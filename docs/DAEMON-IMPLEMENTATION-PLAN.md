# Daemon Transport — Remaining Implementation Plan

> Phase 9: Integration testing, config wiring, reconnection, health checks, hook compatibility.

**Date**: 2026-03-04  
**Prerequisite**: Phase 8 complete (commit `1c06f2ac`)  
**Scope**: 5 work items, ordered by priority

---

## Current Architecture Summary

```
Claude Code ──stdio──> MCP Server (mcp-server.ts)
                          │
              ┌───────────┼───────────────┐
              │ engaged   │ daemon        │ hybrid
              ▼           ▼               ▼
         LocalTransport  RemoteTransport  try Remote → fallback Local
              │           │
         RuntimeEngine   Unix Socket ──> DaemonServer ──> LocalTransport ──> RuntimeEngine
              │                          (daemon-server.ts)        (shared engine)
              │
         Hook IPC Socket
```

**Key files**:
- `src/transport/remote-transport.ts` — Client-side socket transport (277 lines)
- `src/transport/daemon-server.ts` — Server-side RPC dispatcher (340 lines)
- `src/transport/daemon-lifecycle.ts` — Process supervision: start/stop/status (255 lines)
- `src/transport/daemon.ts` — Daemon entry point, compiled to `dist/daemon.cjs` (77 lines)
- `src/transport/factory.ts` — Transport factory with socket discovery (124 lines)
- `src/transport/daemon-constants.ts` — Shared PID/socket/entry constants (17 lines)
- `src/plugins/mcp/mcp-server.ts` — MCP server with 3-mode branching (278 lines)
- `src/plugins/mcp/handlers/daemon-handler.ts` — MCP tool handler for runtime_daemon (146 lines)
- `src/shared/config.ts` — Config types including ExecutorConfig, DaemonTransportConfig (490 lines)
- `src/core/processing/executor-mode.ts` — Mode detection from env/config (135 lines)
- `hooks/scripts/src/shared/runtime-client.ts` — Hook socket discovery (550 lines)

---

## Work Item 1: Integration Test — Daemon End-to-End

**Goal**: Prove the entire daemon stack works: spawn → connect → RPC → response → disconnect.

**Priority**: CRITICAL — validates all Phase 8 work before building on top of it.

### Test File

`src/transport/__tests__/daemon-integration.test.ts`

### Test Cases

#### 1.1 Daemon Server Lifecycle

```
describe('DaemonServer lifecycle')
  ├── 'starts and accepts connections on Unix socket'
  │     - Create tmp dir, create RuntimeEngine with DEFAULT_CONFIG
  │     - Instantiate DaemonServer({ socketPath, engine })
  │     - Call server.start()
  │     - Verify socket file exists at socketPath
  │     - Call server.stop()
  │     - Verify socket file removed
  │
  ├── 'handles multiple concurrent client connections'
  │     - Start DaemonServer
  │     - Create 3 RemoteTransport instances pointing at same socket
  │     - Connect all 3
  │     - Verify server.getSessionCount() === 3
  │     - Disconnect all 3
  │     - Verify server.getSessionCount() === 0
  │
  └── 'cleans up on stop even with active connections'
        - Start server, connect 2 clients
        - Call server.stop()
        - Verify both clients receive close event
```

#### 1.2 RPC Round-Trip

```
describe('RPC round-trip')
  ├── 'getUptime returns number'
  │     - Start DaemonServer with real RuntimeEngine
  │     - Connect RemoteTransport
  │     - Call transport.getUptime()
  │     - Assert typeof result === 'number' && result >= 0
  │
  ├── 'getConfig returns RuntimeConfig shape'
  │     - Connect, call transport.getConfig()
  │     - Assert result has executor.mode, plugins, etc.
  │
  ├── 'setState / getState round-trip'
  │     - Connect, call transport.setState('test.key', { foo: 'bar' })
  │     - Call transport.getState('test.key')
  │     - Assert deep equality
  │
  ├── 'emitEvent / queryEvents round-trip'
  │     - Connect, emit a test event
  │     - Query events with matching filter
  │     - Assert event appears in results
  │
  ├── 'ping returns pong'
  │     - Connect, call transport.rpc('ping')
  │     - Assert result === 'pong'
  │
  ├── 'listSessions returns connected sessions'
  │     - Connect 2 clients with different sessionIds
  │     - Call transport.rpc('listSessions')
  │     - Assert result includes both sessionIds
  │
  └── 'unknown RPC method returns error'
        - Connect, call transport.rpc('nonexistent')
        - Assert rejection with 'Unknown method'
```

#### 1.3 Transport Factory Integration

```
describe('createTransport integration')
  ├── 'daemon mode discovers socket and connects'
  │     - Start DaemonServer, write socket pointer file
  │     - Call createTransport({ mode: 'daemon', projectRoot })
  │     - Assert returned transport.mode === 'remote'
  │     - Assert transport.isReady() === true
  │
  ├── 'daemon mode throws when no daemon available'
  │     - No server running, no pointer file
  │     - Call createTransport({ mode: 'daemon', projectRoot })
  │     - Assert rejection
  │
  ├── 'hybrid mode falls back to local when daemon unavailable'
  │     - No server running
  │     - Call createTransport({ mode: 'hybrid', engine, projectRoot })
  │     - Assert returned transport.mode === 'local'
  │
  └── 'engaged mode creates local transport'
        - Call createTransport({ mode: 'engaged', engine })
        - Assert returned transport.mode === 'local'
```

#### 1.4 DaemonLifecycle Integration

```
describe('DaemonLifecycle')
  ├── 'start spawns daemon and waitForSocket resolves'
  │     - Set CLAUDE_PLUGIN_ROOT to plugin dir
  │     - Call lifecycle.start()
  │     - Assert lifecycle.isRunning() === true
  │     - Assert lifecycle.getStatus() has running: true, pid > 0, socketPath != null
  │
  ├── 'stop kills running daemon'
  │     - Start daemon, verify running
  │     - Call lifecycle.stop()
  │     - Assert lifecycle.isRunning() === false
  │     - Assert PID file cleaned up
  │
  ├── 'start is idempotent when daemon already running'
  │     - Start daemon
  │     - Call start() again
  │     - Assert still one daemon process (not two)
  │
  ├── 'concurrent start calls share single-flight promise'
  │     - Call start() 3 times concurrently (Promise.all)
  │     - Assert only one daemon process spawned
  │
  └── 'detects and cleans up orphaned PID/socket files'
        - Write fake PID file with non-existent PID
        - Write fake socket pointer
        - Call isRunning()
        - Assert returns false
        - Assert stale files cleaned up
```

### Implementation Notes

- Use `os.tmpdir()` + random suffix for test socket paths to avoid conflicts
- Set `timeout: 15000` on lifecycle tests (daemon spawn + socket wait)
- Real RuntimeEngine requires `loadConfig()` — use DEFAULT_CONFIG with projectRoot pointing to temp dir
- Clean up ALL spawned processes in `afterAll` — kill by PID if still running
- Use `vitest` — consistent with existing test infrastructure
- The daemon entry (`dist/daemon.cjs`) must exist — run build before tests or skip with condition

### Dependencies

- `daemon.cjs` must be built (already done in Phase 8)
- RuntimeEngine must instantiate without errors given DEFAULT_CONFIG
- Temp directories for socket files and `.goodvibes/` state

---

## Work Item 2: Config Wiring — `executor.mode` in Plugin Settings

**Goal**: Let users set `executor.mode` to `daemon` or `hybrid` via `.goodvibes/state/runtime-config.json`.

**Priority**: HIGH — required to actually use daemon mode without env vars.

### Current State

Config wiring is **already done**:
- `ExecutorConfig.mode` exists in `shared/config.ts:159` as `ExecutorMode` type (`'engaged' | 'daemon' | 'hybrid'`)
- `DaemonTransportConfig` exists at `shared/config.ts:135` with `auto_start`, `rpc_timeout_ms`, `migrate_state_on_join`
- `ExecutorModeManager` in `executor-mode.ts` reads from env or config
- `mcp-server.ts:153` reads `config.executor.mode` and branches accordingly
- `loadConfig()` reads from `.goodvibes/state/runtime-config.json`

### What's Missing

1. **MCP tool exposure** — The `runtime_config` tool (already exists) can get/set config, but there's no validation that changing `executor.mode` at runtime actually takes effect (the mode is read at MCP server startup, not dynamically)

2. **Documentation** — Users need to know how to configure this:
   ```json
   // .goodvibes/state/runtime-config.json
   {
     "executor": {
       "mode": "hybrid",
       "transport": {
         "auto_start": true,
         "rpc_timeout_ms": 5000
       }
     }
   }
   ```

3. **Validation in `loadConfig`** — Ensure `executor.mode` value is one of the valid enum values. Currently `deepMerge` would accept any string.

4. ~~**`auto_start` wiring**~~ — **ALREADY DONE.** `ensureDaemonRunning()` at `mcp-server.ts:232` checks `config.executor.transport?.auto_start` before starting. No work needed.

### Changes Required

#### 2.1 `shared/config.ts` — Add mode validation

```typescript
// In validateConfig():
const validModes: ExecutorMode[] = ['engaged', 'daemon', 'hybrid'];
if (!validModes.includes(config.executor.mode)) {
  throw new Error(`Invalid executor.mode: ${config.executor.mode}. Must be one of: ${validModes.join(', ')}`);
}
```

#### 2.2 ~~`mcp-server.ts` — Wire `auto_start`~~ — **ALREADY DONE**

`ensureDaemonRunning()` already gates on `auto_start` at line 232. Both daemon and hybrid branches call `ensureDaemonRunning()` which returns early if `auto_start` is falsy. No additional wiring needed.

#### 2.4 Config handler — Mode change notification

When `runtime_config set executor.mode` is called, log a warning that the mode change takes effect on next MCP server restart (not live).

### Files Modified

| File | Change |
|------|--------|
| `shared/config.ts` | Add executor.mode validation in `validateConfig()` |
| `handlers/config.ts` | Add mode-change-requires-restart warning |

### Tests

- Add test case in `config.test.ts` for invalid mode validation
- Verify existing `auto_start` gating in `ensureDaemonRunning()` is covered by MCP server tests

---

## Work Item 3: Reconnection/Retry in RemoteTransport

**Goal**: Auto-reconnect when the daemon socket drops, with exponential backoff.

**Priority**: MEDIUM — needed for production reliability, not needed for initial testing.

### Current Behavior

`RemoteTransport` (remote-transport.ts):
- `connect()` (line 45-78): Creates socket, sets up data/close/error handlers, waits for 'connect' event
- `onClose()` (line 120-128): Rejects all pending RPCs, sets `_connected = false` — **dead transport**
- `onError()` (line 130-135): Logs error, calls `disconnect()`
- No reconnection logic exists

### Design

#### 3.1 New options

```typescript
export interface RemoteTransportOptions {
  socketPath: string;
  connectTimeoutMs?: number;
  sessionId?: string;
  // New:
  reconnect?: {
    enabled: boolean;        // Default: true
    maxAttempts: number;     // Default: 10
    baseDelayMs: number;     // Default: 100
    maxDelayMs: number;      // Default: 10_000
    backoff: 'exponential';  // Only exponential for now
  };
}
```

#### 3.2 State machine

```
           connect()
  IDLE ──────────────> CONNECTING
   ▲                    │
   │  maxAttempts       │ success
   │  exceeded          ▼
   │              CONNECTED
   │                    │
   │  reconnect.enabled │ socket close/error
   │                    ▼
   ├────── NO ──── RECONNECTING
   │                    │
   │                    │ reconnect success
   │                    ▼
   │              CONNECTED (re-establish)
   │
   └── DEAD (maxAttempts exceeded, all pending rejected)
```

#### 3.3 Implementation changes in `remote-transport.ts`

1. **Add state enum**: `'idle' | 'connecting' | 'connected' | 'reconnecting' | 'dead'`

2. **Add `reconnectAttempt` counter** and `reconnectTimer`

3. **Modify `onClose()`**:
   - If `reconnect.enabled` and state !== 'dead': transition to RECONNECTING
   - Start reconnection loop with exponential backoff
   - Do NOT reject pending RPCs during reconnection — hold them until reconnected or maxAttempts exceeded

4. **Add `reconnect()` private method**:
   ```typescript
   private async reconnect(): Promise<void> {
     this.state = 'reconnecting';
     for (let attempt = 0; attempt < this.reconnectOpts.maxAttempts; attempt++) {
       const delay = Math.min(
         this.reconnectOpts.baseDelayMs * 2 ** attempt,
         this.reconnectOpts.maxDelayMs
       );
       await sleep(delay);
       try {
         await this.connectSocket();
         this.state = 'connected';
         this.reconnectAttempt = 0;
         logger.info('Reconnected to daemon', { attempt });
         // Re-register session
         this.socket!.write(JSON.stringify({ type: 'session_join', session_id: this.sessionId }) + '\n');
         return;
       } catch {
         logger.debug('Reconnection attempt failed', { attempt, delay });
       }
     }
     // Max attempts exceeded
     this.state = 'dead';
     this.rejectAllPending(new Error('Reconnection failed after max attempts'));
   }
   ```

5. **Extract `connectSocket()`** from `connect()` — the raw socket creation logic, reusable for reconnection

6. **Modify `rpc()`**: If state is 'reconnecting', queue the call. If 'dead', reject immediately.

7. **Modify `disconnect()`**: Cancel any reconnection timer, transition to 'idle'

#### 3.4 Events

Add EventEmitter or callback hooks:
- `onReconnecting(attempt: number)` — notify consumers
- `onReconnected()` — notify consumers
- `onDead(error: Error)` — transport is permanently failed

### Files Modified

| File | Change |
|------|--------|
| `remote-transport.ts` | Add reconnection state machine, extract connectSocket, hold pending RPCs during reconnection |
| `factory.ts` | Pass reconnect options from config |

### Tests

`src/transport/__tests__/remote-transport-reconnect.test.ts`:
- Server drops connection → client reconnects
- Server comes back after 3 attempts → success
- Server never comes back → dead after maxAttempts
- RPCs during reconnection are held, then resolved on reconnect
- RPCs during dead state reject immediately
- disconnect() during reconnection cancels reconnect loop

---

## Work Item 4: Health Check Polling in DaemonLifecycle

**Goal**: Periodic socket probe so `getStatus()` reflects live daemon state.

**Priority**: MEDIUM — improves observability, not critical for basic operation.

### Current Behavior

`DaemonLifecycle.getStatus()` (line 166-177):
- Reads PID file, checks process liveness via `kill(pid, 0)`, reads socket pointer
- No periodic checking — purely on-demand
- `isRunning()` does PID liveness + socket probe on every call

### Design

#### 4.1 Cached health state

```typescript
interface HealthState {
  running: boolean;
  pid: number | null;
  socketPath: string | null;
  socketResponsive: boolean;  // NEW: was the last probe successful?
  lastChecked: number;        // NEW: timestamp of last check
  uptime: number | null;      // NEW: from daemon RPC if available
}
```

#### 4.2 Polling loop

```typescript
private healthInterval: NodeJS.Timeout | null = null;
private cachedHealth: HealthState | null = null;

startHealthCheck(intervalMs: number = 30_000): void {
  this.stopHealthCheck();
  this.healthInterval = setInterval(async () => {
    await this.updateHealth();
  }, intervalMs);
  // Run immediately
  void this.updateHealth();
}

stopHealthCheck(): void {
  if (this.healthInterval) {
    clearInterval(this.healthInterval);
    this.healthInterval = null;
  }
}

private async updateHealth(): Promise<void> {
  const pid = this.readPid();
  const alive = pid !== null && this.isProcessAlive(pid);
  const socketPath = this.readSocketPointer();
  let socketResponsive = false;
  
  if (alive && socketPath) {
    socketResponsive = await this.probeSocket(socketPath);
  }
  
  if (!alive && pid !== null) {
    // Process died — clean up
    this.cleanupStaleFiles();
  }
  
  this.cachedHealth = {
    running: alive && socketResponsive,
    pid: alive ? pid : null,
    socketPath: socketResponsive ? socketPath : null,
    socketResponsive,
    lastChecked: Date.now(),
    uptime: null, // Could be enriched via RPC
  };
}
```

#### 4.3 Modified `getStatus()`

Return cached health if available and fresh (< intervalMs old). Otherwise, run `updateHealth()` and return.

#### 4.4 Lifecycle integration

- `start()` → call `startHealthCheck()` after daemon is up
- `stop()` → call `stopHealthCheck()` before killing daemon
- Constructor option: `healthCheckIntervalMs?: number` (default: 30000)

### Files Modified

| File | Change |
|------|--------|
| `daemon-lifecycle.ts` | Add health polling loop, cached state, `startHealthCheck()`/`stopHealthCheck()` |

### Tests

`src/transport/__tests__/daemon-lifecycle-health.test.ts`:
- Health check runs on interval, updates cached state
- `getStatus()` returns cached result when fresh
- Dead daemon detected and stale files cleaned up
- `stopHealthCheck()` clears interval
- Health check does not run after `stop()`

---

## Work Item 5: Hook Script Compatibility

**Goal**: Hook scripts work correctly under both engaged and daemon transport modes.

### Current Behavior

Hook scripts (`hooks/scripts/src/shared/runtime-client.ts`):
- `RuntimeClient` class discovers the IPC socket via 5 strategies (env var, session-keyed pointer, scan, legacy, tmpdir)
- Socket is the **hook IPC socket** created by `IPCRouter` in the RuntimeEngine
- In daemon mode, there is **no local RuntimeEngine** → no IPC socket → hooks can't communicate

### Problem

In daemon mode:
1. MCP server starts with no local RuntimeEngine
2. No IPCRouter runs locally → no hook IPC socket created
3. Hook scripts (`user-prompt-submit-directives.mjs`, `pre-tool-use-directive-drain.mjs`) try to connect to local IPC socket → fail
4. WRFC directive delivery breaks completely

### Design Options

#### Option A: Daemon Exposes Hook IPC Socket

The DaemonServer already runs on a daemon RPC socket. Add a second listening socket specifically for hooks, or multiplex hook messages on the same socket.

**Pros**: Single daemon, hooks connect to daemon instead of local engine  
**Cons**: DaemonServer protocol changes, hooks need to know about daemon socket

#### Option B: Local IPC Proxy in MCP Server

When in daemon mode, the MCP server creates a lightweight IPC socket that proxies hook requests to the daemon over RemoteTransport.

**Pros**: Hooks don't change, same discovery mechanism works  
**Cons**: Extra process, extra socket, proxy layer

#### Option C: Hooks Connect to Daemon Socket Directly

Hook scripts learn about daemon socket discovery (socket pointer file) and connect to the daemon RPC socket for directive queries.

**Pros**: Direct, no proxy overhead  
**Cons**: Hook scripts need to understand the daemon protocol

### Recommended: Option A (Daemon Hook IPC Endpoint) — REVISED per review

> **Original plan recommended Option B (proxy).** After review feedback, Option A is preferred: the daemon exposes a hook-compatible IPC endpoint directly, handling the hook protocol natively. This avoids the proxy complexity issues identified in the review (trigger evaluation, directive enrichment, session routing).

The daemon already has a Unix socket server (`DaemonServer`). Add a second listener (or multiplex on the same socket) that speaks the hook IPC protocol:
- `hook_event` → processed by EventBus + trigger evaluation (already in RuntimeEngine)
- `get_directives` → calls `buildDirectivesResponse()` with proper enrichment
- `get_system_message` → returns from directive queue
- Session registration → daemon manages per-session state

This eliminates the proxy entirely. Hooks discover the daemon's hook socket via the same pointer file mechanism they use today.

### Previous: Option B (Local IPC Proxy) — SUPERSEDED

Keep hooks unchanged. The MCP server in daemon/hybrid mode:
1. Creates a lightweight IPC socket at the usual pointer file location
2. Proxies MCP tool calls (get_directives, get_system_message) to the daemon via RemoteTransport
3. Hooks discover this socket normally and talk to it as if it were a local engine

#### 5.1 New class: `IPCProxy`

```typescript
// src/plugins/mcp/ipc-proxy.ts
export class IPCProxy {
  private server: net.Server | null = null;
  private transport: RemoteTransport;
  
  constructor(transport: RemoteTransport) {
    this.transport = transport;
  }
  
  async start(socketPath: string): Promise<void> {
    // Create Unix socket server
    // Accept connections from hooks
    // Forward requests to daemon via this.transport.rpc()
    // Return responses to hooks
  }
  
  async stop(): Promise<void> {
    // Close socket server
  }
}
```

#### 5.2 MCP Server integration

In `mcp-server.ts`, after connecting to daemon:
```typescript
if (mode === 'daemon' || mode === 'hybrid') {
  if (this.runtimeTransport?.mode === 'remote') {
    this.ipcProxy = new IPCProxy(this.runtimeTransport as RemoteTransport);
    await this.ipcProxy.start(getIpcSocketPath(projectRoot));
  }
}
```

#### 5.3 What gets proxied

The hook IPC protocol uses these message types (from `ipc-router.ts`):
- `get_directives` → proxy to `drainDirectives` RPC
- `get_system_message` → proxy to custom RPC or return empty
- `processHookEvent` → proxy to `emitEvent` RPC
- `mcp_call` → proxy the specific tool call to daemon

This requires the DaemonServer to support these RPCs — some may need to be added to `dispatchRPC()`.

### Files Modified/Created

| File | Change |
|------|--------|
| `src/plugins/mcp/ipc-proxy.ts` | NEW — lightweight IPC proxy for hooks |
| `mcp-server.ts` | Start/stop IPCProxy in daemon/hybrid mode |
| `daemon-server.ts` | Add missing RPC methods that hooks need |

### Tests

`src/plugins/mcp/__tests__/ipc-proxy.test.ts`:
- Hook connects to proxy socket
- get_directives proxied to daemon and back
- processHookEvent proxied correctly
- Proxy cleans up on stop

### Risk Assessment

This is the most complex work item. The IPC protocol has many message types and the proxy must handle all of them correctly. Consider:
- Starting with a subset (just directive queries) and expanding
- Testing against the actual hook scripts in integration
- The daemon must support session-scoped directive queues (already does via WRFC handlers)

---

## Execution Order

```
┌─────────┐
│  WI 1   │  Integration Tests
│ (CRIT)  │  Validates Phase 8 stack
└────┬────┘
     │
┌────▼────┐
│  WI 2   │  Config Wiring
│ (HIGH)  │  auto_start, validation
└────┬────┘
     │
┌────▼────┐     ┌─────────┐
│  WI 3   │     │  WI 4   │  Can run in parallel
│  (MED)  │     │  (MED)  │
│ Reconn. │     │ Health  │
└────┬────┘     └────┬────┘
     │               │
     └───────┬───────┘
             │
     ┌───────▼───────┐
     │     WI 5      │  Hook Compatibility
     │    (HIGH)     │  Depends on WI 3 (reconnect for proxy reliability)
     └───────────────┘
```

**Parallelism**: WI 3 and WI 4 are independent and can be implemented concurrently.

**WI 5 depends on WI 3**: The IPC proxy needs reconnection logic for reliability (if daemon restarts, proxy reconnects).

---

## Estimated Complexity

| Work Item | New Files | Modified Files | New Tests | Estimated Lines |
|-----------|-----------|----------------|-----------|----------------|
| WI 1 | 1 | 0 | ~200 lines | ~200 |
| WI 2 | 0 | 3 | ~30 lines | ~60 |
| WI 3 | 0 (1 test) | 2 | ~150 lines | ~250 |
| WI 4 | 0 (1 test) | 1 | ~80 lines | ~120 |
| WI 5 | 1 | 2 | ~100 lines | ~300 |
| **Total** | **2** | **8** | **~560** | **~930** |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| daemon.cjs doesn't start cleanly in CI/test | WI 1 blocked | Test with `child_process.spawn` in isolated tmp dirs |
| Reconnection races with pending RPCs | Data loss | Hold pending during reconnect, timeout if too long |
| IPC proxy protocol mismatch | Hooks break | Test against actual hook scripts, not mocks |
| Health check timer leaks in tests | Flaky tests | Always call `stopHealthCheck()` in afterEach |
| Config change doesn't take effect | User confusion | Document restart requirement clearly |
| IPC proxy must handle trigger eval + directive enrichment | WI 5 scope creep | Consider daemon-side hook IPC endpoint instead of MCP proxy |
| Pending RPCs during reconnect may outlive caller timeout | Memory leak | Add per-RPC `pendingTimeoutMs` independent of reconnect attempts |

---

## Review Response (2026-03-04)

Review: `docs/DAEMON-IMPLEMENTATION-PLAN-REVIEW.md`

### Accepted Changes

| Issue | Resolution |
|-------|------------|
| #2 session_join typo | Fixed — plan now uses `session_join` with `session_id` field |
| #5 auto_start already wired | Fixed — WI 2 section 2.2 marked as ALREADY DONE |
| #7 pending RPC timeout | Added `pendingTimeoutMs` to risk register |
| #9 priority label | Valid observation, noted |

### Rejected/Clarified

| Issue | Response |
|-------|----------|
| #3 daemon.cjs dependency | **Incorrect** — `build.mjs` already has daemon.cjs entry (Phase 8, commit `1c06f2ac`). Build produces both `dist/index.cjs` and `dist/daemon.cjs`. |

### Deferred for Deeper Design

| Issue | Response |
|-------|----------|
| #1 WI 5 IPC proxy complexity | **Valid.** The IPC router does server-side trigger evaluation, `holdDrain()` async blocking, and directive enrichment via `buildDirectivesResponse()`. A naive proxy won't work. Before implementing WI 5, a dedicated design pass is needed. Two options to evaluate: (A) Daemon exposes a hook-compatible IPC endpoint directly (daemon-server handles hook protocol natively), or (B) Enhanced proxy that replicates enrichment logic locally. Option A is likely simpler. |
| #4 Proxy session routing | **Valid.** Per-session directive scoping through a single proxy connection needs explicit design. Tied to #1. |
| #6 Health polling value | **Valid concern.** WI 4 may be deprioritized or simplified to on-demand-only with optional caching. |
| #8 Directive enrichment | **Valid.** Tied to #1 — daemon needs `get_directives` RPC that replicates `buildDirectivesResponse()` behavior. |
