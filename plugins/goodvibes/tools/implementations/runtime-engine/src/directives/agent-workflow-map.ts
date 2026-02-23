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
}
