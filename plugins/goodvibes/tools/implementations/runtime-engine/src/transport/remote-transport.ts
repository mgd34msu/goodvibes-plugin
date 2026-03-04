/**
 * RemoteTransport — Unix socket RPC client
 * Proxies all RuntimeTransport calls to a daemon process via JSON-RPC over a Unix domain socket.
 */

import { createConnection, Socket } from 'node:net';
import type { RuntimeTransport, TransportMode } from './types.js';
import type { RuntimeEvent, EventFilter } from '../shared/events.js';
import type { RuntimeConfig } from '../shared/config.js';
import type { HealthStatus } from '../shared/types.js';
import type { DaemonRPCRequest, DaemonRPCResponse } from './daemon-protocol.js';
import { generateId } from '../shared/utils.js';

export interface RemoteTransportOptions {
  socketPath: string;
  connectTimeoutMs?: number;
}

export class RemoteTransport implements RuntimeTransport {
  readonly mode: TransportMode = 'remote';

  private socketPath: string;
  private connectTimeoutMs: number;
  private socket: Socket | null = null;
  private buffer = '';
  private pending = new Map<string, { resolve: (r: DaemonRPCResponse) => void; reject: (e: Error) => void }>();
  private sessionId: string;
  private _connected = false;

  constructor(options: RemoteTransportOptions) {
    this.socketPath = options.socketPath;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.sessionId = generateId();
  }

  isReady(): boolean {
    return this._connected;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      const socket = createConnection(this.socketPath);

      socket.once('connect', () => {
        clearTimeout(timer);
        this._connected = true;
        this.socket = socket;

        socket.on('data', (chunk: Buffer) => this.onData(chunk.toString()));
        socket.on('close', () => this.onClose());
        socket.on('error', (err) => this.onError(err));

        // Send session join
        const join = JSON.stringify({
          type: 'session_join',
          id: generateId(),
          session_id: this.sessionId,
        }) + '\n';
        socket.write(join);

        resolve();
      });

      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;

    try {
      const leave = JSON.stringify({
        type: 'session_leave',
        id: generateId(),
        session_id: this.sessionId,
      }) + '\n';
      this.socket.write(leave);
    } catch {
      // ignore write errors on disconnect
    }

    return new Promise((resolve) => {
      this.socket!.end(() => resolve());
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
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          pending.resolve(msg);
        }
      } catch {
        // malformed line, skip
      }
    }
  }

  private onClose(): void {
    this._connected = false;
    this.socket = null;
    // reject all pending requests
    for (const [id, p] of this.pending) {
      p.reject(new Error('Socket closed'));
      this.pending.delete(id);
    }
  }

  private onError(err: Error): void {
    for (const [id, p] of this.pending) {
      p.reject(err);
      this.pending.delete(id);
    }
  }

  private sendRaw(request: DaemonRPCRequest): Promise<DaemonRPCResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this._connected) {
        return reject(new Error('Not connected to daemon'));
      }
      this.pending.set(request.id, { resolve, reject });
      const line = JSON.stringify(request) + '\n';
      this.socket.write(line, (err) => {
        if (err) {
          this.pending.delete(request.id);
          reject(err);
        }
      });
    });
  }

  private async rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const request: DaemonRPCRequest = {
      type: 'rpc_call',
      id: generateId(),
      method,
      args,
      session_id: this.sessionId,
    };
    const response = await this.sendRaw(request);
    if (response.status === 'error') {
      throw new Error(response.error ?? 'RPC error');
    }
    return response.result as T;
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
