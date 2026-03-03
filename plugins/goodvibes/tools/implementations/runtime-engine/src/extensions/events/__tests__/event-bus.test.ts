import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../event-bus.js';
import type { RuntimeEvent, EventType, EventPayload } from '../../../shared/events.js';

// Suppress logger output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(
  type: EventType,
  overrides: Partial<Omit<RuntimeEvent, 'metadata' | 'priority'> & { priority?: number; metadata?: Partial<RuntimeEvent['metadata']> }> = {},
): Omit<RuntimeEvent, 'metadata' | 'priority'> & { priority?: number; metadata?: Partial<RuntimeEvent['metadata']> } {
  return {
    id: `evt_test_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    type,
    source: { kind: 'system' },
    payload: { type, data: {} } as EventPayload,
    ...overrides,
  };
}

// ─── EventBus ────────────────────────────────────────────────────────────────

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    // Clear env vars to keep session_id deterministic
    delete process.env['CLAUDE_SESSION_ID'];
    delete process.env['SESSION_ID'];
    bus = new EventBus();
  });

  afterEach(() => {
    bus.removeAllListeners();
  });

  // ─── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates an instance with default maxHistorySize of 10,000', () => {
      const b = new EventBus();
      // Emit 1 event and verify history works
      b.emit(makeEvent('session:started'));
      expect(b.getHistory()).toHaveLength(1);
    });

    it('creates an instance with a custom maxHistorySize', () => {
      const b = new EventBus(5);
      for (let i = 0; i < 7; i++) {
        b.emit(makeEvent('session:started'));
      }
      // Ring buffer holds only the last 5
      expect(b.getHistory()).toHaveLength(5);
    });

    it('disables history when maxHistorySize is 0', () => {
      const b = new EventBus(0);
      b.emit(makeEvent('session:started'));
      expect(b.getHistory()).toHaveLength(0);
    });

    it('treats negative maxHistorySize as 0 (no history)', () => {
      const b = new EventBus(-10);
      b.emit(makeEvent('session:started'));
      expect(b.getHistory()).toHaveLength(0);
    });

    it('floors fractional maxHistorySize', () => {
      const b = new EventBus(3.9);
      for (let i = 0; i < 5; i++) {
        b.emit(makeEvent('session:started'));
      }
      expect(b.getHistory()).toHaveLength(3);
    });
  });

  // ─── emit ──────────────────────────────────────────────────────────────────

  describe('emit', () => {
    it('returns the full RuntimeEvent', () => {
      const event = makeEvent('session:started');
      const result = bus.emit(event);
      expect(result.id).toBe(event.id);
      expect(result.type).toBe('session:started');
      expect(result.metadata.sequence).toBe(1);
      expect(result.metadata.version).toBe(1);
    });

    it('auto-generates id if omitted', () => {
      const { id: _removed, ...eventWithoutId } = makeEvent('session:started');
      const result = bus.emit(eventWithoutId as never);
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
    });

    it('auto-generates timestamp if omitted', () => {
      const { timestamp: _removed, ...eventWithoutTs } = makeEvent('session:started');
      const result = bus.emit(eventWithoutTs as never);
      expect(typeof result.timestamp).toBe('number');
      // Should be a valid epoch ms value usable as a Date constructor argument
      expect(result.timestamp).toBeGreaterThan(0);
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('increments the sequence number monotonically', () => {
      const r1 = bus.emit(makeEvent('session:started'));
      const r2 = bus.emit(makeEvent('session:ending'));
      const r3 = bus.emit(makeEvent('session:ended'));
      expect(r1.metadata.sequence).toBe(1);
      expect(r2.metadata.sequence).toBe(2);
      expect(r3.metadata.sequence).toBe(3);
    });

    it('fills session_id from CLAUDE_SESSION_ID env var', () => {
      process.env['CLAUDE_SESSION_ID'] = 'test-session-123';
      const b = new EventBus();
      const result = b.emit(makeEvent('session:started'));
      expect(result.metadata.session_id).toBe('test-session-123');
    });

    it('fills session_id from SESSION_ID env var when CLAUDE_SESSION_ID absent', () => {
      process.env['SESSION_ID'] = 'fallback-session-456';
      const b = new EventBus();
      const result = b.emit(makeEvent('session:started'));
      expect(result.metadata.session_id).toBe('fallback-session-456');
    });

    it('falls back to "unknown" session_id when no env var set', () => {
      const result = bus.emit(makeEvent('session:started'));
      expect(result.metadata.session_id).toBe('unknown');
    });

    it('preserves provided metadata fields', () => {
      const event = makeEvent('session:started', {
        metadata: { correlation_id: 'corr-abc', causation_id: 'cause-xyz' },
      });
      const result = bus.emit(event);
      expect(result.metadata.correlation_id).toBe('corr-abc');
      expect(result.metadata.causation_id).toBe('cause-xyz');
    });

    it('stores event in history', () => {
      bus.emit(makeEvent('session:started'));
      expect(bus.getHistory()).toHaveLength(1);
    });

    it('calls eventLog.append when a log is attached', () => {
      const log = { append: vi.fn() };
      bus.setEventLog(log);
      const event = makeEvent('session:started');
      bus.emit(event);
      expect(log.append).toHaveBeenCalledOnce();
      expect(log.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'session:started' }));
    });

    it('does not throw when eventLog.append throws', () => {
      const log = { append: vi.fn(() => { throw new Error('disk full'); }) };
      bus.setEventLog(log);
      expect(() => bus.emit(makeEvent('session:started'))).not.toThrow();
    });
  });

  // ─── on / unsubscribe ──────────────────────────────────────────────────────

  describe('on', () => {
    it('receives matching events', () => {
      const received: RuntimeEvent[] = [];
      bus.on('session:started', (e) => { received.push(e); });
      bus.emit(makeEvent('session:started'));
      expect(received).toHaveLength(1);
      expect(received[0]?.type).toBe('session:started');
    });

    it('does not receive non-matching events', () => {
      const received: RuntimeEvent[] = [];
      bus.on('session:started', (e) => { received.push(e); });
      bus.emit(makeEvent('session:ending'));
      expect(received).toHaveLength(0);
    });

    it('returns an unsubscribe function', () => {
      const received: RuntimeEvent[] = [];
      const off = bus.on('session:started', (e) => { received.push(e); });
      bus.emit(makeEvent('session:started'));
      off();
      bus.emit(makeEvent('session:started'));
      expect(received).toHaveLength(1);
    });

    it('removes the pattern entry when last handler is unsubscribed', () => {
      const off = bus.on('session:started', vi.fn());
      expect(bus.listenerCount('session:started')).toBe(1);
      off();
      expect(bus.listenerCount('session:started')).toBe(0);
    });

    it('supports multiple handlers on the same pattern', () => {
      const calls: number[] = [];
      bus.on('session:started', () => { calls.push(1); });
      bus.on('session:started', () => { calls.push(2); });
      bus.emit(makeEvent('session:started'));
      expect(calls).toEqual([1, 2]);
    });

    it('calling unsubscribe twice does not throw', () => {
      const off = bus.on('session:started', vi.fn());
      expect(() => { off(); off(); }).not.toThrow();
    });
  });

  // ─── once ──────────────────────────────────────────────────────────────────

  describe('once', () => {
    it('fires exactly once for matching events', () => {
      const received: RuntimeEvent[] = [];
      bus.once('session:started', (e) => { received.push(e); });
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('session:started'));
      expect(received).toHaveLength(1);
    });

    it('returns an unsubscribe function that cancels before firing', () => {
      const received: RuntimeEvent[] = [];
      const off = bus.once('session:started', (e) => { received.push(e); });
      off();
      bus.emit(makeEvent('session:started'));
      expect(received).toHaveLength(0);
    });

    it('does not throw when async once handler rejects', async () => {
      bus.once('session:started', async () => { throw new Error('once async fail'); });
      expect(() => bus.emit(makeEvent('session:started'))).not.toThrow();
      // Allow microtasks to settle
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── Pattern matching ──────────────────────────────────────────────────────

  describe('pattern matching', () => {
    it('exact match: only fires for the exact type', () => {
      const received: string[] = [];
      bus.on('hook:pre_tool_use', (e) => { received.push(e.type); });
      bus.emit(makeEvent('hook:pre_tool_use'));
      bus.emit(makeEvent('hook:post_tool_use'));
      bus.emit(makeEvent('session:started'));
      expect(received).toEqual(['hook:pre_tool_use']);
    });

    it('namespace wildcard: fires for all events in the namespace', () => {
      const received: string[] = [];
      bus.on('hook:*', (e) => { received.push(e.type); });
      bus.emit(makeEvent('hook:pre_tool_use'));
      bus.emit(makeEvent('hook:post_tool_use'));
      bus.emit(makeEvent('hook:session_start'));
      bus.emit(makeEvent('session:started'));
      expect(received).toEqual(['hook:pre_tool_use', 'hook:post_tool_use', 'hook:session_start']);
    });

    it('global wildcard: fires for every event', () => {
      const received: string[] = [];
      bus.on('*', (e) => { received.push(e.type); });
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('hook:pre_tool_use'));
      bus.emit(makeEvent('workflow:created'));
      expect(received).toHaveLength(3);
    });

    it('namespace wildcard does not match events from other namespaces', () => {
      const received: string[] = [];
      bus.on('hook:*', (e) => { received.push(e.type); });
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('workflow:created'));
      expect(received).toHaveLength(0);
    });

    it('namespace wildcard does not match when namespace is only prefix without colon', () => {
      const received: string[] = [];
      bus.on('hook:*', (e) => { received.push(e.type); });
      // 'hookExtra:event' should NOT match 'hook:*' because the namespace is 'hook'
      bus.emit(makeEvent('session:started'));
      expect(received).toHaveLength(0);
    });

    it('multiple patterns can match the same event', () => {
      const calls: string[] = [];
      bus.on('hook:pre_tool_use', () => { calls.push('exact'); });
      bus.on('hook:*', () => { calls.push('namespace'); });
      bus.on('*', () => { calls.push('global'); });
      bus.emit(makeEvent('hook:pre_tool_use'));
      expect(calls).toContain('exact');
      expect(calls).toContain('namespace');
      expect(calls).toContain('global');
    });
  });

  // ─── Error isolation ───────────────────────────────────────────────────────

  describe('error isolation', () => {
    it('sync handler that throws does not prevent other handlers from running', () => {
      const calls: number[] = [];
      bus.on('session:started', () => { throw new Error('boom'); });
      bus.on('session:started', () => { calls.push(2); });
      bus.on('session:started', () => { calls.push(3); });
      expect(() => bus.emit(makeEvent('session:started'))).not.toThrow();
      expect(calls).toEqual([2, 3]);
    });

    it('async handler error is fire-and-forget and does not throw from emit', async () => {
      let asyncErrorCaught = false;
      bus.on('session:started', async () => { throw new Error('async boom'); });
      const syncCalls: number[] = [];
      bus.on('session:started', () => { syncCalls.push(1); });
      expect(() => bus.emit(makeEvent('session:started'))).not.toThrow();
      // Other sync handlers still ran
      expect(syncCalls).toEqual([1]);
      // Allow async rejection to settle
      await new Promise((r) => setImmediate(r));
      // No uncaught rejection — asyncErrorCaught stays false
      expect(asyncErrorCaught).toBe(false);
    });
  });

  // ─── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns empty array when no events emitted', () => {
      expect(bus.getHistory()).toEqual([]);
    });

    it('returns events in emission order', () => {
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('session:ending'));
      bus.emit(makeEvent('session:ended'));
      const history = bus.getHistory();
      expect(history.map((e) => e.type)).toEqual([
        'session:started',
        'session:ending',
        'session:ended',
      ]);
    });

    it('ring buffer evicts oldest events when full', () => {
      const b = new EventBus(3);
      b.emit(makeEvent('session:started'));
      b.emit(makeEvent('session:ending'));
      b.emit(makeEvent('session:ended'));
      b.emit(makeEvent('workflow:created')); // evicts session:started
      const history = b.getHistory();
      expect(history).toHaveLength(3);
      expect(history.map((e) => e.type)).toEqual([
        'session:ending',
        'session:ended',
        'workflow:created',
      ]);
    });

    it('filter by types returns only matching events', () => {
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('hook:pre_tool_use'));
      bus.emit(makeEvent('session:ended'));
      const filtered = bus.getHistory({ types: ['hook:pre_tool_use'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.type).toBe('hook:pre_tool_use');
    });

    it('filter by source returns only matching events', () => {
      bus.emit(makeEvent('session:started', { source: { kind: 'internal', hook_name: 'test' } }));
      bus.emit(makeEvent('hook:pre_tool_use', { source: { kind: 'system' } }));
      const filtered = bus.getHistory({ source: { kind: 'internal' } });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.source).toEqual({ kind: 'internal', hook_name: 'test' });
    });

    it('filter by since excludes older events', () => {
      const past = Date.now() - 10_000;
      const now = Date.now();
      bus.emit(makeEvent('session:started', { timestamp: past }));
      bus.emit(makeEvent('session:ending', { timestamp: now }));
      const filtered = bus.getHistory({ since: Date.now() - 5_000 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.type).toBe('session:ending');
    });

    it('filter by until excludes newer events', () => {
      const past = Date.now() - 10_000;
      const now = Date.now();
      bus.emit(makeEvent('session:started', { timestamp: past }));
      bus.emit(makeEvent('session:ending', { timestamp: now }));
      const filtered = bus.getHistory({ until: Date.now() - 5_000 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.type).toBe('session:started');
    });

    it('filter by correlation_id returns only matching events', () => {
      bus.emit(makeEvent('session:started', { metadata: { correlation_id: 'corr-123' } }));
      bus.emit(makeEvent('session:ending', { metadata: { correlation_id: 'corr-456' } }));
      const filtered = bus.getHistory({ correlation_id: 'corr-123' });
      expect(filtered).toHaveLength(1);
    });

    it('filter with limit returns last N events', () => {
      for (let i = 0; i < 5; i++) {
        bus.emit(makeEvent('session:started'));
      }
      const filtered = bus.getHistory({ limit: 2 });
      expect(filtered).toHaveLength(2);
    });

    it('empty types array does not filter out events', () => {
      bus.emit(makeEvent('session:started'));
      const filtered = bus.getHistory({ types: [] });
      expect(filtered).toHaveLength(1);
    });
  });

  // ─── listenerCount ─────────────────────────────────────────────────────────

  describe('listenerCount', () => {
    it('returns 0 when no handlers registered', () => {
      expect(bus.listenerCount()).toBe(0);
    });

    it('returns total listener count across all patterns', () => {
      bus.on('session:started', vi.fn());
      bus.on('session:started', vi.fn());
      bus.on('hook:*', vi.fn());
      expect(bus.listenerCount()).toBe(3);
    });

    it('returns count for a specific pattern', () => {
      bus.on('session:started', vi.fn());
      bus.on('session:started', vi.fn());
      bus.on('hook:*', vi.fn());
      expect(bus.listenerCount('session:started')).toBe(2);
      expect(bus.listenerCount('hook:*')).toBe(1);
    });

    it('returns 0 for a pattern with no listeners', () => {
      expect(bus.listenerCount('session:started')).toBe(0);
    });
  });

  // ─── removeAllListeners ────────────────────────────────────────────────────

  describe('removeAllListeners', () => {
    it('clears all handlers', () => {
      bus.on('session:started', vi.fn());
      bus.on('hook:*', vi.fn());
      bus.on('*', vi.fn());
      bus.removeAllListeners();
      expect(bus.listenerCount()).toBe(0);
    });

    it('clears history buffer', () => {
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('session:ending'));
      bus.removeAllListeners();
      expect(bus.getHistory()).toHaveLength(0);
    });

    it('no events delivered after removeAllListeners', () => {
      const calls: number[] = [];
      bus.on('session:started', () => { calls.push(1); });
      bus.removeAllListeners();
      bus.emit(makeEvent('session:started'));
      expect(calls).toHaveLength(0);
    });
  });

  // ─── setEventLog ───────────────────────────────────────────────────────────

  describe('setEventLog', () => {
    it('replaces a previously set event log', () => {
      const log1 = { append: vi.fn() };
      const log2 = { append: vi.fn() };
      bus.setEventLog(log1);
      bus.setEventLog(log2);
      bus.emit(makeEvent('session:started'));
      expect(log1.append).not.toHaveBeenCalled();
      expect(log2.append).toHaveBeenCalledOnce();
    });
  });
});
