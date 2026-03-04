/**
 * RemoteTransport — Unix socket RPC client
 * Proxies all RuntimeTransport calls to a daemon process via JSON-RPC over a Unix domain socket.
 * Supports automatic reconnection with exponential backoff.
 */

import { createConnection, Socket } from 'node:net';
import type { RuntimeTransport, TransportMode } from './types.js';
import type { RuntimeEvent, EventFilter } from '../shared/events.js';
import type { RuntimeConfig } from '../shared/config.js';
import type { HealthStatus } from '../shared/types.js';
import type { DaemonRPCRequest, DaemonRPCResponse } from './daemon-protocol.js';
import { generateId } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('remote-transport');

// ── Connection state ─────────────────────────────────────────────────────────

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'dead';

// ── Options ──────────────────────────────────────────────────────────────────

export interface ReconnectOptions {
  /** Enable auto-reconnect on socket close/error. Default: true. */
  enabled: boolean;
  /** Maximum reconnection attempts before transitioning to 'dead'. Default: 10. */
  maxAttempts: number;
  /** Base delay in ms for exponential backoff. Default: 100. */
  baseDelayMs: number;
  /** Maximum delay cap in ms. Default: 10_000. */
  maxDelayMs: number;
}

export interface RemoteTransportOptions {
  /** Path to the Unix domain socket. */
  daemonSocketPath: string;
  /** Session timeout in ms (connect + per-RPC). Default: 5000. */
  timeoutMs?: number;
  /** Session ID (random if omitted). */
  sessionId?: string;
  /** Reconnection options. */
  reconnect?: Partial<ReconnectOptions>;
  /** Called when reconnection attempt starts. */
  onReconnecting?: (attempt: number) => void;
  /** Called when reconnection succeeds. */
  onReconnected?: () => void;
  /** Called when transport gives up (maxAttempts exceeded). */
  onDead?: (error: Error) => void;
  /** Per-RPC pending timeout in ms (default: 30000). Prevents memory leaks during long reconnects. */
  pendingTimeoutMs?: number;
  /** Max number of RPCs queued during reconnection (default: 1000). Excess calls reject immediately. */
  maxQueueSize?: number;
}

// ── Internal pending RPC entry ────────────────────────────────────────────────

interface PendingEntry {
  resolve: (r: DaemonRPCResponse) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

// ── RemoteTransport ───────────────────────────────────────────────────────────

export class RemoteTransport implements RuntimeTransport {
  readonly mode: TransportMode = 'remote';

  private readonly daemonSocketPath: string;
  private readonly timeoutMs: number;
  private readonly sessionId: string;
  private readonly reconnectOpts: ReconnectOptions;
  private readonly pendingTimeoutMs: number;

  // Callbacks
  private readonly onReconnectingCb?: (attempt: number) => void;
  private readonly onReconnectedCb?: () => void;
  private readonly onDeadCb?: (error: Error) => void;

  // State
  private state: ConnectionState = 'idle';
  private socket: Socket | null = null;
  private buffer = '';
  private pending = new Map<string, PendingEntry>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;

  // Queue for RPCs issued during 'reconnecting' state
  private reconnectQueue: Array<() => void> = [];
  private readonly maxQueueSize: number;

  constructor(options: RemoteTransportOptions) {
    this.daemonSocketPath = options.daemonSocketPath;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.sessionId = options.sessionId ?? generateId();
    this.pendingTimeoutMs = options.pendingTimeoutMs ?? 30_000;
    this.onReconnectingCb = options.onReconnecting;
    this.onReconnectedCb = options.onReconnected;
    this.onDeadCb = options.onDead;

    this.maxQueueSize = options.maxQueueSize ?? 1000;

    const r = options.reconnect ?? {};
    this.reconnectOpts = {
      enabled: r.enabled ?? true,
      maxAttempts: r.maxAttempts ?? 10,
      baseDelayMs: r.baseDelayMs ?? 100,
      maxDelayMs: r.maxDelayMs ?? 10_000,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  isReady(): boolean {
    return this.state === 'connected';
  }

  get connected(): boolean {
    return this.isReady();
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Connect to the daemon socket and perform session_join handshake.
   * Resolves when session is established; rejects on timeout or error.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    if (this.connectPromise) return this.connectPromise;
    this.state = 'connecting';
    this.reconnectAttempt = 0;
    this.connectPromise = this.connectSocket()
      .then(() => { this.state = 'connected'; })
      .finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  /**
   * Disconnect from the daemon, cancel any pending reconnect, and clean up.
   */
  async disconnect(): Promise<void> {
    // Cancel any pending reconnect timer
    this.cancelReconnectTimer();

    const previousState = this.state;
    this.state = 'idle';

    // Drain reconnect queue — callbacks check state === 'idle' and reject
    const queuedCallbacks = this.reconnectQueue.splice(0);
    for (const cb of queuedCallbacks) {
      cb();
    }

    const sock = this.socket;
    if (!sock) {
      // Reject pending RPCs that were queued in reconnecting state
      this.rejectAllPending(new Error('Disconnected'));
      return;
    }

    // Send session_leave if we were connected
    if (previousState === 'connected') {
      try {
        const leave = JSON.stringify({
          type: 'session_leave',
          id: generateId(),
          session_id: this.sessionId,
        }) + '\n';
        sock.write(leave);
      } catch (err) {
        logger.debug('session_leave write error during disconnect', { error: err });
      }
    }

    this.socket = null;
    this.rejectAllPending(new Error('Disconnected'));

    return new Promise((resolve) => {
      sock.end(() => resolve());
    });
  }

  // ── RPC ─────────────────────────────────────────────────────────────────────

  async rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    if (this.state === 'dead') {
      throw new Error('RemoteTransport is dead — daemon unreachable after max reconnect attempts');
    }

    if (this.state === 'reconnecting') {
      // Reject immediately if queue is full
      if (this.reconnectQueue.length >= this.maxQueueSize) {
        throw new Error('Reconnect queue full');
      }
      // Queue the RPC to be replayed after reconnect
      return new Promise<T>((resolve, reject) => {
        this.reconnectQueue.push(() => {
          if (this.state === 'dead') {
            reject(new Error('RemoteTransport is dead — daemon unreachable after max reconnect attempts'));
          } else if (this.state === 'idle') {
            reject(new Error('Disconnected'));
          } else {
            // State is connected — execute
            this.rpc<T>(method, args).then(resolve).catch(reject);
          }
        });
      });
    }

    const request: DaemonRPCRequest = {
      type: 'rpc_call',
      id: generateId(),
      method,
      args,
      session_id: this.sessionId,
    };
    const response = await this.sendRaw(request);
    if (response.status === 'error') {
      throw new Error(response.error ?? 'Daemon RPC failed');
    }
    return response.result as T;
  }

  // ── Private: socket management ───────────────────────────────────────────────

  /**
   * Create a socket connection and perform session_join handshake.
   * Returns when handshake is complete. Throws on timeout or error.
   */
  private connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const socket = createConnection(this.daemonSocketPath);

      socket.once('connect', () => {
        this.socket = socket;
        this.buffer = '';

        socket.on('data', (chunk: Buffer) => this.onData(chunk.toString()));
        socket.on('close', () => this.onClose());
        socket.on('error', (err) => this.onSocketError(err));

        // Perform session_join handshake — wait for response
        const joinId = generateId();
        const join = JSON.stringify({
          type: 'session_join',
          id: joinId,
          session_id: this.sessionId,
        }) + '\n';

        // Register the pending entry for join response
        this.pending.set(joinId, {
          resolve: (resp) => {
            clearTimeout(timer);
            if (resp.status === 'error') {
              socket.destroy();
              reject(new Error(resp.error ?? 'session_join rejected'));
            } else {
              resolve();
            }
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });

        socket.write(join, (err) => {
          if (err) {
            this.pending.delete(joinId);
            clearTimeout(timer);
            reject(err);
          }
        });
      });

      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as DaemonRPCResponse;
        const entry = this.pending.get(msg.id);
        if (entry) {
          if (entry.timer) clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } catch {
        // malformed line, skip
      }
    }
  }

  private onClose(): void {
    this.socket = null;
    this.buffer = '';

    if (this.state === 'idle' || this.state === 'dead') {
      return;
    }

    if (!this.reconnectOpts.enabled || this.state === 'connecting') {
      // No reconnect — reject all pending RPCs
      this.state = 'idle';
      this.rejectAllPending(new Error('Socket closed'));
      return;
    }

    // If already reconnecting (e.g. socket destroyed during a session_join attempt),
    // let the active doReconnect .catch() handler reschedule — don't double-fire.
    if (this.state === 'reconnecting') {
      return;
    }

    // Start reconnection loop
    this.state = 'reconnecting';
    this.reconnectAttempt = 0;
    this.scheduleReconnect();
  }

  private onSocketError(err: Error): void {
    logger.error('Socket error', { error: err.message });
    // onClose will fire after error — let it handle reconnection
    // But reject any pending that won't get a close event
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.reconnectOpts.maxAttempts) {
      this.transitionToDead();
      return;
    }

    const attempt = this.reconnectAttempt + 1;
    const exponential = this.reconnectOpts.baseDelayMs * Math.pow(2, this.reconnectAttempt);
    const capped = Math.min(exponential, this.reconnectOpts.maxDelayMs);
    const delay = Math.floor(Math.random() * capped);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doReconnect(attempt);
    }, delay);
  }

  private doReconnect(attempt: number): void {
    if (this.state !== 'reconnecting') return;

    this.reconnectAttempt = attempt;
    this.onReconnectingCb?.(attempt);
    logger.info('Reconnecting to daemon', { attempt, maxAttempts: this.reconnectOpts.maxAttempts });

    this.connectSocket()
      .then(() => {
        if (this.state !== 'reconnecting') return;
        this.state = 'connected';
        this.reconnectAttempt = 0;
        logger.info('Reconnected to daemon');
        this.onReconnectedCb?.();

        // Flush the reconnect queue
        const queued = this.reconnectQueue.splice(0);
        for (const cb of queued) {
          cb();
        }
      })
      .catch(() => {
        if (this.state !== 'reconnecting') return;
        if (this.reconnectAttempt >= this.reconnectOpts.maxAttempts) {
          this.transitionToDead();
        } else {
          this.scheduleReconnect();
        }
      });
  }

  private transitionToDead(): void {
    this.state = 'dead';
    const err = new Error(
      `RemoteTransport dead after ${this.reconnectAttempt} reconnect attempts`,
    );
    logger.error(err.message);
    this.onDeadCb?.(err);
    this.rejectAllPending(err);

    // Drain reconnect queue
    const queued = this.reconnectQueue.splice(0);
    for (const cb of queued) {
      cb();
    }
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, entry] of this.pending) {
      if (entry.timer) clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.reject(err);
    }
  }

  private sendRaw(request: DaemonRPCRequest): Promise<DaemonRPCResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.state !== 'connected') {
        return reject(new Error('Not connected to daemon'));
      }

      const entry: PendingEntry = { resolve, reject };

      // Per-RPC timeout
      if (this.pendingTimeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.pending.delete(request.id);
          reject(new Error(`Daemon RPC failed: no response from daemon within ${this.pendingTimeoutMs}ms`));
        }, this.pendingTimeoutMs);
      }

      this.pending.set(request.id, entry);
      const line = JSON.stringify(request) + '\n';
      this.socket.write(line, (err) => {
        if (err) {
          if (entry.timer) clearTimeout(entry.timer);
          this.pending.delete(request.id);
          reject(err);
        }
      });
    });
  }

  // ── RuntimeTransport implementation ────────────────────────────────────────

  async getUptime(): Promise<number> {
    return this.rpc<number>('getUptime');
  }

  async getHealth(): Promise<HealthStatus> {
    return this.rpc<HealthStatus>('getHealth');
  }

  async getConfig(): Promise<RuntimeConfig> {
    return this.rpc<RuntimeConfig>('getConfig');
  }

  async updateConfig(config: RuntimeConfig): Promise<void> {
    return this.rpc<void>('updateConfig', { config });
  }

  async getVersion(): Promise<string> {
    return this.rpc<string>('getVersion');
  }

  async getProjectRoot(): Promise<string> {
    return this.rpc<string>('getProjectRoot');
  }

  async getStateSnapshot(): Promise<Record<string, unknown>> {
    return this.rpc<Record<string, unknown>>('getStateSnapshot');
  }

  async getState(key: string): Promise<unknown> {
    return this.rpc<unknown>('getState', { key });
  }

  async setState(key: string, value: unknown): Promise<void> {
    return this.rpc<void>('setState', { key, value });
  }

  async deleteState(key: string): Promise<void> {
    return this.rpc<void>('deleteState', { key });
  }

  async listStateKeys(prefix?: string): Promise<string[]> {
    return this.rpc<string[]>('listStateKeys', { prefix });
  }

  async emitEvent(event: RuntimeEvent): Promise<void> {
    return this.rpc<void>('emitEvent', { event });
  }

  async queryEvents(filter: EventFilter): Promise<RuntimeEvent[]> {
    return this.rpc<RuntimeEvent[]>('queryEvents', { filter });
  }

  async getQueueDepth(): Promise<number> {
    return this.rpc<number>('getQueueDepth');
  }

  async getWorkflow(workflowId: string): Promise<Record<string, unknown> | null> {
    return this.rpc<Record<string, unknown> | null>('getWorkflow', { workflowId });
  }

  async listWorkflows(): Promise<Record<string, unknown>[]> {
    return this.rpc<Record<string, unknown>[]>('listWorkflows');
  }

  async startWorkflow(
    definitionId: string,
    context?: Record<string, unknown>,
  ): Promise<{ workflow_id: string }> {
    return this.rpc<{ workflow_id: string }>('startWorkflow', { definitionId, context });
  }

  async transitionWorkflow(
    workflowId: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.rpc<Record<string, unknown>>('transitionWorkflow', { workflowId, event, data });
  }

  async listTriggers(): Promise<Record<string, unknown>[]> {
    return this.rpc<Record<string, unknown>[]>('listTriggers');
  }

  async getTrigger(triggerId: string): Promise<Record<string, unknown> | null> {
    return this.rpc<Record<string, unknown> | null>('getTrigger', { triggerId });
  }

  async registerTrigger(definition: Record<string, unknown>): Promise<void> {
    return this.rpc<void>('registerTrigger', { definition });
  }

  async unregisterTrigger(triggerId: string): Promise<boolean> {
    return this.rpc<boolean>('unregisterTrigger', { triggerId });
  }

  async getAgent(agentId: string): Promise<Record<string, unknown> | null> {
    return this.rpc<Record<string, unknown> | null>('getAgent', { agentId });
  }

  async listAgents(): Promise<Record<string, unknown>[]> {
    return this.rpc<Record<string, unknown>[]>('listAgents');
  }

  async drainDirectives(target: string, workflowId?: string): Promise<{ directives: unknown[] }> {
    return this.rpc<{ directives: unknown[] }>('drainDirectives', { target, workflowId });
  }
}
