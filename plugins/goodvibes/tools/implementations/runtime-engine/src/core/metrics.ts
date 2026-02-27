/**
 * Metrics Collector — Layer 1
 *
 * Collects observability data for the event processing loop.
 *
 * Features:
 *  - Rolling window latency averages (configurable window size)
 *  - Event counters (processed, failed, dead-lettered)
 *  - Trigger fire counts
 *  - Chain depth tracking (max and rolling average)
 *  - Queue depth tracking
 *  - Stats snapshot generation
 *  - Reset capability
 */

import { createLogger } from '../shared/logger.js';
import type { MetricsCollector, MetricsSnapshot, RuntimeEvent } from './types.js';

const logger = createLogger('core:metrics');

export interface MetricsOptions {
  /** Maximum samples kept in the latency rolling window. Default: 100. */
  latency_window_size?: number;
  /** Maximum chain depth samples kept for rolling average. Default: 100. */
  chain_depth_window_size?: number;
}

/**
 * Rolling window of numeric samples backed by a circular buffer.
 * Maintains the last N values for computing averages without O(n) shifts.
 *
 * Complexity:
 *  - push:    O(1)
 *  - average: O(count) where count is filled slots (not capacity)
 *  - max:     O(count) where count is filled slots (not capacity)
 *
 * When the buffer is partially filled, only `count` valid slots are iterated.
 * This avoids divide-by-zero and ensures accurate results before the window
 * reaches full capacity.
 */
export class RollingWindow {
  /** Fixed-size circular buffer. */
  private readonly buffer: number[];
  /** Index of the oldest element (write head). */
  private head = 0;
  /**
   * Number of valid samples currently in the buffer (0 <= count <= capacity).
   * Tracks filled slots so average() and max() iterate only valid entries,
   * avoiding divide-by-zero and inaccurate results when the window is partial.
   */
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = Array.from({ length: capacity }, () => 0);
  }

  push(value: number): void {
    this.buffer[(this.head + this.count) % this.capacity] = value;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer is full — advance head to overwrite the oldest slot
      this.head = (this.head + 1) % this.capacity;
    }
  }

  average(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    // Safe: index is always within [0, count) and count <= capacity
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[(this.head + i) % this.capacity]!;
    }
    return sum / this.count;
  }

  max(): number {
    if (this.count === 0) return 0;
    let best = -Infinity;
    // Safe: index is always within [0, count) and count <= capacity
    for (let i = 0; i < this.count; i++) {
      const v = this.buffer[(this.head + i) % this.capacity]!;
      if (v > best) best = v;
    }
    return best;
  }

  size(): number {
    return this.count;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
  }
}

/**
 * Metrics collector implementation.
 * Implements {@link MetricsCollector}.
 */
export class EventMetrics implements MetricsCollector {
  private eventsProcessed = 0;
  private eventsFailed = 0;
  private eventsDeadLettered = 0;
  private triggersFired = 0;
  private currentQueueDepth = 0;
  private currentActiveChains = 0;
  private currentActiveWorkflows = 0;

  private readonly latency: RollingWindow;
  private readonly chainDepth: RollingWindow;
  /** Per-trigger fire counts. */
  private readonly triggerFireCounts = new Map<string, number>();
  /** Per-trigger error counts. */
  private readonly triggerErrorCounts = new Map<string, number>();
  /** Per-type event counts. */
  private readonly eventTypeCounts = new Map<string, number>();

  constructor(options: MetricsOptions = {}) {
    this.latency = new RollingWindow(options.latency_window_size ?? 100);
    this.chainDepth = new RollingWindow(options.chain_depth_window_size ?? 100);
  }

  /**
   * Record a successfully processed event.
   */
  onEventProcessed(event: RuntimeEvent, duration_ms: number): void {
    this.eventsProcessed++;
    this.latency.push(duration_ms);

    // Track chain depth
    const depth = event.context?.chain_depth ?? 0;
    this.chainDepth.push(depth);

    // Track per-type counts
    const current = this.eventTypeCounts.get(event.type) ?? 0;
    this.eventTypeCounts.set(event.type, current + 1);

    logger.debug('Event processed', { type: event.type, duration_ms, chain_depth: depth });
  }

  /**
   * Record a handler execution error.
   */
  onHandlerError(trigger_id: string, error: Error, event: RuntimeEvent): void {
    this.eventsFailed++;
    const current = this.triggerErrorCounts.get(trigger_id) ?? 0;
    this.triggerErrorCounts.set(trigger_id, current + 1);
    logger.warn('Handler error recorded', {
      trigger_id,
      event_type: event.type,
      error: error.message,
    });
  }

  /**
   * Record a queue depth change.
   */
  onQueueDepthChange(depth: number): void {
    this.currentQueueDepth = depth;
  }

  /**
   * Record a trigger fire.
   */
  onTriggerFired(trigger_id: string, event: RuntimeEvent): void {
    this.triggersFired++;
    const current = this.triggerFireCounts.get(trigger_id) ?? 0;
    this.triggerFireCounts.set(trigger_id, current + 1);
    logger.debug('Trigger fired', { trigger_id, event_type: event.type });
  }

  /**
   * Record an event moved to the dead-letter queue.
   */
  onEventDeadLettered(event: RuntimeEvent, reason: string): void {
    this.eventsDeadLettered++;
    logger.warn('Event dead-lettered', { event_id: event.id, type: event.type, reason });
  }

  /**
   * Generate a current stats snapshot.
   */
  getStats(): MetricsSnapshot {
    return {
      events_processed: this.eventsProcessed,
      events_failed: this.eventsFailed,
      events_dead_lettered: this.eventsDeadLettered,
      avg_latency_ms: Math.round(this.latency.average() * 100) / 100,
      queue_depth: this.currentQueueDepth,
      active_chains: this.currentActiveChains,
      active_workflows: this.currentActiveWorkflows,
      triggers_fired: this.triggersFired,
    };
  }

  /**
   * Update the count of active event chains.
   */
  setActiveChains(count: number): void {
    this.currentActiveChains = count;
  }

  /**
   * Update the count of active workflows.
   */
  setActiveWorkflows(count: number): void {
    this.currentActiveWorkflows = count;
  }

  /**
   * Get the fire count for a specific trigger.
   */
  getTriggerFireCount(trigger_id: string): number {
    return this.triggerFireCounts.get(trigger_id) ?? 0;
  }

  /**
   * Get the error count for a specific trigger.
   */
  getTriggerErrorCount(trigger_id: string): number {
    return this.triggerErrorCounts.get(trigger_id) ?? 0;
  }

  /**
   * Get the processed count for a specific event type.
   */
  getEventTypeCount(type: string): number {
    return this.eventTypeCounts.get(type) ?? 0;
  }

  /**
   * Maximum observed chain depth.
   */
  maxChainDepth(): number {
    return this.chainDepth.max();
  }

  /**
   * Average observed chain depth.
   */
  avgChainDepth(): number {
    return this.chainDepth.average();
  }

  /**
   * Reset all counters and rolling windows.
   */
  reset(): void {
    this.eventsProcessed = 0;
    this.eventsFailed = 0;
    this.eventsDeadLettered = 0;
    this.triggersFired = 0;
    this.currentQueueDepth = 0;
    this.currentActiveChains = 0;
    this.currentActiveWorkflows = 0;
    this.latency.reset();
    this.chainDepth.reset();
    this.triggerFireCounts.clear();
    this.triggerErrorCounts.clear();
    this.eventTypeCounts.clear();
    logger.debug('Metrics reset');
  }
}
