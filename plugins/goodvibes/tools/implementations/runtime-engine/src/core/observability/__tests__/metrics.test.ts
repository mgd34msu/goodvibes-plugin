/**
 * Tests for RollingWindow and EventMetrics — core/observability/metrics.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RollingWindow, EventMetrics } from '../metrics.js';
import type { RuntimeEvent } from '../../types.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/** Build a minimal RuntimeEvent for testing */
function makeEvent(overrides: Partial<Omit<RuntimeEvent, 'type'>> & { type?: string; chain_depth?: number } = {}): RuntimeEvent {
  const { chain_depth, ...rest } = overrides;
  return {
    id: 'evt-001',
    type: 'test:event',
    source: 'test',
    timestamp: Date.now(),
    context: chain_depth !== undefined ? { chain_depth } as RuntimeEvent['context'] : undefined,
    ...rest,
  } as RuntimeEvent;
}

// ─────────────────────────────────────────────────────────────────────────────
// RollingWindow
// ─────────────────────────────────────────────────────────────────────────────

describe('RollingWindow', () => {
  describe('initial state', () => {
    it('size() returns 0 before any pushes', () => {
      const w = new RollingWindow(5);
      expect(w.size()).toBe(0);
    });

    it('average() returns 0 on empty window', () => {
      expect(new RollingWindow(5).average()).toBe(0);
    });

    it('max() returns 0 on empty window', () => {
      expect(new RollingWindow(5).max()).toBe(0);
    });
  });

  describe('push and size', () => {
    it('tracks size correctly as values are pushed', () => {
      const w = new RollingWindow(4);
      w.push(1);
      expect(w.size()).toBe(1);
      w.push(2);
      expect(w.size()).toBe(2);
      w.push(3);
      expect(w.size()).toBe(3);
      w.push(4);
      expect(w.size()).toBe(4);
    });

    it('size does not exceed capacity', () => {
      const w = new RollingWindow(3);
      w.push(1);
      w.push(2);
      w.push(3);
      w.push(4); // overflow — oldest evicted
      expect(w.size()).toBe(3);
    });
  });

  describe('average()', () => {
    it('computes average of all pushed values', () => {
      const w = new RollingWindow(10);
      w.push(10);
      w.push(20);
      w.push(30);
      expect(w.average()).toBe(20);
    });

    it('evicts oldest entry and maintains rolling average', () => {
      const w = new RollingWindow(3);
      w.push(1);
      w.push(2);
      w.push(3); // window: [1, 2, 3], avg = 2
      w.push(10); // window: [2, 3, 10], avg = 5
      expect(w.average()).toBeCloseTo(5, 5);
    });

    it('single value average equals the value', () => {
      const w = new RollingWindow(5);
      w.push(42);
      expect(w.average()).toBe(42);
    });
  });

  describe('max()', () => {
    it('returns maximum of pushed values', () => {
      const w = new RollingWindow(10);
      w.push(5);
      w.push(15);
      w.push(3);
      expect(w.max()).toBe(15);
    });

    it('max reflects eviction of oldest entry', () => {
      const w = new RollingWindow(2);
      w.push(100); // window: [100]
      w.push(50);  // window: [100, 50]
      w.push(10);  // window: [50, 10] — 100 evicted
      expect(w.max()).toBe(50);
    });

    it('handles negative values', () => {
      const w = new RollingWindow(5);
      w.push(-10);
      w.push(-5);
      w.push(-20);
      expect(w.max()).toBe(-5);
    });
  });

  describe('reset()', () => {
    it('resets size to 0', () => {
      const w = new RollingWindow(5);
      w.push(1);
      w.push(2);
      w.reset();
      expect(w.size()).toBe(0);
    });

    it('average() returns 0 after reset', () => {
      const w = new RollingWindow(5);
      w.push(100);
      w.reset();
      expect(w.average()).toBe(0);
    });

    it('max() returns 0 after reset', () => {
      const w = new RollingWindow(5);
      w.push(100);
      w.reset();
      expect(w.max()).toBe(0);
    });

    it('can be used again after reset', () => {
      const w = new RollingWindow(3);
      w.push(5);
      w.push(10);
      w.reset();
      w.push(7);
      expect(w.size()).toBe(1);
      expect(w.average()).toBe(7);
    });
  });

  describe('circular buffer wrap-around', () => {
    it('capacity=1 always holds only latest value', () => {
      const w = new RollingWindow(1);
      w.push(10);
      w.push(20);
      w.push(30);
      expect(w.average()).toBe(30);
      expect(w.max()).toBe(30);
    });

    it('fills and wraps correctly for capacity=5', () => {
      const w = new RollingWindow(5);
      for (let i = 1; i <= 10; i++) {
        w.push(i); // pushes 1..10, evicting 1..5
      }
      // window should be [6, 7, 8, 9, 10]
      expect(w.size()).toBe(5);
      expect(w.average()).toBe(8);
      expect(w.max()).toBe(10);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EventMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('EventMetrics', () => {
  let metrics: EventMetrics;

  beforeEach(() => {
    metrics = new EventMetrics();
  });

  describe('construction', () => {
    it('creates with default options', () => {
      expect(metrics).toBeInstanceOf(EventMetrics);
    });

    it('creates with custom window sizes', () => {
      const m = new EventMetrics({ latency_window_size: 10, chain_depth_window_size: 5 });
      expect(m).toBeInstanceOf(EventMetrics);
    });

    it('getStats returns zero values initially', () => {
      const stats = metrics.getStats();
      expect(stats).toMatchObject({
        events_processed: 0,
        events_failed: 0,
        events_dead_lettered: 0,
        avg_latency_ms: 0,
        queue_depth: 0,
        active_chains: 0,
        active_workflows: 0,
        triggers_fired: 0,
      });
    });
  });

  describe('onEventProcessed()', () => {
    it('increments events_processed counter', () => {
      metrics.onEventProcessed(makeEvent(), 100);
      expect(metrics.getStats().events_processed).toBe(1);

      metrics.onEventProcessed(makeEvent(), 200);
      expect(metrics.getStats().events_processed).toBe(2);
    });

    it('records latency in rolling window', () => {
      metrics.onEventProcessed(makeEvent(), 100);
      metrics.onEventProcessed(makeEvent(), 200);
      expect(metrics.getStats().avg_latency_ms).toBe(150);
    });

    it('tracks per-type event counts', () => {
      metrics.onEventProcessed(makeEvent({ type: 'hook:pre' }), 10);
      metrics.onEventProcessed(makeEvent({ type: 'hook:pre' }), 10);
      metrics.onEventProcessed(makeEvent({ type: 'hook:post' }), 10);
      expect(metrics.getEventTypeCount('hook:pre' as never)).toBe(2);
      expect(metrics.getEventTypeCount('hook:post' as never)).toBe(1);
    });

    it('tracks chain depth with chain_depth from event context', () => {
      metrics.onEventProcessed(makeEvent({ chain_depth: 3 }), 10);
      metrics.onEventProcessed(makeEvent({ chain_depth: 7 }), 10);
      expect(metrics.maxChainDepth()).toBe(7);
      expect(metrics.avgChainDepth()).toBe(5);
    });

    it('uses 0 for chain_depth when context is undefined', () => {
      metrics.onEventProcessed(makeEvent(), 50);
      expect(metrics.maxChainDepth()).toBe(0);
    });
  });

  describe('onHandlerError()', () => {
    it('increments events_failed', () => {
      metrics.onHandlerError('trigger-1', new Error('boom'), makeEvent());
      expect(metrics.getStats().events_failed).toBe(1);
    });

    it('increments trigger-specific error count', () => {
      metrics.onHandlerError('trigger-a', new Error('e1'), makeEvent());
      metrics.onHandlerError('trigger-a', new Error('e2'), makeEvent());
      metrics.onHandlerError('trigger-b', new Error('e3'), makeEvent());
      expect(metrics.getTriggerErrorCount('trigger-a')).toBe(2);
      expect(metrics.getTriggerErrorCount('trigger-b')).toBe(1);
    });

    it('getTriggerErrorCount returns 0 for unknown trigger', () => {
      expect(metrics.getTriggerErrorCount('unknown')).toBe(0);
    });
  });

  describe('onQueueDepthChange()', () => {
    it('updates queue_depth in stats', () => {
      metrics.onQueueDepthChange(42);
      expect(metrics.getStats().queue_depth).toBe(42);
    });

    it('reflects latest value on multiple calls', () => {
      metrics.onQueueDepthChange(10);
      metrics.onQueueDepthChange(5);
      expect(metrics.getStats().queue_depth).toBe(5);
    });
  });

  describe('onTriggerFired()', () => {
    it('increments triggers_fired', () => {
      metrics.onTriggerFired('t1', makeEvent());
      expect(metrics.getStats().triggers_fired).toBe(1);
    });

    it('increments per-trigger fire count', () => {
      metrics.onTriggerFired('t1', makeEvent());
      metrics.onTriggerFired('t1', makeEvent());
      metrics.onTriggerFired('t2', makeEvent());
      expect(metrics.getTriggerFireCount('t1')).toBe(2);
      expect(metrics.getTriggerFireCount('t2')).toBe(1);
    });

    it('getTriggerFireCount returns 0 for unknown trigger', () => {
      expect(metrics.getTriggerFireCount('unknown')).toBe(0);
    });
  });

  describe('onEventDeadLettered()', () => {
    it('increments events_dead_lettered', () => {
      metrics.onEventDeadLettered(makeEvent(), 'max retries exceeded');
      expect(metrics.getStats().events_dead_lettered).toBe(1);

      metrics.onEventDeadLettered(makeEvent(), 'handler error');
      expect(metrics.getStats().events_dead_lettered).toBe(2);
    });
  });

  describe('setActiveChains() / setActiveWorkflows()', () => {
    it('sets active_chains in stats', () => {
      metrics.setActiveChains(5);
      expect(metrics.getStats().active_chains).toBe(5);
    });

    it('sets active_workflows in stats', () => {
      metrics.setActiveWorkflows(3);
      expect(metrics.getStats().active_workflows).toBe(3);
    });

    it('reflects latest values', () => {
      metrics.setActiveChains(10);
      metrics.setActiveChains(2);
      expect(metrics.getStats().active_chains).toBe(2);
    });
  });

  describe('getEventTypeCount()', () => {
    it('returns 0 for never-seen type', () => {
      expect(metrics.getEventTypeCount('never:seen')).toBe(0);
    });

    it('returns accumulated count for seen type', () => {
      metrics.onEventProcessed(makeEvent({ type: 'agent:spawned' }), 5);
      metrics.onEventProcessed(makeEvent({ type: 'agent:spawned' }), 5);
      expect(metrics.getEventTypeCount('agent:spawned')).toBe(2);
    });
  });

  describe('maxChainDepth() / avgChainDepth()', () => {
    it('both return 0 with no events processed', () => {
      expect(metrics.maxChainDepth()).toBe(0);
      expect(metrics.avgChainDepth()).toBe(0);
    });

    it('computes max and average from chain depths', () => {
      metrics.onEventProcessed(makeEvent({ chain_depth: 2 }), 10);
      metrics.onEventProcessed(makeEvent({ chain_depth: 4 }), 10);
      metrics.onEventProcessed(makeEvent({ chain_depth: 6 }), 10);
      expect(metrics.maxChainDepth()).toBe(6);
      expect(metrics.avgChainDepth()).toBeCloseTo(4, 5);
    });
  });

  describe('avg_latency_ms rounding', () => {
    it('rounds avg_latency_ms to 2 decimal places', () => {
      // 1/3 ms average → should round to 0.33
      metrics.onEventProcessed(makeEvent(), 0);
      metrics.onEventProcessed(makeEvent(), 0);
      metrics.onEventProcessed(makeEvent(), 1);
      const stats = metrics.getStats();
      // average is 1/3 ≈ 0.333..., rounded to 2 decimals = 0.33
      expect(stats.avg_latency_ms).toBe(0.33);
    });
  });

  describe('reset()', () => {
    it('resets all counters to 0', () => {
      metrics.onEventProcessed(makeEvent(), 100);
      metrics.onHandlerError('t1', new Error('e'), makeEvent());
      metrics.onEventDeadLettered(makeEvent(), 'reason');
      metrics.onTriggerFired('t2', makeEvent());
      metrics.onQueueDepthChange(10);
      metrics.setActiveChains(3);
      metrics.setActiveWorkflows(2);

      metrics.reset();

      const stats = metrics.getStats();
      expect(stats.events_processed).toBe(0);
      expect(stats.events_failed).toBe(0);
      expect(stats.events_dead_lettered).toBe(0);
      expect(stats.triggers_fired).toBe(0);
      expect(stats.queue_depth).toBe(0);
      expect(stats.active_chains).toBe(0);
      expect(stats.active_workflows).toBe(0);
      expect(stats.avg_latency_ms).toBe(0);
    });

    it('clears per-trigger fire counts after reset', () => {
      metrics.onTriggerFired('t1', makeEvent());
      metrics.reset();
      expect(metrics.getTriggerFireCount('t1')).toBe(0);
    });

    it('clears per-trigger error counts after reset', () => {
      metrics.onHandlerError('t1', new Error('e'), makeEvent());
      metrics.reset();
      expect(metrics.getTriggerErrorCount('t1')).toBe(0);
    });

    it('clears per-type event counts after reset', () => {
      metrics.onEventProcessed(makeEvent({ type: 'custom:type' }), 10);
      metrics.reset();
      expect(metrics.getEventTypeCount('custom:type' as never)).toBe(0);
    });

    it('can accumulate again after reset', () => {
      metrics.onEventProcessed(makeEvent(), 50);
      metrics.reset();
      metrics.onEventProcessed(makeEvent(), 200);
      expect(metrics.getStats().events_processed).toBe(1);
      expect(metrics.getStats().avg_latency_ms).toBe(200);
    });
  });
});
