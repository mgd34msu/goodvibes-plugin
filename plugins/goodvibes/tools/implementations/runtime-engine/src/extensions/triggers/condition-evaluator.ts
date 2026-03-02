/**
 * Condition Evaluator
 *
 * Evaluates trigger conditions against incoming events. Maintains a true
 * circular ring buffer of recent events to support threshold (N events in
 * window) and sequence (ordered event chain within window) conditions.
 *
 * Uses the same O(1) ring-buffer pattern as EventBus.historyBuffer:
 * - Pre-allocated fixed-size array
 * - `recentEventsHead` is the next write position (monotonically increasing)
 * - `recentEventsCount` tracks how many slots are occupied
 * - Chronological order: start at `(head - count + capacity) % capacity`
 */

import type { RuntimeEvent, EventTypePattern } from '../../shared/events.js';
import type {
  TriggerCondition,
  EventCondition,
  CompositeCondition,
  ThresholdCondition,
  PatternCondition,
} from './types.js';

/** Entry in the recent-events ring buffer */
interface RecentEntry {
  event: RuntimeEvent;
  timestamp: number;
}

/**
 * Evaluates trigger conditions against runtime events.
 *
 * Maintains an in-memory ring buffer of recent events to support
 * stateful conditions (threshold, sequence). Older events are pruned
 * when the buffer reaches capacity.
 */
export class ConditionEvaluator {
  /** Pre-allocated ring buffer storage for recent events. */
  private recentEventsBuffer: (RecentEntry | undefined)[];
  /** Next write index into the circular buffer (monotonically increasing). */
  private recentEventsHead: number = 0;
  /** Number of events currently stored in the buffer. */
  private recentEventsCount: number = 0;
  /** Maximum number of recent events to retain. */
  private readonly maxRecentEvents: number;

  /**
   * @param maxRecentEvents - Maximum events to retain in the buffer (default: 1000).
   */
  constructor(maxRecentEvents = 1000) {
    this.maxRecentEvents = maxRecentEvents;
    this.recentEventsBuffer = new Array(maxRecentEvents);
  }

  /**
   * Records an event in the recent-events buffer.
   *
   * Must be called before `evaluate` so threshold and sequence conditions
   * have access to the full event history including the current event.
   *
   * @param event - The event to record.
   */
  recordEvent(event: RuntimeEvent): void {
    // Write at the current head position (O(1) — no shifting)
    this.recentEventsBuffer[this.recentEventsHead % this.maxRecentEvents] = {
      event,
      timestamp: Date.now(),
    };
    this.recentEventsHead++;
    // Prevent integer overflow on long-running processes
    if (this.recentEventsHead >= Number.MAX_SAFE_INTEGER - this.maxRecentEvents) {
      this.recentEventsHead = this.recentEventsHead % this.maxRecentEvents;
    }
    if (this.recentEventsCount < this.maxRecentEvents) {
      this.recentEventsCount++;
    }
  }

  /**
   * Evaluates a condition against the given event.
   *
   * @param condition - The condition to evaluate.
   * @param event - The triggering event.
   * @returns `true` if the condition is satisfied.
   */
  evaluate(condition: TriggerCondition, event: RuntimeEvent): boolean {
    switch (condition.type) {
      case 'event':
        return this.evaluateEvent(condition, event);
      case 'and':
        return condition.conditions.every((c) => this.evaluate(c, event));
      case 'or':
        return condition.conditions.some((c) => this.evaluate(c, event));
      case 'not': {
        const first = condition.conditions[0];
        return first !== undefined ? !this.evaluate(first, event) : false;
      }
      case 'threshold':
        return this.evaluateThreshold(condition, event);
      case 'sequence':
        return this.evaluateSequence(condition, event);
      default:
        return false;
    }
  }

  /**
   * Tests whether `eventType` matches `pattern`.
   *
   * - `'*'` matches any event type
   * - `'namespace:*'` matches any event whose type starts with `namespace:`
   * - An exact string matches only that specific type
   */
  private matchEventType(eventType: string, pattern: EventTypePattern): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith(':*')) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return eventType === pattern;
  }

  /**
   * Evaluates a simple event condition: type match + optional payload filter.
   */
  private evaluateEvent(cond: EventCondition, event: RuntimeEvent): boolean {
    if (!this.matchEventType(event.type, cond.event_type)) return false;

    if (cond.filter) {
      // Access payload data safely — EventPayload has a `data` field
      const data = (event.payload as { data?: Record<string, unknown> }).data ?? {};
      for (const [key, expected] of Object.entries(cond.filter)) {
        if (data[key] !== expected) return false;
      }
    }

    return true;
  }

  /**
   * Returns the contents of the ring buffer in chronological order (oldest first).
   */
  private getRecentEventsInOrder(): RecentEntry[] {
    if (this.recentEventsCount === 0) return [];
    const capacity = this.maxRecentEvents;
    const startIndex =
      this.recentEventsCount < capacity
        ? 0
        : this.recentEventsHead % capacity;
    const result: RecentEntry[] = [];
    for (let i = 0; i < this.recentEventsCount; i++) {
      const entry = this.recentEventsBuffer[(startIndex + i) % capacity];
      if (entry !== undefined) result.push(entry);
    }
    return result;
  }

  /**
   * Evaluates a threshold condition: at least `count` matching events
   * within the last `window_ms` milliseconds (including the current event).
   */
  private evaluateThreshold(cond: ThresholdCondition, event: RuntimeEvent): boolean {
    // Current event must match the event_type
    if (!this.matchEventType(event.type, cond.event_type)) return false;

    const now = Date.now();
    const windowStart = now - cond.window_ms;

    let matchCount = 0;
    for (const entry of this.getRecentEventsInOrder()) {
      if (entry.timestamp < windowStart) continue;
      if (!this.matchEventType(entry.event.type, cond.event_type)) continue;
      matchCount++;
      if (matchCount >= cond.count) return true;
    }

    return false;
  }

  /**
   * Evaluates a sequence condition: all events in `cond.events` must have
   * occurred in order within the last `window_ms` milliseconds, with the
   * current event matching the final pattern in the sequence.
   */
  private evaluateSequence(cond: PatternCondition, event: RuntimeEvent): boolean {
    if (cond.events.length === 0) return false;

    // Current event must match the last pattern in the sequence
    const lastPattern = cond.events[cond.events.length - 1]!;
    if (!this.matchEventType(event.type, lastPattern)) return false;

    // If only one event in the sequence, the type match is sufficient
    if (cond.events.length === 1) return true;

    const now = Date.now();
    const windowStart = now - cond.window_ms;

    // Build a list of recent events within the window. Note: recordEvent is
    // called before evaluate, so the current event IS included in this buffer.
    const windowEvents = this.getRecentEventsInOrder().filter(
      (e) => e.timestamp >= windowStart,
    );

    // Walk through the sequence patterns (all but the last) and find matching
    // events in chronological order
    let patternIndex = 0;
    const patternsToMatch = cond.events.slice(0, -1);

    for (const entry of windowEvents) {
      if (patternIndex >= patternsToMatch.length) break;
      const pattern = patternsToMatch[patternIndex]!;
      if (this.matchEventType(entry.event.type, pattern)) {
        patternIndex++;
      }
    }

    // All prefix patterns must have been found in order
    return patternIndex >= patternsToMatch.length;
  }

  /**
   * Removes events older than `maxAgeMs` from the buffer.
   *
   * Called periodically to prevent unbounded growth when the trigger
   * registry evaluates infrequently-fired triggers.
   *
   * @param maxAgeMs - Maximum age in milliseconds. Events older than this are removed.
   */
  pruneOldEvents(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    const capacity = this.maxRecentEvents;

    // Walk from the oldest slot forward, advancing head past expired entries.
    // The oldest slot is at (head - count) % capacity (using positive modulo).
    let pruned = 0;
    while (pruned < this.recentEventsCount) {
      const oldestSlot =
        ((this.recentEventsHead - this.recentEventsCount + pruned) % capacity + capacity) % capacity;
      const entry = this.recentEventsBuffer[oldestSlot];
      if (entry === undefined || entry.timestamp < cutoff) {
        this.recentEventsBuffer[oldestSlot] = undefined;
        pruned++;
      } else {
        // Remaining entries are newer — stop
        break;
      }
    }
    this.recentEventsCount -= pruned;
    // If all events were pruned, reset head to keep modulo arithmetic clean
    if (this.recentEventsCount === 0) {
      this.recentEventsHead = 0;
    }
  }
}
