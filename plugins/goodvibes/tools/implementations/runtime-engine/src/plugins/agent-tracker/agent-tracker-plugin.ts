/**
 * AgentTrackerPlugin — Layer 3 Plugin
 *
 * Tracks agent lifecycle by listening to agent:spawned, agent:completed,
 * and agent:failed events emitted by the subagent-start/stop hooks.
 *
 * Stores tracked agents in the runtime state store and provides
 * query methods for inspecting active/completed agents.
 */

import { createLogger } from '../../shared/logger.js';
import type {
  RuntimePlugin,
  PluginState,
  PluginWorkflowDefinition,
  PluginTriggerDefinition,
  PluginEventHandler,
  RuntimeServices,
} from '../../shared/plugin.js';
import type { RuntimeEvent } from '../../shared/events.js';
import type { TrackedAgent, TrackedAgentStatus, AgentTrackerStats } from './types.js';

const log = createLogger('agent-tracker-plugin');

// ─── State key helpers ──────────────────────────────────────────────────────────

const AGENT_KEY = (id: string) => `agent_tracker.agents.${id}`;
const INDEX_KEY = 'agent_tracker.agent_ids';

// ─── Trigger IDs ────────────────────────────────────────────────────────────────

export const TRACKER_TRIGGER_IDS = {
  AGENT_SPAWNED: 'agent_tracker:agent_spawned',
  AGENT_COMPLETED: 'agent_tracker:agent_completed',
  AGENT_FAILED: 'agent_tracker:agent_failed',
} as const;

// ─── Payload extraction ─────────────────────────────────────────────────────────

/**
 * Extracts agent fields from an event payload.
 * Handles both direct payload shape and nested data shape.
 */
function extractAgentData(event: RuntimeEvent): {
  agent_id: string | null;
  agent_type: string;
  workflow_id: string | null;
} {
  const payload = event.payload as Record<string, unknown>;
  const data = (typeof payload['data'] === 'object' && payload['data'] !== null)
    ? payload['data'] as Record<string, unknown>
    : payload;

  const agent_id = typeof data['agent_id'] === 'string' ? data['agent_id'] : null;
  const agent_type = typeof data['agent_type'] === 'string' ? data['agent_type'] : 'unknown';
  const workflow_id = typeof data['workflow_id'] === 'string' && data['workflow_id'].length > 0
    ? data['workflow_id']
    : null;

  return { agent_id, agent_type, workflow_id };
}

// ─── Plugin Class ───────────────────────────────────────────────────────────────

export class AgentTrackerPlugin implements RuntimePlugin {
  readonly name = 'agent-tracker';
  readonly version = '1.0.0';
  state: PluginState = 'registered';

  private _handlers: PluginEventHandler[] = [];
  private _services: RuntimeServices | null = null;

  // ─── RuntimePlugin interface ──────────────────────────────────────────────

  register(services: RuntimeServices): void {
    this._services = services;

    // Initialise the agent ID index if not present
    const existing = services.getState(INDEX_KEY);
    if (!existing) {
      services.setState(INDEX_KEY, []);
    }

    // Handler: agent:spawned
    const onSpawned = async (event: RuntimeEvent): Promise<void> => {
      this.handleSpawned(event);
    };

    // Handler: agent:completed
    const onCompleted = async (event: RuntimeEvent): Promise<void> => {
      this.handleFinished(event, 'completed');
    };

    // Handler: agent:failed
    const onFailed = async (event: RuntimeEvent): Promise<void> => {
      this.handleFinished(event, 'failed');
    };

    // Register triggers with the runtime
    services.registerTrigger(
      TRACKER_TRIGGER_IDS.AGENT_SPAWNED,
      {
        id: TRACKER_TRIGGER_IDS.AGENT_SPAWNED,
        name: 'agent_tracker_spawned',
        description: 'Track agent when it is spawned',
        event_type: 'agent:spawned',
        conditions: [{ source: ['agent', 'hook', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 1000,
      },
      onSpawned,
    );

    services.registerTrigger(
      TRACKER_TRIGGER_IDS.AGENT_COMPLETED,
      {
        id: TRACKER_TRIGGER_IDS.AGENT_COMPLETED,
        name: 'agent_tracker_completed',
        description: 'Update tracker when agent completes',
        event_type: 'agent:completed',
        conditions: [{ source: ['agent', 'hook', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 1000,
      },
      onCompleted,
    );

    services.registerTrigger(
      TRACKER_TRIGGER_IDS.AGENT_FAILED,
      {
        id: TRACKER_TRIGGER_IDS.AGENT_FAILED,
        name: 'agent_tracker_failed',
        description: 'Update tracker when agent fails',
        event_type: 'agent:failed',
        conditions: [{ source: ['agent', 'hook', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 1000,
      },
      onFailed,
    );

    // Capture handlers for getHandlers()
    this._handlers = [
      { event_type: 'agent:spawned', handler: onSpawned, priority: 5 },
      { event_type: 'agent:completed', handler: onCompleted, priority: 5 },
      { event_type: 'agent:failed', handler: onFailed, priority: 5 },
    ];

    this.state = 'starting';
    log.debug('AgentTrackerPlugin registered');
  }

  start(): void {
    if (this._handlers.length === 0) {
      throw new Error('AgentTrackerPlugin: register() must be called before start()');
    }
    this.state = 'running';
    log.info('AgentTrackerPlugin started');
  }

  stop(): void {
    this.state = 'stopped';
    this._handlers = [];
    this._services = null;
    log.debug('AgentTrackerPlugin stopped');
  }

  getWorkflowDefinitions(): PluginWorkflowDefinition[] {
    return [];
  }

  getTriggerDefinitions(): PluginTriggerDefinition[] {
    return [
      {
        id: TRACKER_TRIGGER_IDS.AGENT_SPAWNED,
        name: 'agent_tracker_spawned',
        description: 'Track agent when it is spawned',
        event_type: 'agent:spawned',
        conditions: [{ source: ['agent', 'hook', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 1000,
      },
      {
        id: TRACKER_TRIGGER_IDS.AGENT_COMPLETED,
        name: 'agent_tracker_completed',
        description: 'Update tracker when agent completes',
        event_type: 'agent:completed',
        conditions: [{ source: ['agent', 'hook', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 1000,
      },
      {
        id: TRACKER_TRIGGER_IDS.AGENT_FAILED,
        name: 'agent_tracker_failed',
        description: 'Update tracker when agent fails',
        event_type: 'agent:failed',
        conditions: [{ source: ['agent', 'hook', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 1000,
      },
    ];
  }

  getHandlers(): PluginEventHandler[] {
    return [...this._handlers];
  }

  // ─── Event handlers ───────────────────────────────────────────────────────

  private handleSpawned(event: RuntimeEvent): void {
    const { agent_id, agent_type, workflow_id } = extractAgentData(event);
    if (!agent_id) {
      log.debug('handleSpawned: no agent_id, skipping');
      return;
    }

    const tracked: TrackedAgent = {
      id: agent_id,
      type: agent_type,
      workflow_id,
      status: 'spawned',
      spawned_at: event.timestamp,
      finished_at: null,
      duration_ms: null,
    };

    this._services!.setState(AGENT_KEY(agent_id), tracked);
    this.addToIndex(agent_id);

    log.info('Agent tracked: spawned', { agent_id, agent_type, workflow_id });
  }

  private handleFinished(event: RuntimeEvent, status: 'completed' | 'failed'): void {
    const { agent_id, agent_type, workflow_id } = extractAgentData(event);
    if (!agent_id) {
      log.debug(`handleFinished(${status}): no agent_id, skipping`);
      return;
    }

    // Try to load existing tracked entry
    const existing = this._services!.getState(AGENT_KEY(agent_id)) as TrackedAgent | null;

    const now = event.timestamp;
    const tracked: TrackedAgent = {
      id: agent_id,
      type: existing?.type ?? agent_type,
      workflow_id: existing?.workflow_id ?? workflow_id,
      status,
      spawned_at: existing?.spawned_at ?? now,
      finished_at: now,
      duration_ms: existing ? now - existing.spawned_at : null,
    };

    this._services!.setState(AGENT_KEY(agent_id), tracked);
    this.addToIndex(agent_id);

    log.info(`Agent tracked: ${status}`, {
      agent_id,
      agent_type: tracked.type,
      workflow_id: tracked.workflow_id,
      duration_ms: tracked.duration_ms,
    });
  }

  // ─── Index management ─────────────────────────────────────────────────────

  private addToIndex(agentId: string): void {
    const ids = (this._services!.getState(INDEX_KEY) as string[] | null) ?? [];
    if (!ids.includes(agentId)) {
      this._services!.setState(INDEX_KEY, [...ids, agentId]);
    }
  }

  // ─── Query methods ────────────────────────────────────────────────────────

  /** Get a tracked agent by ID. */
  getAgent(agentId: string): TrackedAgent | null {
    if (!this._services) return null;
    return (this._services.getState(AGENT_KEY(agentId)) as TrackedAgent | null) ?? null;
  }

  /** Get all tracked agents. */
  getAllAgents(): TrackedAgent[] {
    if (!this._services) return [];
    const ids = (this._services.getState(INDEX_KEY) as string[] | null) ?? [];
    const agents: TrackedAgent[] = [];
    for (const id of ids) {
      const agent = this._services.getState(AGENT_KEY(id)) as TrackedAgent | null;
      if (agent) agents.push(agent);
    }
    return agents;
  }

  /** Get agents filtered by status. */
  getAgentsByStatus(status: TrackedAgentStatus): TrackedAgent[] {
    return this.getAllAgents().filter(a => a.status === status);
  }

  /** Get agents filtered by workflow ID. */
  getAgentsByWorkflow(workflowId: string): TrackedAgent[] {
    return this.getAllAgents().filter(a => a.workflow_id === workflowId);
  }

  /** Get aggregate stats. */
  getStats(): AgentTrackerStats {
    const agents = this.getAllAgents();
    const workflowIds = new Set(agents.map(a => a.workflow_id).filter(Boolean));
    return {
      total: agents.length,
      active: agents.filter(a => a.status === 'spawned').length,
      completed: agents.filter(a => a.status === 'completed').length,
      failed: agents.filter(a => a.status === 'failed').length,
      workflows: workflowIds.size,
    };
  }
}
