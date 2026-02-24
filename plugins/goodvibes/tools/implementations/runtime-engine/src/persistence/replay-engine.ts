/**
 * Replay Engine
 *
 * Reads events from the EventLog and replays them through subsystems to
 * reconstruct in-memory state after a restart. This is the core of the
 * event-sourcing recovery mechanism.
 *
 * Events are processed in sequence order. Unknown event types are skipped
 * with a debug log. Corrupted/unparseable events are skipped with a warning.
 *
 * Actions are NOT re-executed during replay — only state is reconstructed.
 */

import type { EventLog } from '../events/event-log.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { EventType, RuntimeEvent } from '../events/types.js';
import type { WorkflowInstance } from '../workflow/types.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

const logger = createLogger('replay-engine');

/** Dependencies required by the replay engine. */
export interface ReplayDeps {
  workflowEngine: WorkflowEngine | null;
  triggerRegistry: TriggerRegistry | null;
  agentCoordinator: AgentCoordinator | null;
  agentWorkflowMap: AgentWorkflowMap | null;
}

/** Options that control replay behaviour. */
export interface ReplayOptions {
  /**
   * When true, trigger actions and workflow actions are skipped during replay.
   * Only state (instances, bindings, fire counts) is reconstructed.
   * Default: true (skip actions — always the right choice for recovery).
   */
  skipActions?: boolean;
  /**
   * If provided, only events with a sequence number greater than this value
   * are replayed. Used to replay "delta" events after a snapshot.
   */
  afterSequence?: number;
  /**
   * Optional allowlist of event type prefixes. When provided, only events
   * whose type starts with one of these prefixes are processed.
   * e.g. `['workflow:', 'agent:', 'trigger:']`
   *
   * When omitted, all event types relevant to state reconstruction are processed.
   */
  eventTypes?: string[];
}

/** Result of a replay operation. */
export interface ReplayResult {
  /** Number of events read from the log. */
  eventsReplayed: number;
  /** Number of workflow instances restored. */
  workflowsRestored: number;
  /** Number of agent-to-workflow bindings restored. */
  agentBindingsRestored: number;
  /** Number of triggers whose fire counts were updated. */
  triggerCountsRestored: number;
  /** Duration of the replay operation in milliseconds. */
  replayDurationMs: number;
  /** The highest sequence number seen during replay (0 if no events). */
  lastSequence: number;
  /** Number of events that were skipped due to parse errors or unknown types. */
  skippedEvents: number;
}

/**
 * Replays events from the EventLog through the provided subsystems to
 * reconstruct in-memory state.
 *
 * @param eventLog - The event log to read from.
 * @param deps     - The subsystems to update.
 * @param options  - Replay behaviour options.
 * @returns A summary of what was restored.
 */
export async function replayEvents(
  eventLog: EventLog,
  deps: ReplayDeps,
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const startMs = Date.now();
  const { skipActions = true, afterSequence, eventTypes } = options;

  let eventsReplayed = 0;
  let workflowsRestored = 0;
  let agentBindingsRestored = 0;
  let triggerCountsRestored = 0;
  let lastSequence = afterSequence ?? 0;
  let skippedEvents = 0;

  // Track restored workflow instances by ID to avoid double-restore
  const restoredWorkflows = new Map<string, WorkflowInstance>();
  // Track restored agent bindings
  const restoredAgentBindings = new Set<string>();
  // Track trigger state updates: triggerId -> { firesCount, lastFired }
  const triggerStateMap = new Map<string, { firesCount: number; lastFired?: number }>();

  logger.info('Starting event replay', {
    afterSequence: afterSequence ?? 0,
    skipActions,
  });

  let events: RuntimeEvent[];
  try {
    if (afterSequence !== undefined) {
      events = await eventLog.since(afterSequence);
    } else {
      events = await eventLog.query({});
    }
  } catch (err) {
    logger.error('Failed to read events from event log', { error: toErrorMessage(err) });
    return {
      eventsReplayed: 0,
      workflowsRestored: 0,
      agentBindingsRestored: 0,
      triggerCountsRestored: 0,
      replayDurationMs: Date.now() - startMs,
      lastSequence: afterSequence ?? 0,
      skippedEvents: 0,
    };
  }

  // Sort by sequence to ensure chronological order
  events.sort((a, b) => {
    const seqA = a.metadata?.sequence ?? 0;
    const seqB = b.metadata?.sequence ?? 0;
    return seqA - seqB;
  });

  for (const event of events) {
    // Track sequence
    const seq = event.metadata?.sequence;
    if (typeof seq === 'number' && seq > lastSequence) {
      lastSequence = seq;
    }

    // Apply event type filter if provided
    if (eventTypes && eventTypes.length > 0) {
      const typeMatches = eventTypes.some((prefix) => event.type.startsWith(prefix));
      if (!typeMatches) continue;
    }

    try {
      const processed = processEvent(event, deps, restoredWorkflows, restoredAgentBindings, triggerStateMap, skipActions);
      if (processed) {
        eventsReplayed++;
      }
    } catch (err) {
      logger.warn('Skipping event during replay due to error', {
        event_id: event.id,
        event_type: event.type,
        sequence: seq,
        error: toErrorMessage(err),
      });
      skippedEvents++;
    }
  }

  // Apply accumulated workflow state to WorkflowEngine
  if (deps.workflowEngine && restoredWorkflows.size > 0) {
    for (const instance of restoredWorkflows.values()) {
      try {
        deps.workflowEngine.restoreInstance(instance);
        workflowsRestored++;
      } catch (err) {
        logger.warn('Failed to restore workflow instance', {
          id: instance.id,
          error: toErrorMessage(err),
        });
        skippedEvents++;
      }
    }
  }

  // Apply accumulated agent-workflow bindings
  if (deps.agentWorkflowMap && restoredAgentBindings.size > 0) {
    for (const binding of restoredAgentBindings) {
      const [agentId, workflowId] = binding.split('::', 2);
      if (agentId && workflowId) {
        try {
          deps.agentWorkflowMap.bind(agentId, workflowId);
          agentBindingsRestored++;
        } catch (err) {
          logger.warn('Failed to restore agent binding', { agentId, workflowId, error: toErrorMessage(err) });
        }
      }
    }
  }

  // Apply accumulated trigger state
  if (deps.triggerRegistry && triggerStateMap.size > 0) {
    const triggerStates = Array.from(triggerStateMap.entries()).map(([triggerId, state]) => ({
      triggerId,
      firesCount: state.firesCount,
      lastFired: state.lastFired,
    }));
    try {
      deps.triggerRegistry.restoreTriggerState(triggerStates);
      triggerCountsRestored = triggerStates.length;
    } catch (err) {
      logger.warn('Failed to restore trigger states', { error: toErrorMessage(err) });
    }
  }

  const replayDurationMs = Date.now() - startMs;
  logger.info('Event replay complete', {
    eventsReplayed,
    workflowsRestored,
    agentBindingsRestored,
    triggerCountsRestored,
    skippedEvents,
    replayDurationMs,
    lastSequence,
  });

  return {
    eventsReplayed,
    workflowsRestored,
    agentBindingsRestored,
    triggerCountsRestored,
    replayDurationMs,
    lastSequence,
    skippedEvents,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Processes a single event during replay.
 *
 * Returns true if the event was relevant and processed; false if ignored.
 * Throws on unexpected errors (caller will skip and log).
 */
function processEvent(
  event: RuntimeEvent,
  _deps: ReplayDeps,
  restoredWorkflows: Map<string, WorkflowInstance>,
  restoredAgentBindings: Set<string>,
  triggerStateMap: Map<string, { firesCount: number; lastFired?: number }>,
  _skipActions: boolean,
): boolean {
  const { type } = event;

  // ── Workflow events ────────────────────────────────────────────────────────
  if (type === 'workflow:created') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id as string | undefined;
    const definitionId = data.workflow_type as string | undefined;
    const initialState = data.current_state as string | undefined;
    const context = (data.context as Record<string, unknown> | undefined) ?? {};
    const createdAt = event.timestamp;

    if (instanceId && definitionId && initialState) {
      const existing = restoredWorkflows.get(instanceId);
      if (!existing) {
        restoredWorkflows.set(instanceId, {
          id: instanceId,
          definition_id: definitionId,
          current_state: initialState,
          context,
          history: [],
          created_at: createdAt,
          updated_at: createdAt,
          status: 'active',
        });
      }
      return true;
    }
    return false;
  }

  if (type === 'workflow:state_changed') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id as string | undefined;
    const newState = data.current_state as string | undefined;
    // context is emitted as the full context snapshot; treat it as the context changes for replay
    const contextChanges = (data.context as Record<string, unknown> | undefined) ?? {};

    if (instanceId && newState) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        const transition = {
          from_state: instance.current_state,
          to_state: newState,
          event: event.type,
          timestamp: event.timestamp,
          context_changes: contextChanges,
        };
        instance.history.push(transition);
        instance.current_state = newState;
        instance.updated_at = event.timestamp;
        // Merge context changes
        Object.assign(instance.context, contextChanges);
      }
      return true;
    }
    return false;
  }

  if (type === 'workflow:completed') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id as string | undefined;
    if (instanceId) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        instance.status = 'completed';
        instance.completed_at = event.timestamp;
        instance.updated_at = event.timestamp;
      }
      return true;
    }
    return false;
  }

  if (type === 'workflow:failed') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id as string | undefined;
    const errorMsg = data.error as string | undefined;
    if (instanceId) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        instance.status = 'failed';
        instance.error = errorMsg;
        instance.updated_at = event.timestamp;
      }
      return true;
    }
    return false;
  }

  if (type === 'workflow:cancelled') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id as string | undefined;
    if (instanceId) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        instance.status = 'cancelled';
        instance.updated_at = event.timestamp;
      }
      return true;
    }
    return false;
  }

  // ── Agent events ───────────────────────────────────────────────────────────
  if (type === 'agent:spawned') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const agentId = event.source.kind === 'agent'
      ? (event.source as { kind: 'agent'; agent_id: string }).agent_id
      : (data.agent_id as string | undefined);
    const workflowId = data.workflow_id as string | undefined;

    if (agentId && workflowId) {
      restoredAgentBindings.add(`${agentId}::${workflowId}`);
      return true;
    }
    return false;
  }

  // ── Trigger events ─────────────────────────────────────────────────────────
  if (type === 'trigger:fired') {
    const payload = event.payload as { data?: Record<string, unknown> };
    const data = payload?.data ?? {};
    const triggerId = data.trigger_id as string | undefined
      ?? (event.source.kind === 'trigger'
        ? (event.source as { kind: 'trigger'; trigger_id: string }).trigger_id
        : undefined);

    if (triggerId) {
      const existing = triggerStateMap.get(triggerId);
      const lastFiredTs = event.timestamp ? new Date(event.timestamp).getTime() : undefined;
      if (existing) {
        existing.firesCount++;
        if (lastFiredTs !== undefined) existing.lastFired = lastFiredTs;
      } else {
        triggerStateMap.set(triggerId, {
          firesCount: 1,
          lastFired: lastFiredTs,
        });
      }
      return true;
    }
    return false;
  }

  // Event type not relevant to state reconstruction — skip silently
  return false;
}
