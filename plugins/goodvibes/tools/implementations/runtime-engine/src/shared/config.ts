/**
 * Runtime Engine Configuration
 *
 * Defines the full configuration schema for the goodvibes runtime engine.
 * All sections have sensible production defaults that can be overridden via
 * .goodvibes/state/runtime-config.json in the project root.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { toErrorMessage } from './utils.js';
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
}

/** Event trigger configuration */
export interface TriggersConfig {
  /** Maximum number of registered triggers */
  max_triggers: number;
  /** Default cooldown in ms between consecutive fires of the same trigger */
  default_cooldown_ms: number;
  /** Maximum number of times a trigger may fire in a single session */
  max_fires_per_session: number;
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
  },
  triggers: {
    max_triggers: 100,
    default_cooldown_ms: 5000,
    max_fires_per_session: 50,
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
};

/**
 * Deep-merges two objects, with override values taking precedence.
 * Only merges own enumerable properties; nested objects are merged recursively.
 */
function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
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
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      process.stderr.write(
        `[runtime-engine] Warning: config at "${configPath}" is not an object — using defaults\n`,
      );
      return { ...DEFAULT_CONFIG };
    }
    return deepMerge(DEFAULT_CONFIG, parsed as Partial<RuntimeConfig>);
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
  const stateDir = join(projectRoot, '.goodvibes', 'state');
  const configPath = join(stateDir, 'runtime-config.json');
  const tmpPath = configPath + '.tmp';
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  renameSync(tmpPath, configPath);
}
