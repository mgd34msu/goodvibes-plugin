/**
 * Agent-to-Workflow Binding Map
 *
 * Maintains an in-memory mapping from `agent_id` to `workflow_id`.
 * Used by the WRFC handlers to deterministically route `hook:agent:completed`
 * events to the correct workflow instance, even when multiple agent chains
 * are running concurrently.
 *
 * Lifecycle:
 * 1. `bind(agentId, workflowId)` — called on `hook:agent:spawned`
 * 2. `lookup(agentId)` — called on `hook:agent:completed` to find the workflow
 * 3. `unbind(agentId)` — called after the workflow is fully resolved (complete/escalate)
 */

import { createLogger } from '../shared/logger.js';

const log = createLogger('agent-workflow-map');

/**
 * In-memory map from agent_id to workflow_id.
 *
 * All methods are O(1) operations against a Map.
 * No persistence — restarts require a fresh map (acceptable since workflows
 * are also in-memory only).
 */
export class AgentWorkflowMap {
  private readonly map: Map<string, string> = new Map();

  /** Pending binds queue: agentType → workflowId, stored FIFO with timestamp. */
  private pendingBinds: Array<{ agentType: string; workflowId: string; timestamp: number }> = [];

  /** Stale pending bind TTL in milliseconds. */
  private static readonly PENDING_BIND_TTL_MS = 60_000;

  /**
   * Binds an agent_id to a workflow_id.
   *
   * If the agent_id is already bound (duplicate spawn event), the existing
   * binding is preserved and a warning is logged.
   *
   * @param agentId    - The agent identifier from the spawn event.
   * @param workflowId - The workflow instance ID this agent belongs to.
   */
  bind(agentId: string, workflowId: string): void {
    if (this.map.has(agentId)) {
      log.warn('AgentWorkflowMap.bind: agent already bound, ignoring duplicate', {
        agent_id: agentId,
        existing_workflow_id: this.map.get(agentId),
        new_workflow_id: workflowId,
      });
      return;
    }
    this.map.set(agentId, workflowId);
    log.debug('AgentWorkflowMap.bind: bound agent to workflow', {
      agent_id: agentId,
      workflow_id: workflowId,
    });
  }

  /**
   * Looks up the workflow_id for a given agent_id.
   *
   * @param agentId - The agent identifier to look up.
   * @returns The workflow_id, or undefined if not bound.
   */
  lookup(agentId: string): string | undefined {
    return this.map.get(agentId);
  }

  /**
   * Removes the binding for an agent_id.
   *
   * Called after a workflow completes or escalates — the mapping is no longer
   * needed and should be removed to prevent unbounded memory growth.
   *
   * @param agentId - The agent identifier to unbind.
   */
  unbind(agentId: string): void {
    const had = this.map.delete(agentId);
    if (had) {
      log.debug('AgentWorkflowMap.unbind: removed binding', { agent_id: agentId });
    }
  }

  /**
   * Returns true if the agent_id has a binding.
   *
   * @param agentId - The agent identifier to check.
   */
  has(agentId: string): boolean {
    return this.map.has(agentId);
  }

  /** Returns the current number of active bindings. */
  size(): number {
    return this.map.size;
  }

  /** Returns all current bindings as a plain object (for debugging/logging). */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map.entries());
  }

  /**
   * Restores bindings from a snapshot. Existing bindings are preserved;
   * entries in the snapshot are added or overwrite existing entries.
   *
   * Used during startup recovery to repopulate the map from a persisted snapshot.
   *
   * @param bindings - Map of agentId → workflowId to restore.
   */
  restoreBindings(bindings: Record<string, string>): void {
    let count = 0;
    for (const [agentId, workflowId] of Object.entries(bindings)) {
      if (agentId && workflowId) {
        this.map.set(agentId, workflowId);
        count++;
      }
    }
    log.debug('Agent-workflow bindings restored', { count });
  }

  /**
   * Enqueues a pending bind so that when a reviewer/fixer agent spawns, it can
   * query the runtime to get the workflow_id it should bind to.
   *
   * Called immediately after enqueuing a spawn directive so the bind is ready
   * before SubagentStart fires for the spawned agent.
   *
   * @param agentType  - The agent type to expect (e.g. 'reviewer', 'engineer').
   * @param workflowId - The workflow this agent should bind to.
   */
  addPendingBind(agentType: string, workflowId: string): void {
    this.pendingBinds.push({ agentType, workflowId, timestamp: Date.now() });
    log.debug('AgentWorkflowMap.addPendingBind: enqueued pending bind', {
      agent_type: agentType,
      workflow_id: workflowId,
      queue_length: this.pendingBinds.length,
    });
  }

  /**
   * Resolves a pending bind for the given agent type (FIFO).
   *
   * Removes the first matching entry from the queue, prunes stale entries
   * older than 60 seconds, and returns the workflow_id or null.
   *
   * @param agentType - The agent type queried by SubagentStart.
   * @returns The workflow_id if a pending bind exists, or null.
   */
  resolvePendingBind(agentType: string): string | null {
    const now = Date.now();
    // Prune stale entries first
    this.pendingBinds = this.pendingBinds.filter(
      (entry) => now - entry.timestamp < AgentWorkflowMap.PENDING_BIND_TTL_MS
    );

    const idx = this.pendingBinds.findIndex((entry) => entry.agentType === agentType);
    if (idx === -1) {
      log.debug('AgentWorkflowMap.resolvePendingBind: no pending bind found', { agent_type: agentType });
      return null;
    }

    const [resolved] = this.pendingBinds.splice(idx, 1);
    log.info('AgentWorkflowMap.resolvePendingBind: resolved pending bind', {
      agent_type: agentType,
      workflow_id: resolved.workflowId,
      remaining_queue_length: this.pendingBinds.length,
    });

    // Clean up sibling entries with the same workflowId (dual-key pattern).
    // When both 'reviewer' and 'goodvibes:reviewer' are enqueued for the same
    // workflow, consuming one makes the other redundant — remove it now rather
    // than waiting for TTL expiry.
    const siblingCount = this.pendingBinds.filter(
      (entry) => entry.workflowId === resolved.workflowId
    ).length;
    if (siblingCount > 0) {
      this.pendingBinds = this.pendingBinds.filter(
        (entry) => entry.workflowId !== resolved.workflowId
      );
      log.debug('AgentWorkflowMap.resolvePendingBind: removed sibling pending bind entries', {
        workflow_id: resolved.workflowId,
        siblings_removed: siblingCount,
        remaining_queue_length: this.pendingBinds.length,
      });
    }

    return resolved.workflowId;
  }
}
