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

/** Maximum number of directives retained per target before oldest are evicted. */
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

  /**
   * Clear all queues.
   */
  clear(): void {
    this.queues.clear();
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
