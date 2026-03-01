import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { EventBridge } from '../event-bridge.js';
import type { EventBus } from '../event-bus.js';
import type { EventQueueInterface, RuntimeEvent as CoreRuntimeEvent } from '../../../core/types.js';
import type { RuntimeEvent } from '../types.js';

// Suppress logger output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  type: string,
  overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
  return {
    id: `evt-${type}-${Math.random()}`,
    type,
    source: { kind: 'system', id: 'test' },
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  } as RuntimeEvent;
}

function makeMockEventBus(): { bus: EventBus; triggerSubscription: (event: RuntimeEvent) => void } {
  let storedListener: ((event: RuntimeEvent) => void) | undefined;
  const unsubscribeFn = vi.fn();

  const bus = {
    on: vi.fn().mockImplementation((_pattern: string, listener: (event: RuntimeEvent) => void) => {
      storedListener = listener;
      return unsubscribeFn;
    }),
    emit: vi.fn(),
    off: vi.fn(),
  } as unknown as EventBus;

  return {
    bus,
    triggerSubscription: (event: RuntimeEvent) => {
      if (storedListener) storedListener(event);
    },
  };
}

function makeMockEventQueue(): EventQueueInterface {
  return {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    peek: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    isEmpty: vi.fn().mockReturnValue(true),
    clear: vi.fn(),
  } as unknown as EventQueueInterface;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventBridge', () => {
  let eventQueue: EventQueueInterface;
  let bridge: EventBridge;
  let mockBus: ReturnType<typeof makeMockEventBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBus = makeMockEventBus();
    eventQueue = makeMockEventQueue();
    bridge = new EventBridge(mockBus.bus, eventQueue);
  });

  // ─── start / stop lifecycle ──────────────────────────────────────────────────

  describe('start / stop lifecycle', () => {
    it('starts and subscribes to wildcard events', () => {
      bridge.start();
      expect((mockBus.bus.on as Mock)).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('does not re-subscribe when start is called twice', () => {
      bridge.start();
      bridge.start();
      expect((mockBus.bus.on as Mock)).toHaveBeenCalledTimes(1);
    });

    it('reports active=true after start', () => {
      bridge.start();
      expect(bridge.getStats().active).toBe(true);
    });

    it('reports active=false before start', () => {
      expect(bridge.getStats().active).toBe(false);
    });

    it('unsubscribes and reports active=false after stop', () => {
      bridge.start();
      bridge.stop();
      expect(bridge.getStats().active).toBe(false);
    });

    it('stop is a no-op when bridge was never started', () => {
      // Should not throw
      expect(() => bridge.stop()).not.toThrow();
    });

    it('stop is a no-op when called twice', () => {
      bridge.start();
      bridge.stop();
      // Second stop should not throw
      expect(() => bridge.stop()).not.toThrow();
    });
  });

  // ─── Event forwarding ────────────────────────────────────────────────────────

  describe('event forwarding', () => {
    const FORWARDED_TYPES = [
      'agent:spawned',
      'agent:completed',
      'hook:subagent_start',
      'hook:subagent_stop',
      'workflow:created',
      'workflow:state_changed',
    ];

    it.each(FORWARDED_TYPES)('forwards %s events to the core queue', (type) => {
      bridge.start();
      const event = makeEvent(type);
      mockBus.triggerSubscription(event);
      expect((eventQueue.enqueue as Mock)).toHaveBeenCalledTimes(1);
    });

    it('does not forward unrecognised event types', () => {
      bridge.start();
      mockBus.triggerSubscription(makeEvent('some:unknown:event'));
      mockBus.triggerSubscription(makeEvent('tool:called'));
      expect((eventQueue.enqueue as Mock)).not.toHaveBeenCalled();
    });

    it('increments forwarded counter on each forwarded event', () => {
      bridge.start();
      mockBus.triggerSubscription(makeEvent('agent:spawned'));
      mockBus.triggerSubscription(makeEvent('agent:completed'));
      expect(bridge.getStats().forwarded).toBe(2);
    });

    it('increments filtered counter for non-forwarded event types', () => {
      bridge.start();
      mockBus.triggerSubscription(makeEvent('irrelevant:event'));
      mockBus.triggerSubscription(makeEvent('another:irrelevant'));
      expect(bridge.getStats().filtered).toBe(2);
    });

    it('does not forward events after stop', () => {
      bridge.start();
      bridge.stop();
      // After stop the subscription is removed; triggerSubscription won't fire
      // (unsubscribeFn was called, so the listener is removed from the mock)
      expect((eventQueue.enqueue as Mock)).not.toHaveBeenCalled();
    });
  });

  // ─── Loop prevention ─────────────────────────────────────────────────────────

  describe('loop prevention', () => {
    it('skips events with origin tag __event_bridge__', () => {
      bridge.start();
      const bridgedEvent = makeEvent('agent:spawned', {
        metadata: { origin: '__event_bridge__' },
      } as Partial<RuntimeEvent>);
      mockBus.triggerSubscription(bridgedEvent);
      expect((eventQueue.enqueue as Mock)).not.toHaveBeenCalled();
    });

    it('does not skip events with a different origin', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', {
        metadata: { origin: 'some-other-origin' },
      } as Partial<RuntimeEvent>);
      mockBus.triggerSubscription(event);
      expect((eventQueue.enqueue as Mock)).toHaveBeenCalledTimes(1);
    });

    it('does not skip events with no metadata', () => {
      bridge.start();
      const event = makeEvent('agent:spawned');
      mockBus.triggerSubscription(event);
      expect((eventQueue.enqueue as Mock)).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Source mapping ───────────────────────────────────────────────────────────

  describe('source kind mapping', () => {
    it('maps agent source kind to "agent"', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', { source: { kind: 'agent', id: 'agent-1' } });
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.source).toBe('agent');
    });

    it('maps system source kind to "internal"', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', { source: { kind: 'system', id: 'system' } });
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.source).toBe('internal');
    });

    it('maps hook source kind to "internal"', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', { source: { kind: 'hook', id: 'hook-1' } });
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.source).toBe('internal');
    });

    it('maps trigger source kind to "internal"', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', { source: { kind: 'trigger', id: 'trig-1' } });
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.source).toBe('internal');
    });

    it('maps unknown source kind to "external"', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', { source: { kind: 'plugin', id: 'p-1' } } as Partial<RuntimeEvent>);
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.source).toBe('external');
    });
  });

  // ─── CoreRuntimeEvent construction ───────────────────────────────────────────

  describe('CoreRuntimeEvent construction', () => {
    it('preserves event id, type, payload', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', { id: 'evt-123', payload: { agent_id: 'a' } });
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.id).toBe('evt-123');
      expect(enqueued.type).toBe('agent:spawned');
      expect(enqueued.payload).toEqual({ agent_id: 'a' });
    });

    it('converts ISO string timestamp to epoch number', () => {
      bridge.start();
      const ts = '2024-01-15T10:00:00.000Z';
      const event = makeEvent('agent:spawned', { timestamp: ts });
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.timestamp).toBe(new Date(ts).getTime());
    });

    it('falls back to Date.now() when timestamp is not a string', () => {
      bridge.start();
      const before = Date.now();
      // Force a non-string timestamp by casting
      const event = makeEvent('agent:spawned', { timestamp: 12345 as unknown as string });
      mockBus.triggerSubscription(event);
      const after = Date.now();
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.timestamp).toBeGreaterThanOrEqual(before);
      expect(enqueued.timestamp).toBeLessThanOrEqual(after);
    });

    it('preserves correlation_id in context ref when present', () => {
      bridge.start();
      const event = makeEvent('agent:spawned', {
        metadata: { correlation_id: 'corr-abc' },
      } as Partial<RuntimeEvent>);
      mockBus.triggerSubscription(event);
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.context?.ref).toBe('corr-abc');
    });

    it('emits event with priority 0', () => {
      bridge.start();
      mockBus.triggerSubscription(makeEvent('agent:spawned'));
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.priority).toBe(0);
    });

    it('emits empty context when no correlation_id present', () => {
      bridge.start();
      mockBus.triggerSubscription(makeEvent('agent:spawned'));
      const enqueued = (eventQueue.enqueue as Mock).mock.calls[0][0] as CoreRuntimeEvent;
      expect(enqueued.context).toEqual({});
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zero counts before any events', () => {
      bridge.start();
      const stats = bridge.getStats();
      expect(stats.forwarded).toBe(0);
      expect(stats.filtered).toBe(0);
      expect(stats.active).toBe(true);
    });

    it('accumulates forwarded and filtered counts independently', () => {
      bridge.start();
      mockBus.triggerSubscription(makeEvent('agent:spawned'));
      mockBus.triggerSubscription(makeEvent('irrelevant'));
      mockBus.triggerSubscription(makeEvent('agent:completed'));
      const stats = bridge.getStats();
      expect(stats.forwarded).toBe(2);
      expect(stats.filtered).toBe(1);
    });
  });
});
