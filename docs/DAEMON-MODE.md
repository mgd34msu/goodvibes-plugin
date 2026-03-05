# Daemon Mode

Daemon mode runs the runtime engine as a persistent background process, shared across Claude Code sessions. Instead of each session creating its own engine, sessions connect to a single daemon over a Unix socket.

## Why Use It

- **Shared state** — Multiple sessions see the same triggers, workflows, and state
- **Background processing** — Queue processing and deferred execution continue between sessions
- **Faster startup** — Sessions connect to an already-running engine instead of bootstrapping one
- **Persistent context** — Engine state survives individual session restarts

## Quick Start

Edit `.goodvibes/state/runtime-config.json` in your project root:

```json
{
  "executor": {
    "mode": "hybrid",
    "transport": {
      "auto_start": true
    }
  }
}
```

That's it. Next time Claude Code starts, the daemon launches automatically and sessions connect to it. If the daemon isn't available, hybrid mode falls back to the normal local engine.

## The Three Modes

| Mode | Behavior |
|------|----------|
| `engaged` | Default. Local engine per session. No daemon. |
| `daemon` | Remote only. Requires a running daemon. Fails if unavailable. |
| `hybrid` | Tries daemon first, falls back to local engine if unavailable. |

**Recommendation:** Use `hybrid` with `auto_start: true`. You get daemon benefits when it's running and local fallback when it's not.

## Manual Daemon Control

Use the `runtime_daemon` MCP tool from any session:

```
runtime_daemon { action: "start" }    # Start the daemon
runtime_daemon { action: "stop" }     # Stop the daemon (graceful)
runtime_daemon { action: "status" }   # Check if running, PID, uptime
runtime_daemon { action: "sessions" } # List connected sessions (daemon mode only)
```

## Configuration Reference

All fields in `.goodvibes/state/runtime-config.json` under `executor`:

```json
{
  "executor": {
    "mode": "engaged | daemon | hybrid",

    "transport": {
      "auto_start": false,
      "rpc_timeout_ms": 5000,
      "migrate_state_on_join": false,

      "reconnect": {
        "enabled": true,
        "max_attempts": 10,
        "base_delay_ms": 100,
        "max_delay_ms": 10000
      }
    }
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `mode` | `engaged` | Transport mode |
| `transport.auto_start` | `false` | Auto-start daemon on session start |
| `transport.rpc_timeout_ms` | `5000` | Timeout for individual RPC calls |
| `transport.migrate_state_on_join` | `false` | Merge local state into daemon on connect (useful in hybrid mode when falling back to local, then later connecting to daemon) |
| `transport.reconnect.enabled` | `true` | Auto-reconnect when socket drops |
| `transport.reconnect.max_attempts` | `10` | Max reconnection attempts before giving up |
| `transport.reconnect.base_delay_ms` | `100` | Initial backoff delay |
| `transport.reconnect.max_delay_ms` | `10000` | Maximum backoff delay cap |

## Environment Variable Overrides

| Variable | Purpose |
|----------|--------|
| `GOODVIBES_EXECUTOR_MODE` | Force a mode (overrides config) |
| `GV_DAEMON_SOCKET` | Override daemon RPC socket path |
| `GV_DAEMON_HOOK_SOCKET` | Override hook IPC socket path |
| `GV_PROJECT_ROOT` | Override project root for daemon |

Mode priority: env var > config file > default (`engaged`).

## How It Works

```
Session A ──stdio──> MCP Server ──RemoteTransport──┐
                                                    │
Session B ──stdio──> MCP Server ──RemoteTransport──>├──> DaemonServer ──> RuntimeEngine
                                                    │     (Unix socket)     (shared)
Session C ──stdio──> MCP Server ──RemoteTransport──┘

Hook scripts ──> DaemonHookServer ──> Same RuntimeEngine
                  (separate socket, discovered via
                   PID-keyed pointer files in .goodvibes/state/)
```

**Engaged mode:** Each MCP server creates its own local RuntimeEngine. No sockets.

**Daemon/hybrid mode:** MCP servers connect to a shared daemon process. The daemon runs a RuntimeEngine and exposes two Unix sockets:
- **RPC socket** — For MCP server transport (tool calls, state, events)
- **Hook socket** — For hook scripts (directives, events)

## File Locations

PID and pointer files live under `.goodvibes/` in your project root. Socket files may live in a system socket directory (e.g., `/tmp/goodvibes-{uid}/`):

| File | Purpose |
|------|--------|
| `goodvibes-runtime.pid` | Daemon process ID |
| `daemon.socket` | Pointer to daemon RPC socket path |
| `goodvibes-runtime.sock` | Daemon RPC socket (default: `.goodvibes/goodvibes-runtime.sock`, overridable via `GV_DAEMON_SOCKET`) |
| `goodvibes-hook-{hash}-{pid}.sock` | Hook IPC socket (in socket directory, includes project hash and daemon PID) |
| `state/runtime-config.json` | Configuration file |

## Reconnection

When the daemon socket drops (daemon restart, network issue), RemoteTransport automatically reconnects:

1. Enters `reconnecting` state
2. Exponential backoff with random jitter (prevents thundering herd)
3. Pending RPCs are held in a queue (up to 1000)
4. On success: queue is flushed, session re-joined
5. On failure after max attempts: enters `dead` state, all pending RPCs rejected

This is transparent to the MCP server — tool calls simply wait during reconnection.

## Health Checks

DaemonLifecycle runs periodic health checks (default: every 30 seconds) that verify:
- Process is alive (PID check)
- Socket is responsive (connection probe)

Stale PID files and socket pointers from crashed daemons are automatically cleaned up.

## Logging

The daemon process runs detached with stdio set to `ignore`, so its logs are not visible in the terminal. To debug daemon issues:
- Daemon engine logs go to stderr, which is discarded in detached mode. To capture them, start the daemon manually with output redirection instead of using `auto_start`
- Use `runtime_daemon { action: "status" }` to verify the daemon is responsive
- Set `GV_DAEMON_SOCKET` and `GV_DAEMON_HOOK_SOCKET` env vars to known paths for easier debugging

## Troubleshooting

**Daemon won't start:**
- Check that `dist/daemon.cjs` exists (run the build first)
- Check `CLAUDE_PLUGIN_ROOT` is set correctly
- Look for stale `.goodvibes/goodvibes-runtime.pid` — delete if process is dead

**Sessions can't connect:**
- Run `runtime_daemon { action: "status" }` to verify daemon is running
- Check `.goodvibes/daemon.socket` exists and points to a valid socket
- Verify the socket file at the pointer path actually exists

**Hooks not working in daemon mode:**
- The daemon runs a dedicated hook socket (DaemonHookServer)
- Hooks discover it via PID-keyed pointer files in `.goodvibes/`
- If hooks can't find the socket, check that the daemon started successfully

**Mode change doesn't take effect:**
- Mode is read at MCP server startup, not live-reloaded
- After changing `executor.mode` in config, restart the Claude Code session

**Daemon keeps restarting:**
- Check for config errors in `.goodvibes/state/runtime-config.json`
- Invalid `executor.mode` values are rejected with a validation error
- Valid values: `engaged`, `daemon`, `hybrid`
