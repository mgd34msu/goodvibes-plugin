/**
 * Directive Queue
 *
 * A FIFO queue keyed by hook type (target string). Directives are enqueued
 * by trigger handlers and drained by the IPC query handler when a hook
 * queries for directives.
 */

import type { Directive } from '../ipc/protocol.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('directive-queue');

/**
 * Maximum number of directives retained per target before the oldest is evicted.
 *
 * This is a compile-time constant rather than a configurable value by design:
 * making it runtime-configurable would require surfacing it through the public
 * API or config schema, adding complexity for a limit that protects against
 * runaway memory growth. If the default proves too low or too high for a
 * specific deployment, it should be adjusted here with a code review rather
 * than through user configuration.
 */
const MAX_QUEUE_DEPTH = 100;

/**
 * FIFO queue of Directives, partitioned by target hook name.
 *
 * Usage:
 * - Enqueue via `enqueue(target, directive)`
 * - Drain (destructive read) via `drain(target)`
 * - Peek (non-destructive) via `peek(target)`
 */
export class DirectiveQueue {
  /** Per-target FIFO queues. */
  private readonly queues: Map<string, Directive[]> = new Map();

  /**
   * Add a directive to the end of the queue for `target`.
   *
   * @param target - Hook target name (e.g. `'subagent_stop'`).
   * @param directive - The directive to enqueue.
   */
  enqueue(target: string, directive: Directive): void {
    const queue = this.queues.get(target);
    if (queue) {
      if (queue.length >= MAX_QUEUE_DEPTH) {
        queue.shift();
        logger.warn('DirectiveQueue at capacity: oldest directive evicted', { target, max: MAX_QUEUE_DEPTH });
      }
      queue.push(directive);
    } else {
      this.queues.set(target, [directive]);
    }
  }

  /**
   * Return and remove all directives for `target`.
   *
   * @param target - Hook target name.
   * @returns Array of directives in FIFO order (may be empty).
   */
  drain(target: string): Directive[] {
    const queue = this.queues.get(target);
    if (!queue || queue.length === 0) return [];
    const items = [...queue];
    this.queues.delete(target);
    return items;
  }

  /**
   * Return all directives for `target` without removing them.
   *
   * @param target - Hook target name.
   * @returns Snapshot of the queue (may be empty).
   */
  peek(target: string): Directive[] {
    return [...(this.queues.get(target) ?? [])];
  }

  /** Clear all directive queues. WRFC config is preserved. */
  clear(): void {
    this.queues.clear();
  }

  /**
   * Stored WRFC config from the `config:loaded` hook event.
   *
   * @v1-design-note Storing WRFC-specific configuration (min review score,
   * max fix attempts, etc.) inside `DirectiveQueue` violates the Single
   * Responsibility Principle — a queue should only manage queueing. This was
   * a pragmatic choice in v1 to avoid a separate config-store module. In v2
   * this should be extracted to a dedicated `WRFCConfig` service or singleton
   * so that `DirectiveQueue` only owns directive lifecycle.
   */
  private wrfcConfig: Record<string, unknown> = {};

  /**
   * Store the WRFC config delivered by the config:loaded hook event.
   *
   * @param config - The `wrfc` section of the merged goodvibes.json.
   */
  // TODO(v2): Extract WRFC config into dedicated WRFCConfigStore — this violates SRP.
  setWRFCConfig(config: Record<string, unknown>): void {
    this.wrfcConfig = config;
    logger.debug('WRFC config stored', { keys: Object.keys(config) });
  }

  /**
   * Return the stored WRFC config (empty object if never set).
   */
  getWRFCConfig(): Record<string, unknown> {
    return this.wrfcConfig;
  }

  /**
   * Return the number of pending directives, optionally scoped to a target.
   *
   * @param target - Optional hook target name. If omitted, counts across all targets.
   * @returns Total pending directive count.
   */
  size(target?: string): number {
    if (target !== undefined) {
      return this.queues.get(target)?.length ?? 0;
    }
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }
}
