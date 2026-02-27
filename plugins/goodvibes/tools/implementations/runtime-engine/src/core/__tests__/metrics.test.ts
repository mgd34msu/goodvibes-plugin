/**
 * metrics.test.ts
 * Tests for EventMetrics and internal RollingWindow — Layer 1.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventMetrics } from '../metrics.js';
import type { RuntimeEvent } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: overrides.id ?? 'evt-1',
    source: 'internal',
    type: overrides.type ?? 'test:event',
    payload: {},
    timestamp: Date.now(),
    priority: 0,
    context: overrides.context,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventMetrics', () => {
  let metrics: EventMetrics;

  beforeEach(() => {
    metrics = new EventMetrics();
  });

  // ── Initial snapshot ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('returns zeroed snapshot on construction', () => {
      const snap = metrics.getStats();
      expect(snap.events_processed).toBe(0);
      expect(snap.events_failed).toBe(0);
      expect(snap.events_dead_lettered).toBe(0);
      expect(snap.avg_latency_ms).toBe(0);
      expect(snap.queue_depth).toBe(0);
      expect(snap.active_chains).toBe(0);
      expect(snap.active_workflows).toBe(0);
      expect(snap.triggers_fired).toBe(0);
    });

    it('per-trigger fire count returns 0 for unknown trigger', () => {
      expect(metrics.getTriggerFireCount('unknown')).toBe(0);
    });

    it('per-trigger error count returns 0 for unknown trigger', () => {
      expect(metrics.getTriggerErrorCount('unknown')).toBe(0);
    });

    it('per-type count returns 0 for unknown type', () => {
      expect(metrics.getEventTypeCount('test:event')).toBe(0);
    });

    it('maxChainDepth returns 0 with no data', () => {
      expect(metrics.maxChainDepth()).toBe(0);
    });

    it('avgChainDepth returns 0 with no data', () => {
      expect(metrics.avgChainDepth()).toBe(0);
    });
  });

  // ── onEventProcessed ───────────────────────────────────────────────────────

  describe('onEventProcessed', () => {
    it('increments events_processed', () => {
      metrics.onEventProcessed(makeEvent(), 10);
      expect(metrics.getStats().events_processed).toBe(1);
    });

    it('accumulates events_processed across multiple calls', () => {
      metrics.onEventProcessed(makeEvent(), 10);
      metrics.onEventProcessed(makeEvent({ id: 'evt-2' }), 20);
      metrics.onEventProcessed(makeEvent({ id: 'evt-3' }), 30);
      expect(metrics.getStats().events_processed).toBe(3);
    });

    it('tracks avg_latency_ms correctly', () => {
      metrics.onEventProcessed(makeEvent(), 10);
      metrics.onEventProcessed(makeEvent({ id: 'evt-2' }), 20);
      // Average of 10 and 20 = 15
      expect(metrics.getStats().avg_latency_ms).toBe(15);
    });

    it('rounds avg_latency_ms to 2 decimal places', () => {
      metrics.onEventProcessed(makeEvent(), 1);
      metrics.onEventProcessed(makeEvent({ id: 'e2' }), 2);
      metrics.onEventProcessed(makeEvent({ id: 'e3' }), 4);
      // Average of 1, 2, 4 = 2.33 (rounds to 2 decimal places)
      expect(metrics.getStats().avg_latency_ms).toBe(2.33);
    });

    it('tracks avg_latency_ms with fractional result', () => {
      metrics.onEventProcessed(makeEvent(), 10);
      metrics.onEventProcessed(makeEvent({ id: 'e2' }), 11);
      metrics.onEventProcessed(makeEvent({ id: 'e3' }), 13);
      // Average of 10, 11, 13 = 11.33 (fractional, rounds to 2 decimal places)
      expect(metrics.getStats().avg_latency_ms).toBe(11.33);
    });

    it('increments per-type event count', () => {
      metrics.onEventProcessed(makeEvent({ type: 'user:login' }), 5);
      metrics.onEventProcessed(makeEvent({ id: 'e2', type: 'user:login' }), 5);
      metrics.onEventProcessed(makeEvent({ id: 'e3', type: 'user:logout' }), 5);
      expect(metrics.getEventTypeCount('user:login')).toBe(2);
      expect(metrics.getEventTypeCount('user:logout')).toBe(1);
    });

    it('tracks chain_depth from event context', () => {
      metrics.onEventProcessed(makeEvent({ context: { chain_depth: 3 } }), 5);
      expect(metrics.maxChainDepth()).toBe(3);
      expect(metrics.avgChainDepth()).toBe(3);
    });

    it('defaults chain_depth to 0 when context is undefined', () => {
      const evt = makeEvent();
      delete evt.context;
      metrics.onEventProcessed(evt, 5);
      expect(metrics.maxChainDepth()).toBe(0);
    });

    it('tracks max and avg chain depth across multiple events', () => {
      metrics.onEventProcessed(makeEvent({ context: { chain_depth: 2 } }), 1);
      metrics.onEventProcessed(makeEvent({ id: 'e2', context: { chain_depth: 8 } }), 1);
      metrics.onEventProcessed(makeEvent({ id: 'e3', context: { chain_depth: 5 } }), 1);
      expect(metrics.maxChainDepth()).toBe(8);
      expect(metrics.avgChainDepth()).toBeCloseTo((2 + 8 + 5) / 3);
    });
  });

  // ── onHandlerError ─────────────────────────────────────────────────────────

  describe('onHandlerError', () => {
    it('increments events_failed', () => {
      metrics.onHandlerError('trigger-1', new Error('boom'), makeEvent());
      expect(metrics.getStats().events_failed).toBe(1);
    });

    it('accumulates events_failed', () => {
      metrics.onHandlerError('t1', new Error('a'), makeEvent());
      metrics.onHandlerError('t2', new Error('b'), makeEvent());
      expect(metrics.getStats().events_failed).toBe(2);
    });

    it('increments per-trigger error count', () => {
      metrics.onHandlerError('trigger-a', new Error('x'), makeEvent());
      metrics.onHandlerError('trigger-a', new Error('y'), makeEvent());
      metrics.onHandlerError('trigger-b', new Error('z'), makeEvent());
      expect(metrics.getTriggerErrorCount('trigger-a')).toBe(2);
      expect(metrics.getTriggerErrorCount('trigger-b')).toBe(1);
    });
  });

  // ── onQueueDepthChange ─────────────────────────────────────────────────────

  describe('onQueueDepthChange', () => {
    it('updates queue_depth in snapshot', () => {
      metrics.onQueueDepthChange(42);
      expect(metrics.getStats().queue_depth).toBe(42);
    });

    it('reflects the latest depth', () => {
      metrics.onQueueDepthChange(10);
      metrics.onQueueDepthChange(5);
      expect(metrics.getStats().queue_depth).toBe(5);
    });
  });

  // ── onTriggerFired ─────────────────────────────────────────────────────────

  describe('onTriggerFired', () => {
    it('increments triggers_fired', () => {
      metrics.onTriggerFired('t1', makeEvent());
      expect(metrics.getStats().triggers_fired).toBe(1);
    });

    it('accumulates triggers_fired across multiple triggers', () => {
      metrics.onTriggerFired('t1', makeEvent());
      metrics.onTriggerFired('t2', makeEvent());
      metrics.onTriggerFired('t1', makeEvent());
      expect(metrics.getStats().triggers_fired).toBe(3);
    });

    it('increments per-trigger fire count', () => {
      metrics.onTriggerFired('trigger-x', makeEvent());
      metrics.onTriggerFired('trigger-x', makeEvent());
      metrics.onTriggerFired('trigger-y', makeEvent());
      expect(metrics.getTriggerFireCount('trigger-x')).toBe(2);
      expect(metrics.getTriggerFireCount('trigger-y')).toBe(1);
    });
  });

  // ── onEventDeadLettered ────────────────────────────────────────────────────

  describe('onEventDeadLettered', () => {
    it('increments events_dead_lettered', () => {
      metrics.onEventDeadLettered(makeEvent(), 'exhausted retries');
      expect(metrics.getStats().events_dead_lettered).toBe(1);
    });

    it('accumulates events_dead_lettered', () => {
      metrics.onEventDeadLettered(makeEvent(), 'reason1');
      metrics.onEventDeadLettered(makeEvent(), 'reason2');
      expect(metrics.getStats().events_dead_lettered).toBe(2);
    });
  });

  // ── setActiveChains / setActiveWorkflows ───────────────────────────────────

  describe('setActiveChains and setActiveWorkflows', () => {
    it('setActiveChains updates active_chains in snapshot', () => {
      metrics.setActiveChains(7);
      expect(metrics.getStats().active_chains).toBe(7);
    });

    it('setActiveWorkflows updates active_workflows in snapshot', () => {
      metrics.setActiveWorkflows(3);
      expect(metrics.getStats().active_workflows).toBe(3);
    });
  });

  // ── getStats snapshot ──────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns a complete MetricsSnapshot with all fields', () => {
      const evt = makeEvent({ type: 'test:type' });
      metrics.onEventProcessed(evt, 50);
      metrics.onHandlerError('t1', new Error('x'), evt);
      metrics.onEventDeadLettered(evt, 'reason');
      metrics.onTriggerFired('t2', evt);
      metrics.onQueueDepthChange(10);
      metrics.setActiveChains(2);
      metrics.setActiveWorkflows(1);

      const snap = metrics.getStats();
      expect(snap.events_processed).toBe(1);
      expect(snap.events_failed).toBe(1);
      expect(snap.events_dead_lettered).toBe(1);
      expect(snap.avg_latency_ms).toBe(50);
      expect(snap.queue_depth).toBe(10);
      expect(snap.active_chains).toBe(2);
      expect(snap.active_workflows).toBe(1);
      expect(snap.triggers_fired).toBe(1);
    });
  });

  // ── reset ──────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all counters', () => {
      const evt = makeEvent();
      metrics.onEventProcessed(evt, 10);
      metrics.onHandlerError('t1', new Error('x'), evt);
      metrics.onEventDeadLettered(evt, 'r');
      metrics.onTriggerFired('t2', evt);
      metrics.onQueueDepthChange(5);
      metrics.setActiveChains(3);
      metrics.setActiveWorkflows(2);

      metrics.reset();

      const snap = metrics.getStats();
      expect(snap.events_processed).toBe(0);
      expect(snap.events_failed).toBe(0);
      expect(snap.events_dead_lettered).toBe(0);
      expect(snap.avg_latency_ms).toBe(0);
      expect(snap.queue_depth).toBe(0);
      expect(snap.active_chains).toBe(0);
      expect(snap.active_workflows).toBe(0);
      expect(snap.triggers_fired).toBe(0);
    });

    it('clears per-trigger fire counts', () => {
      metrics.onTriggerFired('t1', makeEvent());
      metrics.reset();
      expect(metrics.getTriggerFireCount('t1')).toBe(0);
    });

    it('clears per-trigger error counts', () => {
      metrics.onHandlerError('t1', new Error('x'), makeEvent());
      metrics.reset();
      expect(metrics.getTriggerErrorCount('t1')).toBe(0);
    });

    it('clears per-type event counts', () => {
      metrics.onEventProcessed(makeEvent({ type: 'foo:bar' }), 1);
      metrics.reset();
      expect(metrics.getEventTypeCount('foo:bar')).toBe(0);
    });

    it('clears rolling window averages', () => {
      metrics.onEventProcessed(makeEvent(), 100);
      metrics.reset();
      expect(metrics.getStats().avg_latency_ms).toBe(0);
    });

    it('clears chain depth tracking', () => {
      metrics.onEventProcessed(makeEvent({ context: { chain_depth: 9 } }), 1);
      metrics.reset();
      expect(metrics.maxChainDepth()).toBe(0);
      expect(metrics.avgChainDepth()).toBe(0);
    });
  });

  // ── window_size boundary conditions ─────────────────────────────────────

  describe('RollingWindow window_size boundary conditions', () => {
    it('window_size = 1: each push replaces the previous value', () => {
      const m = new EventMetrics({ latency_window_size: 1 });
      m.onEventProcessed(makeEvent({ id: 'e1' }), 10);
      // Only 10 in window
      expect(m.getStats().avg_latency_ms).toBe(10);
      m.onEventProcessed(makeEvent({ id: 'e2' }), 20);
      // 10 evicted; only 20 in window
      expect(m.getStats().avg_latency_ms).toBe(20);
      m.onEventProcessed(makeEvent({ id: 'e3' }), 30);
      // Only 30 in window
      expect(m.getStats().avg_latency_ms).toBe(30);
    });

    it('window_size = 1: max returns the single stored value', () => {
      const m = new EventMetrics({ latency_window_size: 1 });
      m.onEventProcessed(makeEvent(), 42);
      expect(m.maxChainDepth()).toBe(0); // chain_depth = 0 by default
    });

    it('window_size = 1: size() reports 1 after first push', () => {
      const m = new EventMetrics({ latency_window_size: 1, chain_depth_window_size: 1 });
      m.onEventProcessed(makeEvent({ context: { chain_depth: 5 } }), 10);
      expect(m.maxChainDepth()).toBe(5);
      // Second push evicts first
      m.onEventProcessed(makeEvent({ id: 'e2', context: { chain_depth: 3 } }), 20);
      expect(m.maxChainDepth()).toBe(3);
    });

    it('window_size = 0: silently discards all pushes, average remains 0', () => {
      // capacity=0: buffer is empty array, all math produces NaN indices
      // count never increments because (count < capacity) => (0 < 0) is false
      // average() and max() guard on count===0 and return 0
      const m = new EventMetrics({ latency_window_size: 0 });
      m.onEventProcessed(makeEvent(), 100);
      m.onEventProcessed(makeEvent({ id: 'e2' }), 200);
      expect(m.getStats().avg_latency_ms).toBe(0);
    });

    it('window_size = 0: max returns 0 since no samples stored', () => {
      const m = new EventMetrics({ chain_depth_window_size: 0 });
      m.onEventProcessed(makeEvent({ context: { chain_depth: 99 } }), 1);
      expect(m.maxChainDepth()).toBe(0);
      expect(m.avgChainDepth()).toBe(0);
    });

    it('negative window_size: Array.from treats negative length as 0 — silently discards all pushes', () => {
      // Array.from({ length: -1 }, () => 0) returns [] (empty array, no throw)
      // The RollingWindow is created with capacity=-1 but buffer=[]
      // push() does: buffer[(0 + 0) % -1] = value  =>  buffer[NaN] = value (no-op)
      //               count < -1 is false, so else: head = (0+1) % -1 = NaN
      // average() and max() both guard count===0 and return 0
      const m = new EventMetrics({ latency_window_size: -1 });
      m.onEventProcessed(makeEvent(), 100);
      m.onEventProcessed(makeEvent({ id: 'e2' }), 200);
      // All pushes discarded — average stays 0
      expect(m.getStats().avg_latency_ms).toBe(0);
    });

    it('negative chain_depth_window_size: silently discards all chain depth samples', () => {
      // Same as latency: Array.from({length: -5}) = [] => all pushes discarded
      const m = new EventMetrics({ chain_depth_window_size: -5 });
      m.onEventProcessed(makeEvent({ context: { chain_depth: 99 } }), 1);
      expect(m.maxChainDepth()).toBe(0);
      expect(m.avgChainDepth()).toBe(0);
    });

    it('very large window_size: stores and averages correctly up to capacity', () => {
      const m = new EventMetrics({ latency_window_size: 1000 });
      // Push 500 samples (well within capacity)
      let sum = 0;
      for (let i = 1; i <= 500; i++) {
        m.onEventProcessed(makeEvent({ id: `e${i}` }), i);
        sum += i;
      }
      // Average of 1..500 = 250.5
      expect(m.getStats().avg_latency_ms).toBeCloseTo(sum / 500, 1);
    });

    it('very large window_size: push beyond capacity evicts oldest correctly', () => {
      const m = new EventMetrics({ latency_window_size: 1000 });
      // Fill to capacity
      for (let i = 1; i <= 1000; i++) {
        m.onEventProcessed(makeEvent({ id: `e${i}` }), 10);
      }
      // All values are 10, avg = 10
      expect(m.getStats().avg_latency_ms).toBe(10);
      // Push one more to evict oldest
      m.onEventProcessed(makeEvent({ id: 'e1001' }), 10);
      expect(m.getStats().avg_latency_ms).toBe(10);
    });
  });

  // ── CircularBuffer rolling window ──────────────────────────────────────────

  describe('RollingWindow behavior (via latency)', () => {
    it('rolls over oldest value when window is full', () => {
      // Window size of 3
      const m = new EventMetrics({ latency_window_size: 3 });
      m.onEventProcessed(makeEvent({ id: 'e1' }), 10);
      m.onEventProcessed(makeEvent({ id: 'e2' }), 20);
      m.onEventProcessed(makeEvent({ id: 'e3' }), 30);
      // Push a 4th value — oldest (10) should be evicted
      m.onEventProcessed(makeEvent({ id: 'e4' }), 40);
      // Window should now have [20, 30, 40], average = 30
      expect(m.getStats().avg_latency_ms).toBe(30);
    });

    it('correctly tracks max chain depth within rolling window', () => {
      const m = new EventMetrics({ chain_depth_window_size: 3 });
      m.onEventProcessed(makeEvent({ context: { chain_depth: 5 } }), 1);
      m.onEventProcessed(makeEvent({ id: 'e2', context: { chain_depth: 9 } }), 1);
      m.onEventProcessed(makeEvent({ id: 'e3', context: { chain_depth: 3 } }), 1);
      // Add 4th — evicts depth=5; window = [9,3,2]
      m.onEventProcessed(makeEvent({ id: 'e4', context: { chain_depth: 2 } }), 1);
      expect(m.maxChainDepth()).toBe(9);
    });

    it('handles single latency sample correctly', () => {
      metrics.onEventProcessed(makeEvent(), 42);
      expect(metrics.getStats().avg_latency_ms).toBe(42);
    });
  });
});
