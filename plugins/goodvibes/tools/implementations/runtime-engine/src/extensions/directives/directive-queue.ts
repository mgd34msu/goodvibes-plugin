/**
 * Directive Queue
 *
 * A FIFO queue keyed by hook type (target string). Directives are enqueued
 * by trigger handlers and drained by the IPC query handler when a hook
 * queries for directives.
 */

import { randomUUID } from 'node:crypto';
import type { Directive } from '../../shared/ipc/protocol.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('directive-queue');

interface HeldBatch {
  id: string;
  directives: Directive[];
  target: string;
  heldAt: number;
  workflowId?: string;
}

/** Time in ms before held directives are automatically re-enqueued. */
export const HOLD_TTL_MS = 3_000;

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

  /** Held batches awaiting write confirmation. */
  private readonly held: Map<string, HeldBatch> = new Map();

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
   * Return and remove directives for `target`.
   *
   * @param target - Hook target name.
   * @param workflowId - Optional workflow ID. When provided, only directives
   *   matching this workflow_id are returned and removed; the rest remain in
   *   the queue. When omitted, ALL directives for the target are returned and
   *   the queue is cleared (backward-compatible behaviour).
   * @param sessionId - Optional session ID. When provided, only directives
   *   matching this session_id (or directives with no session_id) are returned
   *   and removed; directives scoped to a different session remain in the queue.
   *   When omitted, ALL directives are eligible regardless of session_id.
   * @returns Array of directives in FIFO order (may be empty).
   */
  drain(target: string, workflowId?: string, sessionId?: string): Directive[] {
    const queue = this.queues.get(target);
    if (!queue || queue.length === 0) return [];

    // Build a filter predicate combining workflow_id and session_id criteria.
    // A directive matches when:
    //   - workflowId is absent OR the directive's workflow_id equals workflowId
    //   - sessionId is absent OR the directive has no session_id OR its session_id equals sessionId
    const matches = (d: Directive): boolean => {
      if (workflowId !== undefined && d.workflow_id !== workflowId) return false;
      if (sessionId !== undefined && d.session_id !== undefined && d.session_id !== sessionId) return false;
      return true;
    };

    if (workflowId === undefined && sessionId === undefined) {
      // Backward-compatible: return all and clear
      const items = [...queue];
      this.queues.delete(target);
      return items;
    }

    // Filtered drain: partition into matching and remaining
    const matching: Directive[] = [];
    const remaining: Directive[] = [];
    for (const d of queue) {
      if (matches(d)) {
        matching.push(d);
      } else {
        remaining.push(d);
      }
    }
    if (remaining.length === 0) {
      this.queues.delete(target);
    } else {
      this.queues.set(target, remaining);
    }
    return matching;
  }

  /**
   * Drain directives into a held state instead of permanently removing them.
   * Held directives can be released (confirmed delivered) or re-enqueued (delivery failed).
   *
   * @param target - Hook target name.
   * @param workflowId - Optional workflow ID filter (same semantics as drain).
   * @param sessionId - Optional session ID filter (same semantics as drain).
   */
  holdDrain(target: string, workflowId?: string, sessionId?: string): { holdId: string; directives: Directive[] } {
    const directives = this.drain(target, workflowId, sessionId);
    if (directives.length === 0) {
      // Returns empty holdId when nothing was drained — callers check with `if (holdId)`.
      return { holdId: '', directives: [] };
    }
    const holdId = `hold-${randomUUID()}`;
    this.held.set(holdId, {
      id: holdId,
      directives,
      target,
      heldAt: Date.now(),
      workflowId,
    });
    logger.debug('DirectiveQueue holdDrain', { holdId, target, count: directives.length });
    return { holdId, directives };
  }

  /**
   * Release a held batch — directives confirmed delivered. No-op for unknown holdId.
   */
  releaseHold(holdId: string): void {
    if (!holdId) return;
    const deleted = this.held.delete(holdId);
    if (deleted) {
      logger.debug('DirectiveQueue hold released', { holdId });
    }
  }

  /**
   * Re-enqueue a held batch back to the front of the target queue.
   * Used when IPC write fails and directives need to be retried.
   */
  reEnqueueHold(holdId: string): number {
    const batch = this.held.get(holdId);
    if (!batch) return 0;
    this.held.delete(holdId);

    const queue = this.queues.get(batch.target) ?? [];
    // Prepend: held directives were older, should be delivered first
    const merged = [...batch.directives, ...queue];
    while (merged.length > MAX_QUEUE_DEPTH) {
      merged.pop(); // Evict newest overflow items to preserve held (older) directives
      logger.warn('DirectiveQueue re-enqueue overflow: directive evicted', { target: batch.target });
    }
    this.queues.set(batch.target, merged);

    logger.info('DirectiveQueue hold re-enqueued', {
      holdId,
      target: batch.target,
      count: batch.directives.length,
    });
    return batch.directives.length;
  }

  /**
   * Re-enqueue any held batches older than ttlMs. Returns total directives re-enqueued.
   */
  sweepStaleHolds(ttlMs: number = HOLD_TTL_MS): number {
    const now = Date.now();
    let reEnqueued = 0;
    const staleIds: string[] = [];
    for (const [holdId, batch] of this.held) {
      if (now - batch.heldAt >= ttlMs) {
        staleIds.push(holdId);
      }
    }
    for (const holdId of staleIds) {
      reEnqueued += this.reEnqueueHold(holdId);
    }
    if (reEnqueued > 0) {
      logger.warn('DirectiveQueue swept stale holds', { count: reEnqueued, ttlMs });
    }
    return reEnqueued;
  }

  /**
   * Return the number of directives currently in held state (diagnostic).
   */
  heldSize(): number {
    let total = 0;
    for (const batch of this.held.values()) {
      total += batch.directives.length;
    }
    return total;
  }

  /**
   * Remove ALL directives across ALL targets that belong to a specific workflow.
   *
   * Used when a workflow reaches a terminal state to prevent stale directives
   * from being delivered to a future run.
   *
   * @param workflowId - The workflow ID whose directives should be purged.
   * @returns Total number of directives removed.
   */
  purge(workflowId: string): number {
    let count = 0;
    const queuesToDelete: string[] = [];
    const queuesToUpdate: [string, Directive[]][] = [];

    for (const [target, queue] of this.queues.entries()) {
      const before = queue.length;
      const remaining = queue.filter((d) => d.workflow_id !== workflowId);
      count += before - remaining.length;
      if (remaining.length === 0) {
        queuesToDelete.push(target);
      } else if (remaining.length !== before) {
        queuesToUpdate.push([target, remaining]);
      }
    }

    for (const target of queuesToDelete) {
      this.queues.delete(target);
    }
    for (const [target, remaining] of queuesToUpdate) {
      this.queues.set(target, remaining);
    }
    const heldToRemove: string[] = [];
    for (const [holdId, batch] of this.held) {
      if (batch.workflowId === workflowId) {
        heldToRemove.push(holdId);
        count += batch.directives.length;
      }
    }
    for (const holdId of heldToRemove) {
      this.held.delete(holdId);
    }
    if (count > 0) {
      logger.info('DirectiveQueue purged', { workflowId, count });
    }
    return count;
  }

  /**
   * Return directives for `target` without removing them.
   *
   * @param target - Hook target name.
   * @param workflowId - Optional workflow ID. When provided, only directives
   *   matching this workflow_id are included in the snapshot.
   * @returns Snapshot of the queue (may be empty).
   */
  peek(target: string, workflowId?: string): Directive[] {
    const queue = this.queues.get(target) ?? [];
    if (workflowId === undefined) {
      return [...queue];
    }
    return queue.filter((d) => d.workflow_id === workflowId);
  }

  /** Clear all directive queues and held batches. */
  clear(): void {
    this.queues.clear();
    this.held.clear();
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
