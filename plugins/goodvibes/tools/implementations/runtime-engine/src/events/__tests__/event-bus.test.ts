import { EventBus } from '../event-bus.js';
import type { RuntimeEvent, EventHandler } from '../types.js';

/** Build a minimal RuntimeEvent for testing. */
function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: 'evt_test',
    timestamp: new Date().toISOString(),
    source: { kind: 'hook', hook_name: 'pre_tool_use' },
    type: 'hook:pre_tool_use',
    payload: { type: 'hook:pre_tool_use', data: { hook_name: 'pre_tool_use', duration_ms: 0 } },
    metadata: {
      session_id: 'test-session',
      sequence: 1,
      version: 1,
    },
    ...overrides,
  };
}

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  // ─── emit ────────────────────────────────────────────────────────────────────

  describe('emit', () => {
    it('returns a fully-formed RuntimeEvent', () => {
      const result = bus.emit(makeEvent());
      expect(result).toMatchObject({
        id: expect.any(String),
        timestamp: expect.any(String),
        type: 'hook:pre_tool_use',
      });
    });

    it('assigns an incrementing sequence number starting at 1', () => {
      const e1 = bus.emit(makeEvent());
      const e2 = bus.emit(makeEvent());
      const e3 = bus.emit(makeEvent());
      expect(e1.metadata.sequence).toBe(1);
      expect(e2.metadata.sequence).toBe(2);
      expect(e3.metadata.sequence).toBe(3);
    });

    it('auto-generates id and timestamp when omitted', () => {
      const partial = {
        source: { kind: 'hook' as const, hook_name: 'test' },
        type: 'hook:post_tool_use' as const,
        payload: { type: 'hook:post_tool_use' as const, data: { hook_name: 'test', duration_ms: 0 } },
      };
      const result = bus.emit(partial);
      expect(result.id).toMatch(/^evt_/);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('uses provided id and timestamp when given', () => {
      const event = makeEvent({ id: 'evt_custom', timestamp: '2026-01-01T00:00:00.000Z' });
      const result = bus.emit(event);
      expect(result.id).toBe('evt_custom');
      expect(result.timestamp).toBe('2026-01-01T00:00:00.000Z');
    });

    it('fills in session_id from metadata if provided', () => {
      const event = makeEvent();
      (event.metadata as RuntimeEvent['metadata']).session_id = 'custom-session';
      const result = bus.emit(event);
      expect(result.metadata.session_id).toBe('custom-session');
    });

    it('sets version to 1', () => {
      const result = bus.emit(makeEvent());
      expect(result.metadata.version).toBe(1);
    });
  });

  // ─── on / Listener Subscription ──────────────────────────────────────────────

  describe('on — exact match', () => {
    it('calls handler for exact matching event type', () => {
      const received: RuntimeEvent[] = [];
      bus.on('hook:pre_tool_use', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(1);
    });

    it('does not call handler for non-matching event type', () => {
      const received: RuntimeEvent[] = [];
      bus.on('hook:pre_tool_use', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:post_tool_use' }));
      expect(received).toHaveLength(0);
    });

    it('calls multiple handlers registered for same pattern in registration order', () => {
      const order: number[] = [];
      bus.on('hook:pre_tool_use', () => order.push(1));
      bus.on('hook:pre_tool_use', () => order.push(2));
      bus.on('hook:pre_tool_use', () => order.push(3));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(order).toEqual([1, 2, 3]);
    });

    it('returns an unsubscribe function', () => {
      const off = bus.on('hook:pre_tool_use', () => {});
      expect(typeof off).toBe('function');
    });
  });

  // ─── Wildcard Patterns ───────────────────────────────────────────────────────

  describe('on — namespace wildcard (hook:*)', () => {
    it('matches any event in the namespace', () => {
      const received: string[] = [];
      bus.on('hook:*', (e) => received.push(e.type));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      bus.emit(makeEvent({ type: 'hook:post_tool_use' }));
      expect(received).toEqual(['hook:pre_tool_use', 'hook:post_tool_use']);
    });

    it('does not match events in a different namespace', () => {
      const received: RuntimeEvent[] = [];
      bus.on('hook:*', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'agent:spawned' }));
      expect(received).toHaveLength(0);
    });

    it('does not match bare namespace name without colon', () => {
      const received: RuntimeEvent[] = [];
      bus.on('hook:*', (e) => received.push(e));
      // A type that starts with 'hook' but no colon - not in types, simulate via cast
      const event = makeEvent();
      (event as RuntimeEvent & { type: string }).type = 'hookother';
      bus.emit(event as RuntimeEvent);
      expect(received).toHaveLength(0);
    });
  });

  describe('on — global wildcard (*)', () => {
    it('matches all event types', () => {
      const received: string[] = [];
      bus.on('*', (e) => received.push(e.type));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      bus.emit(makeEvent({ type: 'agent:spawned' }));
      bus.emit(makeEvent({ type: 'workflow:started' }));
      expect(received).toHaveLength(3);
    });
  });

  // ─── Unsubscribe ─────────────────────────────────────────────────────────────

  describe('off (via returned unsubscribe)', () => {
    it('stops handler from receiving events after unsubscribe', () => {
      const received: RuntimeEvent[] = [];
      const off = bus.on('hook:pre_tool_use', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      off();
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(1);
    });

    it('calling unsubscribe multiple times does not throw', () => {
      const off = bus.on('hook:pre_tool_use', () => {});
      expect(() => {
        off();
        off();
      }).not.toThrow();
    });

    it('removes the pattern entry when last handler for a pattern unsubscribes', () => {
      const off = bus.on('hook:pre_tool_use', () => {});
      expect(bus.listenerCount('hook:pre_tool_use')).toBe(1);
      off();
      expect(bus.listenerCount('hook:pre_tool_use')).toBe(0);
    });

    it('only removes the specific handler, not others on the same pattern', () => {
      const received: number[] = [];
      const off1 = bus.on('hook:pre_tool_use', () => received.push(1));
      bus.on('hook:pre_tool_use', () => received.push(2));
      off1();
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toEqual([2]);
    });
  });

  // ─── once ────────────────────────────────────────────────────────────────────

  describe('once', () => {
    it('fires handler only on first matching event', () => {
      const received: RuntimeEvent[] = [];
      bus.once('hook:pre_tool_use', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(1);
    });

    it('returns an unsubscribe function that can cancel before first event', () => {
      const received: RuntimeEvent[] = [];
      const off = bus.once('hook:pre_tool_use', (e) => received.push(e));
      off();
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(0);
    });

    it('once with wildcard fires only once', () => {
      const received: RuntimeEvent[] = [];
      bus.once('hook:*', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      bus.emit(makeEvent({ type: 'hook:post_tool_use' }));
      expect(received).toHaveLength(1);
    });
  });

  // ─── getHistory / Ring Buffer ─────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns events in emission order', () => {
      const e1 = bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      const e2 = bus.emit(makeEvent({ type: 'hook:post_tool_use' }));
      const history = bus.getHistory();
      expect(history[0].metadata.sequence).toBe(e1.metadata.sequence);
      expect(history[1].metadata.sequence).toBe(e2.metadata.sequence);
    });

    it('returns empty array when no events emitted', () => {
      expect(bus.getHistory()).toEqual([]);
    });

    it('respects maxHistorySize cap — oldest events evicted when full', () => {
      const smallBus = new EventBus(3);
      for (let i = 0; i < 5; i++) {
        smallBus.emit(makeEvent());
      }
      const history = smallBus.getHistory();
      expect(history).toHaveLength(3);
    });

    it('ring buffer wrapping preserves chronological order', () => {
      const smallBus = new EventBus(3);
      // Emit 5 events; only last 3 kept
      for (let i = 0; i < 5; i++) {
        smallBus.emit(makeEvent());
      }
      const history = smallBus.getHistory();
      const seqs = history.map((e) => e.metadata.sequence);
      expect(seqs).toEqual([3, 4, 5]);
    });

    it('filter by types returns only matching events', () => {
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      bus.emit(makeEvent({ type: 'hook:post_tool_use' }));
      bus.emit(makeEvent({ type: 'agent:spawned' }));
      const filtered = bus.getHistory({ types: ['hook:pre_tool_use'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('hook:pre_tool_use');
    });

    it('filter by since excludes events before that time', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const now = new Date().toISOString();
      // Emit one with old timestamp and one with current
      bus.emit(makeEvent({ timestamp: past }));
      bus.emit(makeEvent({ timestamp: now }));
      const filtered = bus.getHistory({ since: new Date(Date.now() - 30_000).toISOString() });
      // Only the recent event should pass
      expect(filtered).toHaveLength(1);
    });

    it('filter by until excludes events after that time', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const now = new Date().toISOString();
      bus.emit(makeEvent({ timestamp: past }));
      bus.emit(makeEvent({ timestamp: now }));
      const filtered = bus.getHistory({ until: new Date(Date.now() - 30_000).toISOString() });
      expect(filtered).toHaveLength(1);
    });

    it('filter by correlation_id returns only matching events', () => {
      const e1 = makeEvent();
      const e2 = makeEvent();
      e1.metadata.correlation_id = 'corr-123';
      bus.emit(e1);
      bus.emit(e2);
      const filtered = bus.getHistory({ correlation_id: 'corr-123' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].metadata.correlation_id).toBe('corr-123');
    });

    it('filter by limit returns only the last N events', () => {
      for (let i = 0; i < 5; i++) {
        bus.emit(makeEvent());
      }
      const filtered = bus.getHistory({ limit: 2 });
      expect(filtered).toHaveLength(2);
      // Should be the last 2 events
      expect(filtered[0].metadata.sequence).toBe(4);
      expect(filtered[1].metadata.sequence).toBe(5);
    });

    it('filter by source returns only matching source events', () => {
      const hookEvent = makeEvent({ source: { kind: 'hook', hook_name: 'pre_tool_use' } });
      const systemEvent = makeEvent({ source: { kind: 'system' } });
      bus.emit(hookEvent);
      bus.emit(systemEvent);
      const filtered = bus.getHistory({ source: { kind: 'hook' } });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].source.kind).toBe('hook');
    });

    it('empty types array does not filter out events', () => {
      bus.emit(makeEvent());
      bus.emit(makeEvent());
      const filtered = bus.getHistory({ types: [] });
      expect(filtered).toHaveLength(2);
    });

    it('limit of 0 returns all events', () => {
      bus.emit(makeEvent());
      bus.emit(makeEvent());
      const filtered = bus.getHistory({ limit: 0 });
      expect(filtered).toHaveLength(2);
    });
  });

  // ─── listenerCount ───────────────────────────────────────────────────────────

  describe('listenerCount', () => {
    it('returns 0 when no handlers registered', () => {
      expect(bus.listenerCount()).toBe(0);
    });

    it('counts listeners for a specific pattern', () => {
      bus.on('hook:pre_tool_use', () => {});
      bus.on('hook:pre_tool_use', () => {});
      expect(bus.listenerCount('hook:pre_tool_use')).toBe(2);
    });

    it('counts all listeners across all patterns when no pattern given', () => {
      bus.on('hook:pre_tool_use', () => {});
      bus.on('hook:post_tool_use', () => {});
      bus.on('*', () => {});
      expect(bus.listenerCount()).toBe(3);
    });

    it('returns 0 for pattern with no registered handlers', () => {
      bus.on('hook:pre_tool_use', () => {});
      expect(bus.listenerCount('agent:spawned')).toBe(0);
    });
  });

  // ─── removeAllListeners ──────────────────────────────────────────────────────

  describe('removeAllListeners', () => {
    it('clears all handlers', () => {
      bus.on('hook:pre_tool_use', () => {});
      bus.on('*', () => {});
      bus.removeAllListeners();
      expect(bus.listenerCount()).toBe(0);
    });

    it('clears event history', () => {
      bus.emit(makeEvent());
      bus.emit(makeEvent());
      bus.removeAllListeners();
      expect(bus.getHistory()).toHaveLength(0);
    });

    it('previously registered handlers no longer fire after removeAllListeners', () => {
      const received: RuntimeEvent[] = [];
      bus.on('hook:pre_tool_use', (e) => received.push(e));
      bus.removeAllListeners();
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(0);
    });
  });

  // ─── setEventLog ─────────────────────────────────────────────────────────────

  describe('setEventLog', () => {
    it('appends emitted events to the injected event log', () => {
      const appended: RuntimeEvent[] = [];
      bus.setEventLog({ append: (e) => appended.push(e) });
      const emitted = bus.emit(makeEvent());
      expect(appended).toHaveLength(1);
      expect(appended[0].id).toBe(emitted.id);
    });

    it('does not throw when event log append fails', () => {
      bus.setEventLog({
        append: () => {
          throw new Error('disk full');
        },
      });
      expect(() => bus.emit(makeEvent())).not.toThrow();
    });

    it('still dispatches to handlers even if event log throws', () => {
      bus.setEventLog({
        append: () => {
          throw new Error('disk full');
        },
      });
      const received: RuntimeEvent[] = [];
      bus.on('hook:pre_tool_use', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(1);
    });
  });

  // ─── Async Handler Error Handling ────────────────────────────────────────────

  describe('async handler error handling', () => {
    it('does not throw synchronously when async handler rejects', async () => {
      bus.on('hook:pre_tool_use', async () => {
        throw new Error('async handler error');
      });
      expect(() => bus.emit(makeEvent({ type: 'hook:pre_tool_use' }))).not.toThrow();
    });

    it('sync handler that throws does not prevent other handlers from running', () => {
      const received: RuntimeEvent[] = [];
      bus.on('hook:pre_tool_use', () => {
        throw new Error('first handler blows up');
      });
      bus.on('hook:pre_tool_use', (e) => received.push(e));
      bus.emit(makeEvent({ type: 'hook:pre_tool_use' }));
      expect(received).toHaveLength(1);
    });
  });

  // ─── Ring Buffer Overflow Protection ─────────────────────────────────────────

  describe('ring buffer overflow protection', () => {
    it('resets historyWriteIndex near MAX_SAFE_INTEGER to prevent overflow', () => {
      const smallBus = new EventBus(3);
      // Fill the buffer
      for (let i = 0; i < 3; i++) smallBus.emit(makeEvent());
      // Simulate near-overflow: place index just at the guard threshold
      (smallBus as any).historyWriteIndex = Number.MAX_SAFE_INTEGER - 3;
      // Emit triggers the overflow guard during increment
      smallBus.emit(makeEvent());
      // Guard resets via modulo — index must now be well below the threshold
      expect((smallBus as any).historyWriteIndex).toBeLessThan(Number.MAX_SAFE_INTEGER - 3);
    });

    it('history remains readable after overflow guard reset', () => {
      const smallBus = new EventBus(3);
      for (let i = 0; i < 3; i++) smallBus.emit(makeEvent());
      (smallBus as any).historyWriteIndex = Number.MAX_SAFE_INTEGER - 3;
      smallBus.emit(makeEvent());
      // Buffer should still contain events
      const history = smallBus.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });
});
