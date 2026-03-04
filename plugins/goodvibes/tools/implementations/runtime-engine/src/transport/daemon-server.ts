/**
 * DaemonServer — hosts a RuntimeEngine and exposes it over a Unix domain socket.
 * Each connected client gets its own session. Handles RPC calls and session lifecycle.
 */

import { createServer, Server, Socket } from 'node:net';
import type { RuntimeEngine } from '../bootstrap.js';
import type {
  DaemonMessage,
  DaemonRPCRequest,
  DaemonRPCResponse,
  DaemonSessionMessage,
} from './daemon-protocol.js';
import { LocalTransport } from './local-transport.js';
import { generateId } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';
import type { EventType, EventPayload } from '../shared/events.js';
import { ENGINE_VERSION } from '../shared/constants.js';

const logger = createLogger('daemon-server');

const CONNECTION_TIMEOUT_MS = 10_000;

export interface DaemonServerOptions {
  socketPath: string;
  engine: RuntimeEngine;
}

interface ClientSession {
  sessionId: string;
  socket: Socket;
  buffer: string;
}

export class DaemonServer {
  private socketPath: string;
  private engine: RuntimeEngine;
  private server: Server | null = null;
  private sessions = new Map<string, ClientSession>();
  private readonly localTransport: LocalTransport;

  constructor(options: DaemonServerOptions) {
    this.socketPath = options.socketPath;
    this.engine = options.engine;
    this.localTransport = new LocalTransport(this.engine);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));

      this.server.once('error', reject);
      this.server.listen(this.socketPath, () => {
        this.server!.removeListener('error', reject);
        this.server!.on('error', (err) => logger.error('Server error', { error: String(err) }));
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const session of this.sessions.values()) {
      try { session.socket.destroy(); } catch { /* ignore */ }
    }
    this.sessions.clear();

    // Remove the socket file
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(this.socketPath);
    } catch { /* ignore missing file */ }

    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private handleConnection(socket: Socket): void {
    const session: ClientSession = {
      sessionId: generateId(), // placeholder until session_join
      socket,
      buffer: '',
    };

    // Idle connection timeout — destroy if no message received within CONNECTION_TIMEOUT_MS
    const idleTimer = setTimeout(() => {
      socket.destroy();
    }, CONNECTION_TIMEOUT_MS);

    socket.on('data', (chunk: Buffer) => {
      clearTimeout(idleTimer);
      session.buffer += chunk.toString();
      const lines = session.buffer.split('\n');
      session.buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let msg: DaemonMessage;
        try {
          msg = JSON.parse(line) as DaemonMessage;
        } catch {
          const resp: DaemonRPCResponse = {
            id: '',
            status: 'error',
            error: 'Invalid JSON',
          };
          this.sendResponse(socket, resp);
          continue;
        }
        this.processMessage(session, msg);
      }
    });

    socket.on('close', () => {
      clearTimeout(idleTimer);
      this.sessions.delete(session.sessionId);
    });

    socket.on('error', (err) => {
      clearTimeout(idleTimer);
      logger.error('Socket error', { error: String(err) });
    });
  }

  private processMessage(session: ClientSession, msg: DaemonMessage): void {
    if (msg.type === 'session_join' || msg.type === 'session_leave') {
      this.handleSessionMessage(session, msg as DaemonSessionMessage);
    } else if (msg.type === 'rpc_call') {
      this.handleRPCCall(session, msg as DaemonRPCRequest);
    } else {
      const resp: DaemonRPCResponse = {
        id: (msg as DaemonRPCRequest).id ?? '',
        status: 'error',
        error: `Unknown message type: ${(msg as DaemonRPCRequest).type}`,
      };
      this.sendResponse(session.socket, resp);
    }
  }

  private handleSessionMessage(session: ClientSession, msg: DaemonSessionMessage): void {
    if (msg.type === 'session_join') {
      this.sessions.delete(session.sessionId);
      session.sessionId = msg.session_id;
      this.sessions.set(session.sessionId, session);
    } else if (msg.type === 'session_leave') {
      this.sessions.delete(session.sessionId);
    }
    const resp: DaemonRPCResponse = { id: msg.id, status: 'ok' };
    this.sendResponse(session.socket, resp);
  }

  private handleRPCCall(session: ClientSession, req: DaemonRPCRequest): void {
    // Guard: only registered sessions can make RPC calls
    if (!this.sessions.has(session.sessionId) || req.session_id !== session.sessionId) {
      const resp: DaemonRPCResponse = {
        id: req.id,
        status: 'error',
        error: 'Session not registered — call session_join first',
      };
      this.sendResponse(session.socket, resp);
      return;
    }

    this.dispatchRPC(req)
      .then((result) => {
        const resp: DaemonRPCResponse = { id: req.id, status: 'ok', result };
        this.sendResponse(session.socket, resp);
      })
      .catch((err: Error) => {
        const resp: DaemonRPCResponse = {
          id: req.id,
          status: 'error',
          error: err.message,
        };
        this.sendResponse(session.socket, resp);
      });
  }

  private sendResponse(socket: Socket, resp: DaemonRPCResponse): void {
    try {
      socket.write(JSON.stringify(resp) + '\n');
    } catch (err) {
      logger.error('Send error', { error: String(err) });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async dispatchRPC(req: DaemonRPCRequest): Promise<any> {
    const { method, args } = req;
    const e = this.engine;

    switch (method) {
      case 'getHealth': {
        return e.getHealthChecker().check();
      }
      case 'getConfig': {
        return e.getConfig();
      }
      case 'updateConfig': {
        e.updateConfig(args['config'] as Parameters<typeof e.updateConfig>[0]);
        return;
      }
      case 'getVersion': {
        return ENGINE_VERSION;
      }
      case 'getProjectRoot': {
        return e.getProjectRoot();
      }
      case 'getUptime': {
        return this.localTransport.getUptime();
      }
      case 'getStateSnapshot': {
        return e.getCoreStateStore().snapshot();
      }
      case 'getState': {
        return e.getCoreStateStore().get(args['key'] as string);
      }
      case 'setState': {
        e.getCoreStateStore().set(args['key'] as string, args['value']);
        return;
      }
      case 'deleteState': {
        e.getCoreStateStore().delete(args['key'] as string);
        return;
      }
      case 'listStateKeys': {
        return e.getCoreStateStore().keys(args['prefix'] as string | undefined);
      }
      case 'emitEvent': {
        e.getEventBus().emit(args['event'] as Parameters<ReturnType<typeof e.getEventBus>['emit']>[0]);
        return;
      }
      case 'queryEvents': {
        return e.getEventLog().query(args['filter'] as Parameters<ReturnType<typeof e.getEventLog>['query']>[0]);
      }
      case 'getQueueDepth': {
        return e.getEventQueue().depth();
      }
      case 'getWorkflow': {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error('WorkflowEngine not available');
        const instance = wf.get(args['workflowId'] as string);
        return instance ? (instance as unknown as Record<string, unknown>) : null;
      }
      case 'listWorkflows': {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error('WorkflowEngine not available');
        return wf.listAll().map((i) => i as unknown as Record<string, unknown>);
      }
      case 'startWorkflow': {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error('WorkflowEngine not available');
        const instance = wf.create(
          args['definitionId'] as string,
          args['context'] as Record<string, unknown> | undefined,
        );
        return { workflow_id: instance.id };
      }
      case 'transitionWorkflow': {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error('WorkflowEngine not available');
        const eventStr = args['event'] as string;
        const data = args['data'] as Record<string, unknown> | undefined;
        const syntheticEvent = {
          id: generateId(),
          type: eventStr as unknown as EventType,
          source: { kind: 'mcp_tool' as const, tool_name: 'transitionWorkflow' },
          payload: { type: eventStr, data: data ?? {} } as unknown as EventPayload,
          timestamp: Date.now(),
          priority: 0,
          metadata: { session_id: req.session_id, sequence: 0, version: 1 as const },
        };
        const result = await wf.sendEvent(args['workflowId'] as string, syntheticEvent);
        return result as unknown as Record<string, unknown>;
      }
      case 'listTriggers': {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error('TriggerRegistry not available');
        return tr.list().map((t) => t as unknown as Record<string, unknown>);
      }
      case 'getTrigger': {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error('TriggerRegistry not available');
        const trigger = tr.get(args['triggerId'] as string);
        return trigger ? (trigger as unknown as Record<string, unknown>) : null;
      }
      case 'registerTrigger': {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error('TriggerRegistry not available');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tr.register(args['definition'] as any);
        return;
      }
      case 'unregisterTrigger': {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error('TriggerRegistry not available');
        return tr.unregister(args['triggerId'] as string);
      }
      case 'getAgent': {
        const ac = e.getAgentCoordinator();
        if (!ac) throw new Error('AgentCoordinator not available');
        const agent = ac.getAgent(args['agentId'] as string);
        return agent ? (agent as unknown as Record<string, unknown>) : null;
      }
      case 'listAgents': {
        const ac = e.getAgentCoordinator();
        if (!ac) throw new Error('AgentCoordinator not available');
        return ac.listActive().map((a) => a as unknown as Record<string, unknown>);
      }
      case 'drainDirectives': {
        const dq = e.getDirectiveQueue();
        if (!dq) throw new Error('DirectiveQueue not available');
        const result = await dq.holdDrain(
          args['target'] as string,
          args['workflowId'] as string | undefined
        );
        return { directives: result.directives };
      }
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
      default:
        throw new Error(`Unknown RPC method: ${method}`);
    }
  }
}
