/**
 * Runtime Engine Configuration
 *
 * Defines the full configuration schema for the goodvibes runtime engine.
 * All sections have sensible production defaults that can be overridden via
 * .goodvibes/state/runtime-config.json in the project root.
 */

import { readFileSync } from 'node:fs';
import { writeJsonSync } from './file-io.js';
import { toErrorMessage, safeJsonParse } from './utils.js';
import { ConfigError } from './errors.js';
import { DEFAULT_HTTP_LISTENER_PORT } from './constants.js';
import { join } from 'node:path';
import { userInfo, tmpdir } from 'node:os';

/** IPC socket and timeout configuration */
export interface IpcConfig {
  /** Directory for Unix domain sockets */
  socket_dir: string;
  /** Timeout in ms for establishing IPC connections */
  connect_timeout_ms: number;
  /** Timeout in ms for individual IPC queries */
  query_timeout_ms: number;
}

/** Message queue configuration */
export interface QueueConfig {
  /** Maximum number of items held in the queue */
  max_size: number;
  /** Maximum delivery attempts before a message is dead-lettered */
  max_attempts: number;
  /** Base delay in ms for exponential backoff retries */
  backoff_base_ms: number;
  /** Multiplier applied on each retry (e.g. 2 = 1s, 2s, 4s, ...) */
  backoff_multiplier: number;
  /** Interval in ms between queue processing ticks */
  process_interval_ms: number;
}

/** Persistence and state checkpoint configuration */
export interface PersistenceConfig {
  /** Interval in ms between automatic state checkpoints */
  checkpoint_interval_ms: number;
  /** Maximum event log file size in megabytes before rotation */
  event_log_max_size_mb: number;
  /** Hours before the event log is compacted */
  compact_after_hours: number;
  /** Directory relative to project root for persisted state */
  state_dir: string;
}

/** Workflow execution configuration */
export interface WorkflowsConfig {
  /** Maximum concurrently active workflows */
  max_active: number;
  /** Maximum state transitions per workflow before it is halted */
  max_transitions_per_workflow: number;
  /** Maximum Write-Review-Fix-Check fix iterations before failing */
  wrfc_max_fix_iterations: number;
  /** Maximum attempts in a fix loop before aborting */
  fix_loop_max_attempts: number;
  /**
   * Maximum time in milliseconds that a state action (on_enter, on_exit, or
   * transition action) may run before it is forcibly cancelled and the
   * transition is rolled back. Defaults to 30 000 ms (30 seconds).
   */
  action_timeout_ms: number;
  /**
   * Maximum number of transitions that may be queued while another is
   * in-flight for the same workflow instance. Requests that exceed this
   * limit are dropped and logged as a warning. Defaults to 10.
   */
  max_transition_queue_depth: number;
}

/** Event trigger configuration */
export interface TriggersConfig {
  /** Maximum number of registered triggers */
  max_triggers: number;
  /** Default cooldown in ms between consecutive fires of the same trigger */
  default_cooldown_ms: number;
  /** Maximum number of times a trigger may fire in a single session */
  max_fires_per_session: number;
  /** Timeout in ms for individual invoke_handler calls (0 = disabled). Default: 30000. */
  handler_timeout_ms: number;
}

/** Health monitoring configuration */
export interface HealthConfig {
  /** Interval in ms between health checks */
  check_interval_ms: number;
  /** Heap usage in MB that triggers a warning */
  memory_warn_mb: number;
  /** Heap usage in MB that triggers a critical alert */
  memory_critical_mb: number;
  /** Queue depth that triggers a warning */
  queue_depth_warn: number;
}

/** Agent coordinator configuration */
export interface AgentsConfig {
  /** Maximum number of concurrently active (pending + running) agents. */
  max_concurrent: number;
  /** Session-level token budget across all agents (0 = unlimited). */
  session_budget: number;
  /** Threshold percentages at which budget_warning events are emitted. */
  budget_thresholds: number[];
  /** Default token budget allocated to each agent when none is specified. */
  default_budget: number;
  /** Maximum number of WRFC review iterations before escalating. */
  max_review_iterations: number;
}

/** Executor mode for the runtime engine session. */
export type ExecutorMode = 'engaged' | 'daemon' | 'hybrid';

/** Daemon-specific configuration. */
export interface DaemonConfig {
  /** Whether to clear context after processing each event batch. */
  clear_context_after_batch: boolean;
  /** Name of the tmux session running the daemon. */
  tmux_session_name: string;
  /** Command string that triggers a tick (typed into the session). */
  tick_command: string;
  /** Interval in ms between automatic daemon ticks sent via tmux (0 = disabled). */
  tick_interval_ms: number;
  /** Whether the daemon tick scheduler is enabled. When false, no automatic ticks are sent. */
  auto_tick: boolean;
  /** Interval in ms at which the TickDriver evaluates the pipeline. Default: 10000 (10s). */
  eval_interval_ms: number;
}

/** Transport daemon config — hosts RuntimeEngine as a standalone process. */
export interface DaemonTransportConfig {
  /** Whether to auto-start the transport daemon on session start. Default: false. */
  auto_start: boolean;
  /** Timeout in ms for daemon RPC calls. Default: 5000. */
  rpc_timeout_ms: number;
  /** Whether to migrate local state into daemon on join. Default: false. */
  migrate_state_on_join: boolean;
}

/** Two-tier budget configuration for executor cost controls. */
export interface ExecutorBudgetConfig {
  /** Total spending ceiling in USD. When hit, processing pauses. Optional. */
  flat_cap_usd?: number;
  /** Per-day spending limit in USD. Resets at reset_hour. Optional. */
  daily_cap_usd?: number;
  /** Fraction (0-1) at which a warning event fires. Default: 0.8 (80%). */
  warning_threshold: number;
  /** Hour of day (0-23) at which the daily cap resets. Default: 0 (midnight). */
  daily_reset_hour: number;
}

/** Complete executor configuration section. */
export interface ExecutorConfig {
  /** Current executor mode. Default: 'engaged'. */
  mode: ExecutorMode;
  /** Daemon-specific settings. Only consulted when mode is 'daemon' or 'hybrid'. */
  daemon: DaemonConfig;
  /** Two-tier cost controls. Active in all modes. */
  budget: ExecutorBudgetConfig;
  /** Transport daemon settings. Only consulted when mode is 'daemon' or 'hybrid'. */
  transport: DaemonTransportConfig;
}

/** Heartbeat configuration for the time plugin. */
export interface HeartbeatPluginConfig {
  /** Interval in ms between heartbeat pulses. Default: 60000 (60s). */
  interval_ms: number;
  /** Whether the heartbeat is enabled. Default: true. */
  enabled: boolean;
  /** Priority of heartbeat events. Default: 10. */
  priority?: number;
}

/** Scheduler configuration for the time plugin. */
export interface SchedulerPluginConfig {
  /** Maximum number of scheduled items. Default: 100. */
  max_scheduled_items: number;
  /** Whether schedules persist across restarts. Default: true. */
  persist_schedules: boolean;
}

/** Time plugin configuration (Layer 3). */
export interface TimePluginRuntimeConfig {
  /** Heartbeat pulse settings. */
  heartbeat: HeartbeatPluginConfig;
  /** Event scheduler settings. */
  scheduler: SchedulerPluginConfig;
}

/** File watcher configuration for the external plugin. */
export interface FileWatcherPluginConfig {
  /** Directory to watch for incoming event files. */
  incoming_dir: string;
  /** Directory for successfully processed files. */
  processed_dir: string;
  /** Directory for files that failed processing. */
  error_dir: string;
  /** Maximum files to process per scan cycle. Default: 50. */
  max_files_per_scan: number;
}

/** HTTP webhook listener configuration for the external plugin. */
export interface HttpListenerPluginConfig {
  /** Whether the HTTP listener is enabled. Default: false. */
  enabled: boolean;
  /** Port to listen on. Default: 3847. */
  port: number;
  /** Bind strategy: localhost (127.0.0.1), local_network (0.0.0.0), or other (custom address). */
  bind_mode: 'localhost' | 'local_network' | 'other';
  /** Resolved bind address. Set automatically for localhost/local_network; user-provided for 'other'. */
  address: string;
  /** Optional bearer token for webhook authentication. */
  auth_token?: string;
  /** Maximum request body size in bytes. Default: 1MB. */
  max_payload_bytes: number;
}

/** External plugin configuration (Layer 3). */
export interface ExternalPluginRuntimeConfig {
  /** File-drop event ingestion settings. */
  file_watcher: FileWatcherPluginConfig;
  /** HTTP webhook listener settings. Disabled by default for security. */
  http_listener: HttpListenerPluginConfig;
}

/** Feature flags -- controls which subsystems are active */
export interface FeaturesConfig {
  /** Whether IPC communication is enabled */
  ipc_enabled: boolean;
  /** Whether workflow orchestration is enabled */
  workflows_enabled: boolean;
  /** Whether agent spawning is enabled */
  agents_enabled: boolean;
  /** Whether full integration mode (all subsystems) is active */
  full_integration: boolean;
}

/** Complete runtime engine configuration */
export interface RuntimeConfig {
  /** Config schema version. Not used for engine version reporting — see ENGINE_VERSION in constants.ts */
  schema_version: string;
  ipc: IpcConfig;
  queue: QueueConfig;
  persistence: PersistenceConfig;
  workflows: WorkflowsConfig;
  triggers: TriggersConfig;
  health: HealthConfig;
  features: FeaturesConfig;
  agents: AgentsConfig;
  executor: ExecutorConfig;
  /** Time plugin settings (heartbeat, scheduler). */
  time: TimePluginRuntimeConfig;
  /** External event ingestion settings (file watcher, HTTP listener). */
  external: ExternalPluginRuntimeConfig;
}

/** Default configuration values -- safe for all environments */
export const DEFAULT_CONFIG: RuntimeConfig = {
  schema_version: '1.0.0',
  ipc: {
    socket_dir: (() => {
      try {
        const xdg = process.env['XDG_RUNTIME_DIR'];
        if (xdg) return `${xdg}/goodvibes`;
        const uid = process.getuid?.() ?? (() => { try { return userInfo().uid; } catch { return 0; } })();
        return `${tmpdir()}/goodvibes-${uid}`;
      } catch {
        return `${tmpdir()}/goodvibes`;
      }
    })(),
    connect_timeout_ms: 500,
    query_timeout_ms: 200,
  },
  queue: {
    max_size: 10000,
    max_attempts: 3,
    backoff_base_ms: 1000,
    backoff_multiplier: 2,
    process_interval_ms: 10,
  },
  persistence: {
    checkpoint_interval_ms: 30000,
    event_log_max_size_mb: 50,
    compact_after_hours: 24,
    state_dir: '.goodvibes/state',
  },
  workflows: {
    max_active: 10,
    max_transitions_per_workflow: 100,
    wrfc_max_fix_iterations: 3,
    fix_loop_max_attempts: 5,
    action_timeout_ms: 30_000,
    max_transition_queue_depth: 10,
  },
  triggers: {
    max_triggers: 100,
    default_cooldown_ms: 5000,
    max_fires_per_session: 50,
    handler_timeout_ms: 30_000,
  },
  health: {
    check_interval_ms: 60000,
    memory_warn_mb: 256,
    memory_critical_mb: 512,
    queue_depth_warn: 100,
  },
  features: {
    ipc_enabled: true,
    workflows_enabled: true,
    agents_enabled: true,
    full_integration: true,
  },
  agents: {
    max_concurrent: 6,
    session_budget: 0, // 0 = unlimited
    budget_thresholds: [50, 80, 95],
    default_budget: 200000, // tokens
    max_review_iterations: 3,
  },
  executor: {
    mode: 'engaged',
    daemon: {
      clear_context_after_batch: true,
      tmux_session_name: 'claude-daemon',
      tick_command: 'tick',
      tick_interval_ms: 30_000,
      auto_tick: true,
      eval_interval_ms: 10_000,
    },
    budget: {
      flat_cap_usd: undefined,
      daily_cap_usd: undefined,
      warning_threshold: 0.8,
      daily_reset_hour: 0,
    },
    transport: {
      auto_start: false,
      rpc_timeout_ms: 5000,
      migrate_state_on_join: false,
    },
  },
  time: {
    heartbeat: {
      interval_ms: 60_000,
      enabled: true,
    },
    scheduler: {
      max_scheduled_items: 100,
      persist_schedules: true,
    },
  },
  external: {
    file_watcher: {
      incoming_dir: '.goodvibes/events/incoming',
      processed_dir: '.goodvibes/events/processed',
      error_dir: '.goodvibes/events/errors',
      max_files_per_scan: 50,
    },
    http_listener: {
      enabled: false,
      port: DEFAULT_HTTP_LISTENER_PORT,
      bind_mode: 'localhost',
      address: '127.0.0.1',
      max_payload_bytes: 1 * 1024 * 1024, // 1MB
    },
  },
};

/**
 * Deep-merges two objects, with override values taking precedence.
 * Only merges own enumerable properties; nested objects are merged recursively.
 */
function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      overrideVal !== undefined &&
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null
    ) {
      result[key] = deepMerge(baseVal as object, overrideVal as object) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Validates that critical numeric config fields are non-negative finite numbers.
 *
 * @param config - The resolved config to validate.
 * @throws {ConfigError} If any critical numeric field is invalid.
 */
function validateConfig(config: RuntimeConfig): void {
  const nums: [string, number][] = [
    ['persistence.checkpoint_interval_ms', config.persistence.checkpoint_interval_ms],
    ['health.memory_warn_mb', config.health.memory_warn_mb],
    ['health.memory_critical_mb', config.health.memory_critical_mb],
    ['executor.daemon.tick_interval_ms', config.executor.daemon.tick_interval_ms],
    ['executor.transport.rpc_timeout_ms', config.executor.transport.rpc_timeout_ms],
  ];
  for (const [name, val] of nums) {
    if (typeof val !== 'number' || val < 0 || !Number.isFinite(val)) {
      throw new ConfigError(`Invalid config: ${name} must be a non-negative finite number, got ${val}`);
    }
  }
}

/**
 * Resolves the project root directory.
 *
 * @param projectRoot - Optional explicit project root path.
 *   Defaults to `process.cwd()` when not provided.
 */
function resolveRoot(projectRoot?: string): string {
  return projectRoot ?? process.cwd();
}

/**
 * Loads the runtime configuration for a project.
 *
 * Reads from `{projectRoot}/.goodvibes/state/runtime-config.json` if it exists
 * and deep-merges it with {@link DEFAULT_CONFIG}. Missing keys fall back to defaults.
 *
 * @param projectRoot - Optional path to the project root directory.
 *   Defaults to `process.cwd()`.
 * @returns Fully resolved {@link RuntimeConfig}.
 */
export function loadConfig(projectRoot?: string): RuntimeConfig {
  const root = resolveRoot(projectRoot);
  const configPath = join(root, '.goodvibes', 'state', 'runtime-config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed: unknown = safeJsonParse<unknown>(raw, null);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      process.stderr.write(
        `[runtime-engine] Warning: config at "${configPath}" is not an object — using defaults\n`,
      );
      return { ...DEFAULT_CONFIG };
    }
    const merged = deepMerge(DEFAULT_CONFIG, parsed as Partial<RuntimeConfig>);
    validateConfig(merged);
    return merged;
  } catch (err) {
    // ENOENT means the config file does not exist yet (normal first-run).
    // Any other error (parse failure, permission denied, etc.) is unexpected
    // and should be surfaced so corrupted configs are not silently ignored.
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // silent - normal first run
    } else {
      // Note: process.stderr.write is used intentionally here. loadConfig is
      // called during bootstrap before the structured logger is initialised.
      // Direct stderr output is the only safe mechanism at this stage.
      // Approved: process.stderr.write usage here is an intentional pre-logger pattern.
      process.stderr.write(
        `[runtime-engine] Warning: failed to load config at "${configPath}": ${
          toErrorMessage(err)
        } — using defaults\n`,
      );
    }
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Persists the runtime configuration to disk.
 *
 * Creates the state directory if it does not exist, then writes the full
 * config as formatted JSON to `{projectRoot}/.goodvibes/state/runtime-config.json`.
 *
 * @param config - The {@link RuntimeConfig} to persist.
 * @param projectRoot - Optional path to the project root directory.
 *   Defaults to `process.cwd()`.
 */
export function saveConfig(projectRoot: string, config: RuntimeConfig): void {
  const configPath = join(projectRoot, '.goodvibes', 'state', 'runtime-config.json');
  writeJsonSync(configPath, config);
}
