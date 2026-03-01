/**
 * Handler for the runtime_config MCP tool.
 *
 * Supports three actions:
 * - get    — return full config, or config[key] if a dot-separated key is given
 * - set    — set config[key] = value and persist to disk
 * - reset  — restore DEFAULT_CONFIG and persist to disk
 *
 * Input schema: { action: 'get'|'set'|'reset', key?: string, value?: unknown }
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { DEFAULT_CONFIG, saveConfig } from '../../../shared/config.js';
import type { RuntimeConfig } from '../../../shared/config.js';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:config');

// ─── Config key validation ───────────────────────────────────────────────────

/**
 * Allowlist of valid dot-path config keys for runtime_config set.
 * Derived from the RuntimeConfig interface in shared/config.ts.
 */
export const VALID_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'ipc.socket_dir',
  'ipc.connect_timeout_ms',
  'ipc.query_timeout_ms',
  'queue.max_size',
  'queue.max_attempts',
  'queue.backoff_base_ms',
  'queue.backoff_multiplier',
  'queue.process_interval_ms',
  'persistence.checkpoint_interval_ms',
  'persistence.event_log_max_size_mb',
  'persistence.compact_after_hours',
  'persistence.state_dir',
  'workflows.max_active',
  'workflows.max_transitions_per_workflow',
  'workflows.wrfc_max_fix_iterations',
  'workflows.fix_loop_max_attempts',
  'triggers.max_triggers',
  'triggers.default_cooldown_ms',
  'triggers.max_fires_per_session',
  'health.check_interval_ms',
  'health.memory_warn_mb',
  'health.memory_critical_mb',
  'health.queue_depth_warn',
  'features.ipc_enabled',
  'features.workflows_enabled',
  'features.agents_enabled',
  'features.full_integration',
  'agents.max_concurrent',
  'agents.session_budget',
  'agents.budget_thresholds',
  'agents.default_budget',
  'agents.max_review_iterations',
  'executor.mode',
  'executor.daemon.clear_context_after_batch',
  'executor.daemon.tmux_session_name',
  'executor.daemon.tick_command',
  'executor.daemon.tick_interval_ms',
  'executor.daemon.auto_tick',
  'executor.budget.flat_cap_usd',
  'executor.budget.daily_cap_usd',
  'executor.budget.warning_threshold',
  'executor.budget.daily_reset_hour',
  'time.heartbeat.interval_ms',
  'time.heartbeat.enabled',
  'time.heartbeat.priority',
  'time.scheduler.max_scheduled_items',
  'time.scheduler.persist_schedules',
  'external.file_watcher.incoming_dir',
  'external.file_watcher.processed_dir',
  'external.file_watcher.error_dir',
  'external.file_watcher.max_files_per_scan',
  'external.http_listener.enabled',
  'external.http_listener.port',
  'external.http_listener.bind_mode',
  'external.http_listener.address',
  'external.http_listener.auth_token',
  'external.http_listener.max_payload_bytes',
]);

/**
 * Expected value types for each valid config key.
 * Used to validate the type of incoming values before persisting.
 */
export const CONFIG_KEY_TYPES: ReadonlyMap<string, 'boolean' | 'number' | 'string' | 'object'> = new Map([
  ['ipc.socket_dir', 'string'],
  ['ipc.connect_timeout_ms', 'number'],
  ['ipc.query_timeout_ms', 'number'],
  ['queue.max_size', 'number'],
  ['queue.max_attempts', 'number'],
  ['queue.backoff_base_ms', 'number'],
  ['queue.backoff_multiplier', 'number'],
  ['queue.process_interval_ms', 'number'],
  ['persistence.checkpoint_interval_ms', 'number'],
  ['persistence.event_log_max_size_mb', 'number'],
  ['persistence.compact_after_hours', 'number'],
  ['persistence.state_dir', 'string'],
  ['workflows.max_active', 'number'],
  ['workflows.max_transitions_per_workflow', 'number'],
  ['workflows.wrfc_max_fix_iterations', 'number'],
  ['workflows.fix_loop_max_attempts', 'number'],
  ['triggers.max_triggers', 'number'],
  ['triggers.default_cooldown_ms', 'number'],
  ['triggers.max_fires_per_session', 'number'],
  ['health.check_interval_ms', 'number'],
  ['health.memory_warn_mb', 'number'],
  ['health.memory_critical_mb', 'number'],
  ['health.queue_depth_warn', 'number'],
  ['features.ipc_enabled', 'boolean'],
  ['features.workflows_enabled', 'boolean'],
  ['features.agents_enabled', 'boolean'],
  ['features.full_integration', 'boolean'],
  ['agents.max_concurrent', 'number'],
  ['agents.session_budget', 'number'],
  ['agents.budget_thresholds', 'object'],
  ['agents.default_budget', 'number'],
  ['agents.max_review_iterations', 'number'],
  ['executor.mode', 'string'],
  ['executor.daemon.clear_context_after_batch', 'boolean'],
  ['executor.daemon.tmux_session_name', 'string'],
  ['executor.daemon.tick_command', 'string'],
  ['executor.daemon.tick_interval_ms', 'number'],
  ['executor.daemon.auto_tick', 'boolean'],
  ['executor.budget.flat_cap_usd', 'number'],
  ['executor.budget.daily_cap_usd', 'number'],
  ['executor.budget.warning_threshold', 'number'],
  ['executor.budget.daily_reset_hour', 'number'],
  ['time.heartbeat.interval_ms', 'number'],
  ['time.heartbeat.enabled', 'boolean'],
  ['time.heartbeat.priority', 'number'],
  ['time.scheduler.max_scheduled_items', 'number'],
  ['time.scheduler.persist_schedules', 'boolean'],
  ['external.file_watcher.incoming_dir', 'string'],
  ['external.file_watcher.processed_dir', 'string'],
  ['external.file_watcher.error_dir', 'string'],
  ['external.file_watcher.max_files_per_scan', 'number'],
  ['external.http_listener.enabled', 'boolean'],
  ['external.http_listener.port', 'number'],
  ['external.http_listener.bind_mode', 'string'],
  ['external.http_listener.address', 'string'],
  ['external.http_listener.auth_token', 'string'],
  ['external.http_listener.max_payload_bytes', 'number'],
]);

// ─── Nested key helpers ────────────────────────────────────────────────────

/**
 * Read a dot-separated path from an object.
 *
 * @param obj  - Source object.
 * @param path - Dot-separated key path (e.g. 'server.port').
 * @returns The value at the path, or undefined if the path does not exist.
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Set a value at a dot-separated path within an object (mutates in-place).
 *
 * Intermediate objects are created automatically if missing.
 *
 * @param obj   - Target object.
 * @param path  - Dot-separated key path (e.g. 'server.port').
 * @param value - Value to assign.
 * @returns The mutated target object.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  if (!path) {
    throw new Error('setNestedValue: path must not be empty');
  }
  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    throw new Error(`setNestedValue: path contains empty segment: "${path}"`);
  }
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (
      current[segment] === undefined ||
      current[segment] === null ||
      typeof current[segment] !== 'object'
    ) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
  return obj;
}

// ─── runtime_config handler ────────────────────────────────────────────────

/**
 * Handle runtime_config tool calls.
 */
export const handleRuntimeConfig = async (
  args: unknown,
  ctx: HandlerContext
): Promise<CallToolResult> => {
  const start = Date.now();
  const uptimeMs = ctx.getUptime();

  try {
    // Validate args before casting
    if (args === null || args === undefined || typeof args !== 'object') {
      return toError(
        'Invalid arguments: expected an object',
        ctx.version,
        uptimeMs,
        Date.now() - start
      );
    }
    const params = args as Record<string, unknown>;
    const action = params.action as string | undefined;

    if (!action) {
      return toError(
        "Missing required field: action. Use 'get', 'set', or 'reset'.",
        ctx.version,
        uptimeMs,
        Date.now() - start
      );
    }

    // ── get ──────────────────────────────────────────────────────────────────
    if (action === 'get') {
      const key = params.key as string | undefined;
      const config = ctx.getConfig();

      if (key) {
        const value = getNestedValue(config as unknown as Record<string, unknown>, key);
        return toSuccess({ key, value }, ctx.version, uptimeMs, Date.now() - start);
      }

      return toSuccess({ config }, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── set ──────────────────────────────────────────────────────────────────
    if (action === 'set') {
      const key = params.key as string | undefined;
      const value = params.value;

      if (!key) {
        return toError(
          "Missing required field: key.",
          ctx.version,
          uptimeMs,
          Date.now() - start
        );
      }
      if (value === undefined) {
        return toError(
          "Missing required field: value.",
          ctx.version,
          uptimeMs,
          Date.now() - start
        );
      }

      // Validate key against allowlist (FIND-007)
      if (!VALID_CONFIG_KEYS.has(key)) {
        return toError(
          `Invalid config key: '${key}'. Use runtime_config get to see valid keys.`,
          ctx.version,
          uptimeMs,
          Date.now() - start
        );
      }

      // Validate value type against expected type (FIND-008)
      const expectedType = CONFIG_KEY_TYPES.get(key);
      if (expectedType !== undefined) {
        const actualType = Array.isArray(value) ? 'object' : typeof value;
        if (actualType !== expectedType) {
          return toError(
            `Invalid value type for '${key}': expected ${expectedType}, got ${actualType}.`,
            ctx.version,
            uptimeMs,
            Date.now() - start
          );
        }
      }

      // Build an updated config with the new key value applied (deep clone to
      // prevent shallow-clone aliasing bugs when setNestedValue mutates in-place)
      const current = ctx.getConfig();
      const updated = setNestedValue(
        JSON.parse(JSON.stringify(current)) as unknown as Record<string, unknown>,
        key,
        value
      ) as unknown as RuntimeConfig;

      saveConfig(ctx.projectRoot, updated);
      ctx.updateConfig(updated);
      logger.info('Config key set', { key, value });

      return toSuccess(
        { key, value, persisted: true },
        ctx.version,
        uptimeMs,
        Date.now() - start
      );
    }

    // ── reset ─────────────────────────────────────────────────────────────────
    if (action === 'reset') {
      saveConfig(ctx.projectRoot, DEFAULT_CONFIG);
      ctx.updateConfig(DEFAULT_CONFIG);
      logger.info('Config reset to defaults');
      return toSuccess(
        { config: DEFAULT_CONFIG, reset: true },
        ctx.version,
        uptimeMs,
        Date.now() - start
      );
    }

    return toError(
      `Unknown action: '${action}'. Use 'get', 'set', or 'reset'.`,
      ctx.version,
      uptimeMs,
      Date.now() - start
    );
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_config failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
