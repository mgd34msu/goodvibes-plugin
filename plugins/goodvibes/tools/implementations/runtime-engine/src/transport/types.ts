// src/transport/types.ts

import type { RuntimeConfig } from '../shared/config.js';
import type { HealthStatus } from '../shared/types.js';
import type { RuntimeEvent, EventFilter } from '../shared/events.js';

/**
 * Transport mode discriminant.
 */
export type TransportMode = 'local' | 'remote';

/**
 * Unified transport interface for the runtime engine.
 *
 * Both local (in-process) and remote (daemon) implementations
 * provide identical semantics. MCP tool handlers interact only
 * with this interface, never with RuntimeEngine directly.
 *
 * Methods mirror HandlerContext but are async-first to accommodate
 * remote transport latency. Local transport methods resolve
 * synchronously via already-resolved promises.
 */
export interface RuntimeTransport {
  /** Which mode this transport is operating in. */
  readonly mode: TransportMode;

  /** Whether the transport is connected and ready. */
  isReady(): boolean;

  // ─── Lifecycle ─────────────────────────────────────────────

  /** Connect to the runtime (no-op for local, socket connect for remote). */
  connect(): Promise<void>;

  /** Disconnect from the runtime (no-op for local, socket close for remote). */
  disconnect(): Promise<void>;

  // ─── Status ────────────────────────────────────────────────

  /** Engine uptime in milliseconds. */
  getUptime(): Promise<number>;

  /** Current runtime configuration. */
  getConfig(): Promise<RuntimeConfig>;

  /** Current health status. */
  getHealth(): Promise<HealthStatus>;

  /** Engine version string. */
  getVersion(): Promise<string>;

  /** Project root path. */
  getProjectRoot(): Promise<string>;

  // ─── Configuration ─────────────────────────────────────────

  /** Update the runtime configuration. */
  updateConfig(config: RuntimeConfig): Promise<void>;

  // ─── State ─────────────────────────────────────────────────

  /** Get a value from the core state store. */
  getState(key: string): Promise<unknown>;

  /** Set a value in the core state store. */
  setState(key: string, value: unknown): Promise<void>;

  /** Delete a key from the core state store. */
  deleteState(key: string): Promise<void>;

  /** List state keys with optional prefix filter. */
  listStateKeys(prefix?: string): Promise<string[]>;

  /** Full state snapshot. */
  getStateSnapshot(): Promise<Record<string, unknown>>;

  // ─── Events ────────────────────────────────────────────────

  /** Emit an event on the event bus. */
  emitEvent(event: RuntimeEvent): Promise<void>;

  /** Query the event log with filters. */
  queryEvents(filter: EventFilter): Promise<RuntimeEvent[]>;

  /** Get current event queue depth. */
  getQueueDepth(): Promise<number>;

  // ─── Events (extended) ───────────────────────────────────────

  /** Get event history from the in-memory EventBus ring buffer. */
  getEventHistory(filter?: EventFilter): Promise<RuntimeEvent[]>;

  /** Get combined stats from EventLog and EventQueue. */
  getEventStats(): Promise<{
    log: {
      total_events: number;
      file_size_bytes: number;
      oldest_event?: number;
      newest_event?: number;
      events_per_type: Record<string, number>;
    };
    queue: {
      pending: number;
      max_depth: number;
      dedup_cache_size: number;
    };
  }>;

  // ─── Workflows ─────────────────────────────────────────────

  /** Get workflow instance by ID. @returns WorkflowInstance or null */
  getWorkflow(workflowId: string): Promise<Record<string, unknown> | null>;

  /** List all active workflow instances. @returns WorkflowInstance[] */
  listWorkflows(): Promise<Record<string, unknown>[]>;

  /** Start a new workflow instance. */
  startWorkflow(
    definitionId: string,
    context?: Record<string, unknown>,
  ): Promise<{ workflow_id: string }>;

  /** Transition a workflow to the next state. */
  transitionWorkflow(
    workflowId: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /** Cancel a workflow instance. */
  cancelWorkflow(workflowId: string, reason?: string): Promise<void>;

  // ─── Triggers ──────────────────────────────────────────────

  /** List all registered triggers. @returns TriggerDefinition[] */
  listTriggers(): Promise<Record<string, unknown>[]>;

  /** Get a trigger by ID. @returns TriggerDefinition or null */
  getTrigger(triggerId: string): Promise<Record<string, unknown> | null>;

  /** Register a new trigger. */
  registerTrigger(definition: Record<string, unknown>): Promise<void>;

  /** Unregister a trigger. */
  unregisterTrigger(triggerId: string): Promise<boolean>;

  // ─── Agents ────────────────────────────────────────────────

  /** Get agent status by ID. @returns AgentRecord or null */
  getAgent(agentId: string): Promise<Record<string, unknown> | null>;

  /** List all agents. @returns AgentRecord[] */
  listAgents(): Promise<Record<string, unknown>[]>;

  // ─── Directives ────────────────────────────────────────────

  /** Drain directives for a target. Returns raw directives — message assembly is a handler concern. */
  drainDirectives(
    target: string,
    workflowId?: string,
  ): Promise<{ directives: unknown[] }>;

  // ─── Schedule ──────────────────────────────────────────────

  /** Get heartbeat status and scheduler summary. */
  getHeartbeat(): Promise<{
    enabled: boolean;
    tick_count: number;
    last_tick_at: number;
    scheduled_count: number;
    interval_ms: number;
  }>;

  /** Set the heartbeat interval (ms). Must be >= 1000. */
  setHeartbeatInterval(intervalMs: number): Promise<void>;

  // ─── External ──────────────────────────────────────────────

  /** Get external plugin status (HTTP listener, normalizers). */
  getExternalStatus(): Promise<{
    http_listener: {
      running: boolean;
      port: number | null;
      address: string | null;
    };
    normalizer_count: number;
    normalizer_sources: string[];
  }>;
}
