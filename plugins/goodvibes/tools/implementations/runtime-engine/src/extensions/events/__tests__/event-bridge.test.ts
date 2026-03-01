import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../event-bus.js';
import { EventBridge } from '../event-bridge.js';
import type { RuntimeEvent as CoreRuntimeEvent } from '../../../core/types.js';
import type { RuntimeEvent } from '../types.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Fake EventQueue ─────────────────────────────────────────────────────────

function makeEventQueue() {
  const enqueued: CoreRuntimeEvent[] = [];
  return {
    enqueue: vi.fn((event: CoreRuntimeEvent) => enqueued.push(event)),
    drain: vi.fn(() => []),
    peek: vi.fn().mockReturnValue(null),
    depth: vi.fn(() => 0),
    deduplicate: vi.fn(),
    cancel: vi.fn(),
    cancelByRef: vi.fn(),
    requeue: vi.fn(),
    enqueued,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(
  type: string,
  sourceKind = 'system',
): Parameters<EventBus['emit']>[0] {
  return {
    id: `evt_${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: type as never,
    source: { kind: sourceKind as never },
    payload: { type: type as never, data: {} as never },
  };
}

describe('EventBridge', () => {
  let bus: EventBus;
  let queue: ReturnType<typeof makeEventQueue>;
  let bridge: EventBridge;

  beforeEach(() => {
    bus = new EventBus();
    queue = makeEventQueue();
    bridge = new EventBridge(bus, queue);
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  describe('start / stop', () => {
    it('starts inactive', () => {
      expect(bridge.getStats().active).toBe(false);
    });

    it('becomes active after start()', () => {
      bridge.start();
      expect(bridge.getStats().active).toBe(true);
    });

    it('becomes inactive after stop()', () => {
      bridge.start();
      bridge.stop();
      expect(bridge.getStats().active).toBe(false);
    });

    it('calling start() twice does not register double subscriptions', () => {
      bridge.start();
      bridge.start();
      // Emit a forwarded event — should only be enqueued once
      bus.emit(makeEvent('agent:spawned', 'system'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('stop() is a no-op when already stopped', () => {
      bridge.stop(); // called without start — should not throw
      expect(bridge.getStats().active).toBe(false);
    });
  });

  // ─── Forwarding ──────────────────────────────────────────────────────────────

  describe('forwarding', () => {
    beforeEach(() => bridge.start());

    it('forwards agent:spawned events', () => {
      bus.emit(makeEvent('agent:spawned', 'agent'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('forwards agent:completed events', () => {
      bus.emit(makeEvent('agent:completed', 'agent'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('forwards hook:subagent_start events', () => {
      bus.emit(makeEvent('hook:subagent_start', 'hook'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('forwards hook:subagent_stop events', () => {
      bus.emit(makeEvent('hook:subagent_stop', 'hook'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('forwards workflow:created events', () => {
      bus.emit(makeEvent('workflow:created', 'workflow'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('forwards workflow:state_changed events', () => {
      bus.emit(makeEvent('workflow:state_changed', 'workflow'));
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('increments forwarded counter for each forwarded event', () => {
      bus.emit(makeEvent('agent:spawned'));
      bus.emit(makeEvent('agent:completed'));
      expect(bridge.getStats().forwarded).toBe(2);
    });
  });

  // ─── Filtering ───────────────────────────────────────────────────────────────

  describe('filtering', () => {
    beforeEach(() => bridge.start());

    it('does not forward irrelevant event types', () => {
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('hook:pre_tool_use'));
      bus.emit(makeEvent('test:passed'));
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('increments filtered counter for irrelevant events', () => {
      bus.emit(makeEvent('session:started'));
      bus.emit(makeEvent('hook:pre_tool_use'));
      expect(bridge.getStats().filtered).toBe(2);
    });
  });

  // ─── Loop prevention ─────────────────────────────────────────────────────────

  describe('loop prevention', () => {
    beforeEach(() => bridge.start());

    it('skips events whose metadata.origin is the bridge origin tag', () => {
      // The bridge checks (event.metadata as Record<string, unknown>).origin.
      // EventBus.emit() strips unrecognised metadata fields, so this path is
      // exercised by injecting a pre-built RuntimeEvent directly into the
      // EventBus subscriber, bypassing emit().
      let capturedHandler: ((e: RuntimeEvent) => void) | undefined;
      const busSpy = {
        on: vi.fn((pattern: string, handler: (e: RuntimeEvent) => void) => {
          capturedHandler = handler;
          return () => {};
        }),
      } as unknown as EventBus;

      const spyQueue = makeEventQueue();
      const spyBridge = new EventBridge(busSpy, spyQueue);
      spyBridge.start();

      // Confirm the bridge called bus.on and captured the handler
      expect(capturedHandler).toBeDefined();

      // Now invoke the handler with an event carrying the origin tag directly
      const fakeEvent: RuntimeEvent = {
        id: 'evt_loop',
        timestamp: new Date().toISOString(),
        type: 'agent:spawned' as never,
        source: { kind: 'system' as never },
        payload: { type: 'agent:spawned' as never, data: {} as never },
        metadata: {
          session_id: 'sess',
          sequence: 1,
          version: 1,
          // @ts-expect-error origin is not in the official metadata type
          origin: '__event_bridge__',
        },
      };
      capturedHandler!(fakeEvent);

      // Event with origin tag should be skipped
      expect(spyQueue.enqueue).not.toHaveBeenCalled();
    });

    it('does not skip events whose metadata.origin is undefined', () => {
      bus.emit(makeEvent('agent:spawned', 'system'));
      // Normal events without origin tag are forwarded
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Source kind mapping ─────────────────────────────────────────────────────

  describe('source kind mapping', () => {
    beforeEach(() => bridge.start());

    it('maps agent source to "agent" in the core event', () => {
      bus.emit(makeEvent('agent:spawned', 'agent'));
      const forwarded = queue.enqueued[0];
      expect(forwarded.source).toBe('agent');
    });

    it('maps hook source to "internal" in the core event', () => {
      bus.emit(makeEvent('hook:subagent_stop', 'hook'));
      const forwarded = queue.enqueued[0];
      expect(forwarded.source).toBe('internal');
    });

    it('maps system source to "internal" in the core event', () => {
      bus.emit(makeEvent('agent:spawned', 'system'));
      const forwarded = queue.enqueued[0];
      expect(forwarded.source).toBe('internal');
    });

    it('maps trigger source to "internal" in the core event', () => {
      const event: Parameters<EventBus['emit']>[0] = {
        id: 'evt_trigger',
        timestamp: new Date().toISOString(),
        type: 'agent:spawned' as never,
        source: { kind: 'trigger' as never, trigger_id: 'trig-1' } as never,
        payload: { type: 'agent:spawned' as never, data: {} as never },
      };
      bus.emit(event);
      const forwarded = queue.enqueued[0];
      expect(forwarded.source).toBe('internal');
    });

    it('maps mcp_tool source to "external" in the core event', () => {
      const event: Parameters<EventBus['emit']>[0] = {
        id: 'evt_mcp',
        timestamp: new Date().toISOString(),
        type: 'agent:spawned' as never,
        source: { kind: 'mcp_tool' as never, tool_name: 'my-tool' } as never,
        payload: { type: 'agent:spawned' as never, data: {} as never },
      };
      bus.emit(event);
      const forwarded = queue.enqueued[0];
      expect(forwarded.source).toBe('external');
    });

    it('maps ipc source to "external" in the core event', () => {
      const event: Parameters<EventBus['emit']>[0] = {
        id: 'evt_ipc',
        timestamp: new Date().toISOString(),
        type: 'agent:spawned' as never,
        source: { kind: 'ipc' as never, client_id: 'hook-1' } as never,
        payload: { type: 'agent:spawned' as never, data: {} as never },
      };
      bus.emit(event);
      const forwarded = queue.enqueued[0];
      expect(forwarded.source).toBe('external');
    });
  });

  // ─── Timestamp conversion ────────────────────────────────────────────────────

  describe('timestamp conversion', () => {
    beforeEach(() => bridge.start());

    it('converts ISO timestamp string to epoch milliseconds', () => {
      const before = Date.now();
      bus.emit(makeEvent('agent:spawned', 'system'));
      const after = Date.now();
      const forwarded = queue.enqueued[0];
      expect(typeof forwarded.timestamp).toBe('number');
      expect(forwarded.timestamp).toBeGreaterThanOrEqual(before);
      expect(forwarded.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // ─── Stats ───────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns forwarded=0, filtered=0, active=false initially', () => {
      expect(bridge.getStats()).toEqual({ forwarded: 0, filtered: 0, active: false });
    });

    it('does not count events when bridge is stopped', () => {
      bridge.start();
      bridge.stop();
      bus.emit(makeEvent('agent:spawned'));
      expect(bridge.getStats().forwarded).toBe(0);
    });
  });
});
