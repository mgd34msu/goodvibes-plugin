# Phase 8: Making the Daemon Operational

## Overview

The transport abstraction layer (Phases 1-7) provides the interfaces, implementations, and test coverage. This phase makes the daemon end-to-end operational by closing six gaps: build integration, hook IPC routing, auto-start, daemon management, session ID propagation, and process supervision.

**Invariant**: Local/engaged mode is the default. All changes are gated on `executor.mode` being `'daemon'` or `'hybrid'`. Zero behavioral changes in engaged mode.

---

## Gap 1: Build Integration

### Problem
`daemon.ts` exists but isn't compiled. The build script (`build.mjs`) only produces `dist/index.cjs` from `src/server.ts`.

### Solution
Add a second esbuild entry point for `daemon.ts` producing `dist/daemon.cjs`.

### File: `plugins/goodvibes/tools/implementations/runtime-engine/build.mjs`

```typescript
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  try {
    // Main MCP server entry point
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/server.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(__dirname, 'dist/index.cjs'),
      sourcemap: true,
      minify: false,
      keepNames: true,
    });
    console.log('Build completed: dist/index.cjs');

    // Daemon standalone entry point
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/transport/daemon.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(__dirname, 'dist/daemon.cjs'),
      sourcemap: true,
      minify: false,
      keepNames: true,
    });
    console.log('Build completed: dist/daemon.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
```

### Dependencies
None. Can be done first.

---

## Gap 2: Hook IPC in Daemon Mode

### Problem
Hook scripts communicate with the runtime engine via IPC (Unix domain socket). In local mode, each MCP server process creates its own IPC socket. When the daemon hosts the engine, hooks must route to the daemon's IPC socket instead.

### Analysis: Why This Already Works (Mostly)

The current architecture makes this simpler than it appears:

1. **`RuntimeEngine.startup()` creates the IPC subsystem** (step 22 in bootstrap.ts). When `daemon.ts` calls `engine.startup()`, the IPC server is created and pointer files are written to `.goodvibes/state/`.

2. **Hook scripts discover sockets via pointer files.** `RuntimeClient.discoverSocket()` in `hooks/scripts/src/shared/runtime-client.ts` scans `.goodvibes/state/runtime-{id}.socket` files, sorted by mtime, preferring the most recent.

3. **The daemon's engine will create a pointer file** named `runtime-{daemonPid}.socket` that points to the IPC socket. Hooks will discover it.

### The Multi-Session Problem

In daemon mode, multiple Claude sessions connect to one daemon. But hooks fire from each session independently. The IPC protocol already includes session identification:

- Hook events carry `session_id` in the payload (from Claude Code's `session_id` input)
- The IPC router tracks sessions via `registeredSessions` set
- Directive draining is scoped by target and workflow ID

**Key insight**: The IPC subsystem doesn't need to know *which* transport session (daemon RPC client) initiated a hook event. Hook events are identified by the Claude Code session ID in the payload, not by the transport connection. The IPC router processes them the same way regardless of whether the engine is local or in a daemon.

### What Needs to Change

The MCP server currently also creates its own `RuntimeEngine` and IPC subsystem. In daemon mode, it must NOT do this — the daemon owns the engine.

#### Change 1: MCP Server Should Skip Local Engine in Daemon Mode

When `executor.mode === 'daemon'`, the MCP server should:
- NOT create a `RuntimeEngine`
- NOT start the IPC subsystem locally
- ONLY create a `RemoteTransport` to the daemon

When `executor.mode === 'hybrid'`, the MCP server should:
- Create a `RuntimeEngine` as fallback
- Try to connect to daemon first; if successful, skip local IPC
- If daemon unavailable, use local engine + IPC as today

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/plugins/mcp/mcp-server.ts`

The `RuntimeEngineServer` constructor and `start()` method need restructuring:

```typescript
export class RuntimeEngineServer {
  private readonly server: Server;
  // processManager is now optional — null in pure daemon mode
  // NOTE: Removes the `readonly` modifier from the original field
  // (was: `private readonly processManager: RuntimeEngine`)
  private processManager: RuntimeEngine | null = null;
  private runtimeTransport: RuntimeTransport | null = null;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: ENGINE_VERSION },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  async start(): Promise<void> {
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const config = loadConfig(projectRoot);
    const mode = config.executor.mode;

    if (mode === 'daemon') {
      // Pure daemon mode: no local engine, connect to daemon
      await this.ensureDaemonRunning(projectRoot, config);
      this.runtimeTransport = await createTransport({
        mode: 'daemon',
        projectRoot,
        connectTimeoutMs: config.executor.transport.rpc_timeout_ms,
        sessionId: this.getSessionId(),
      });
    } else if (mode === 'hybrid') {
      // Hybrid: try daemon first, create local engine only if daemon unavailable
      await this.ensureDaemonRunning(projectRoot, config);
      try {
        this.runtimeTransport = await createTransport({
          mode: 'daemon',
          projectRoot,
          connectTimeoutMs: config.executor.transport.rpc_timeout_ms,
          sessionId: this.getSessionId(),
        });
        // Daemon available — no local engine needed
      } catch {
        // Daemon unavailable — fall back to local engine
        this.processManager = new RuntimeEngine(config, projectRoot);
        await this.processManager.startup();
        this.runtimeTransport = await createTransport({
          mode: 'engaged',
          engine: this.processManager,
        });
      }
    } else {
      // Engaged (local) mode: unchanged behavior
      this.processManager = new RuntimeEngine(config, projectRoot);
      await this.processManager.startup();
      this.runtimeTransport = await createTransport({
        mode: 'engaged',
        engine: this.processManager,
      });
    }

    // Signal handlers
    setupSignalHandlers(async () => {
      await this.stop();
    });

    // Connect MCP transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info(`${SERVER_NAME} v${ENGINE_VERSION} ready`, {
      tools: listHandlers(),
      pid: process.pid,
      transportMode: this.runtimeTransport?.mode ?? 'unknown',
    });
  }

  private getSessionId(): string {
    // Match event-bus.ts env var order for consistency
    return process.env.CLAUDE_SESSION_ID
      ?? process.env.SESSION_ID
      ?? `mcp-${process.pid}`;
  }

  private async ensureDaemonRunning(
    projectRoot: string,
    config: RuntimeConfig,
  ): Promise<void> {
    if (!config.executor.transport.auto_start) return;
    const lifecycle = new DaemonLifecycle(projectRoot);
    if (await lifecycle.isRunning()) return;
    await lifecycle.start();
  }

  // ... stop() updated to handle null processManager
}
```

#### Note: `migrate_state_on_join` Deferred

`DaemonTransportConfig` includes `migrate_state_on_join: boolean` (default: `false`). This controls whether a session exports its local state into the daemon when joining. Implementation is deferred to Phase 9 — the current phase establishes the connection lifecycle; state migration adds complexity (conflict resolution, prefix scoping) that should be designed separately. The config field exists and defaults to `false`, so no behavioral gap.

#### Change 2: HandlerContext Must Work Without Local Engine

Currently `HandlerContext` is built by reaching into `this.processManager` directly. When `processManager` is null (pure daemon mode), all data flows through the transport.

The handler context construction should detect whether transport is remote and route accordingly:

```typescript
private buildHandlerContext(): HandlerContext {
  // If we have a remote transport, the transport IS the context
  // All methods on HandlerContext that call engine directly
  // should route through transport instead.
  return {
    transport: this.runtimeTransport ?? undefined,
    // Legacy fields for backward compatibility during migration
    // In daemon mode, these throw if called — handlers should use transport
    getUptime: () => this.processManager?.getUptime() ?? 0,
    getConfig: () => this.processManager?.getConfig()
      ?? { /* will throw - handler should use transport */ } as RuntimeConfig,
    getHealth: () => this.processManager?.getHealthChecker().check()
      ?? { status: 'unknown' as const, checks: [], timestamp: Date.now() } as HealthStatus,
    updateConfig: (config) => {
      if (this.processManager) this.processManager.updateConfig(config);
    },
    projectRoot: this.processManager?.getProjectRoot() ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    version: ENGINE_VERSION,
    // These return null when no local engine — handlers using transport won't need them
    getEventBus: () => this.processManager?.getEventBus() ?? null,
    getEventLog: () => this.processManager?.getEventLog() ?? null,
    getEventQueue: () => this.processManager?.getEventQueue() ?? null,
    getWorkflowEngine: () => this.processManager?.getWorkflowEngine() ?? null,
    getTriggerRegistry: () => this.processManager?.getTriggerRegistry() ?? null,
    getAgentCoordinator: () => this.processManager?.getAgentCoordinator() ?? null,
    getDirectiveQueue: () => this.processManager?.getDirectiveQueue() ?? null,
    getCoreStateStore: () => {
      try { return this.processManager?.getCoreStateStore() ?? null; }
      catch { return null; }
    },
  };
}
```

Since the MCP handlers were already migrated to use `ctx.transport` in Phase 5, this should work transparently. The legacy fields exist only for any handler that hasn't been migrated yet.

---

## Gap 3: Auto-Start

### Problem
`DaemonTransportConfig.auto_start` exists but nothing reads it. The MCP server should spawn the daemon process automatically when needed.

### Solution
Create a `DaemonLifecycle` class that handles daemon process management.

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/transport/daemon-lifecycle.ts` (NEW)

```typescript
/**
 * DaemonLifecycle — manages the daemon process lifecycle.
 * Handles checking if daemon is running, starting it, stopping it,
 * and health checking.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

const logger = createLogger('daemon-lifecycle');

const PID_FILE_NAME = 'goodvibes-runtime.pid';
const SOCKET_POINTER_NAME = 'daemon.socket';
const DAEMON_ENTRY = 'dist/daemon.cjs';
const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 500;

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  socketPath: string | null;
  uptime: number | null;
  sessions: number | null;
}

export class DaemonLifecycle {
  private readonly projectRoot: string;
  private readonly goodvibesDir: string;
  private readonly pidFilePath: string;
  private readonly socketPointerPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.goodvibesDir = resolve(projectRoot, '.goodvibes');
    this.pidFilePath = resolve(this.goodvibesDir, PID_FILE_NAME);
    this.socketPointerPath = resolve(this.goodvibesDir, SOCKET_POINTER_NAME);
  }

  /**
   * Check if the daemon is currently running.
   * Verifies both PID file existence AND process liveness AND socket responsiveness.
   */
  async isRunning(): Promise<boolean> {
    const pid = this.readPid();
    if (pid === null) return false;

    // Check if process is alive
    if (!this.isProcessAlive(pid)) {
      this.cleanupStaleFiles();
      return false;
    }

    // Check if socket is responsive
    const socketPath = this.readSocketPointer();
    if (!socketPath) {
      return false; // Process alive but no socket yet (starting up?)
    }

    return this.probeSocket(socketPath);
  }

  /**
   * Start the daemon process.
   * Spawns daemon.cjs as a detached child and waits for socket availability.
   */
  async start(): Promise<void> {
    if (await this.isRunning()) {
      logger.info('Daemon already running');
      return;
    }

    // Clean up any stale files from a previous run
    this.cleanupStaleFiles();

    // Resolve the daemon entry point
    // CLAUDE_PLUGIN_ROOT points to the installed plugin location
    const pluginRoot = process.env['CLAUDE_PLUGIN_ROOT'] ?? process.cwd();
    const daemonScript = resolve(
      pluginRoot,
      'tools/implementations/runtime-engine',
      DAEMON_ENTRY,
    );

    if (!existsSync(daemonScript)) {
      throw new Error(
        `Daemon entry point not found: ${daemonScript}. Run the build first.`,
      );
    }

    logger.info('Starting daemon process', { script: daemonScript });

    // Spawn detached process
    const child = spawn(process.execPath, [daemonScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        GV_PROJECT_ROOT: this.projectRoot,
      },
    });

    child.unref();

    // Wait for the daemon to become responsive
    await this.waitForSocket(STARTUP_TIMEOUT_MS);

    logger.info('Daemon started', { pid: child.pid });
  }

  /**
   * Stop the daemon process by sending SIGTERM.
   */
  async stop(): Promise<void> {
    const pid = this.readPid();
    if (pid === null) {
      logger.info('No daemon PID file found');
      return;
    }

    if (!this.isProcessAlive(pid)) {
      logger.info('Daemon process already dead, cleaning up');
      this.cleanupStaleFiles();
      return;
    }

    logger.info('Sending SIGTERM to daemon', { pid });
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      logger.warn('Failed to send SIGTERM', { err: toErrorMessage(err) });
    }

    // Wait for process to exit (up to 5s)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!this.isProcessAlive(pid)) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Force kill if still alive
    if (this.isProcessAlive(pid)) {
      logger.warn('Daemon did not exit gracefully, sending SIGKILL', { pid });
      try {
        process.kill(pid, 'SIGKILL');
      } catch { /* ignore */ }
    }

    this.cleanupStaleFiles();
  }

  /**
   * Get daemon status information.
   */
  async getStatus(): Promise<DaemonStatus> {
    const pid = this.readPid();
    const socketPath = this.readSocketPointer();
    const running = pid !== null && this.isProcessAlive(pid)
      && socketPath !== null && await this.probeSocket(socketPath);

    return {
      running,
      pid: running ? pid : null,
      socketPath: running ? socketPath : null,
      uptime: null,    // Populated via RPC if running
      sessions: null,  // Populated via RPC if running
    };
  }

  // ── Private Helpers ────────────────────────────────────────────

  private readPid(): number | null {
    if (!existsSync(this.pidFilePath)) return null;
    try {
      const content = readFileSync(this.pidFilePath, 'utf-8').trim();
      const pid = parseInt(content, 10);
      return Number.isFinite(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  private readSocketPointer(): string | null {
    if (!existsSync(this.socketPointerPath)) return null;
    try {
      const content = readFileSync(this.socketPointerPath, 'utf-8').trim();
      return content || null;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private probeSocket(socketPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!existsSync(socketPath)) {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
      const socket = createConnection(socketPath, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  private cleanupStaleFiles(): void {
    for (const path of [this.pidFilePath, this.socketPointerPath]) {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  }

  private async waitForSocket(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const socketPath = this.readSocketPointer();
      if (socketPath && await this.probeSocket(socketPath)) {
        return;
      }
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    throw new Error(
      `Daemon did not become responsive within ${timeoutMs}ms`,
    );
  }
}
```

### Dependencies
- Gap 1 (build produces `dist/daemon.cjs`)

---

## Gap 4: Daemon Management

### Problem
No way to check daemon status, manually start/stop it, or see connected sessions.

### Solution
Add a new MCP tool `runtime_daemon` with actions: `start`, `stop`, `status`, `sessions`.

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/plugins/mcp/handlers/daemon-handler.ts` (NEW)

```typescript
/**
 * MCP handler for daemon management.
 * Provides start/stop/status/sessions actions.
 */

import type { HandlerContext } from '../tool-handlers.js';
import { DaemonLifecycle } from '../../../transport/daemon-lifecycle.js';

export async function handleDaemon(
  args: Record<string, unknown>,
  ctx: HandlerContext,
) {
  const action = args['action'] as string;
  const projectRoot = ctx.projectRoot;
  const lifecycle = new DaemonLifecycle(projectRoot);

  switch (action) {
    case 'start': {
      await lifecycle.start();
      const status = await lifecycle.getStatus();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: 'Daemon started',
            ...status,
          }, null, 2),
        }],
      };
    }

    case 'stop': {
      await lifecycle.stop();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: 'Daemon stopped',
          }, null, 2),
        }],
      };
    }

    case 'status': {
      const status = await lifecycle.getStatus();

      // If running and we have a transport, enrich with uptime and session count
      if (status.running && ctx.transport) {
        try {
          status.uptime = await ctx.transport.getUptime();
        } catch { /* ignore */ }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(status, null, 2),
        }],
      };
    }

    case 'sessions': {
      // Session list requires daemon RPC — use a dedicated method
      if (!ctx.transport || ctx.transport.mode !== 'remote') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Sessions query requires an active daemon connection',
            }, null, 2),
          }],
          isError: true,
        };
      }
      // This requires extending DaemonServer with a listSessions RPC
      // See Gap 4 addendum below
      try {
        const sessions = await (ctx.transport as any).rpc('listSessions');
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sessions }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: `Failed to query sessions: ${err}`,
            }, null, 2),
          }],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [{
          type: 'text' as const,
          text: `Unknown daemon action: ${action}. Valid: start, stop, status, sessions`,
        }],
        isError: true,
      };
  }
}
```

### Tool Schema

Add to tool definitions:

```json
{
  "name": "runtime_daemon",
  "description": "Manage the GoodVibes runtime daemon process. Actions: start (spawn daemon), stop (terminate daemon), status (check daemon health), sessions (list connected sessions).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["start", "stop", "status", "sessions"],
        "description": "Daemon management action."
      }
    },
    "required": ["action"]
  }
}
```

### DaemonServer Extension for `listSessions` RPC

```typescript
// In daemon-server.ts dispatchRPC, add:
case 'listSessions': {
  const sessions: Array<{ sessionId: string }> = [];
  for (const [id] of this.sessions) {
    sessions.push({ sessionId: id });
  }
  return sessions;
}
```

### Registration

Add to `tool-handlers.ts`:
- Import `handleDaemon`
- Register schema and handler in the handler registry

### Dependencies
- Gap 3 (DaemonLifecycle class)

---

## Gap 5: Session ID in Transport Factory

### Problem
`RemoteTransport` generates its own random session ID. The MCP server should pass the Claude Code session ID so the daemon can correlate sessions.

### Solution

#### Change 1: Add `sessionId` to `RemoteTransportOptions`

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/transport/remote-transport.ts`

```typescript
export interface RemoteTransportOptions {
  socketPath: string;
  connectTimeoutMs?: number;
  sessionId?: string;  // NEW — use this instead of generating random
}

export class RemoteTransport implements RuntimeTransport {
  // ...
  constructor(options: RemoteTransportOptions) {
    this.socketPath = options.socketPath;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.sessionId = options.sessionId ?? generateId(); // Fallback to random
  }
  // ...
}
```

#### Change 2: Add `sessionId` to `TransportFactoryOptions`

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/transport/factory.ts`

```typescript
export interface TransportFactoryOptions {
  mode: 'engaged' | 'daemon' | 'hybrid';
  socketPath?: string;
  connectTimeoutMs?: number;
  engine?: RuntimeEngine;
  projectRoot?: string;
  sessionId?: string;  // NEW — forwarded to RemoteTransport
}

export async function createTransport(options: TransportFactoryOptions): Promise<RuntimeTransport> {
  const { mode, connectTimeoutMs, sessionId } = options;
  // ...
  if (mode === 'daemon') {
    // ...
    const transport = new RemoteTransport({ socketPath, connectTimeoutMs, sessionId });
    await transport.connect();
    return transport;
  }

  // hybrid: try remote first
  if (socketPath) {
    try {
      const transport = new RemoteTransport({ socketPath, connectTimeoutMs, sessionId });
      await transport.connect();
      return transport;
    } catch {
      // fall through to local
    }
  }
  // ...
}
```

#### Change 3: MCP Server Passes Session ID

See Gap 2 changes to `mcp-server.ts` — the `getSessionId()` method resolves the session ID from environment variables.

### Dependencies
None. Can be done independently.

---

## Gap 6: Process Supervision

### Problem
The daemon process needs basic supervision: PID file management, health checking, orphan detection, and clean shutdown propagation.

### Solution
Most of this is already handled by `daemon.ts` (PID file, signal handlers) and `DaemonLifecycle` (Gap 3). The remaining piece is orphan detection.

### Orphan Detection Strategy

Orphan = daemon PID file exists + socket file exists + process is dead.

Detection happens at two points:

1. **On MCP server startup** (in `DaemonLifecycle.isRunning()`): Already checks PID liveness and socket probing. Cleans up stale files if daemon is dead.

2. **On `discoverDaemonSocket()`** in factory.ts: Should check PID file liveness before trusting the socket pointer.

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/transport/factory.ts`

Enhance `discoverDaemonSocket` with liveness check:

```typescript
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Discover daemon socket path from the pointer file written by daemon.ts.
 * Validates that the daemon PID is still alive before returning the path.
 * Returns undefined if no pointer file exists or daemon is dead.
 */
export function discoverDaemonSocket(projectRoot: string): string | undefined {
  const goodvibesDir = join(projectRoot, '.goodvibes');
  const pointerPath = join(goodvibesDir, 'daemon.socket');
  if (!existsSync(pointerPath)) return undefined;

  try {
    const content = readFileSync(pointerPath, 'utf-8').trim();
    if (!content) return undefined;

    // Verify the daemon PID is alive
    const pidPath = join(goodvibesDir, 'goodvibes-runtime.pid');
    if (existsSync(pidPath)) {
      const pidStr = readFileSync(pidPath, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, 0);
        } catch {
          // PID is dead — clean up orphaned files
          try { unlinkSync(pointerPath); } catch { /* ignore */ }
          try { unlinkSync(pidPath); } catch { /* ignore */ }
          return undefined;
        }
      }
    }

    return content;
  } catch {
    return undefined;
  }
}
```

### Health Check Enhancement in DaemonServer

Add a `ping` RPC method for lightweight health checks:

### File: `plugins/goodvibes/tools/implementations/runtime-engine/src/transport/daemon-server.ts`

```typescript
// In dispatchRPC, add:
case 'ping': {
  return { ok: true, pid: process.pid, uptime: process.uptime() };
}

case 'listSessions': {
  const sessions: Array<{ sessionId: string }> = [];
  for (const [id] of this.sessions) {
    sessions.push({ sessionId: id });
  }
  return sessions;
}
```

### Dependencies
- Gap 3 (DaemonLifecycle handles most supervision)

---

## Dependency Graph

```
Gap 5 (session ID)    ──────────────────────────────────────────┐
  (independent)                                                 │
                                                                v
Gap 1 (build)  ───>  Gap 3 (auto-start)  ───>  Gap 4 (management tool)
                          │                          │
                          v                          │
                     Gap 2 (hook IPC + MCP server)  <┘
                          │
                          v
                     Gap 6 (supervision)
```

### Recommended Implementation Order

1. **Gap 5** — Session ID propagation (minimal, independent changes to types)
2. **Gap 1** — Build integration (one file change, enables everything else)
3. **Gap 6** — Supervision (enhance discoverDaemonSocket, add ping RPC)
4. **Gap 3** — Auto-start (DaemonLifecycle class, depends on build)
5. **Gap 2** — Hook IPC + MCP server restructuring (largest change, depends on auto-start)
6. **Gap 4** — Management tool (depends on DaemonLifecycle + MCP server changes)

---

## Files to Create

| File | Purpose |
|------|--------|
| `runtime-engine/src/transport/daemon-lifecycle.ts` | Daemon process management: start, stop, status, health check |
| `runtime-engine/src/plugins/mcp/handlers/daemon-handler.ts` | MCP tool handler for `runtime_daemon` |

## Files to Modify

| File | Changes |
|------|--------|
| `runtime-engine/build.mjs` | Add second esbuild entry for `dist/daemon.cjs` |
| `runtime-engine/src/transport/factory.ts` | Add `sessionId` to options, enhance `discoverDaemonSocket` with PID liveness check |
| `runtime-engine/src/transport/remote-transport.ts` | Accept optional `sessionId` in constructor |
| `runtime-engine/src/transport/index.ts` | Export `DaemonLifecycle` |
| `runtime-engine/src/transport/daemon-server.ts` | Add `ping` and `listSessions` RPC methods |
| `runtime-engine/src/plugins/mcp/mcp-server.ts` | Restructure to support daemon/hybrid/engaged modes |
| `runtime-engine/src/plugins/mcp/tool-handlers.ts` | Register `runtime_daemon` handler and schema |
| `tools/definitions/runtime-engine/runtime_daemon.yaml` | Tool definition for `runtime_daemon` |

## Files Unchanged

| File | Why |
|------|-----|
| `runtime-engine/src/bootstrap.ts` | Engine startup is identical — daemon.ts calls it the same way |
| `runtime-engine/src/extensions/ipc/setup.ts` | IPC subsystem creation is generic — works in both local and daemon |
| `runtime-engine/src/extensions/ipc/ipc-router.ts` | Router already handles session-scoped operations |
| `hooks/scripts/src/shared/runtime-client.ts` | Hook discovery already finds sockets via pointer files |
| `runtime-engine/src/transport/daemon.ts` | Daemon entry point already correct |
| `runtime-engine/src/transport/daemon-protocol.ts` | Protocol messages unchanged |
| `runtime-engine/src/transport/types.ts` | Transport interface unchanged |
| `runtime-engine/src/transport/local-transport.ts` | Local transport unchanged |
| `runtime-engine/src/shared/config.ts` | Config schema already has all needed fields |

---

## Risk Assessment

### Risk 1: Dual IPC Sockets (Hybrid Mode)
- **Probability**: Medium
- **Impact**: Medium
- **Description**: In hybrid mode with daemon unavailable, the MCP server creates a local engine + IPC socket. If the daemon later starts, there are two engines with two IPC sockets. Hooks will discover the most recent one.
- **Mitigation**: When hybrid transport falls back to local, log a clear warning. The pointer file mtime ordering in RuntimeClient ensures the most recent socket is preferred. If daemon starts after local fallback, the MCP server would need to reconnect — this is a future enhancement, not Phase 8.

### Risk 2: Hook Events Reaching Wrong Engine
- **Probability**: Low
- **Impact**: High
- **Description**: If both a local engine and daemon engine are running for the same project, hook events could go to either.
- **Mitigation**: In daemon mode, the MCP server does NOT create a local engine. In hybrid mode with daemon available, local engine exists but is not used. Hook pointer files from the daemon's engine will be more recent.

### Risk 3: Stale Daemon Process
- **Probability**: Medium
- **Impact**: Low
- **Description**: Daemon crashes without cleanup, leaving stale PID/socket files.
- **Mitigation**: `DaemonLifecycle.isRunning()` verifies PID + socket probe. `discoverDaemonSocket()` checks PID liveness. Multiple layers of orphan detection.

### Risk 4: Session ID Mismatch
- **Probability**: Low
- **Impact**: Medium
- **Description**: Claude Code session ID format may differ from what the IPC router expects.
- **Mitigation**: Session ID is treated as an opaque string throughout. The RemoteTransport falls back to a random ID if none is provided.

---

## Testing Strategy

### Unit Tests
- `daemon-lifecycle.test.ts` — Mock spawn, PID file ops, socket probing
- `factory.test.ts` — Add tests for `sessionId` propagation and enhanced `discoverDaemonSocket`
- `daemon-server.test.ts` — Add tests for `ping` and `listSessions` RPC
- `daemon-handler.test.ts` — Test start/stop/status/sessions actions

### Integration Tests
- Start daemon process, verify PID file + socket creation
- Connect RemoteTransport with session ID, verify session_join message
- Send RPC calls through RemoteTransport, verify round-trip
- Stop daemon, verify cleanup of PID + socket files
- Auto-start: verify daemon spawns when MCP server starts in hybrid mode
- Hook routing: verify hooks discover daemon socket via pointer file

### Manual Verification
1. Set `executor.mode: 'hybrid'` in config
2. Start MCP server — should auto-start daemon if `auto_start: true`
3. Verify `runtime_daemon status` shows running daemon
4. Verify `runtime_daemon sessions` shows connected MCP server
5. Stop MCP server — daemon should continue running
6. Start another MCP server — should connect to existing daemon
7. `runtime_daemon stop` — verify clean shutdown
8. Switch back to `executor.mode: 'engaged'` — verify zero behavior change

---

## Architectural Decision Record

### ADR: Daemon Shares Engine's IPC Socket

**Status**: Proposed

**Context**: Hook scripts communicate with the runtime engine via IPC Unix socket. When the daemon hosts the engine, hooks need to reach the daemon.

**Decision**: The daemon's `RuntimeEngine.startup()` creates the IPC socket as usual. Hooks discover it via the existing pointer file mechanism. No separate "daemon IPC" socket is needed.

**Rationale**:
- The IPC subsystem is part of `RuntimeEngine`, not part of the MCP server
- When daemon.ts bootstraps the engine, IPC creation happens automatically
- Hook discovery via pointer files already handles multiple sockets (mtime ordering)
- Session routing within the IPC router is already session-aware

**Consequence**: The daemon's socket pointer file (`runtime-{daemonPid}.socket` in `.goodvibes/state/`) must be the most recent for hooks to prefer it. Since the daemon starts before MCP servers connect, this is naturally the case.

### ADR: MCP Server Without Local Engine in Daemon Mode

**Status**: Proposed

**Context**: In `executor.mode: 'daemon'`, the MCP server currently creates a full `RuntimeEngine` with all subsystems.

**Decision**: In pure daemon mode, the MCP server skips local engine creation entirely. All RuntimeTransport calls route through `RemoteTransport` to the daemon.

**Rationale**:
- Running two engines (local + daemon) for the same project wastes resources and creates state conflicts
- The transport abstraction was specifically designed to make this possible
- MCP handlers already use `ctx.transport` for all operations (Phase 5 migration)

**Consequence**: `HandlerContext` fields that reach into the engine directly (`getEventBus`, etc.) return null in daemon mode. Any handler still using these legacy fields will need migration.

### ADR: Separate Daemon RPC Socket from Hook IPC Socket

**Status**: Accepted (from Phase 1-7 design)

**Context**: The daemon needs a socket for MCP server connections (RemoteTransport) and the engine needs a socket for hook connections (IPC).

**Decision**: Two separate sockets:
- **Daemon RPC socket**: `.goodvibes/goodvibes-runtime.sock` — for RemoteTransport connections
- **Hook IPC socket**: `/tmp/goodvibes-runtime-{hash}-{pid}.sock` — for hook script connections

**Rationale**: Different protocols (daemon-protocol.ts vs IPC protocol), different clients (MCP servers vs hook scripts), different lifecycles. Mixing them would create protocol confusion.
