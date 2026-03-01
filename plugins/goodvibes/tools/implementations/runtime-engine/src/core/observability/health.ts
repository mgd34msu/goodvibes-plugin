/**
 * HealthChecker — periodic and on-demand health status computation.
 *
 * Inspects memory usage, uptime, and process identity to produce a
 * structured HealthStatus object used by the runtime_status tool.
 */

import type { RuntimeConfig } from '../../shared/config.js';
import { ENGINE_VERSION } from '../../shared/constants.js';
import type { HealthCheck, HealthStatus } from '../../shared/types.js';

/** Minimum healthy uptime in milliseconds before checks stabilise. */
const MIN_HEALTHY_UPTIME_MS = 1000;

/**
 * HealthChecker computes an instantaneous HealthStatus for the runtime engine.
 *
 * All checks are synchronous and non-blocking; each check records its own
 * duration_ms so callers can identify slow checks.
 */
/** Memory cache TTL in milliseconds — avoids calling memoryUsage() on every check. */
const MEMORY_CACHE_TTL_MS = 5_000;

export class HealthChecker {
  private config: RuntimeConfig;
  private readonly startTime: number;
  private cachedMemoryMb: number = 0;
  private memoryCachedAt: number = 0;

  /**
   * @param config - Runtime configuration (used for feature flags and version).
   * @param startTime - Engine start time as a Unix epoch millisecond timestamp.
   */
  constructor(config: RuntimeConfig, startTime: number) {
    this.config = config;
    this.startTime = startTime;
  }

  /**
   * Update the runtime configuration held by this checker.
   *
   * Must be called whenever RuntimeEngine.updateConfig() is invoked so
   * that memory thresholds and feature flags stay in sync.
   *
   * @param config - The new {@link RuntimeConfig} to apply.
   */
  updateConfig(config: RuntimeConfig): void {
    this.config = config;
  }

  /**
   * Run all health checks and return the aggregated HealthStatus.
   *
   * The overall status is:
   * - 'healthy'   — all checks pass
   * - 'degraded'  — at least one check warns, none fail
   * - 'unhealthy' — at least one check fails
   *
   * @returns Current health status with individual check results.
   */
  check(): HealthStatus {
    const uptime_ms = Date.now() - this.startTime;
    const pid = process.pid;
    const now = Date.now();
    if (now - this.memoryCachedAt > MEMORY_CACHE_TTL_MS) {
      this.cachedMemoryMb = process.memoryUsage().rss / (1024 * 1024);
      this.memoryCachedAt = now;
    }
    const memoryMb = this.cachedMemoryMb;

    const checks: HealthCheck[] = [
      this.checkMemory(memoryMb),
      this.checkUptime(uptime_ms),
    ];

    const status = this.aggregateStatus(checks);

    return {
      status,
      uptime_ms,
      pid,
      memory_usage_mb: Math.round(memoryMb * 100) / 100,
      event_queue_depth: 0,
      active_workflows: 0,
      active_agents: 0,
      ipc_clients: 0,
      last_event_at: null,
      checks,
      features: this.getFeatureFlags(),
      version: ENGINE_VERSION,
    };
  }

  /**
   * Check current RSS memory usage against warning/critical thresholds.
   *
   * @param memoryMb - Current RSS memory in megabytes.
   * @returns HealthCheck result for memory.
   */
  private checkMemory(memoryMb: number): HealthCheck {
    const start = Date.now();

    const warnMb = this.config.health.memory_warn_mb;
    const criticalMb = this.config.health.memory_critical_mb;

    if (memoryMb > criticalMb) {
      return {
        name: 'memory',
        status: 'fail',
        message: `RSS memory ${memoryMb.toFixed(1)} MB exceeds critical threshold of ${criticalMb} MB`,
        duration_ms: Date.now() - start,
      };
    }

    if (memoryMb > warnMb) {
      return {
        name: 'memory',
        status: 'warn',
        message: `RSS memory ${memoryMb.toFixed(1)} MB exceeds warning threshold of ${warnMb} MB`,
        duration_ms: Date.now() - start,
      };
    }

    return {
      name: 'memory',
      status: 'pass',
      message: `RSS memory ${memoryMb.toFixed(1)} MB within limits`,
      duration_ms: Date.now() - start,
    };
  }

  /**
   * Check that the engine has been running for at least the minimum healthy
   * uptime window, indicating a stable startup.
   *
   * @param uptime_ms - Milliseconds since engine startup.
   * @returns HealthCheck result for uptime.
   */
  private checkUptime(uptime_ms: number): HealthCheck {
    const start = Date.now();

    if (uptime_ms < MIN_HEALTHY_UPTIME_MS) {
      return {
        name: 'uptime',
        status: 'warn',
        message: `Engine started ${uptime_ms} ms ago — still in startup window`,
        duration_ms: Date.now() - start,
      };
    }

    return {
      name: 'uptime',
      status: 'pass',
      message: `Engine running for ${Math.round(uptime_ms / 1000)} s`,
      duration_ms: Date.now() - start,
    };
  }

  /**
   * Build the feature flag map from runtime configuration.
   *
   * @returns Record of feature flag names to boolean enabled states.
   */
  private getFeatureFlags(): Record<string, boolean> {
    const flags: Record<string, boolean> = {};
    if (this.config.features) {
      for (const [key, value] of Object.entries(this.config.features)) {
        flags[key] = Boolean(value);
      }
    }
    return flags;
  }

  /**
   * Aggregate individual check statuses into a single overall status.
   *
   * @param checks - Array of completed health check results.
   * @returns 'healthy', 'degraded', or 'unhealthy'.
   */
  private aggregateStatus(
    checks: HealthCheck[]
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (checks.some((c) => c.status === 'fail')) return 'unhealthy';
    if (checks.some((c) => c.status === 'warn')) return 'degraded';
    return 'healthy';
  }
}
