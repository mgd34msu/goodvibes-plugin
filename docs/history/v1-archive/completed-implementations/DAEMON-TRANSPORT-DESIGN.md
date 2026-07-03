# Daemon Transport Design

> Transport abstraction layer enabling both local (in-process) and daemon (out-of-process) modes as first-class citizens.

**Date:** 2026-03-03  
**Status:** Proposed  
**Author:** Architect Agent  

---

## Table of Contents

1. [Current Architecture Summary](#1-current-architecture-summary)
2. [Transport Abstraction Interface](#2-transport-abstraction-interface)
3. [Local Transport Implementation](#3-local-transport-implementation)
4. [Remote Transport Implementation](#4-remote-transport-implementation)
5. [Daemon Process Design](#5-daemon-process-design)
6. [IPC Router Modifications](#6-ipc-router-modifications)
7. [Session Lifecycle](#7-session-lifecycle)
8. [State Migration Strategy](#8-state-migration-strategy)
9. [Configuration](#9-configuration)
10. [File-by-File Implementation Plan](#10-file-by-file-implementation-plan)
11. [Risk Assessment](#11-risk-assessment)
12. [Decisions Log](#12-decisions-log)

---

## 1. Current Architecture Summary

### How Things Flow Today

The runtime engine operates entirely in-process within Claude Code's MCP tool process:

```
Claude Code (LLM)
  |
  v
MCP StdioServerTransport
  |
  v
RuntimeEngineServer (plugins/mcp/mcp-server.ts)
  |  - Creates RuntimeEngine
  |  - Routes CallTool requests to handler registry
  v
HandlerContext (plugins/mcp/handlers/types.ts)
  |  - Facade over RuntimeEngine accessors
  |  - getEventBus(), getConfig(), getCoreStateStore(), etc.
  v
RuntimeEngine (bootstrap.ts)
  |  - Composition root for all subsystems
  |  - L1 Core: EventProcessor, StateStore, EventQueue, TriggerRegistry
  |  - L2 Extensions: Events, Workflow, Triggers, Agents, Directives, IPC, Persistence, Executor
  |  - L3 Plugins: WRFC, AgentTracker, Time, External, Hooks
  |
  +---> IPCServer (shared/ipc/ipc-server.ts)
  |       |  - Unix domain socket server
  |       |  - One-message-per-connection protocol
  |       |  - Used by hook scripts, NOT by MCP tools
  |       v
  |     IPCRouter (extensions/ipc/ipc-router.ts)
  |       |  - Routes hook_event, query, state_update, heartbeat
  |       |  - Manages session pointers, directive draining
  |       v
  |     [EventBus, TriggerRegistry, WorkflowEngine, DirectiveQueue, ...]
  |
  +---> RuntimeClient (shared/ipc/client.ts)
          - Used by hook scripts (session-start, subagent-stop, etc.)
          - Discovers socket via pointer files or env var
          - sendHookEvent(), query()
```

### Key Data Flows

| Flow | Path | Protocol |
|------|------|----------|
| MCP tool call | Claude Code -> stdio -> RuntimeEngineServer -> HandlerContext -> RuntimeEngine | In-process function calls |
| Hook event | Hook script -> RuntimeClient -> Unix socket -> IPCServer -> IPCRouter -> subsystems | Newline-delimited JSON |
| State query | MCP tool -> HandlerContext -> RuntimeEngine.getCoreStateStore() | In-process function calls |
| Event emission | MCP tool -> HandlerContext -> RuntimeEngine.getEventBus().emit() | In-process function calls |

### Existing Infrastructure We Can Reuse

1. **IPC Protocol** (`shared/ipc/protocol.ts`): Already defines `IPCMessage`, `IPCResponse`, `IPCQuery`, `Directive` types with newline-delimited JSON transport.
2. **RuntimeClient** (`shared/ipc/client.ts`): Already implements socket discovery, connection, and send/receive.
3. **ExecutorMode** (`shared/config.ts`): Already defines `'engaged' | 'daemon' | 'hybrid'` mode enum and `DaemonConfig`.
4. **PID file management** (`core/utils/pid-file.ts`): Already handles crash recovery.
5. **Socket pointer files**: Already written per-PID and per-session in `.goodvibes/state/`.

---

## 2. Transport Abstraction Interface

### Design Principles

1. **Zero overhead for local mode.** The transport interface must not add indirection in the hot path when running locally. Local transport is a direct reference, not a proxy.
2. **Same return types.** Both transports return identical types -- no transport-specific wrappers.
3. **Minimal surface.** The interface exposes only what MCP tool handlers actually need, not the entire RuntimeEngine.
4. **Graceful degradation.** If the daemon is unreachable, fall back to local transparently.

### Interface Definition

```typescript
// src/transport/types.ts

import type { RuntimeConfig } from '../shared/config.js';
import type { HealthStatus } from '../shared/types.js';
import type { RuntimeEvent, EventFilter } from '../shared/events.js';
import type { IPCResponseData } from '../shared/ipc/protocol.js';

/**
 * Transport mode discriminant.
 */
export type TransportMode = 'local' | 'remote';

/**
 * Unified transport interface for the runtime engine.
 *
 * Both local (in-process) and remote (daemon) implementations
 * provide identical semantics. MCP tool handlers interact only
 * with this interface, never with RuntimeEngine directly.
 *
 * Methods mirror HandlerContext but are async-first to accommodate
 * remote transport latency. Local transport methods resolve
 * synchronously via already-resolved promises.
 */
export interface RuntimeTransport {
  /** Which mode this transport is operating in. */
  readonly mode: TransportMode;

  /** Whether the transport is connected and ready. */
  isReady(): boolean;

  // ─── Lifecycle ─────────────────────────────────────────────

  /** Connect to the runtime (no-op for local, socket connect for remote). */
  connect(): Promise<void>;

  /** Disconnect from the runtime (no-op for local, socket close for remote). */
  disconnect(): Promise<void>;

  // ─── Status ────────────────────────────────────────────────

  /** Engine uptime in milliseconds. */
  getUptime(): Promise<number>;

  /** Current runtime configuration. */
  getConfig(): Promise<RuntimeConfig>;

  /** Current health status. */
  getHealth(): Promise<HealthStatus>;

  /** Engine version string. */
  getVersion(): Promise<string>;

  /** Project root path. */
  getProjectRoot(): Promise<string>;

  // ─── Configuration ─────────────────────────────────────────

  /** Update the runtime configuration. */
  updateConfig(config: RuntimeConfig): Promise<void>;

  // ─── State ─────────────────────────────────────────────────

  /** Get a value from the core state store. */
  getState(key: string): Promise<unknown>;

  /** Set a value in the core state store. */
  setState(key: string, value: unknown): Promise<void>;

  /** Delete a key from the core state store. */
  deleteState(key: string): Promise<void>;

  /** List state keys with optional prefix filter. */
  listStateKeys(prefix?: string): Promise<string[]>;

  /** Full state snapshot. */
  getStateSnapshot(): Promise<Record<string, unknown>>;

  // ─── Events ────────────────────────────────────────────────

  /** Emit an event on the event bus. */
  emitEvent(event: RuntimeEvent): Promise<void>;

  /** Query the event log with filters. */
  queryEvents(filter: EventFilter): Promise<RuntimeEvent[]>;

  /** Get current event queue depth. */
  getQueueDepth(): Promise<number>;

  // ─── Workflows ─────────────────────────────────────────────

  /** Get workflow instance by ID. @returns WorkflowInstance or null */
  getWorkflow(workflowId: string): Promise<Record<string, unknown> | null>;

  /** List all active workflow instances. @returns WorkflowInstance[] */
  listWorkflows(): Promise<Record<string, unknown>[]>;

  /** Start a new workflow instance. */
  startWorkflow(
    definitionId: string,
    context?: Record<string, unknown>,
  ): Promise<{ workflow_id: string }>;

  /** Transition a workflow to the next state. */
  transitionWorkflow(
    workflowId: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  // ─── Triggers ──────────────────────────────────────────────

  /** List all registered triggers. @returns TriggerDefinition[] */
  listTriggers(): Promise<Record<string, unknown>[]>;

  /** Get a trigger by ID. @returns TriggerDefinition or null */
  getTrigger(triggerId: string): Promise<Record<string, unknown> | null>;

  /** Register a new trigger. */
  registerTrigger(definition: Record<string, unknown>): Promise<void>;

  /** Unregister a trigger. */
  unregisterTrigger(triggerId: string): Promise<boolean>;

  // ─── Agents ────────────────────────────────────────────────

  /** Get agent status by ID. @returns AgentRecord or null */
  getAgent(agentId: string): Promise<Record<string, unknown> | null>;

  /** List all agents. @returns AgentRecord[] */
  listAgents(): Promise<Record<string, unknown>[]>;

  // ─── Directives ────────────────────────────────────────────

  /** Drain directives for a target. Returns raw directives — message assembly is a handler concern. */
  drainDirectives(
    target: string,
    workflowId?: string,
  ): Promise<{ directives: unknown[] }>;
}
```

### Why Not Extend HandlerContext?

`HandlerContext` (from `plugins/mcp/handlers/types.ts`) returns subsystem instances directly (`getEventBus(): EventBus`, `getWorkflowEngine(): WorkflowEngine | null`). These subsystem objects have rich interfaces with internal state that cannot be serialized over a socket. The transport interface instead exposes **operations** (verbs) rather than **objects** (nouns), making it naturally serializable.

---

## 3. Local Transport Implementation

### Design: Zero-Overhead Wrapper

The local transport wraps `RuntimeEngine` accessors. Since all calls are in-process, the async methods resolve immediately. No serialization, no socket overhead, no new abstractions in the hot path.

```typescript
// src/transport/local-transport.ts

import type { RuntimeTransport, TransportMode } from './types.js';
import type { RuntimeEngine } from '../bootstrap.js';
import type { RuntimeConfig } from '../shared/config.js';
import type { RuntimeEvent, EventFilter } from '../shared/events.js';
import { ENGINE_VERSION } from '../shared/constants.js';

/**
 * In-process transport — wraps RuntimeEngine with zero overhead.
 *
 * This is the default transport. All methods delegate directly to
 * RuntimeEngine accessors. Async signatures exist only for interface
 * compatibility with RemoteTransport; they resolve synchronously.
 */
export class LocalTransport implements RuntimeTransport {
  readonly mode: TransportMode = 'local';
  private readonly engine: RuntimeEngine;

  constructor(engine: RuntimeEngine) {
    this.engine = engine;
  }

  isReady(): boolean {
    return this.engine.isRunning();
  }

  async connect(): Promise<void> {
    // No-op — engine is already in-process
  }

  async disconnect(): Promise<void> {
    // No-op — engine lifecycle managed by RuntimeEngineServer
  }

  // ─── Status ─────────────────────────────────────────────────

  async getUptime(): Promise<number> {
    return this.engine.getUptime();
  }

  async getConfig(): Promise<RuntimeConfig> {
    return this.engine.getConfig();
  }

  async getHealth(): Promise<import('../shared/types.js').HealthStatus> {
    return this.engine.getHealthChecker().check();
  }

  async getVersion(): Promise<string> {
    return ENGINE_VERSION;
  }

  async getProjectRoot(): Promise<string> {
    return this.engine.getProjectRoot();
  }

  // ─── Configuration ──────────────────────────────────────────

  async updateConfig(config: RuntimeConfig): Promise<void> {
    this.engine.updateConfig(config);
  }

  // ─── State ──────────────────────────────────────────────────

  async getState(key: string): Promise<unknown> {
    return this.engine.getCoreStateStore().get(key);
  }

  async setState(key: string, value: unknown): Promise<void> {
    this.engine.getCoreStateStore().set(key, value);
  }

  async deleteState(key: string): Promise<void> {
    this.engine.getCoreStateStore().delete(key);
  }

  async listStateKeys(prefix?: string): Promise<string[]> {
    return this.engine.getCoreStateStore().keys(prefix);
  }

  async getStateSnapshot(): Promise<Record<string, unknown>> {
    return this.engine.getCoreStateStore().snapshot();
  }

  // ─── Events ─────────────────────────────────────────────────

  async emitEvent(event: RuntimeEvent): Promise<void> {
    this.engine.getEventBus().emit(event);
  }

  async queryEvents(filter: EventFilter): Promise<RuntimeEvent[]> {
    return this.engine.getEventLog().query(filter);
  }

  async getQueueDepth(): Promise<number> {
    return this.engine.getEventQueue().depth();
  }

  // ─── Workflows ──────────────────────────────────────────────

  async getWorkflow(workflowId: string): Promise<Record<string, unknown> | null> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) return null;
    const instance = engine.get(workflowId);
    return instance ? (instance as unknown as Record<string, unknown>) : null;
  }

  async listWorkflows(): Promise<Record<string, unknown>[]> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) return [];
    return engine.list().map((i) => i as unknown as Record<string, unknown>);
  }

  async startWorkflow(
    definitionId: string,
    context?: Record<string, unknown>,
  ): Promise<{ workflow_id: string }> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error('Workflow engine not available');
    const instance = await engine.start(definitionId, context);
    return { workflow_id: instance.id };
  }

  async transitionWorkflow(
    workflowId: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error('Workflow engine not available');
    const result = await engine.transition(workflowId, event, data);
    return result as unknown as Record<string, unknown>;
  }

  // ─── Triggers ───────────────────────────────────────────────

  async listTriggers(): Promise<Record<string, unknown>[]> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return [];
    return registry.list().map((t) => t as unknown as Record<string, unknown>);
  }

  async getTrigger(triggerId: string): Promise<Record<string, unknown> | null> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return null;
    const trigger = registry.get(triggerId);
    return trigger ? (trigger as unknown as Record<string, unknown>) : null;
  }

  async registerTrigger(definition: Record<string, unknown>): Promise<void> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) throw new Error('Trigger registry not available');
    registry.register(definition as any);
  }

  async unregisterTrigger(triggerId: string): Promise<boolean> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return false;
    return registry.unregister(triggerId);
  }

  // ─── Agents ─────────────────────────────────────────────────

  async getAgent(agentId: string): Promise<Record<string, unknown> | null> {
    const coordinator = this.engine.getAgentCoordinator();
    if (!coordinator) return null;
    const agent = coordinator.getAgent(agentId);
    return agent ? (agent as unknown as Record<string, unknown>) : null;
  }

  async listAgents(): Promise<Record<string, unknown>[]> {
    const coordinator = this.engine.getAgentCoordinator();
    if (!coordinator) return [];
    return coordinator.list().map((a) => a as unknown as Record<string, unknown>);
  }

  // ─── Directives ─────────────────────────────────────────────

  async drainDirectives(
    target: string,
    workflowId?: string,
  ): Promise<{ directives: unknown[] }> {
    const queue = this.engine.getDirectiveQueue();
    if (!queue) return { directives: [] };
    const result = queue.holdDrain(target, workflowId);
    // NOTE: Message assembly (filtering by type, sorting by priority, joining)
    // is a presentation concern — it stays in the MCP handler layer, not here.
    // Transport returns raw directives only.
    return { directives: result.directives };
  }
}
```

---

## 4. Remote Transport Implementation

### Design: Daemon RPC Client

The remote transport communicates with a daemon process over a Unix socket. It extends the existing IPC protocol with a new message type (`rpc_call`) for transport-level operations, distinct from hook-level operations.

### Daemon Protocol Extension

```typescript
// src/transport/daemon-protocol.ts

/**
 * RPC call message — used by RemoteTransport to invoke
 * RuntimeTransport methods on the daemon.
 *
 * Extends the existing IPC protocol with a transport-specific
 * message type. The daemon socket is separate from the hook
 * IPC socket to avoid interference.
 */
export interface DaemonRPCRequest {
  type: 'rpc_call';
  id: string;
  /** Method name from RuntimeTransport interface. */
  method: string;
  /** Serialized arguments array. */
  args: unknown[];
  /** Session ID of the calling client. */
  session_id: string;
}

export interface DaemonRPCResponse {
  id: string;
  status: 'ok' | 'error';
  /** Serialized return value. */
  result?: unknown;
  /** Error message if status === 'error'. */
  error?: string;
}

/**
 * Session management messages.
 */
export interface DaemonSessionMessage {
  type: 'session_join' | 'session_leave';
  id: string;
  session_id: string;
  /** State snapshot to merge on join (optional). */
  state_snapshot?: Record<string, unknown>;
}

/** All daemon protocol messages. */
export type DaemonMessage = DaemonRPCRequest | DaemonSessionMessage;
```

### Remote Transport

```typescript
// src/transport/remote-transport.ts

import * as net from 'node:net';
import type { RuntimeTransport, TransportMode } from './types.js';
import type { DaemonRPCRequest, DaemonRPCResponse } from './daemon-protocol.js';
import { generateId } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('remote-transport');

/**
 * Remote transport — proxies RuntimeTransport calls to a daemon
 * process over a Unix domain socket.
 *
 * Uses a request/response pattern: one connection per call,
 * matching the existing IPC server design. The daemon runs a
 * separate socket from the hook IPC socket.
 *
 * Falls back to null returns on connection failure so callers
 * can detect daemon unavailability.
 */
export class RemoteTransport implements RuntimeTransport {
  readonly mode: TransportMode = 'remote';

  private readonly daemonSocketPath: string;
  private readonly sessionId: string;
  private readonly timeoutMs: number;
  private ready = false;

  constructor(opts: {
    daemonSocketPath: string;
    sessionId: string;
    timeoutMs?: number;
  }) {
    this.daemonSocketPath = opts.daemonSocketPath;
    this.sessionId = opts.sessionId;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  isReady(): boolean {
    return this.ready;
  }

  async connect(): Promise<void> {
    // Send session_join to daemon
    const response = await this.sendRaw({
      type: 'session_join',
      id: generateId(),
      session_id: this.sessionId,
    });
    if (response?.status === 'ok') {
      this.ready = true;
      logger.info('Connected to daemon', { socket: this.daemonSocketPath });
    } else {
      throw new Error(
        `Failed to join daemon session: ${response?.error ?? 'no response'}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.ready) return;
    await this.sendRaw({
      type: 'session_leave',
      id: generateId(),
      session_id: this.sessionId,
    });
    this.ready = false;
    logger.info('Disconnected from daemon');
  }

  // ─── RPC Proxy ─────────────────────────────────────────────

  // Each method delegates to the private rpc() helper which
  // serializes the call, sends it to the daemon, and deserializes
  // the response. Type safety is maintained at the interface level.

  async getUptime()        { return this.rpc<number>('getUptime'); }
  async getConfig()        { return this.rpc('getConfig'); }
  async getHealth()        { return this.rpc('getHealth'); }
  async getVersion()       { return this.rpc<string>('getVersion'); }
  async getProjectRoot()   { return this.rpc<string>('getProjectRoot'); }
  async updateConfig(c: any) { return this.rpc<void>('updateConfig', c); }
  async getState(k: string)  { return this.rpc('getState', k); }
  async setState(k: string, v: unknown) { return this.rpc<void>('setState', k, v); }
  async deleteState(k: string) { return this.rpc<void>('deleteState', k); }
  async listStateKeys(p?: string) { return this.rpc<string[]>('listStateKeys', p); }
  async getStateSnapshot()  { return this.rpc('getStateSnapshot'); }
  async emitEvent(e: any)   { return this.rpc<void>('emitEvent', e); }
  async queryEvents(f: any) { return this.rpc('queryEvents', f); }
  async getQueueDepth()     { return this.rpc<number>('getQueueDepth'); }
  async getWorkflow(id: string)    { return this.rpc('getWorkflow', id); }
  async listWorkflows()            { return this.rpc('listWorkflows'); }
  async startWorkflow(d: string, c?: any) { return this.rpc('startWorkflow', d, c); }
  async transitionWorkflow(id: string, e: string, d?: any) {
    return this.rpc('transitionWorkflow', id, e, d);
  }
  async listTriggers()     { return this.rpc('listTriggers'); }
  async getTrigger(id: string) { return this.rpc('getTrigger', id); }
  async registerTrigger(d: any) { return this.rpc<void>('registerTrigger', d); }
  async unregisterTrigger(id: string) { return this.rpc<boolean>('unregisterTrigger', id); }
  async getAgent(id: string)   { return this.rpc('getAgent', id); }
  async listAgents()           { return this.rpc('listAgents'); }
  async drainDirectives(t: string, w?: string) {
    return this.rpc('drainDirectives', t, w);
  }

  // ─── Private ───────────────────────────────────────────────

  private async rpc<T>(method: string, ...args: unknown[]): Promise<T> {
    const request: DaemonRPCRequest = {
      type: 'rpc_call',
      id: generateId(),
      method,
      args,
      session_id: this.sessionId,
    };
    const response = await this.sendRaw(request);
    if (!response || response.status === 'error') {
      throw new Error(`Daemon RPC failed: ${method} — ${response?.error ?? 'no response'}`);
    }
    return response.result as T;
  }

  /**
   * Low-level send: connects to daemon socket, writes JSON + newline,
   * reads JSON + newline response, closes connection.
   *
   * Mirrors RuntimeClient.send() but targets the daemon socket.
   */
  private async sendRaw(message: Record<string, unknown>): Promise<DaemonRPCResponse | null> {
    return new Promise<DaemonRPCResponse | null>((resolve) => {
      let resolved = false;
      const done = (result: DaemonRPCResponse | null): void => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        socket.destroy();
        done(null);
      }, this.timeoutMs);

      const socket = net.createConnection({ path: this.daemonSocketPath });

      socket.once('error', () => done(null));
      socket.once('connect', () => {
        socket.write(JSON.stringify(message) + '\n', 'utf-8');
      });

      let rawData = '';
      socket.on('data', (chunk) => {
        rawData += chunk.toString('utf-8');
        const idx = rawData.indexOf('\n');
        if (idx === -1) return;
        const line = rawData.slice(0, idx);
        socket.destroy();
        try {
          done(JSON.parse(line) as DaemonRPCResponse);
        } catch {
          done(null);
        }
      });

      socket.once('close', () => done(null));
    });
  }
}
```

---

## 5. Daemon Process Design

### Overview

The daemon is a standalone Node.js process that runs the exact same `RuntimeEngine` code. It exposes a second Unix socket (the "daemon socket") that `RemoteTransport` clients connect to. The existing hook IPC socket continues to operate normally.

```
┌─────────────────────────────────────────────────────────┐
│  Daemon Process (node daemon.ts)                        │
│                                                         │
│  ┌──────────────────────────────────────┐                │
│  │  RuntimeEngine (identical bootstrap) │                │
│  │  - All subsystems                    │                │
│  │  - Hook IPC socket (for hooks)       │                │
│  └──────────────┬───────────────────────┘                │
│                 │                                        │
│  ┌──────────────┴───────────────────────┐                │
│  │  DaemonServer                        │                │
│  │  - Daemon socket (for MCP sessions)  │                │
│  │  - Session registry                  │                │
│  │  - RPC dispatcher                    │                │
│  │  - LocalTransport as handler         │                │
│  └──────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ (daemon socket)              │ (hook socket)
         │                              │
    Session A (MCP)               Hook scripts
    Session B (MCP)
    Session C (MCP)
```

### Daemon Server

```typescript
// src/transport/daemon-server.ts

import * as net from 'node:net';
import type { RuntimeTransport } from './types.js';
import type { DaemonMessage, DaemonRPCRequest, DaemonRPCResponse,
  DaemonSessionMessage } from './daemon-protocol.js';
import { LocalTransport } from './local-transport.js';
import type { RuntimeEngine } from '../bootstrap.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('daemon-server');

/**
 * Daemon server that hosts a RuntimeEngine and accepts remote
 * transport connections from MCP tool sessions.
 *
 * Architecture:
 * - Runs the same RuntimeEngine bootstrap as the in-process mode
 * - Exposes a separate Unix socket for daemon RPC (not the hook socket)
 * - Each connected session gets an entry in the session registry
 * - RPC calls are dispatched to a LocalTransport wrapping the engine
 */
export class DaemonServer {
  private server: net.Server | null = null;
  private readonly transport: LocalTransport;
  private readonly socketPath: string;
  private readonly sessions = new Map<string, { joinedAt: number }>();

  constructor(engine: RuntimeEngine, socketPath: string) {
    this.transport = new LocalTransport(engine);
    this.socketPath = socketPath;
  }

  async start(): Promise<void> {
    // Similar to IPCServer.listen() — create dir, remove stale, bind
    const { mkdirSync, existsSync, unlinkSync, chmodSync } = await import('node:fs');
    const { dirname } = await import('node:path');

    const dir = dirname(this.socketPath);
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    if (existsSync(this.socketPath)) {
      try { unlinkSync(this.socketPath); } catch { /* ignore */ }
    }

    this.server = net.createServer((socket) => this.handleConnection(socket));

    return new Promise<void>((resolve, reject) => {
      const srv = this.server!;
      srv.once('error', reject);
      srv.listen(this.socketPath, () => {
        chmodSync(this.socketPath, 0o600);
        srv.removeListener('error', reject);
        logger.info('Daemon server listening', { socket: this.socketPath });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const socketPath = this.socketPath;
    return new Promise<void>((resolve) => {
      const srv = this.server!;
      this.server = null;
      srv.close(async () => {
        try {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(socketPath);
        } catch { /* ignore */ }
        logger.info('Daemon server stopped');
        resolve();
      });
    });
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  // ─── Connection Handling ─────────────────────────────────

  private handleConnection(socket: net.Socket): void {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => socket.destroy(), 10_000);

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks).toString('utf-8');
      const idx = combined.indexOf('\n');
      if (idx === -1) return;

      clearTimeout(timer);
      socket.pause();

      const line = combined.slice(0, idx);
      this.processMessage(socket, line);
    });

    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
    });

    socket.once('close', () => clearTimeout(timer));
  }

  private async processMessage(socket: net.Socket, line: string): Promise<void> {
    let message: DaemonMessage;
    try {
      message = JSON.parse(line) as DaemonMessage;
    } catch {
      this.writeResponse(socket, { id: 'unknown', status: 'error', error: 'Invalid JSON' });
      return;
    }

    let response: DaemonRPCResponse;

    if (message.type === 'session_join') {
      response = this.handleSessionJoin(message);
    } else if (message.type === 'session_leave') {
      response = this.handleSessionLeave(message);
    } else if (message.type === 'rpc_call') {
      response = await this.handleRPCCall(message);
    } else {
      response = { id: (message as any).id ?? '', status: 'error', error: 'Unknown message type' };
    }

    this.writeResponse(socket, response);
  }

  private handleSessionJoin(msg: DaemonSessionMessage): DaemonRPCResponse {
    this.sessions.set(msg.session_id, { joinedAt: Date.now() });
    logger.info('Session joined daemon', {
      session_id: msg.session_id,
      total_sessions: this.sessions.size,
    });
    return { id: msg.id, status: 'ok', result: { session_count: this.sessions.size } };
  }

  private handleSessionLeave(msg: DaemonSessionMessage): DaemonRPCResponse {
    this.sessions.delete(msg.session_id);
    logger.info('Session left daemon', {
      session_id: msg.session_id,
      total_sessions: this.sessions.size,
    });
    return { id: msg.id, status: 'ok', result: { session_count: this.sessions.size } };
  }

  private async handleRPCCall(msg: DaemonRPCRequest): Promise<DaemonRPCResponse> {
    const { method, args } = msg;

    // Guard: reject calls from sessions that haven't joined
    if (!this.sessions.has(msg.session_id)) {
      return {
        id: msg.id,
        status: 'error',
        error: 'Session not registered. Send session_join first.',
      };
    }

    // Validate method exists on transport
    const transport = this.transport as unknown as Record<string, unknown>;
    if (typeof transport[method] !== 'function') {
      return { id: msg.id, status: 'error', error: `Unknown method: ${method}` };
    }

    try {
      const result = await (transport[method] as Function).apply(this.transport, args);
      return { id: msg.id, status: 'ok', result };
    } catch (err) {
      return {
        id: msg.id,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private writeResponse(socket: net.Socket, response: DaemonRPCResponse): void {
    try {
      socket.end(JSON.stringify(response) + '\n', 'utf-8');
    } catch {
      socket.destroy();
    }
  }
}
```

### Daemon Entry Point

```typescript
// src/transport/daemon.ts

import { RuntimeEngine } from '../bootstrap.js';
import { loadConfig } from '../shared/config.js';
import { DaemonServer } from './daemon-server.js';
import { createLogger } from '../shared/logger.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const logger = createLogger('daemon');

/**
 * Daemon entry point.
 *
 * Boots the same RuntimeEngine as the MCP server, then starts a
 * DaemonServer on a separate Unix socket. Sessions connect to this
 * socket instead of running their own RuntimeEngine.
 *
 * Usage:
 *   node --loader ts-node/esm src/transport/daemon.ts [project-root]
 */
async function main(): Promise<void> {
  const projectRoot = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const config = loadConfig(projectRoot);

  // Compute daemon socket path (separate from hook IPC socket)
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  const daemonSocketPath = join(
    config.ipc.socket_dir,
    `goodvibes-daemon-${hash}.sock`,
  );

  // Boot RuntimeEngine
  const engine = new RuntimeEngine(config, projectRoot);
  await engine.startup();

  // Start daemon server
  const daemon = new DaemonServer(engine, daemonSocketPath);
  await daemon.start();

  // Write daemon pointer file for discovery
  const pointerFile = join(projectRoot, '.goodvibes', 'state', 'daemon.socket');
  writeFileSync(pointerFile, daemonSocketPath, 'utf-8');

  // Write PID file for crash detection, process management, and duplicate prevention
  const pidFile = join(projectRoot, '.goodvibes', 'state', 'daemon.pid');
  writeFileSync(pidFile, String(process.pid), 'utf-8');

  logger.info('Daemon started', {
    project: projectRoot,
    socket: daemonSocketPath,
    pid: process.pid,
  });

  // Signal handlers
  const shutdown = async () => {
    logger.info('Daemon shutting down');
    await daemon.stop();
    await engine.shutdown();
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(pointerFile);
      unlinkSync(pidFile);
    } catch { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Daemon failed to start', { error: String(err) });
  process.exit(1);
});
```

---

## 6. IPC Router Modifications

### Scope: Minimal

The IPC router (`extensions/ipc/ipc-router.ts`) requires **no changes** for the transport layer. It handles hook-to-engine communication, which is orthogonal to MCP-to-engine communication.

The only addition is awareness that hook events may originate from sessions that are connected via the daemon rather than in-process. This is already handled correctly because:

1. Hook scripts discover the IPC socket independently (via pointer files)
2. The IPC router processes hook events regardless of which RuntimeEngine instance hosts the subsystems
3. Session pointer files are written during `session:started` handling

When running in daemon mode:
- The daemon's RuntimeEngine creates the hook IPC socket as usual
- Hook scripts connect to it via the normal discovery path
- The IPC router processes events identically

The only change needed is in the **setup** layer, not the router itself:

```typescript
// extensions/ipc/setup.ts — add daemon socket pointer alongside hook socket pointer

// In createIPCSubsystem(), after writing the hook socket pointer:
if (opts.daemonSocketPath) {
  const daemonPointer = join(stateDir, 'daemon.socket');
  writeFileSync(daemonPointer, opts.daemonSocketPath, 'utf-8');
}
```

---

## 7. Session Lifecycle

### Join Flow

```
1. MCP session starts
2. RuntimeEngineServer constructor runs
3. TransportFactory checks config:
   a. mode === 'engaged' → LocalTransport (default)
   b. mode === 'daemon'  → attempt RemoteTransport
   c. mode === 'hybrid'  → attempt RemoteTransport, fallback to LocalTransport
4. For RemoteTransport:
   a. Discover daemon socket (pointer file or env var)
   b. Send session_join message
   c. If daemon unreachable and mode === 'hybrid': fallback to LocalTransport
   d. If daemon unreachable and mode === 'daemon': throw startup error
5. Transport is ready — MCP tool calls route through it
```

### Leave Flow

```
1. MCP session ends (SIGINT/SIGTERM or transport close)
2. RuntimeEngineServer.stop() called
3. transport.disconnect()
   - LocalTransport: no-op (engine shutdown handled by RuntimeEngineServer)
   - RemoteTransport: sends session_leave to daemon
4. Engine shutdown (local) or session deregistration (remote)
```

### Fallback Behavior

```typescript
// src/transport/factory.ts

import type { RuntimeTransport } from './types.js';
import { LocalTransport } from './local-transport.js';
import { RemoteTransport } from './remote-transport.js';
import type { RuntimeEngine } from '../bootstrap.js';
import type { RuntimeConfig } from '../shared/config.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('transport-factory');

/**
 * Discover the daemon socket path.
 *
 * Resolution order:
 * 1. GOODVIBES_DAEMON_SOCKET environment variable
 * 2. Daemon pointer file: .goodvibes/state/daemon.socket
 */
function discoverDaemonSocket(projectRoot: string): string | null {
  const envPath = process.env['GOODVIBES_DAEMON_SOCKET'];
  if (envPath) return envPath;

  const { join } = require('node:path');
  const { existsSync, readFileSync } = require('node:fs');

  const pointerFile = join(projectRoot, '.goodvibes', 'state', 'daemon.socket');
  if (existsSync(pointerFile)) {
    try {
      const socketPath = readFileSync(pointerFile, 'utf-8').trim();
      if (socketPath && existsSync(socketPath)) return socketPath;
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Create the appropriate transport based on configuration.
 *
 * - 'engaged' (default): Always local. Zero overhead.
 * - 'daemon': Always remote. Fails if daemon is unreachable.
 * - 'hybrid': Try remote, fall back to local.
 *
 * @param config - Runtime configuration.
 * @param projectRoot - Absolute project root path.
 * @param engine - RuntimeEngine instance (used for LocalTransport).
 * @param sessionId - Session ID for daemon registration.
 */
export async function createTransport(
  config: RuntimeConfig,
  projectRoot: string,
  engine: RuntimeEngine,
  sessionId: string,
): Promise<RuntimeTransport> {
  const mode = config.executor.mode;

  if (mode === 'engaged') {
    logger.debug('Using local transport (engaged mode)');
    return new LocalTransport(engine);
  }

  // Daemon or hybrid mode — attempt remote connection
  const daemonSocket = discoverDaemonSocket(projectRoot);

  if (!daemonSocket) {
    if (mode === 'daemon') {
      throw new Error(
        'Daemon mode configured but no daemon socket found. ' +
        'Start the daemon with: node daemon.ts',
      );
    }
    // Hybrid: fall back to local
    logger.info('Daemon socket not found — falling back to local transport');
    return new LocalTransport(engine);
  }

  const remote = new RemoteTransport({
    daemonSocketPath: daemonSocket,
    sessionId,
    timeoutMs: config.ipc.connect_timeout_ms,
  });

  try {
    await remote.connect();
    logger.info('Connected to daemon via remote transport', {
      socket: daemonSocket,
    });
    return remote;
  } catch (err) {
    if (mode === 'daemon') {
      throw new Error(
        `Daemon mode configured but connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Hybrid: fall back to local
    logger.warn('Failed to connect to daemon — falling back to local transport', {
      error: err instanceof Error ? err.message : String(err),
    });
    return new LocalTransport(engine);
  }
}
```

---

## 8. State Migration Strategy

### When Joining a Daemon

When a session switches from local to daemon (or a new session joins the daemon), state migration is **optional** and **additive**:

```typescript
// State migration on session_join

interface SessionJoinOptions {
  /** If true, export local state and merge into daemon. */
  migrate_state?: boolean;
  /** Specific state prefixes to migrate (default: all). */
  state_prefixes?: string[];
}
```

Migration strategy:

1. **No migration (default):** The session joins the daemon and uses the daemon's state. Any local state from a previous local run is abandoned. This is the simplest and safest default.

2. **Prefix-scoped merge:** The session exports specific state prefixes (e.g., `agent_tracker.*`, `wrfc.*`) and the daemon merges them into its state store. Conflicts are resolved with last-writer-wins semantics.

3. **Snapshot merge:** The session exports a full state snapshot and the daemon deep-merges it. This is the most aggressive option and risks stomping daemon state from other sessions.

### When Leaving a Daemon

When a session disconnects from the daemon, no state is migrated back. The daemon retains all state. If the session re-enters local mode (hybrid fallback), it starts with fresh state.

**Rationale:** The daemon is the source of truth. Bidirectional state sync introduces consistency hazards (concurrent mutations, merge conflicts). The daemon model is hub-and-spoke, not peer-to-peer.

### State Isolation Between Sessions

Daemon state is shared by design. Multiple sessions see the same:
- Event log
- Workflow instances
- Trigger registry
- Agent coordinator state

This is the primary value of daemon mode: shared context across sessions. Per-session isolation (if needed) should use state key prefixes:

```
shared.workflows.*      — visible to all sessions
session.{id}.agent_tracker.* — per-session agent tracking
```

---

## 9. Configuration

### Config Schema Extension

The existing `DaemonConfig` handles tmux tick/eval scheduling — a different concept from the transport daemon. We create a separate interface to avoid conflation:

```typescript
// In shared/config.ts — NEW interface (do NOT modify DaemonConfig)

// Existing — untouched, handles tmux tick daemon:
// export interface DaemonConfig {
//   clear_context_after_batch: boolean;
//   tmux_session_name: string;
//   tick_command: string;
//   tick_interval_ms: number;
//   auto_tick: boolean;
//   eval_interval_ms: number;
// }

/** Transport daemon config — hosts RuntimeEngine as a standalone process. */
export interface DaemonTransportConfig {
  /** Whether to auto-start the transport daemon on session start. Default: false. */
  auto_start: boolean;
  /** Timeout in ms for daemon RPC calls. Default: 5000. */
  rpc_timeout_ms: number;
  /** Whether to migrate local state into daemon on join. Default: false. */
  migrate_state_on_join: boolean;
}

// Add to ExecutorConfig:
export interface ExecutorConfig {
  mode: ExecutorMode; // 'engaged' | 'daemon' | 'hybrid'
  // ... existing fields ...
  transport: DaemonTransportConfig; // NEW
}

// Default values:
const DAEMON_TRANSPORT_DEFAULTS: DaemonTransportConfig = {
  auto_start: false,
  rpc_timeout_ms: 5000,
  migrate_state_on_join: false,
};
```

> **Note:** `DaemonConfig` (tmux tick scheduler) and `DaemonTransportConfig` (runtime process hosting) are orthogonal. The tmux daemon ticks commands into a Claude session; the transport daemon hosts the RuntimeEngine as a standalone process.

### Runtime Config Tool Extension

The `runtime_config` MCP tool already supports reading and writing config. No changes needed — the new daemon fields are accessible through the existing config interface.

### Switching Modes at Runtime

The `runtime_config` tool can update `executor.mode` at runtime. However, transport switching requires re-initialization. The recommended flow:

1. User calls `runtime_config` to set `executor.mode = 'daemon'`
2. Config is persisted to disk
3. On next session start, the transport factory reads the new mode
4. Mid-session switching is NOT supported (would require re-wiring all handlers)

---

## 10. File-by-File Implementation Plan

### Phase 1: Transport Abstraction (Core)

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/transport/types.ts` | **Create** | ~120 lines | P0 |
| `src/transport/local-transport.ts` | **Create** | ~200 lines | P0 |
| `src/transport/daemon-protocol.ts` | **Create** | ~60 lines | P0 |
| `src/transport/remote-transport.ts` | **Create** | ~180 lines | P0 |
| `src/transport/factory.ts` | **Create** | ~90 lines | P0 |
| `src/transport/index.ts` | **Create** | ~15 lines | P0 |

### Phase 2: Daemon Server

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/transport/daemon-server.ts` | **Create** | ~200 lines | P1 |
| `src/transport/daemon.ts` | **Create** | ~80 lines | P1 |

### Phase 3: MCP Server Integration

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/plugins/mcp/mcp-server.ts` | **Modify** | ~30 lines changed | P1 |
| `src/plugins/mcp/handlers/types.ts` | **Modify** | ~15 lines changed | P1 |
| `src/plugins/mcp/tool-handlers.ts` | **Modify** | ~20 lines changed | P1 |

Changes in mcp-server.ts:
- Import `createTransport` from transport factory
- After `RuntimeEngine.startup()`, create transport via factory
- Pass transport to `HandlerContext` instead of raw engine accessors
- In `stop()`, call `transport.disconnect()` before engine shutdown

Changes in handlers/types.ts:
- Add `transport: RuntimeTransport` to `HandlerContext`
- Keep existing accessors for backward compatibility during migration
- Eventually remove direct engine accessors

### Phase 4: Configuration Extension

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/shared/config.ts` | **Modify** | ~15 lines added | P1 |

Changes:
- Add `auto_start`, `rpc_timeout_ms`, `migrate_state_on_join` to `DaemonConfig`
- Add defaults to `DEFAULT_CONFIG`

### Phase 5: Handler Migration (Per-Handler)

Each MCP tool handler file needs updating to use `RuntimeTransport` instead of direct engine access. This can be done incrementally:

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/plugins/mcp/handlers/status.ts` | **Modify** | ~10 lines | P2 |
| `src/plugins/mcp/handlers/config.ts` | **Modify** | ~10 lines | P2 |
| `src/plugins/mcp/handlers/state.ts` | **Modify** | ~15 lines | P2 |
| `src/plugins/mcp/handlers/events.ts` | **Modify** | ~15 lines | P2 |
| `src/plugins/mcp/handlers/emit.ts` | **Modify** | ~10 lines | P2 |
| `src/plugins/mcp/handlers/workflow.ts` | **Modify** | ~20 lines | P2 |
| `src/plugins/mcp/handlers/triggers.ts` | **Modify** | ~15 lines | P2 |
| `src/plugins/mcp/handlers/agents.ts` | **Modify** | ~10 lines | P2 |

### Phase 6: Tests

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/transport/__tests__/local-transport.test.ts` | **Create** | ~200 lines | P2 |
| `src/transport/__tests__/remote-transport.test.ts` | **Create** | ~250 lines | P2 |
| `src/transport/__tests__/daemon-server.test.ts` | **Create** | ~200 lines | P2 |
| `src/transport/__tests__/factory.test.ts` | **Create** | ~150 lines | P2 |

### Phase 7: Documentation and Tooling

| File | Action | Estimated Changes | Priority |
|------|--------|-------------------|----------|
| `src/transport/index.ts` | **Update** | ~5 lines | P2 |
| `src/index.ts` | **Modify** | ~10 lines | P2 |

### Estimated Totals

| Category | New Files | Modified Files | New Lines | Changed Lines |
|----------|-----------|----------------|-----------|---------------|
| Phase 1 (Core) | 6 | 0 | ~665 | 0 |
| Phase 2 (Daemon) | 2 | 0 | ~280 | 0 |
| Phase 3 (Integration) | 0 | 3 | 0 | ~65 |
| Phase 4 (Config) | 0 | 1 | ~15 | 0 |
| Phase 5 (Handlers) | 0 | 8 | 0 | ~105 |
| Phase 6 (Tests) | 4 | 0 | ~800 | 0 |
| **Total** | **12** | **12** | **~1760** | **~170** |

### Dependency Graph

```
Phase 1 (types, local-transport, daemon-protocol, remote-transport, factory)
  |
  +---> Phase 2 (daemon-server, daemon entry point)
  |
  +---> Phase 3 (mcp-server integration)
          |
          +---> Phase 4 (config extension)
          |
          +---> Phase 5 (handler migration)  [can be incremental]
  |
  +---> Phase 6 (tests)  [can parallel with Phase 3-5]
```

---

## 11. Risk Assessment

### Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Serialization edge cases** — Some RuntimeEngine return values may contain non-JSON-serializable data (functions, circular refs, Dates) | Medium | Medium | Audit all transport method return types. Add serialization tests. Use `JSON.parse(JSON.stringify(x))` as a smoke test. |
| **Daemon socket conflicts** — Multiple projects using the same socket dir | Low | Medium | Socket path includes project-root hash (already done in existing IPC). |
| **State consistency under concurrent mutations** — Two sessions modifying state simultaneously | Medium | High | Document that daemon state is shared and last-writer-wins. Consider adding optimistic locking (version field) in a future iteration. |
| **Hook event routing in daemon mode** — Hooks need to reach the daemon's IPC socket, not a local one | Low | High | Hooks already discover sockets via pointer files. Daemon writes the same pointer files. No change needed. |
| **Connection-per-call bottleneck** — RemoteTransport creates a new Unix socket per RPC call. Under burst (e.g., 20 rapid state queries), connection churn could bottleneck (~0.5-1ms overhead per call) | Low | Medium | Acceptable for v1. **Future:** Add connection pooling or persistent connection with request multiplexing if profiling shows this as a bottleneck. |
| **Performance regression on local mode** — Transport abstraction adds overhead even for local | Low | Medium | LocalTransport methods are direct function calls. Async wrappers around sync operations have negligible overhead (~0.1ms). Benchmark to confirm. |
| **Mid-session mode switching** — User changes executor.mode while tools are in-flight | Medium | Medium | Explicitly document that mode changes take effect on next session start. Add guard in runtime_config handler. |

### Checkpoint Strategy

- **Before Phase 3:** Verify Phase 1+2 work end-to-end with a standalone test script
- **Before Phase 5:** Verify that mcp-server.ts correctly creates and uses transport
- **After Phase 5:** Full integration test with all MCP tools routing through transport

---

## 12. Decisions Log

### ADR-1: Transport interface exposes operations, not objects

**Status:** Accepted  
**Context:** HandlerContext returns subsystem instances (EventBus, WorkflowEngine) which have rich, stateful APIs that cannot be serialized.  
**Decision:** Transport interface exposes verb-based methods (`emitEvent`, `getWorkflow`) instead of noun-based accessors (`getEventBus`).  
**Consequence:** Slight API surface change for handler authors. Handlers call `transport.emitEvent(e)` instead of `ctx.getEventBus().emit(e)`.

### ADR-2: Separate daemon socket from hook IPC socket

**Status:** Accepted  
**Context:** The hook IPC socket uses a simple request/response protocol optimized for short-lived hook scripts. The daemon needs session management and RPC semantics.  
**Decision:** Daemon listens on a separate Unix socket with its own protocol extension (`rpc_call`, `session_join`, `session_leave`).  
**Consequence:** Two sockets per daemon process. Slightly more complexity, but clean separation of concerns.

### ADR-3: No bidirectional state sync

**Status:** Accepted  
**Context:** When a session leaves a daemon, should state be migrated back to local?  
**Decision:** No. Daemon is source of truth. Sessions that leave lose access to daemon state.  
**Consequence:** Simplifies implementation. Avoids consistency hazards. Sessions re-entering local mode start fresh.

### ADR-4: Mode changes take effect on next session start

**Status:** Accepted  
**Context:** Could we support hot-swapping between local and remote transport mid-session?  
**Decision:** No. Transport is created at session start and fixed for the session lifetime.  
**Consequence:** Simpler implementation, no re-wiring needed. Config changes are persisted and picked up on next startup.

### ADR-5: Local mode is zero-overhead by design

**Status:** Accepted  
**Context:** The transport abstraction could add overhead even in local mode if not carefully designed.  
**Decision:** LocalTransport is a thin wrapper with direct function calls. Async methods resolve synchronously (microtask only). No serialization, no message passing, no socket IO.  
**Consequence:** Engaged mode users see no performance difference from the current in-process design.
