/**
 * Shared types for the runtime-engine MCP server.
 */

/**
 * Standard result wrapper for all runtime-engine tools.
 * Analogous to PrecisionResult in precision-engine.
 */
export interface RuntimeResult<T = unknown> {
  /** Whether the operation succeeded. */
  success: boolean;
  /** Result data payload (only present when success=true). */
  data?: T;
  /** Error message (only present when success=false). */
  error?: string;
  /** Metadata about the operation. */
  meta: {
    /** Engine identifier. */
    engine: 'runtime-engine';
    /** Engine version string. */
    version: string;
    /** Milliseconds since engine startup. */
    uptime_ms: number;
    /** Wall-clock execution time in milliseconds. */
    execution_ms: number;
  };
}

/**
 * A single health check result.
 */
export interface HealthCheck {
  /** Human-readable check name (e.g. 'memory', 'uptime'). */
  name: string;
  /** Pass/warn/fail status for this check. */
  status: 'pass' | 'warn' | 'fail';
  /** Optional human-readable message describing the result. */
  message?: string;
  /** How long this check took in milliseconds. */
  duration_ms: number;
}

/**
 * Aggregated health status for the runtime engine.
 */
export interface HealthStatus {
  /** Overall health status derived from all check results. */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Milliseconds since engine startup. */
  uptime_ms: number;
  /** Operating system PID. */
  pid: number;
  /** Current RSS memory usage in megabytes. */
  memory_usage_mb: number;
  /** Number of pending events in the queue (Phase 1: always 0). */
  event_queue_depth: number;
  /** Number of currently active workflows (Phase 1: always 0). */
  active_workflows: number;
  /** Number of currently active agents (Phase 1: always 0). */
  active_agents: number;
  /** Number of connected IPC clients (Phase 1: always 0). */
  ipc_clients: number;
  /** ISO 8601 timestamp of the last processed event, or null. */
  last_event_at: string | null;
  /** Individual health check results. */
  checks: HealthCheck[];
  /** Current feature flag state keyed by flag name. */
  features: Record<string, boolean>;
  /** Engine version string. */
  version: string;
}
