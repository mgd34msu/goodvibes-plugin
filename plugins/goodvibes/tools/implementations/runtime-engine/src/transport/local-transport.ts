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
}
