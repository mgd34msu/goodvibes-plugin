/**
 * AgentTrackerPlugin — Layer 3 Plugin
 *
 * Tracks agent lifecycle by subscribing to agent:spawned, agent:completed,
 * and agent:failed events on the EventBus. Auto-resolves workflow_id from
 * the WRFC state store when not present in the event payload.
 *
 * Uses services.subscribe() for reliable event delivery and
 * services.setState/getState for persistent tracking.
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
const WRFC_MAP_KEY = (sid: string, id: string) => `wrfc.sessions.${sid}.agent_map.${id}`;

/**
 * Trigger IDs used by the AgentTrackerPlugin.
 * The plugin currently uses EventBus subscriptions rather than triggers,
 * so this object is empty. Preserved for backward compatibility.
 */
export const TRACKER_TRIGGER_IDS: Record<string, string> = {};

// ─── Payload extraction ─────────────────────────────────────────────────────────

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
  const agent_type = typeof data['agent_type'] === 'string' && data['agent_type'].length > 0 ? data['agent_type'] : '';
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
  private _unsubscribes: Array<() => void> = [];

  // ─── RuntimePlugin interface ──────────────────────────────────────────────

  register(services: RuntimeServices): void {
    this._services = services;

    const existing = services.getState(INDEX_KEY);
    if (!existing) {
      services.setState(INDEX_KEY, []);
    }

    // Subscribe directly to the EventBus
    const unsubSpawned = services.subscribe('agent:spawned', (event) => {
      this.handleSpawned(event);
    });
    const unsubCompleted = services.subscribe('agent:completed', (event) => {
      this.handleFinished(event, 'completed');
    });
    const unsubFailed = services.subscribe('agent:failed', (event) => {
      this.handleFinished(event, 'failed');
    });

    this._unsubscribes = [unsubSpawned, unsubCompleted, unsubFailed];

    this._handlers = [
      { event_type: 'agent:spawned', handler: (e: RuntimeEvent) => { this.handleSpawned(e); }, priority: 5 },
      { event_type: 'agent:completed', handler: (e: RuntimeEvent) => { this.handleFinished(e, 'completed'); }, priority: 5 },
      { event_type: 'agent:failed', handler: (e: RuntimeEvent) => { this.handleFinished(e, 'failed'); }, priority: 5 },
    ];

    this.state = 'starting';
    log.debug('AgentTrackerPlugin registered with EventBus subscriptions');
  }

  start(): void {
    if (this._handlers.length === 0) {
      throw new Error('AgentTrackerPlugin: register() must be called before start()');
    }
    this.state = 'running';
    log.info('AgentTrackerPlugin started');
  }

  stop(): void {
    for (const unsub of this._unsubscribes) unsub();
    this._unsubscribes = [];
    this._handlers = [];
    this._services = null;
    this.state = 'stopped';
    log.debug('AgentTrackerPlugin stopped');
  }

  getWorkflowDefinitions(): PluginWorkflowDefinition[] { return []; }
  getTriggerDefinitions(): PluginTriggerDefinition[] { return []; }
  getHandlers(): PluginEventHandler[] { return [...this._handlers]; }

  // ─── Event handlers ───────────────────────────────────────────────────────

  private handleSpawned(event: RuntimeEvent): void {
    if (!this._services) {
      log.warn('handleSpawned: plugin not registered, skipping');
      return;
    }

    const { agent_id, agent_type, workflow_id } = extractAgentData(event);
    if (!agent_id) {
      log.debug('handleSpawned: no agent_id, skipping');
      return;
    }
    if (!agent_type) {
      log.debug('handleSpawned: no agent_type, skipping', { agent_id });
      return;
    }

    const sessionId = typeof (event.metadata as Record<string, unknown> | undefined)?.['session_id'] === 'string'
      ? (event.metadata as Record<string, unknown>)['session_id'] as string
      : 'default';
    const resolvedWid = workflow_id ?? this.resolveWorkflowId(agent_id, sessionId);

    const tracked: TrackedAgent = {
      id: agent_id,
      type: agent_type,
      workflow_id: resolvedWid,
      status: 'spawned',
      spawned_at: event.timestamp,
      finished_at: null,
      duration_ms: null,
    };

    this._services.setState(AGENT_KEY(agent_id), tracked);
    this.addToIndex(agent_id);

    log.info('Agent tracked: spawned', { agent_id, agent_type, workflow_id: resolvedWid });
  }

  private handleFinished(event: RuntimeEvent, status: 'completed' | 'failed'): void {
    if (!this._services) {
      log.warn(`handleFinished(${status}): plugin not registered, skipping`);
      return;
    }

    const { agent_id, agent_type, workflow_id } = extractAgentData(event);
    if (!agent_id) {
      log.debug(`handleFinished(${status}): no agent_id, skipping`);
      return;
    }

    const existing = this._services.getState(AGENT_KEY(agent_id)) as TrackedAgent | null;
    if (!existing && !agent_type) {
      log.debug(`handleFinished(${status}): untracked agent with no type, skipping`, { agent_id });
      return;
    }
    const now = event.timestamp;

    const sessionId = typeof (event.metadata as Record<string, unknown> | undefined)?.['session_id'] === 'string'
      ? (event.metadata as Record<string, unknown>)['session_id'] as string
      : 'default';
    const resolvedWid = existing?.workflow_id ?? workflow_id ?? this.resolveWorkflowId(agent_id, sessionId);

    const tracked: TrackedAgent = {
      id: agent_id,
      type: existing?.type ?? agent_type,
      workflow_id: resolvedWid,
      status,
      spawned_at: existing?.spawned_at ?? now,
      finished_at: now,
      duration_ms: existing ? now - existing.spawned_at : null,
    };

    this._services.setState(AGENT_KEY(agent_id), tracked);
    this.addToIndex(agent_id);

    log.info(`Agent tracked: ${status}`, {
      agent_id,
      agent_type: tracked.type,
      workflow_id: tracked.workflow_id,
      duration_ms: tracked.duration_ms,
    });
  }

  // ─── Workflow ID resolution ────────────────────────────────────────────────

  private resolveWorkflowId(agentId: string, sessionId: string): string | null {
    if (!this._services) return null;
    const wid = this._services.getState(WRFC_MAP_KEY(sessionId, agentId));
    if (typeof wid === 'string' && wid.length > 0) {
      log.debug('Resolved workflow_id from WRFC state', { agent_id: agentId, workflow_id: wid });
      return wid;
    }
    return null;
  }

  // ─── Index management ─────────────────────────────────────────────────────

  private addToIndex(agentId: string): void {
    if (!this._services) return;
    const ids = (this._services.getState(INDEX_KEY) as string[] | null) ?? [];
    if (!ids.includes(agentId)) {
      this._services.setState(INDEX_KEY, [...ids, agentId]);
    }
  }

  // ─── Query methods ────────────────────────────────────────────────────────

  getAgent(agentId: string): TrackedAgent | null {
    if (!this._services) return null;
    return (this._services.getState(AGENT_KEY(agentId)) as TrackedAgent | null) ?? null;
  }

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

  getAgentsByStatus(status: TrackedAgentStatus): TrackedAgent[] {
    return this.getAllAgents().filter(a => a.status === status);
  }

  getAgentsByWorkflow(workflowId: string): TrackedAgent[] {
    return this.getAllAgents().filter(a => a.workflow_id === workflowId);
  }

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
