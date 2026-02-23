/**
 * Condition Evaluator
 *
 * Evaluates trigger conditions against incoming events. Maintains a ring buffer
 * of recent events to support threshold (N events in window) and sequence
 * (ordered event chain within window) conditions.
 */

import type { RuntimeEvent, EventTypePattern } from '../events/types.js';
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
  /** Ring buffer of recent events for threshold/sequence evaluation. */
  private recentEvents: RecentEntry[] = [];
  /** Maximum number of recent events to retain. */
  private readonly maxRecentEvents: number;

  /**
   * @param maxRecentEvents - Maximum events to retain in the buffer (default: 1000).
   */
  constructor(maxRecentEvents = 1000) {
    this.maxRecentEvents = maxRecentEvents;
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
    this.recentEvents.push({ event, timestamp: Date.now() });
    // Evict oldest entries when buffer is full
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
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
   * Evaluates a threshold condition: at least `count` matching events
   * within the last `window_ms` milliseconds (including the current event).
   */
  private evaluateThreshold(cond: ThresholdCondition, event: RuntimeEvent): boolean {
    // Current event must match the event_type
    if (!this.matchEventType(event.type, cond.event_type)) return false;

    const now = Date.now();
    const windowStart = now - cond.window_ms;

    let matchCount = 0;
    for (const entry of this.recentEvents) {
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
    const windowEvents = this.recentEvents.filter(
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
    const firstKeep = this.recentEvents.findIndex((e) => e.timestamp >= cutoff);
    if (firstKeep > 0) {
      this.recentEvents.splice(0, firstKeep);
    } else if (firstKeep === -1) {
      // All events are older than cutoff
      this.recentEvents = [];
    }
  }
}
