// src/transport/local-transport.ts

import type { RuntimeTransport, TransportMode } from './types.js';
import type { RuntimeEngine } from '../bootstrap.js';
import type { RuntimeConfig } from '../shared/config.js';
import type { RuntimeEvent, EventFilter } from '../shared/events.js';
import type { HealthStatus } from '../shared/types.js';
import { ENGINE_VERSION } from '../shared/constants.js';
import { createEvent } from '../shared/events.js';

/**
 * In-process transport — wraps RuntimeEngine with zero overhead.
 *
 * This is the default transport. All methods delegate directly to
 * RuntimeEngine accessors. Async signatures exist only for interface
 * compatibility with RemoteTransport; they resolve synchronously.
 */
export class LocalTransport implements RuntimeTransport {
  readonly mode: TransportMode = 'local';
  private readonly engine: RuntimeEngine;

  constructor(engine: RuntimeEngine) {
    this.engine = engine;
  }

  isReady(): boolean {
    return this.engine.isRunning();
  }

  async connect(): Promise<void> {
    // No-op — engine is already in-process
  }

  async disconnect(): Promise<void> {
    // No-op — engine lifecycle managed by RuntimeEngineServer
  }

  // ─── Status ─────────────────────────────────────────────────

  async getUptime(): Promise<number> {
    return this.engine.getUptime();
  }

  async getConfig(): Promise<RuntimeConfig> {
    return this.engine.getConfig();
  }

  async getHealth(): Promise<HealthStatus> {
    return this.engine.getHealthChecker().check();
  }

  async getVersion(): Promise<string> {
    return ENGINE_VERSION;
  }

  async getProjectRoot(): Promise<string> {
    return this.engine.getProjectRoot();
  }

  // ─── Configuration ──────────────────────────────────────────

  async updateConfig(config: RuntimeConfig): Promise<void> {
    this.engine.updateConfig(config);
  }

  // ─── State ──────────────────────────────────────────────────

  async getState(key: string): Promise<unknown> {
    return this.engine.getCoreStateStore().get(key);
  }

  async setState(key: string, value: unknown): Promise<void> {
    this.engine.getCoreStateStore().set(key, value);
  }

  async deleteState(key: string): Promise<void> {
    this.engine.getCoreStateStore().delete(key);
  }

  async listStateKeys(prefix?: string): Promise<string[]> {
    return this.engine.getCoreStateStore().keys(prefix);
  }

  async getStateSnapshot(): Promise<Record<string, unknown>> {
    return this.engine.getCoreStateStore().snapshot();
  }

  // ─── Events ─────────────────────────────────────────────────

  async emitEvent(event: RuntimeEvent): Promise<void> {
    this.engine.getEventBus().emit(event);
  }

  async queryEvents(filter: EventFilter): Promise<RuntimeEvent[]> {
    return this.engine.getEventLog().query(filter);
  }

  async getQueueDepth(): Promise<number> {
    return this.engine.getEventQueue().depth();
  }

  async getEventHistory(filter?: EventFilter): Promise<RuntimeEvent[]> {
    return this.engine.getEventBus().getHistory(filter);
  }

  async getEventStats(): Promise<{
    log: { total_events: number; file_size_bytes: number; oldest_event?: number; newest_event?: number; events_per_type: Record<string, number> };
    queue: { pending: number; max_depth: number; dedup_cache_size: number };
  }> {
    return {
      log: this.engine.getEventLog().getStats(),
      queue: this.engine.getEventQueue().getStats(),
    };
  }

  // ─── Workflows ──────────────────────────────────────────────

  async getWorkflow(workflowId: string): Promise<Record<string, unknown> | null> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) return null;
    const instance = engine.get(workflowId);
    return instance ? (instance as unknown as Record<string, unknown>) : null;
  }

  async listWorkflows(): Promise<Record<string, unknown>[]> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) return [];
    return engine.listAll() as unknown as Record<string, unknown>[];
  }

  async startWorkflow(
    definitionId: string,
    context?: Record<string, unknown>,
  ): Promise<{ workflow_id: string }> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error('Workflow engine not available');
    const instance = engine.create(definitionId, context ?? {});
    return { workflow_id: instance.id };
  }

  async transitionWorkflow(
    workflowId: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error('Workflow engine not available');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtimeEvent = createEvent({
      source: { kind: 'internal' },
      type: event as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { type: event, data: data ?? {} } as any,
    });
    return engine.sendEvent(workflowId, runtimeEvent) as unknown as Promise<Record<string, unknown>>;
  }

  async cancelWorkflow(workflowId: string, reason?: string): Promise<void> {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error('Workflow engine not available');
    engine.cancel(workflowId, reason ?? 'cancelled via MCP');
  }

  // ─── Triggers ───────────────────────────────────────────────

  async listTriggers(): Promise<Record<string, unknown>[]> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return [];
    return registry.list() as unknown as Record<string, unknown>[];
  }

  async getTrigger(triggerId: string): Promise<Record<string, unknown> | null> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return null;
    const trigger = registry.get(triggerId);
    return trigger ? (trigger as unknown as Record<string, unknown>) : null;
  }

  async registerTrigger(definition: Record<string, unknown>): Promise<void> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) throw new Error('Trigger registry not available');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.register(definition as any);
  }

  async unregisterTrigger(triggerId: string): Promise<boolean> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return false;
    return registry.unregister(triggerId);
  }

  // ─── Agents ─────────────────────────────────────────────────

  async getAgent(agentId: string): Promise<Record<string, unknown> | null> {
    const coordinator = this.engine.getAgentCoordinator();
    if (!coordinator) return null;
    const agent = coordinator.getAgent(agentId);
    return agent ? (agent as unknown as Record<string, unknown>) : null;
  }

  async listAgents(): Promise<Record<string, unknown>[]> {
    const coordinator = this.engine.getAgentCoordinator();
    if (!coordinator) return [];
    return coordinator.listActive() as unknown as Record<string, unknown>[];
  }

  // ─── Directives ─────────────────────────────────────────────

  async drainDirectives(
    target: string,
    workflowId?: string,
  ): Promise<{ directives: unknown[] }> {
    const queue = this.engine.getDirectiveQueue();
    if (!queue) return { directives: [] };
    const result = await queue.holdDrain(target, workflowId);
    // NOTE: Message assembly (filtering by type, sorting by priority, joining)
    // is a presentation concern — it stays in the MCP handler layer, not here.
    // Transport returns raw directives only.
    return { directives: result.directives };
  }

  // ─── Schedule ──────────────────────────────────────────────

  async getHeartbeat(): Promise<{
    enabled: boolean;
    tick_count: number;
    last_tick_at: number;
    scheduled_count: number;
    interval_ms: number;
  }> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    const heartbeat = timePlugin.getHeartbeat();
    const scheduler = timePlugin.getScheduler();
    return {
      enabled: heartbeat.isEnabled(),
      tick_count: heartbeat.getTickCount(),
      last_tick_at: heartbeat.getLastTickAt(),
      scheduled_count: scheduler.size(),
      interval_ms: heartbeat.getInterval(),
    };
  }

  async setHeartbeatInterval(intervalMs: number): Promise<void> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    timePlugin.getHeartbeat().setInterval(intervalMs);
  }

  async listSchedules(filter?: { type?: string }): Promise<Record<string, unknown>[]> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    const scheduler = timePlugin.getScheduler();
    let items = scheduler.getAllItems();
    if (filter?.type) {
      items = items.filter((item) => item.time_type === filter.type);
    }
    return items as unknown as Record<string, unknown>[];
  }

  async getSchedule(scheduleId: string): Promise<Record<string, unknown> | null> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    const item = timePlugin.getScheduler().getItem(scheduleId);
    return item ? (item as unknown as Record<string, unknown>) : null;
  }

  async createSchedule(params: {
    schedule_id: string;
    event_type: string;
    schedule_type: string;
    interval_ms?: number;
    delay_ms?: number;
    ttl?: number;
    payload?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    const scheduler = timePlugin.getScheduler();
    const { schedule_id, event_type, schedule_type, interval_ms, delay_ms, ttl, payload } = params;
    let item;
    if (schedule_type === 'one_shot') {
      if (delay_ms === undefined) throw new Error('delay_ms required for one_shot');
      item = scheduler.scheduleOneShot({
        id: schedule_id,
        event_type,
        delay_ms,
        ...(payload !== undefined && { payload }),
      });
    } else if (schedule_type === 'cron') {
      if (interval_ms === undefined) throw new Error('interval_ms required for cron');
      item = scheduler.scheduleCron({
        id: schedule_id,
        event_type,
        interval_ms,
        ...(payload !== undefined && { payload }),
      });
    } else {
      if (interval_ms === undefined) throw new Error('interval_ms required for heartbeat');
      item = scheduler.scheduleHeartbeat({
        id: schedule_id,
        event_type,
        interval_ms,
        ...(ttl !== undefined && { ttl }),
        ...(payload !== undefined && { payload }),
      });
    }
    return item as unknown as Record<string, unknown>;
  }

  async cancelSchedule(scheduleId: string): Promise<boolean> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    return timePlugin.getScheduler().cancel(scheduleId);
  }

  async pauseSchedule(scheduleId: string): Promise<boolean> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    return timePlugin.getScheduler().pause(scheduleId);
  }

  async resumeSchedule(scheduleId: string): Promise<boolean> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    return timePlugin.getScheduler().resume(scheduleId);
  }

  async pauseHeartbeat(): Promise<void> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    timePlugin.getHeartbeat().disable();
  }

  async resumeHeartbeat(): Promise<void> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    timePlugin.getHeartbeat().enable();
  }

  // ─── External ──────────────────────────────────────────────

  async getExternalStatus(): Promise<{
    http_listener: { running: boolean; port: number | null; address: string | null };
    normalizer_count: number;
    normalizer_sources: string[];
  }> {
    const externalPlugin = this.engine.getExternalPlugin();
    if (!externalPlugin) throw new Error('ExternalPlugin not available');
    const normalizerSources = externalPlugin.getNormalizerRegistry().sources();
    return {
      http_listener: {
        running: externalPlugin.isHttpListenerRunning(),
        port: externalPlugin.getHttpPort(),
        address: externalPlugin.getHttpAddress(),
      },
      normalizer_count: normalizerSources.length,
      normalizer_sources: normalizerSources,
    };
  }

  async getExternalNormalizers(): Promise<{ sources: string[]; count: number }> {
    const externalPlugin = this.engine.getExternalPlugin();
    if (!externalPlugin) throw new Error('ExternalPlugin not available');
    const sources = externalPlugin.getNormalizerRegistry().sources();
    return { sources, count: sources.length };
  }

  async testNormalize(
    source: string,
    payload: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<{ normalized: Record<string, unknown>; source: string }> {
    const externalPlugin = this.engine.getExternalPlugin();
    if (!externalPlugin) throw new Error('ExternalPlugin not available');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = externalPlugin.getNormalizerRegistry().normalize(source, payload, headers) as any as Record<string, unknown>;
    return { normalized, source };
  }

  async getExternalStats(since?: number): Promise<Record<string, unknown>> {
    const externalPlugin = this.engine.getExternalPlugin();
    if (!externalPlugin) throw new Error('ExternalPlugin not available');
    const normalizerRegistry = externalPlugin.getNormalizerRegistry();
    return {
      action: 'stats',
      since: since && since > 0 ? new Date(since).toISOString() : 'all_time',
      normalizers: normalizerRegistry ? normalizerRegistry.sources() : [],
      http_listener: { running: externalPlugin.isHttpListenerRunning() },
      note: 'Detailed webhook receive/error counts require ExternalPlugin stats tracking (not yet implemented)',
    };
  }

  async getExternalQueue(): Promise<{ queue_depth: number | null; external_stats: unknown }> {
    const stateStore = this.engine.getCoreStateStore();
    const eventQueue = this.engine.getEventQueue();
    const queueDepth = eventQueue != null ? eventQueue.depth() : null;
    const queueStats = stateStore?.get?.('external_plugin.stats') ?? null;
    return { queue_depth: queueDepth, external_stats: queueStats };
  }

  // ─── Triggers (extended) ────────────────────────────────────────

  async testTrigger(
    triggerId: string,
    testEvent: Record<string, unknown>,
  ): Promise<{ result: Record<string, unknown> | null; all_results: Record<string, unknown>[] }> {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) throw new Error('Trigger registry not available');
    const mockEvent = {
      id: (testEvent['id'] as string) ?? 'test-mock-id',
      timestamp: (testEvent['timestamp'] as number) ?? Date.now(),
      type: testEvent['type'],
      source: testEvent['source'] ?? { kind: 'mcp_tool', tool_name: 'runtime_triggers' },
      payload: testEvent['payload'] ?? { type: testEvent['type'], data: {} },
      priority: (testEvent['priority'] as number) ?? 0,
      metadata: testEvent['metadata'] ?? { session_id: '', sequence: 0, version: 1 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await registry.evaluate(mockEvent as any);
    const result = results.find((r) => r.trigger_id === triggerId);
    return {
      result: (result as unknown as Record<string, unknown>) ?? null,
      all_results: results as unknown as Record<string, unknown>[],
    };
  }
}
