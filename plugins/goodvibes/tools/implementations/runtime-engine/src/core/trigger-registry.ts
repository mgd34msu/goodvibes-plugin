/**
 * Trigger Registry — Layer 1
 *
 * Generic trigger matching engine. Knows nothing about WRFC, agents, or hooks.
 *
 * Responsibilities:
 *  - Register/unregister/enable/disable triggers
 *  - Match events against trigger event_match (type string, RegExp)
 *  - Filter by source
 *  - Deep partial payload matching
 *  - Evaluate conditions against state (all ops, dot-path traversal)
 *  - Circuit breakers: max_fires, cooldown_ms, chain_depth_limit
 *  - Priority ordering (higher = evaluated first)
 *  - Fire count reset
 */

import { createLogger } from '../shared/logger.js';
import { assertNever } from '../shared/utils.js';
import type { RuntimeEvent, Trigger, Condition, ConditionOp, StateStoreInterface, TriggerRegistryInterface } from './types.js';

const logger = createLogger('core:trigger-registry');

/** Runtime state tracked per trigger (not part of the trigger definition). */
interface TriggerState {
  fire_count: number;
  last_fired_at: number; // epoch ms, 0 if never fired
}

/**
 * Result of matching a single trigger against an event.
 */
export interface MatchResult {
  trigger: Trigger;
  matched: boolean;
  skip_reason?: 'disabled' | 'max_fires' | 'cooldown' | 'chain_depth' | 'source' | 'type' | 'payload' | 'conditions';
}

/**
 * Module-level LRU cache for compiled glob patterns.
 * Avoids re-compiling the same glob pattern on every match call.
 */
const globCache = new Map<string, RegExp>();
const GLOB_CACHE_MAX = 500;

/**
 * Get or create a compiled RegExp for a glob pattern.
 * Evicts the oldest entry when the cache is full (LRU via Map insertion order).
 */
function getGlobRegex(pattern: string): RegExp {
  let regex = globCache.get(pattern);
  if (!regex) {
    if (globCache.size >= GLOB_CACHE_MAX) {
      // Map preserves insertion order; keys().next() returns the oldest entry
      const first = globCache.keys().next().value;
      if (first !== undefined) globCache.delete(first);
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*\*/g, '.+').replace(/\*/g, '[^:]+') + '$';
    try {
      regex = new RegExp(regexStr);
    } catch {
      logger.warn('Failed to compile glob pattern; using never-matching fallback', { pattern, regexStr });
      regex = /(?!)/; // never-matching regex
    }
    globCache.set(pattern, regex);
  }
  return regex;
}

/**
 * Glob-like pattern matching.
 * Supports `*` as a wildcard that matches any sequence of non-colon characters,
 * and `**` as a wildcard that matches any sequence of characters.
 */
function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*' || pattern === '**') return true;
  return getGlobRegex(pattern).test(value);
}

/**
 * Deep partial equality: every key in `partial` must exist in `obj` with an equal value.
 * Nested objects are compared recursively. Arrays are compared by reference or value.
 */
function deepPartialMatch(obj: unknown, partial: Record<string, unknown>): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const target = obj as Record<string, unknown>;
  for (const [key, expected] of Object.entries(partial)) {
    const actual = target[key];
    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      if (!deepPartialMatch(actual, expected as Record<string, unknown>)) return false;
    } else if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length || !actual.every((v, i) => v === expected[i])) return false;
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}

/**
 * Traverse a dot-separated path into an object.
 * Returns undefined if any segment along the path is missing.
 */
function getPath(obj: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * Evaluate a single condition against a state snapshot.
 */
function evaluateCondition(condition: Condition, state: Record<string, unknown>): boolean {
  const actual = getPath(state, condition.field);
  const op: ConditionOp = condition.op;
  const expected = condition.value;

  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'eq':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      return actual === expected;
    case 'neq':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      return actual !== expected;
    case 'gt':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'gte':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lte':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      if (actual === undefined) {
        logger.debug('Condition LHS is undefined; treating as not met', { field: condition.field, op });
        return false;
      }
      if (!Array.isArray(expected)) return false;
      return expected.includes(actual);
    default:
      assertNever(op);
  }
}

/**
 * Generic trigger matching registry.
 */
export class TriggerRegistry implements TriggerRegistryInterface {
  private readonly triggers = new Map<string, Trigger>();
  private readonly states = new Map<string, TriggerState>();

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a trigger. Throws if the ID is already registered.
   */
  register(trigger: Trigger): void {
    if (this.triggers.has(trigger.id)) {
      throw new Error(`Trigger '${trigger.id}' is already registered`);
    }
    this.triggers.set(trigger.id, trigger);
    this.states.set(trigger.id, { fire_count: 0, last_fired_at: 0 });
    globCache.clear();
    logger.debug('Registered trigger', { id: trigger.id });
  }

  /**
   * Unregister a trigger by ID.
   * @returns true if the trigger existed and was removed.
   */
  unregister(id: string): boolean {
    const existed = this.triggers.delete(id);
    this.states.delete(id);
    globCache.clear();
    if (existed) logger.debug('Unregistered trigger', { id });
    return existed;
  }

  /**
   * Enable a trigger.
   */
  enable(id: string): void {
    const trigger = this.triggers.get(id);
    if (!trigger) throw new Error(`Trigger '${id}' not found`);
    this.triggers.set(id, { ...trigger, enabled: true });
  }

  /**
   * Disable a trigger without removing it.
   */
  disable(id: string): void {
    const trigger = this.triggers.get(id);
    if (!trigger) throw new Error(`Trigger '${id}' not found`);
    this.triggers.set(id, { ...trigger, enabled: false });
  }

  /**
   * Get a registered trigger by ID.
   */
  get(id: string): Trigger | undefined {
    return this.triggers.get(id);
  }

  /**
   * List all registered trigger IDs.
   */
  ids(): string[] {
    return Array.from(this.triggers.keys());
  }

  /**
   * Total number of registered triggers.
   */
  size(): number {
    return this.triggers.size;
  }

  // ─── Matching ───────────────────────────────────────────────────────────────

  /**
   * Match an event against all registered triggers.
   * Returns triggers that matched (in priority order, descending).
   * Does NOT fire them — that is the event processor's job.
   */
  match(event: RuntimeEvent, store: StateStoreInterface): Trigger[] {
    const stateSnapshot = store.snapshot();
    const matched: Trigger[] = [];

    // Sort triggers by priority descending for evaluation order
    const sorted = Array.from(this.triggers.values()).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    for (const trigger of sorted) {
      const result = this.matchOne(trigger, event, stateSnapshot);
      if (result.matched) {
        matched.push(trigger);
      } else {
        logger.debug('Trigger not matched', {
          trigger_id: trigger.id,
          reason: result.skip_reason,
          event_type: event.type,
        });
      }
    }

    return matched;
  }

  /**
   * Evaluate a single trigger against an event.
   * Returns a MatchResult with the outcome and skip reason (if any).
   */
  matchOne(trigger: Trigger, event: RuntimeEvent, stateSnapshot: Record<string, unknown>): MatchResult {
    // 1. Enabled check
    if (!trigger.enabled) {
      return { trigger, matched: false, skip_reason: 'disabled' };
    }

    // 2. Circuit breaker: max_fires
    const state = this.states.get(trigger.id);
    if (!state) {
      logger.warn('matchOne called for trigger with no state record', { trigger_id: trigger.id });
      return { trigger, matched: false, skip_reason: 'disabled' };
    }
    if (trigger.max_fires !== undefined && trigger.max_fires > 0 && state.fire_count >= trigger.max_fires) {
      return { trigger, matched: false, skip_reason: 'max_fires' };
    }

    // 3. Circuit breaker: cooldown
    if (trigger.cooldown_ms !== undefined && state.last_fired_at > 0) {
      const elapsed = Date.now() - state.last_fired_at;
      if (elapsed < trigger.cooldown_ms) {
        return { trigger, matched: false, skip_reason: 'cooldown' };
      }
    }

    // 4. Circuit breaker: chain depth limit
    if (trigger.chain_depth_limit !== undefined) {
      const depth = event.context?.chain_depth ?? 0;
      if (depth > trigger.chain_depth_limit) {
        return { trigger, matched: false, skip_reason: 'chain_depth' };
      }
    }

    // 5. Source filter
    if (trigger.event_match.source !== undefined) {
      const allowed = Array.isArray(trigger.event_match.source)
        ? trigger.event_match.source
        : [trigger.event_match.source];
      if (!allowed.includes(event.source)) {
        return { trigger, matched: false, skip_reason: 'source' };
      }
    }

    // 6. Type match (string exact, RegExp, or glob pattern)
    if (!this.typeMatches(trigger.event_match.type, event.type)) {
      return { trigger, matched: false, skip_reason: 'type' };
    }

    // 7. Payload match
    if (trigger.event_match.payload_match !== undefined) {
      if (!deepPartialMatch(event.payload, trigger.event_match.payload_match)) {
        return { trigger, matched: false, skip_reason: 'payload' };
      }
    }

    // 8. Conditions against state
    if (trigger.conditions && trigger.conditions.length > 0) {
      for (const condition of trigger.conditions) {
        if (!evaluateCondition(condition, stateSnapshot)) {
          return { trigger, matched: false, skip_reason: 'conditions' };
        }
      }
    }

    return { trigger, matched: true };
  }

  /**
   * Record that a trigger has fired. Updates fire_count and last_fired_at.
   */
  recordFire(trigger_id: string): void {
    const state = this.states.get(trigger_id);
    if (!state) {
      logger.warn('recordFire called for unknown trigger', { trigger_id });
      return;
    }
    state.fire_count++;
    state.last_fired_at = Date.now();
  }

  /**
   * Get the current fire count for a trigger.
   */
  getFireCount(trigger_id: string): number {
    return this.states.get(trigger_id)?.fire_count ?? 0;
  }

  /**
   * Reset fire counts for all triggers (called on session:started).
   */
  resetAllFireCounts(): void {
    for (const state of this.states.values()) {
      state.fire_count = 0;
      state.last_fired_at = 0;
    }
    logger.debug('Reset all trigger fire counts');
  }

  /**
   * Reset fire count for a single trigger.
   */
  resetFireCount(trigger_id: string): void {
    const state = this.states.get(trigger_id);
    if (!state) throw new Error(`Trigger '${trigger_id}' not found`);
    state.fire_count = 0;
    state.last_fired_at = 0;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private typeMatches(pattern: string | RegExp, eventType: string): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(eventType);
    }
    // Exact match
    if (pattern === eventType) return true;
    // Glob match
    return globMatch(pattern, eventType);
  }
}
