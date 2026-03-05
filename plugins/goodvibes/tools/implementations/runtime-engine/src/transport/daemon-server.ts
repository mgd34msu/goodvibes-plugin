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
import { saveConfig } from '../shared/config.js';

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
        id: (msg as unknown as DaemonRPCRequest).id ?? '',
        status: 'error',
        error: `Unknown message type: ${(msg as unknown as DaemonRPCRequest).type}`,
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
        const updatedConfig = args['config'] as Parameters<typeof e.updateConfig>[0];
        e.updateConfig(updatedConfig);
        // TODO: consider async saveConfig to avoid blocking the event loop during concurrent RPCs
        saveConfig(e.getProjectRoot(), updatedConfig);
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
      case 'cancelWorkflow': {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error('WorkflowEngine not available');
        wf.cancel(args['workflowId'] as string, (args['reason'] as string) ?? 'cancelled via IPC');
        const cancelled = wf.get(args['workflowId'] as string);
        return cancelled ? (cancelled as unknown as Record<string, unknown>) : null;
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
      case 'getEventHistory': {
        const filter = args['filter'] as Parameters<ReturnType<typeof e.getEventBus>['getHistory']>[0];
        return e.getEventBus().getHistory(filter);
      }
      case 'getEventStats': {
        return {
          log: e.getEventLog().getStats(),
          queue: e.getEventQueue().getStats(),
        };
      }
      case 'getHeartbeat': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        const hb = tp.getHeartbeat();
        const sched = tp.getScheduler();
        return {
          enabled: hb.isEnabled(),
          tick_count: hb.getTickCount(),
          last_tick_at: hb.getLastTickAt(),
          scheduled_count: sched.size(),
          interval_ms: hb.getInterval(),
        };
      }
      case 'setHeartbeatInterval': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        tp.getHeartbeat().setInterval(args['intervalMs'] as number);
        return;
      }
      case 'listSchedules': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        const filter = args['filter'] as { type?: string } | undefined;
        let items = tp.getScheduler().getAllItems();
        if (filter?.type) {
          items = items.filter((item) => item.time_type === filter.type);
        }
        return items;
      }
      case 'getSchedule': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        const item = tp.getScheduler().getItem(args['scheduleId'] as string);
        return item ?? null;
      }
      case 'createSchedule': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        const scheduler = tp.getScheduler();
        const p = args['params'] as {
          schedule_id: string;
          event_type: string;
          schedule_type: string;
          interval_ms?: number;
          delay_ms?: number;
          ttl?: number;
          payload?: Record<string, unknown>;
        };
        const { schedule_id, event_type, schedule_type, interval_ms, delay_ms, ttl, payload } = p;
        let item;
        if (schedule_type === 'one_shot') {
          if (delay_ms === undefined) throw new Error('delay_ms required for one_shot');
          item = scheduler.scheduleOneShot({
            id: schedule_id,
            event_type,
            delay_ms,
            ...(payload !== undefined && { payload }),
          });
        } else if (schedule_type === 'cron') {
          if (interval_ms === undefined) throw new Error('interval_ms required for cron');
          item = scheduler.scheduleCron({
            id: schedule_id,
            event_type,
            interval_ms,
            ...(payload !== undefined && { payload }),
          });
        } else {
          if (interval_ms === undefined) throw new Error('interval_ms required for heartbeat');
          item = scheduler.scheduleHeartbeat({
            id: schedule_id,
            event_type,
            interval_ms,
            ...(ttl !== undefined && { ttl }),
            ...(payload !== undefined && { payload }),
          });
        }
        return item;
      }
      case 'cancelSchedule': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        return tp.getScheduler().cancel(args['scheduleId'] as string);
      }
      case 'pauseSchedule': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        return tp.getScheduler().pause(args['scheduleId'] as string);
      }
      case 'resumeSchedule': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        return tp.getScheduler().resume(args['scheduleId'] as string);
      }
      case 'pauseHeartbeat': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        tp.getHeartbeat().disable();
        return;
      }
      case 'resumeHeartbeat': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        tp.getHeartbeat().enable();
        return;
      }
      case 'getExternalStatus': {
        const ep = e.getExternalPlugin();
        if (!ep) throw new Error('ExternalPlugin not available');
        const sources = ep.getNormalizerRegistry().sources();
        return {
          http_listener: {
            running: ep.isHttpListenerRunning(),
            port: ep.getHttpPort(),
            address: ep.getHttpAddress(),
          },
          normalizer_count: sources.length,
          normalizer_sources: sources,
        };
      }
      case 'getExternalNormalizers': {
        const ep = e.getExternalPlugin();
        if (!ep) throw new Error('ExternalPlugin not available');
        const sources = ep.getNormalizerRegistry().sources();
        return { sources, count: sources.length };
      }
      case 'testNormalize': {
        const ep = e.getExternalPlugin();
        if (!ep) throw new Error('ExternalPlugin not available');
        const source = args['source'] as string;
        const payload = args['payload'] as Record<string, unknown>;
        const headers = args['headers'] as Record<string, string> | undefined;
        const normalized = ep.getNormalizerRegistry().normalize(source, payload, headers);
        return { normalized, source };
      }
      case 'getExternalStats': {
        const ep = e.getExternalPlugin();
        if (!ep) throw new Error('ExternalPlugin not available');
        const since = args['since'] as number | undefined;
        const normalizerRegistry = ep.getNormalizerRegistry();
        return {
          action: 'stats',
          since: since && since > 0 ? new Date(since).toISOString() : 'all_time',
          normalizers: normalizerRegistry ? normalizerRegistry.sources() : [],
          http_listener: { running: ep.isHttpListenerRunning() },
          note: 'Detailed webhook receive/error counts require ExternalPlugin stats tracking (not yet implemented)',
        };
      }
      case 'getExternalQueue': {
        const stateStore = e.getCoreStateStore();
        const eventQueue = e.getEventQueue();
        const queueDepth = eventQueue != null ? eventQueue.depth() : null;
        const queueStats = stateStore?.get?.('external_plugin.stats') ?? null;
        return { queue_depth: queueDepth, external_stats: queueStats };
      }
      case 'testTrigger': {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error('TriggerRegistry not available');
        const triggerId = args['triggerId'] as string;
        const testEvent = args['testEvent'] as Record<string, unknown>;
        const mockEvent = {
          id: (testEvent['id'] as string) ?? generateId(),
          timestamp: (testEvent['timestamp'] as number) ?? Date.now(),
          type: testEvent['type'],
          source: testEvent['source'] ?? { kind: 'mcp_tool' as const, tool_name: 'runtime_triggers' },
          payload: testEvent['payload'] ?? { type: testEvent['type'], data: {} },
          priority: (testEvent['priority'] as number) ?? 0,
          metadata: testEvent['metadata'] ?? { session_id: req.session_id, sequence: 0, version: 1 as const },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = await tr.evaluate(mockEvent as any);
        const result = results.find((r) => r.trigger_id === triggerId);
        return {
          result: (result as unknown as Record<string, unknown>) ?? null,
          all_results: results as unknown as Record<string, unknown>[],
        };
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
