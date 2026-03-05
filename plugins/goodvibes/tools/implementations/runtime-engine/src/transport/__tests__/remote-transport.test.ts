/**
 * Tests for RemoteTransport — daemon RPC client over Unix domain socket.
 *
 * Strategy:
 * - Mock node:net to simulate socket connect/write/data/error/timeout
 * - Mock generateId for predictable request IDs
 * - Test connect/disconnect session lifecycle
 * - Test RPC proxy methods, error handling, and timeout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { MockSocket, mockCreateConnection, capturedSockets } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as { EventEmitter: typeof import('node:events').EventEmitter };

  const capturedSockets: InstanceType<typeof MockSocket>[] = [];

  class MockSocket extends EventEmitter {
    destroyed = false;
    written: string[] = [];
    write = vi.fn((data: string, encOrCb?: string | (() => void), cb?: () => void) => {
      this.written.push(data);
      const callback = typeof encOrCb === 'function' ? encOrCb : cb;
      if (callback) callback();
      return true;
    });
    destroy = vi.fn(() => { this.destroyed = true; });
    pause = vi.fn();
    end = vi.fn((cb?: () => void) => { if (cb) cb(); });

    /** Helper: simulate daemon responding with JSON */
    respondWith(response: Record<string, unknown>): void {
      process.nextTick(() => {
        this.emit('data', Buffer.from(JSON.stringify(response) + '\n'));
      });
    }

    /** Helper: simulate connect event */
    simulateConnect(): void {
      process.nextTick(() => this.emit('connect'));
    }

    /** Helper: simulate socket error */
    simulateError(err: Error): void {
      process.nextTick(() => this.emit('error', err));
    }
  }

  const mockCreateConnection = vi.fn((_opts: unknown) => {
    const socket = new MockSocket();
    capturedSockets.push(socket);
    // Auto-emit connect on next tick
    process.nextTick(() => socket.emit('connect'));
    return socket;
  });

  return { MockSocket, mockCreateConnection, capturedSockets };
});

vi.mock('node:net', () => ({
  createConnection: mockCreateConnection,
}));

let idCounter = 0;
vi.mock('../../../shared/utils.js', () => ({
  generateId: vi.fn(() => `test-id-${++idCounter}`),
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { RemoteTransport } from '../remote-transport.js';

describe('RemoteTransport', () => {
  const SOCKET_PATH = '/tmp/test-daemon.sock';
  const SESSION_ID = 'session-abc';
  let transport: RemoteTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSockets.length = 0;
    idCounter = 0;
    transport = new RemoteTransport({
      daemonSocketPath: SOCKET_PATH,
      sessionId: SESSION_ID,
      timeoutMs: 100, // short timeout for connect
      pendingTimeoutMs: 100, // short timeout for per-RPC calls
    });
  });

  // ─── Constructor & mode ─────────────────────────────────────────────────

  describe('constructor & mode', () => {
    it('has mode "remote"', () => {
      expect(transport.mode).toBe('remote');
    });

    it('starts not ready', () => {
      expect(transport.isReady()).toBe(false);
    });
  });

  // ─── connect() ──────────────────────────────────────────────────────────

  describe('connect', () => {
    it('sends session_join and sets ready on ok response', async () => {
      // Override createConnection to respond with ok
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => {
          sock.emit('connect');
        });
        // After write, respond with ok
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          expect(parsed.type).toBe('session_join');
          expect(parsed.session_id).toBe(SESSION_ID);
          sock.respondWith({ id: parsed.id, status: 'ok', result: { session_count: 1 } });
          return true;
        });
        return sock;
      });

      await transport.connect();
      expect(transport.isReady()).toBe(true);
    });

    it('throws when daemon responds with error', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          sock.respondWith({ id: parsed.id, status: 'error', error: 'Rejected' });
          return true;
        });
        return sock;
      });

      await expect(transport.connect()).rejects.toThrow();
      expect(transport.isReady()).toBe(false);
    });

    it('throws when socket times out (no response)', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        // Write but never respond — will hit timeout
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          return true;
        });
        return sock;
      });

      await expect(transport.connect()).rejects.toThrow();
    }, 5000);
  });

  // ─── disconnect() ───────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('is a no-op when not ready', async () => {
      await transport.disconnect();
      expect(mockCreateConnection).not.toHaveBeenCalled();
    });

    it('sends session_leave and sets ready=false', async () => {
      // First connect — respond to session_join with ok
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          if (parsed.type === 'session_join') {
            sock.respondWith({ id: parsed.id, status: 'ok', result: {} });
          } else if (parsed.type === 'session_leave') {
            // session_leave is fire-and-forget; no response needed
          }
          return true;
        });
        return sock;
      });
      await transport.connect();
      expect(transport.isReady()).toBe(true);

      // Verify session_leave is written to the same socket, then disconnect
      const sock = capturedSockets[0];
      await transport.disconnect();

      // Confirm session_leave was sent via the existing socket
      const leaves = sock.written.filter((w) => {
        const p = JSON.parse(w.replace('\n', ''));
        return p.type === 'session_leave';
      });
      expect(leaves.length).toBe(1);
      expect(transport.isReady()).toBe(false);
    });
  });

  // ─── RPC proxy methods ──────────────────────────────────────────────────

  /**
   * Helper: configure a single mock socket that handles session_join then one RPC call with a result.
   * Configures mock for connect + single RPC
   */
  function setupConnectAndRPC(result: unknown): void {
    mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
      const sock = new MockSocket();
      capturedSockets.push(sock);
      process.nextTick(() => sock.emit('connect'));
      let joined = false;
      sock.write = vi.fn((data: string) => {
        sock.written.push(data);
        const parsed = JSON.parse(data.replace('\n', ''));
        if (!joined && parsed.type === 'session_join') {
          joined = true;
          sock.respondWith({ id: parsed.id, status: 'ok', result: { session_count: 1 } });
        } else {
          expect(parsed.type).toBe('rpc_call');
          expect(parsed.session_id).toBe(SESSION_ID);
          sock.respondWith({ id: parsed.id, status: 'ok', result });
        }
        return true;
      });
      return sock;
    });
  }

  describe('RPC proxy methods', () => {
    it('getUptime() sends rpc_call with method "getUptime"', async () => {
      setupConnectAndRPC(12345);
      await transport.connect();
      const result = await transport.getUptime();
      expect(result).toBe(12345);
      // written[0] = session_join, written[1] = rpc_call
      const sock = capturedSockets[0];
      const rpcWrite = sock.written[1];
      const parsed = JSON.parse(rpcWrite.replace('\n', ''));
      expect(parsed.method).toBe('getUptime');
      expect(parsed.args).toEqual({});
    });

    it('getState() sends key as argument', async () => {
      setupConnectAndRPC('state-value');
      await transport.connect();
      const result = await transport.getState('my.key');
      expect(result).toBe('state-value');
      const sock = capturedSockets[0];
      const rpcWrite = sock.written[1];
      const parsed = JSON.parse(rpcWrite.replace('\n', ''));
      expect(parsed.method).toBe('getState');
      expect(parsed.args).toEqual({ key: 'my.key' });
    });

    it('setState() sends key and value as arguments', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      await transport.setState('my.key', { nested: true });
      const sock = capturedSockets[0];
      const rpcWrite = sock.written[1];
      const parsed = JSON.parse(rpcWrite.replace('\n', ''));
      expect(parsed.method).toBe('setState');
      expect(parsed.args).toEqual({ key: 'my.key', value: { nested: true } });
    });

    it('startWorkflow() sends definitionId and context', async () => {
      setupConnectAndRPC({ workflow_id: 'wf-123' });
      await transport.connect();
      const result = await transport.startWorkflow('my-defn', { key: 'val' });
      expect(result).toEqual({ workflow_id: 'wf-123' });
      const sock = capturedSockets[0];
      const rpcWrite = sock.written[1];
      const parsed = JSON.parse(rpcWrite.replace('\n', ''));
      expect(parsed.method).toBe('startWorkflow');
      expect(parsed.args).toEqual({ definitionId: 'my-defn', context: { key: 'val' } });
    });

    it('drainDirectives() sends target and workflowId', async () => {
      const directives = [{ type: 'inject', content: 'test' }];
      setupConnectAndRPC({ directives });
      await transport.connect();
      const result = await transport.drainDirectives('subagent_stop', 'wf-1');
      expect(result.directives).toEqual(directives);
      const sock = capturedSockets[0];
      const rpcWrite = sock.written[1];
      const parsed = JSON.parse(rpcWrite.replace('\n', ''));
      expect(parsed.method).toBe('drainDirectives');
      expect(parsed.args).toEqual({ target: 'subagent_stop', workflowId: 'wf-1' });
    });

    it('cancelWorkflow() sends workflowId and reason', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      await transport.cancelWorkflow('wf-1', 'user cancelled');
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('cancelWorkflow');
      expect(parsed.args).toEqual({ workflowId: 'wf-1', reason: 'user cancelled' });
    });

    it('getEventHistory() sends filter as argument', async () => {
      const events = [{ type: 'test:event' }];
      setupConnectAndRPC(events);
      await transport.connect();
      const filter = { type: 'test:*' } as any;
      const result = await transport.getEventHistory(filter);
      expect(result).toEqual(events);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getEventHistory');
      expect(parsed.args).toEqual({ filter });
    });

    it('getEventStats() sends rpc_call with method "getEventStats"', async () => {
      const stats = { log: { total_events: 5 }, queue: { pending: 0 } };
      setupConnectAndRPC(stats);
      await transport.connect();
      const result = await transport.getEventStats();
      expect(result).toEqual(stats);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getEventStats');
      expect(parsed.args).toEqual({});
    });

    it('getHeartbeat() sends rpc_call with method "getHeartbeat"', async () => {
      const hb = { enabled: true, tick_count: 3, last_tick_at: 0, scheduled_count: 1, interval_ms: 500 };
      setupConnectAndRPC(hb);
      await transport.connect();
      const result = await transport.getHeartbeat();
      expect(result).toEqual(hb);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getHeartbeat');
      expect(parsed.args).toEqual({});
    });

    it('setHeartbeatInterval() sends intervalMs as argument', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      await transport.setHeartbeatInterval(2000);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('setHeartbeatInterval');
      expect(parsed.args).toEqual({ intervalMs: 2000 });
    });

    it('getExternalStatus() sends rpc_call with method "getExternalStatus"', async () => {
      const status = { http_listener: { running: true, port: 8080, address: '127.0.0.1' }, normalizer_count: 2, normalizer_sources: ['github'] };
      setupConnectAndRPC(status);
      await transport.connect();
      const result = await transport.getExternalStatus();
      expect(result).toEqual(status);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getExternalStatus');
      expect(parsed.args).toEqual({});
    });

    it('listSchedules() sends filter as argument', async () => {
      const items = [{ id: 's1' }];
      setupConnectAndRPC(items);
      await transport.connect();
      const result = await transport.listSchedules({ type: 'cron' });
      expect(result).toEqual(items);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('listSchedules');
      expect(parsed.args).toEqual({ filter: { type: 'cron' } });
    });

    it('getSchedule() sends scheduleId as argument', async () => {
      const item = { id: 'sched-1', time_type: 'cron' };
      setupConnectAndRPC(item);
      await transport.connect();
      const result = await transport.getSchedule('sched-1');
      expect(result).toEqual(item);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getSchedule');
      expect(parsed.args).toEqual({ scheduleId: 'sched-1' });
    });

    it('createSchedule() sends params as argument', async () => {
      const item = { id: 'cr-1' };
      setupConnectAndRPC(item);
      await transport.connect();
      const params = { schedule_id: 'cr-1', event_type: 'tick', schedule_type: 'cron', interval_ms: 60000 };
      const result = await transport.createSchedule(params);
      expect(result).toEqual(item);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('createSchedule');
      expect(parsed.args).toEqual({ params });
    });

    it('cancelSchedule() sends scheduleId as argument', async () => {
      setupConnectAndRPC(true);
      await transport.connect();
      const result = await transport.cancelSchedule('sched-1');
      expect(result).toBe(true);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('cancelSchedule');
      expect(parsed.args).toEqual({ scheduleId: 'sched-1' });
    });

    it('pauseSchedule() sends scheduleId as argument', async () => {
      setupConnectAndRPC(true);
      await transport.connect();
      const result = await transport.pauseSchedule('sched-1');
      expect(result).toBe(true);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('pauseSchedule');
      expect(parsed.args).toEqual({ scheduleId: 'sched-1' });
    });

    it('resumeSchedule() sends scheduleId as argument', async () => {
      setupConnectAndRPC(true);
      await transport.connect();
      const result = await transport.resumeSchedule('sched-1');
      expect(result).toBe(true);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('resumeSchedule');
      expect(parsed.args).toEqual({ scheduleId: 'sched-1' });
    });

    it('pauseHeartbeat() sends rpc_call with method "pauseHeartbeat"', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      await transport.pauseHeartbeat();
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('pauseHeartbeat');
      expect(parsed.args).toEqual({});
    });

    it('resumeHeartbeat() sends rpc_call with method "resumeHeartbeat"', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      await transport.resumeHeartbeat();
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('resumeHeartbeat');
      expect(parsed.args).toEqual({});
    });

    it('getExternalNormalizers() sends rpc_call with method "getExternalNormalizers"', async () => {
      const normalizers = { sources: ['github'], count: 1 };
      setupConnectAndRPC(normalizers);
      await transport.connect();
      const result = await transport.getExternalNormalizers();
      expect(result).toEqual(normalizers);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getExternalNormalizers');
      expect(parsed.args).toEqual({});
    });

    it('testNormalize() sends source, payload, and headers', async () => {
      const normalized = { type: 'push' };
      setupConnectAndRPC({ normalized, source: 'github' });
      await transport.connect();
      const payload = { action: 'push' };
      const headers = { 'x-github-event': 'push' };
      const result = await transport.testNormalize('github', payload, headers);
      expect(result).toEqual({ normalized, source: 'github' });
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('testNormalize');
      expect(parsed.args).toEqual({ source: 'github', payload, headers });
    });

    it('getExternalStats() sends since as argument', async () => {
      const stats = { action: 'stats', since: 'all_time' };
      setupConnectAndRPC(stats);
      await transport.connect();
      const result = await transport.getExternalStats(0);
      expect(result).toEqual(stats);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getExternalStats');
      expect(parsed.args).toEqual({ since: 0 });
    });

    it('getExternalQueue() sends rpc_call with method "getExternalQueue"', async () => {
      const queue = { queue_depth: 3, external_stats: null };
      setupConnectAndRPC(queue);
      await transport.connect();
      const result = await transport.getExternalQueue();
      expect(result).toEqual(queue);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getExternalQueue');
      expect(parsed.args).toEqual({});
    });

    it('testTrigger() sends triggerId and testEvent', async () => {
      const response = { result: { trigger_id: 't1', matched: true }, all_results: [] };
      setupConnectAndRPC(response);
      await transport.connect();
      const testEvent = { type: 'push:event', payload: {} };
      const result = await transport.testTrigger('t1', testEvent);
      expect(result).toEqual(response);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('testTrigger');
      expect(parsed.args).toEqual({ triggerId: 't1', testEvent });
    });

    // ─── State methods ───────────────────────────────────────────────────────

    it('deleteState() sends key as argument', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      await transport.deleteState('my.key');
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('deleteState');
      expect(parsed.args).toEqual({ key: 'my.key' });
    });

    it('listStateKeys() sends prefix as argument', async () => {
      const keys = ['ns.a', 'ns.b'];
      setupConnectAndRPC(keys);
      await transport.connect();
      const result = await transport.listStateKeys('ns');
      expect(result).toEqual(keys);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('listStateKeys');
      expect(parsed.args).toEqual({ prefix: 'ns' });
    });

    it('listStateKeys() sends no prefix when omitted', async () => {
      setupConnectAndRPC([]);
      await transport.connect();
      await transport.listStateKeys();
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('listStateKeys');
      expect(parsed.args).toEqual({});
    });

    it('getStateSnapshot() sends rpc_call with method "getStateSnapshot"', async () => {
      const snapshot = { 'ns.key': 'value' };
      setupConnectAndRPC(snapshot);
      await transport.connect();
      const result = await transport.getStateSnapshot();
      expect(result).toEqual(snapshot);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getStateSnapshot');
      expect(parsed.args).toEqual({});
    });

    // ─── Event methods ───────────────────────────────────────────────────────

    it('emitEvent() sends event as argument', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      const event = { type: 'test:event', payload: { key: 'val' } } as any;
      await transport.emitEvent(event);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('emitEvent');
      expect(parsed.args).toEqual({ event });
    });

    it('queryEvents() sends filter as argument', async () => {
      const events = [{ type: 'test:event' }];
      setupConnectAndRPC(events);
      await transport.connect();
      const filter = { type: 'test:*' } as any;
      const result = await transport.queryEvents(filter);
      expect(result).toEqual(events);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('queryEvents');
      expect(parsed.args).toEqual({ filter });
    });

    it('getQueueDepth() sends rpc_call with method "getQueueDepth"', async () => {
      setupConnectAndRPC(7);
      await transport.connect();
      const result = await transport.getQueueDepth();
      expect(result).toBe(7);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getQueueDepth');
      expect(parsed.args).toEqual({});
    });

    // ─── Workflow methods ────────────────────────────────────────────────────

    it('getWorkflow() sends workflowId as argument', async () => {
      const wf = { id: 'wf-1', state: 'running' };
      setupConnectAndRPC(wf);
      await transport.connect();
      const result = await transport.getWorkflow('wf-1');
      expect(result).toEqual(wf);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getWorkflow');
      expect(parsed.args).toEqual({ workflowId: 'wf-1' });
    });

    it('listWorkflows() sends rpc_call with method "listWorkflows"', async () => {
      const wfs = [{ id: 'wf-1' }, { id: 'wf-2' }];
      setupConnectAndRPC(wfs);
      await transport.connect();
      const result = await transport.listWorkflows();
      expect(result).toEqual(wfs);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('listWorkflows');
      expect(parsed.args).toEqual({});
    });

    it('transitionWorkflow() sends workflowId, event, and data', async () => {
      const updated = { id: 'wf-1', state: 'completed' };
      setupConnectAndRPC(updated);
      await transport.connect();
      const result = await transport.transitionWorkflow('wf-1', 'complete', { output: 'done' });
      expect(result).toEqual(updated);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('transitionWorkflow');
      expect(parsed.args).toEqual({ workflowId: 'wf-1', event: 'complete', data: { output: 'done' } });
    });

    // ─── Trigger methods ─────────────────────────────────────────────────────

    it('listTriggers() sends rpc_call with method "listTriggers"', async () => {
      const triggers = [{ id: 't1' }, { id: 't2' }];
      setupConnectAndRPC(triggers);
      await transport.connect();
      const result = await transport.listTriggers();
      expect(result).toEqual(triggers);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('listTriggers');
      expect(parsed.args).toEqual({});
    });

    it('getTrigger() sends triggerId as argument', async () => {
      const trigger = { id: 't1', event_pattern: 'push:*' };
      setupConnectAndRPC(trigger);
      await transport.connect();
      const result = await transport.getTrigger('t1');
      expect(result).toEqual(trigger);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getTrigger');
      expect(parsed.args).toEqual({ triggerId: 't1' });
    });

    it('registerTrigger() sends definition as argument', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      const definition = { id: 't-new', event_pattern: 'deploy:*', workflow_id: 'wf-1' };
      await transport.registerTrigger(definition);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('registerTrigger');
      expect(parsed.args).toEqual({ definition });
    });

    it('unregisterTrigger() sends triggerId as argument', async () => {
      setupConnectAndRPC(true);
      await transport.connect();
      const result = await transport.unregisterTrigger('t1');
      expect(result).toBe(true);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('unregisterTrigger');
      expect(parsed.args).toEqual({ triggerId: 't1' });
    });

    // ─── Agent methods ───────────────────────────────────────────────────────

    it('getAgent() sends agentId as argument', async () => {
      const agent = { id: 'agent-1', type: 'engineer' };
      setupConnectAndRPC(agent);
      await transport.connect();
      const result = await transport.getAgent('agent-1');
      expect(result).toEqual(agent);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getAgent');
      expect(parsed.args).toEqual({ agentId: 'agent-1' });
    });

    it('listAgents() sends rpc_call with method "listAgents"', async () => {
      const agents = [{ id: 'agent-1' }, { id: 'agent-2' }];
      setupConnectAndRPC(agents);
      await transport.connect();
      const result = await transport.listAgents();
      expect(result).toEqual(agents);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('listAgents');
      expect(parsed.args).toEqual({});
    });

    // ─── Config/health methods ───────────────────────────────────────────────

    it('getVersion() sends rpc_call with method "getVersion"', async () => {
      setupConnectAndRPC('1.2.3');
      await transport.connect();
      const result = await transport.getVersion();
      expect(result).toBe('1.2.3');
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getVersion');
      expect(parsed.args).toEqual({});
    });

    it('getProjectRoot() sends rpc_call with method "getProjectRoot"', async () => {
      setupConnectAndRPC('/home/user/project');
      await transport.connect();
      const result = await transport.getProjectRoot();
      expect(result).toBe('/home/user/project');
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getProjectRoot');
      expect(parsed.args).toEqual({});
    });

    it('getConfig() sends rpc_call with method "getConfig"', async () => {
      const config = { queue: { max_size: 10000 } };
      setupConnectAndRPC(config);
      await transport.connect();
      const result = await transport.getConfig();
      expect(result).toEqual(config);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getConfig');
      expect(parsed.args).toEqual({});
    });

    it('updateConfig() sends config as argument', async () => {
      setupConnectAndRPC(undefined);
      await transport.connect();
      const config = { queue: { max_size: 5000 } } as any;
      await transport.updateConfig(config);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('updateConfig');
      expect(parsed.args).toEqual({ config });
    });

    it('getHealth() sends rpc_call with method "getHealth"', async () => {
      const health = { status: 'ok', uptime: 12345 };
      setupConnectAndRPC(health);
      await transport.connect();
      const result = await transport.getHealth();
      expect(result).toEqual(health);
      const sock = capturedSockets[0];
      const parsed = JSON.parse(sock.written[1].replace('\n', ''));
      expect(parsed.method).toBe('getHealth');
      expect(parsed.args).toEqual({});
    });
  });

  // ─── RPC error handling ─────────────────────────────────────────────────

  describe('RPC error handling', () => {
    it('throws when daemon returns status error', async () => {
      // Connect first with a mock that accepts session_join, then returns error for rpc_call
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        let joined = false;
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          if (!joined && parsed.type === 'session_join') {
            joined = true;
            sock.respondWith({ id: parsed.id, status: 'ok', result: { session_count: 1 } });
          } else {
            sock.respondWith({ id: parsed.id, status: 'error', error: 'Method failed' });
          }
          return true;
        });
        return sock;
      });

      await transport.connect();
      await expect(transport.getUptime()).rejects.toThrow(/Method failed|Daemon RPC failed/);
    });
  });

  // ─── Timeout handling ───────────────────────────────────────────────────

  describe('timeout handling', () => {
    it('throws when socket never responds', async () => {
      // Connect first, then the RPC call will time out (pendingTimeoutMs = 100ms)
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        let joined = false;
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          if (!joined && parsed.type === 'session_join') {
            joined = true;
            sock.respondWith({ id: parsed.id, status: 'ok', result: { session_count: 1 } });
          }
          // rpc_call writes receive no response — will hit pendingTimeoutMs
          return true;
        });
        return sock;
      });

      await transport.connect();
      await expect(transport.getUptime()).rejects.toThrow(/no response|Daemon RPC failed/);
    }, 5000);
  });

  // ─── Socket error handling ───────────────────────────────────────────────

  describe('socket error handling', () => {
    it('throws when not connected', async () => {
      // transport.state is 'idle' — sendRaw rejects immediately without touching the socket
      await expect(transport.getUptime()).rejects.toThrow();
    });

    it('rejects active RPC when socket emits error then closes', async () => {
      // Use a local transport with reconnect disabled so onClose rejects pending RPCs immediately
      const localTransport = new RemoteTransport({
        daemonSocketPath: SOCKET_PATH,
        sessionId: SESSION_ID,
        timeoutMs: 100,
        pendingTimeoutMs: 100,
        reconnect: { enabled: false },
      });

      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        let joined = false;
        sock.write = vi.fn((data: string, encOrCb?: string | (() => void), cb?: () => void) => {
          sock.written.push(data);
          const callback = typeof encOrCb === 'function' ? encOrCb : cb;
          if (callback) callback();
          const parsed = JSON.parse(data.replace('\n', ''));
          if (!joined && parsed.type === 'session_join') {
            joined = true;
            sock.respondWith({ id: parsed.id, status: 'ok', result: { session_count: 1 } });
          }
          // rpc_call receives no response — socket will error instead
          return true;
        });
        return sock;
      });

      await localTransport.connect();
      expect(localTransport.isReady()).toBe(true);

      const sock = capturedSockets[0];

      // Start an RPC without responding, then emit error + close
      const rpcPromise = localTransport.getUptime();
      process.nextTick(() => {
        sock.emit('error', new Error('EPIPE'));
        sock.emit('close');
      });

      await expect(rpcPromise).rejects.toThrow();
    });

    it('throws when connection is refused', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => {
          sock.emit('error', new Error('ECONNREFUSED'));
          sock.emit('close');
        });
        return sock;
      });

      await expect(transport.getState('key')).rejects.toThrow();
    });
  });
});
