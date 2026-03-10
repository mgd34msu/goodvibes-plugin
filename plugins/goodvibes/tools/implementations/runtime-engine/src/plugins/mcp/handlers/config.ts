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

import { DEFAULT_CONFIG, saveConfig, VALID_EXECUTOR_MODES } from '../../../shared/config.js';
import type { RuntimeConfig } from '../../../shared/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonSync } from '../../../shared/file-io.js';
import { assertOptionalString, safeJsonParse, toErrorMessage } from '../../../shared/utils.js';
import { createLogger } from '../../../shared/logger.js';
import { ConfigError } from '../../../shared/errors.js';
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
  'workflows.action_timeout_ms',
  'workflows.max_transition_queue_depth',
  'triggers.max_triggers',
  'triggers.default_cooldown_ms',
  'triggers.max_fires_per_session',
  'triggers.handler_timeout_ms',
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
  'executor.daemon.tmux_session_name',
  'executor.daemon.tick_command',
  'executor.daemon.tick_interval_ms',
  'executor.daemon.auto_tick',
  'executor.daemon.eval_interval_ms',
  'executor.transport.auto_start',
  'executor.transport.rpc_timeout_ms',
  'executor.transport.migrate_state_on_join',
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
  // WRFC plugin config (persisted under runtime.wrfc in goodvibes.json)
  'wrfc.score_threshold',
  'wrfc.max_fix_attempts',
  'wrfc.auto_commit',
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
  ['workflows.action_timeout_ms', 'number'],
  ['workflows.max_transition_queue_depth', 'number'],
  ['triggers.max_triggers', 'number'],
  ['triggers.default_cooldown_ms', 'number'],
  ['triggers.max_fires_per_session', 'number'],
  ['triggers.handler_timeout_ms', 'number'],
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
  ['executor.daemon.tmux_session_name', 'string'],
  ['executor.daemon.tick_command', 'string'],
  ['executor.daemon.tick_interval_ms', 'number'],
  ['executor.daemon.auto_tick', 'boolean'],
  ['executor.daemon.eval_interval_ms', 'number'],
  ['executor.transport.auto_start', 'boolean'],
  ['executor.transport.rpc_timeout_ms', 'number'],
  ['executor.transport.migrate_state_on_join', 'boolean'],
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
  // WRFC plugin config
  ['wrfc.score_threshold', 'number'],
  ['wrfc.max_fix_attempts', 'number'],
  ['wrfc.auto_commit', 'boolean'],
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
    throw new ConfigError('setNestedValue: path must not be empty');
  }
  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    throw new ConfigError(`setNestedValue: path contains empty segment: "${path}"`);
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
    const action = assertOptionalString(params.action, 'action');

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
      const key = assertOptionalString(params.key, 'key');
      const config = ctx.transport ? await ctx.transport.getConfig() : ctx.getConfig();

      if (key) {
        // wrfc.* keys: read from state store or file, not from RuntimeConfig
        if (key.startsWith('wrfc.')) {
          const wrfcField = key.slice(5);
          const stateStoreKeyMap: Record<string, string> = {
            score_threshold: 'wrfc.config.min_review_score',
            max_fix_attempts: 'wrfc.config.max_fix_attempts',
            auto_commit: 'wrfc.config.auto_commit',
          };
          const stateKey = stateStoreKeyMap[wrfcField];
          const stateStore = ctx.getCoreStateStore?.();
          const value = stateStore && stateKey ? stateStore.get(stateKey) : undefined;
          return toSuccess({ key, value, source: 'state_store' }, ctx.version, uptimeMs, Date.now() - start);
        }
        const value = getNestedValue(config as unknown as Record<string, unknown>, key);
        return toSuccess({ key, value }, ctx.version, uptimeMs, Date.now() - start);
      }

      // Include wrfc config in full config dump
      const stateStore = ctx.getCoreStateStore?.();
      const wrfc = stateStore ? {
        score_threshold: stateStore.get('wrfc.config.min_review_score'),
        max_fix_attempts: stateStore.get('wrfc.config.max_fix_attempts'),
        auto_commit: stateStore.get('wrfc.config.auto_commit'),
      } : undefined;

      return toSuccess({ config, wrfc }, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── set ──────────────────────────────────────────────────────────────────
    if (action === 'set') {
      const key = assertOptionalString(params.key, 'key');
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

      // ── wrfc.* keys: separate persistence path ──────────────────────────
      // wrfc config lives under runtime.wrfc in goodvibes.json, not in RuntimeConfig.
      // Handle it directly: persist to file + update CoreStateStore.
      if (key.startsWith('wrfc.')) {
        const wrfcField = key.slice(5); // e.g. 'score_threshold'
        const stateStoreKeyMap: Record<string, string> = {
          score_threshold: 'wrfc.config.min_review_score',
          max_fix_attempts: 'wrfc.config.max_fix_attempts',
          auto_commit: 'wrfc.config.auto_commit',
        };
        const stateKey = stateStoreKeyMap[wrfcField];
        if (!stateKey) {
          return toError(
            `Unknown wrfc config field: '${wrfcField}'.`,
            ctx.version, uptimeMs, Date.now() - start
          );
        }

        // Persist to goodvibes.json under runtime.wrfc
        const goodvibesPath = join(ctx.projectRoot, '.goodvibes', 'goodvibes.json');
        try {
          let existing: Record<string, unknown> = {};
          try {
            existing = safeJsonParse<Record<string, unknown>>(readFileSync(goodvibesPath, 'utf-8'), {}) ?? {};
          } catch { /* file doesn't exist yet */ }
          if (typeof existing.runtime !== 'object' || existing.runtime === null) {
            existing.runtime = {};
          }
          const runtime = existing.runtime as Record<string, unknown>;
          if (typeof runtime.wrfc !== 'object' || runtime.wrfc === null) {
            runtime.wrfc = {};
          }
          (runtime.wrfc as Record<string, unknown>)[wrfcField] = value;
          writeJsonSync(goodvibesPath, existing);
        } catch (err) {
          return toError(
            `Failed to persist wrfc config: ${toErrorMessage(err)}`,
            ctx.version, uptimeMs, Date.now() - start
          );
        }

        // Update CoreStateStore so WRFC handlers pick it up immediately
        const stateStore = ctx.getCoreStateStore?.();
        if (stateStore) {
          stateStore.set(stateKey, value);
        }

        logger.info('WRFC config key set', { key, value, stateKey });
        return toSuccess(
          { key, value, persisted: true, state_store_key: stateKey },
          ctx.version, uptimeMs, Date.now() - start
        );
      }

      // Validate value-level constraints for specific keys
      if (key === 'executor.mode') {
        if (!(VALID_EXECUTOR_MODES as readonly string[]).includes(value as string)) {
          return toError(
            `Invalid value for 'executor.mode': "${value}". Must be one of: ${VALID_EXECUTOR_MODES.join(', ')}.`,
            ctx.version,
            uptimeMs,
            Date.now() - start
          );
        }
      }

      // Build an updated config with the new key value applied (deep clone to
      // prevent shallow-clone aliasing bugs when setNestedValue mutates in-place)
      const current = ctx.transport ? await ctx.transport.getConfig() : ctx.getConfig();
      const updated = setNestedValue(
        structuredClone(current) as unknown as Record<string, unknown>,
        key,
        value
      ) as unknown as RuntimeConfig;

      if (ctx.transport) {
        await ctx.transport.updateConfig(updated);
      } else {
        saveConfig(ctx.projectRoot, updated);
        ctx.updateConfig(updated);
      }
      logger.info('Config key set', { key, value });

      const result: Record<string, unknown> = { key, value, persisted: true };
      if (key === 'executor.mode') {
        result.warning = 'executor.mode change takes effect on next session restart. Most other config keys are hot-reloaded immediately.';
      }
      return toSuccess(
        result,
        ctx.version,
        uptimeMs,
        Date.now() - start
      );
    }

    // ── reset ─────────────────────────────────────────────────────────────────
    if (action === 'reset') {
      if (ctx.transport) {
        await ctx.transport.updateConfig(DEFAULT_CONFIG);
      } else {
        saveConfig(ctx.projectRoot, DEFAULT_CONFIG);
        ctx.updateConfig(DEFAULT_CONFIG);
      }
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
