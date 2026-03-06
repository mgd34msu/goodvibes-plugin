/**
 * Runtime Engine Configuration
 *
 * Defines the full configuration schema for the goodvibes runtime engine.
 * All sections have sensible production defaults that can be overridden via
 * .goodvibes/goodvibes.json (under the "runtime" key) in the project root.
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

/** Valid executor modes — single source of truth for validation. */
export const VALID_EXECUTOR_MODES: ReadonlyArray<ExecutorMode> = ['engaged', 'daemon', 'hybrid'];

/** Daemon-specific configuration. */
export interface DaemonConfig {
  /** Whether to clear context after processing each event batch. */
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
  /** Reconnection configuration for RemoteTransport. */
  reconnect: {
    /** Enable auto-reconnect on socket close/error. Default: true. */
    enabled: boolean;
    /** Maximum reconnection attempts before giving up. Default: 10. */
    max_attempts: number;
    /** Base delay in ms for exponential backoff. Default: 100. */
    base_delay_ms: number;
    /** Maximum delay cap in ms. Default: 10000. */
    max_delay_ms: number;
  };
  /** Health check ping interval in ms (default: 10000). */
  health_check_interval_ms?: number;
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

/** Dev server health monitor configuration (Layer 3). Opt-in — disabled by default. */
export interface DevServerConfig {
  /** Whether the dev server monitor is enabled. Default: false. */
  enabled: boolean;
  /** The command used to start the dev server (informational only). */
  command: string;
  /** Port to health-check. Default: 3000. */
  port: number;
  /** Optional URL override for health checks. Defaults to http://localhost:{port}. */
  health_url?: string;
  /** Interval in ms between health checks. Default: 15000. */
  check_interval_ms?: number;
}

/** Tool block rule for the tool gating system. */
export interface ToolBlockRule {
  /** Glob pattern matching tool names: 'Bash', 'precision_exec', '*', etc. */
  tool_pattern: string;
  /** Condition under which the rule fires. */
  condition: 'always' | 'budget_exceeded' | 'workflow_phase' | 'custom';
  /** Human-readable reason shown when the tool is blocked. */
  message?: string;
}

/** Top-level configuration for the tool gating system. */
export interface ToolGatingConfig {
  /** Whether tool gating is active. When false, all tools are allowed. */
  enabled: boolean;
  /** When true, bypasses all rules and allows all tools unconditionally. */
  force_allow_all: boolean;
  /** Ordered list of block rules. First match wins. */
  rules: ToolBlockRule[];
}

/** Which context sources to include in injected output. */
export type ContextSource = 'workflow_state' | 'agent_roster' | 'budget_status';

/** Configuration for the context injection system. */
export interface ContextInjectionConfig {
  /** Whether context injection is active. When false, returns empty context. */
  enabled: boolean;
  /** Ordered list of sources to include in the injected context. */
  include: Array<ContextSource>;
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
  /** Dev server health monitor settings. Opt-in — disabled by default. */
  devserver?: DevServerConfig;
  /** Tool gating settings — blocks specific tools under configurable conditions. */
  tool_gating?: ToolGatingConfig;
  /** Context injection settings — assembles dynamic runtime context for agents. */
  context_injection?: ContextInjectionConfig;
}

/** Default configuration values -- safe for all environments */
export const DEFAULT_CONFIG: RuntimeConfig = {
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
      reconnect: {
        enabled: true,
        max_attempts: 10,
        base_delay_ms: 100,
        max_delay_ms: 10_000,
      },
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
  devserver: {
    enabled: false,
    command: 'npm run dev',
    port: 3000,
    check_interval_ms: 15_000,
  },
  tool_gating: {
    enabled: false,
    force_allow_all: false,
    rules: [],
  },
  context_injection: {
    enabled: false,
    include: [],
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
 * Tries `{projectRoot}/.goodvibes/goodvibes.json` first (under the "runtime" key).
 * Falls back to `{projectRoot}/.goodvibes/state/runtime-config.json` for backwards compatibility.
 * Deep-merges with {@link DEFAULT_CONFIG}. Missing keys fall back to defaults.
 *
 * @param projectRoot - Optional path to the project root directory.
 *   Defaults to `process.cwd()`.
 * @returns Fully resolved {@link RuntimeConfig}.
 */
export function loadConfig(projectRoot?: string): RuntimeConfig {
  const root = resolveRoot(projectRoot);

  // Try goodvibes.json first (new location, under "runtime" key)
  const goodvibesPath = join(root, '.goodvibes', 'goodvibes.json');
  try {
    const raw = readFileSync(goodvibesPath, 'utf-8');
    const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && 'runtime' in parsed) {
      const runtimeSection = parsed.runtime;
      if (typeof runtimeSection === 'object' && runtimeSection !== null && !Array.isArray(runtimeSection)) {
        // Filter to only RuntimeConfig keys to avoid unknown keys (e.g. 'wrfc') polluting the config
        const knownKeys = Object.keys(DEFAULT_CONFIG) as (keyof RuntimeConfig)[];
        const filtered: Partial<RuntimeConfig> = {};
        for (const key of knownKeys) {
          if (key in (runtimeSection as Record<string, unknown>)) {
            (filtered as Record<string, unknown>)[key] = (runtimeSection as Record<string, unknown>)[key];
          }
        }
        const merged = deepMerge(DEFAULT_CONFIG, filtered);
        validateConfig(merged);
        process.stderr.write(
          `[runtime-engine] Config loaded from ${goodvibesPath} (http_listener.enabled=${merged.external.http_listener.enabled})\n`,
        );
        return merged;
      }
      process.stderr.write(
        `[runtime-engine] Warning: goodvibes.json has no valid "runtime" object — trying legacy config\n`,
      );
    } else {
      process.stderr.write(
        `[runtime-engine] Warning: goodvibes.json has no "runtime" key — trying legacy config\n`,
      );
    }
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
      process.stderr.write(
        `[runtime-engine] Warning: failed to read goodvibes.json at "${goodvibesPath}": ${toErrorMessage(err)} — trying legacy config\n`,
      );
    }
    // ENOENT is silent — normal first-run, no goodvibes.json yet
  }

  // Fall back to legacy runtime-config.json
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
    process.stderr.write(
      `[runtime-engine] Config loaded from legacy ${configPath} (http_listener.enabled=${merged.external.http_listener.enabled})\n`,
    );
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
 * Writes RuntimeConfig keys under the "runtime" key in `{projectRoot}/.goodvibes/goodvibes.json`,
 * preserving all other keys in that file (e.g. sandbox, fetch, runtime.wrfc).
 *
 * @param projectRoot - Path to the project root directory.
 * @param config - The {@link RuntimeConfig} to persist.
 */
export function saveConfig(projectRoot: string, config: RuntimeConfig): void {
  const goodvibesPath = join(projectRoot, '.goodvibes', 'goodvibes.json');
  let existing: Record<string, unknown> = {};
  try {
    const raw = readFileSync(goodvibesPath, 'utf-8');
    existing = safeJsonParse<Record<string, unknown>>(raw, {}) ?? {};
  } catch { /* file doesn't exist yet or unreadable — start fresh */ }

  // Merge only RuntimeConfig keys into runtime section, preserving non-RuntimeConfig keys like 'wrfc'
  const existingRuntime = (typeof existing.runtime === 'object' && existing.runtime !== null)
    ? existing.runtime as Record<string, unknown>
    : {};
  const configKeys = Object.keys(DEFAULT_CONFIG) as (keyof RuntimeConfig)[];
  const updatedRuntime: Record<string, unknown> = { ...existingRuntime };
  for (const key of configKeys) {
    updatedRuntime[key] = config[key] as unknown;
  }
  existing.runtime = updatedRuntime;
  writeJsonSync(goodvibesPath, existing);
}

/**
 * Ensures all RuntimeConfig sections exist under the "runtime" key in goodvibes.json.
 *
 * Reads goodvibes.json and adds any missing top-level RuntimeConfig sections with
 * their defaults. Never overwrites existing values. A no-op if goodvibes.json does not exist.
 *
 * @param projectRoot - Optional path to the project root directory.
 *   Defaults to `process.cwd()`.
 */
export function ensureRuntimeSections(projectRoot?: string): void {
  const root = resolveRoot(projectRoot);
  const goodvibesPath = join(root, '.goodvibes', 'goodvibes.json');

  let existing: Record<string, unknown>;
  try {
    const raw = readFileSync(goodvibesPath, 'utf-8');
    existing = safeJsonParse<Record<string, unknown>>(raw, {}) ?? {};
  } catch {
    return; // No goodvibes.json — nothing to ensure
  }

  if (typeof existing.runtime !== 'object' || existing.runtime === null) {
    existing.runtime = {};
  }

  const runtime = existing.runtime as Record<string, unknown>;
  const defaults = DEFAULT_CONFIG as unknown as Record<string, unknown>;
  let changed = false;

  for (const key of Object.keys(defaults)) {
    if (!(key in runtime)) {
      runtime[key] = defaults[key];
      changed = true;
    }
  }

  if (changed) {
    try {
      writeJsonSync(goodvibesPath, existing);
    } catch (err) {
      process.stderr.write(
        `[runtime-engine] Warning: failed to write runtime defaults to goodvibes.json: ${toErrorMessage(err)}\n`,
      );
    }
  }
}
