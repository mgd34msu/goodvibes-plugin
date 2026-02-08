/**
 * Runtime configuration for precision-engine.
 * Singleton pattern - config loaded on first access.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logging.js';

/**
 * Configuration schema for precision-engine.
 */
export interface PrecisionEngineConfig {
  /** Path boundary enforcement (default: false) */
  sandbox: boolean;
  /** Per-tool verbosity defaults */
  verbosity_defaults?: Record<string, string>;
  /** Maximum diff characters before truncation (default: 10000) */
  max_diff_chars?: number;
  /** Maximum file size in bytes before size gate prompts pagination (default: 524288 = 512KB) */
  max_file_bytes?: number;
  /** Maximum estimated tokens before size gate prompts pagination (default: 50000) */
  max_token_estimate?: number;
  /** Lines per page when paginating large file reads (default: 200) */
  page_size_lines?: number;
  /** Slow filesystem detection threshold in ms (default: 50) */
  slow_fs_stat_threshold_ms?: number;
  /** Known slow filesystem prefixes (default: ["/mnt/"]) */
  slow_fs_known_prefixes?: string[];
  /** Cache mode: 'hash_only' (minimal memory) or 'with_content' (enables diffs). Default: 'with_content' */
  cache_mode?: 'hash_only' | 'with_content';
  /** Maximum memory budget for file cache in megabytes. Default: 200 MB */
  cache_max_mb?: number;
  /** Enable safe overwrite protection (auto-backup on first-time overwrite). Default: true */
  safe_overwrite?: boolean;
  /** Backup directory for safe overwrites. Default: '.goodvibes/.backups' */
  backup_dir?: string;
  /** Skip backup when file is clean in git (recoverable via git checkout). Default: true */
  backup_git_clean_skip?: boolean;

  /** Exec defaults */
  exec_max_output_chars?: number;
  exec_default_timeout_ms?: number;
  exec_max_output_lines?: number;
  exec_overflow_dir?: string;
  exec_max_background?: number;
  exec_history_max?: number;

  /** Extensible for future config */
  [key: string]: unknown;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: PrecisionEngineConfig = {
  sandbox: false,
};

/**
 * In-memory config cache.
 */
let cachedConfig: PrecisionEngineConfig | null = null;

/**
 * Clean config for persistence (defaults + file content, NO env overrides).
 */
let configForFile: PrecisionEngineConfig | null = null;

/**
 * Pending fire-and-forget persist operation.
 */
let pendingPersist: Promise<void> | null = null;

/**
 * Persist config to file (only file content + defaults, NOT env overrides).
 * Used by both sync (fire-and-forget) and async (await) code paths.
 */
async function persistConfig(configToPersist: PrecisionEngineConfig): Promise<void> {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure config directory exists
  await fs.promises.mkdir(configDir, { recursive: true });

  // Write config file
  await fs.promises.writeFile(
    configPath,
    JSON.stringify(configToPersist, null, 2) + '\n',
    'utf-8'
  );

  logger.debug('Persisted config to file', { path: configPath });
}

/**
 * Apply defaults and env var overrides to loaded file config.
 * Shared between sync and async load paths.
 * Returns info about whether any default keys were missing from file.
 */
function applyConfigOverrides(
  fileConfig: Partial<PrecisionEngineConfig>
): { config: PrecisionEngineConfig; keysAdded: boolean; configForPersistence: PrecisionEngineConfig } {
  // Merge defaults with file config (this is what should be persisted)
  const configForPersistence: PrecisionEngineConfig = { ...DEFAULT_CONFIG, ...fileConfig };
  
  // Check if any default keys were missing
  const addedKeys = Object.keys(DEFAULT_CONFIG).filter(k => !(k in fileConfig));
  const keysAdded = addedKeys.length > 0;
  
  // Apply env var overrides (runtime-only, should NOT be persisted)
  const config: PrecisionEngineConfig = { ...configForPersistence };
  if (process.env.ALLOW_EXTERNAL_PATHS === 'true') {
    config.sandbox = false;
    logger.info('Sandbox disabled via ALLOW_EXTERNAL_PATHS env var');
  }
  
  cachedConfig = config;
  configForFile = { ...configForPersistence };
  return { config, keysAdded, configForPersistence };
}

/**
 * Get the config file path.
 */
function getConfigPath(): string {
  return path.join(process.cwd(), '.goodvibes', 'goodvibes.json');
}

/**
 * Load config from file synchronously.
 * Used by sync getters to avoid async complications.
 */
function loadConfigSync(): PrecisionEngineConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  let fileConfig: Partial<PrecisionEngineConfig> = {};
  const configPath = getConfigPath();
  let fileExists = false;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    fileExists = true;
    fileConfig = JSON.parse(content);
    logger.debug('Loaded config from file', { path: configPath });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('Config file not found, using defaults', { path: configPath });
    } else {
      logger.warn('Failed to load config file, using defaults', {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { config, keysAdded, configForPersistence } = applyConfigOverrides(fileConfig);
  
  // If file exists and we added default keys, persist them (fire-and-forget)
  if (fileExists && keysAdded) {
    pendingPersist = persistConfig(configForPersistence).catch(err => {
      logger.warn('Failed to persist missing default keys (fire-and-forget)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  
  return config;
}

/**
 * Load config from file asynchronously.
 * Can be called explicitly to reload configuration.
 *
 * @returns Promise that resolves when config is loaded
 */
export async function loadConfig(): Promise<void> {
  let fileConfig: Partial<PrecisionEngineConfig> = {};
  const configPath = getConfigPath();
  let fileExists = false;

  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    fileExists = true;
    fileConfig = JSON.parse(content);
    logger.debug('Loaded config from file', { path: configPath });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('Config file not found, using defaults', { path: configPath });
    } else {
      logger.warn('Failed to load config file, using defaults', {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { keysAdded, configForPersistence } = applyConfigOverrides(fileConfig);
  
  // If file exists and we added default keys, persist them (await)
  if (fileExists && keysAdded) {
    try {
      await persistConfig(configForPersistence);
    } catch (error) {
      logger.warn('Failed to persist missing default keys', {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Get the full current config.
 * Loads config on first access if not already loaded.
 *
 * @returns Current configuration object
 */
export function getConfig(): PrecisionEngineConfig {
  return loadConfigSync();
}

/**
 * Get a specific config value.
 * Loads config on first access if not already loaded.
 *
 * @param key - Configuration key to retrieve
 * @returns Value for the specified key
 */
export function getConfigValue<T = unknown>(key: string): T {
  const config = loadConfigSync();
  return config[key] as T;
}

/**
 * Get the verbosity default for a specific tool from config.
 * Returns undefined if no custom default is set.
 *
 * @param toolName - Name of the tool (e.g., 'precision_edit')
 * @returns Verbosity default string or undefined
 */
export function getToolVerbosityDefault(toolName: string): string | undefined {
  const config = loadConfigSync();
  const defaults = config.verbosity_defaults;
  if (defaults && typeof defaults === 'object') {
    const value = defaults[toolName];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * Get the max diff chars setting from config.
 * Returns 10000 if not configured.
 *
 * @returns Maximum diff characters before truncation
 */
export function getMaxDiffChars(): number {
  const config = loadConfigSync();
  return typeof config.max_diff_chars === 'number' ? config.max_diff_chars : 10000;
}

/**
 * Get the slow filesystem stat threshold from config.
 * Returns 50ms if not configured.
 *
 * @returns Threshold in milliseconds for detecting slow filesystems
 */
export function getSlowFsThreshold(): number {
  const config = loadConfigSync();
  return typeof config.slow_fs_stat_threshold_ms === 'number' ? config.slow_fs_stat_threshold_ms : 50;
}

/**
 * Get the known slow filesystem prefixes from config.
 * Returns ["/mnt/"] if not configured.
 *
 * @returns Array of path prefixes known to be slow filesystems
 */
export function getSlowFsPrefixes(): string[] {
  const config = loadConfigSync();
  return Array.isArray(config.slow_fs_known_prefixes) ? config.slow_fs_known_prefixes : ['/mnt/'];
}

/**
 * Get the max file bytes setting from config.
 * When a file exceeds this size, precision_read will suggest pagination instead of reading the entire file.
 * Returns 524288 (512KB) if not configured or invalid (values <= 0 are treated as invalid).
 *
 * @returns Maximum file size in bytes before size gate prompts pagination
 */
export function getMaxFileBytes(): number {
  const config = loadConfigSync();
  const value = config.max_file_bytes;
  return typeof value === 'number' && value > 0 ? value : 524288;
}

/**
 * Get the max token estimate setting from config.
 * When a file's estimated token count exceeds this threshold, precision_read will suggest pagination instead of reading the entire file.
 * Returns 50000 if not configured or invalid (values <= 0 are treated as invalid).
 *
 * @returns Maximum estimated tokens before size gate prompts pagination
 */
export function getMaxTokenEstimate(): number {
  const config = loadConfigSync();
  const value = config.max_token_estimate;
  return typeof value === 'number' && value > 0 ? value : 50000;
}

/**
 * Get the page size lines setting from config.
 * Defines how many lines to read per page when pagination is suggested/used for large files.
 * Returns 200 if not configured or invalid (values <= 0 are treated as invalid).
 *
 * @returns Lines per page when paginating large file reads
 */
export function getPageSizeLines(): number {
  const config = loadConfigSync();
  const value = config.page_size_lines;
  return typeof value === 'number' && value > 0 ? value : 200;
}

/**
 * Get cache mode: 'hash_only' (minimal memory) or 'with_content' (enables diffs).
 * Default: 'with_content'
 * @returns Cache mode string, either 'hash_only' or 'with_content'
 */
export function getCacheMode(): 'hash_only' | 'with_content' {
  const config = loadConfigSync();
  const value = config.cache_mode;
  if (value === 'hash_only' || value === 'with_content') return value;
  return 'with_content';
}

/**
 * Get maximum memory budget for file cache in megabytes.
 * Default: 200 MB
 * @returns Maximum cache memory in megabytes
 */
export function getCacheMaxMb(): number {
  const config = loadConfigSync();
  const value = config.cache_max_mb;
  if (typeof value === 'number' && value > 0) return value;
  return 200;
}

/**
 * Get safe overwrite protection setting from config.
 * Default: true
 * @returns Whether to enable automatic backup on first-time overwrite
 */
export function getSafeOverwrite(): boolean {
  const config = loadConfigSync();
  const value = config.safe_overwrite;
  if (typeof value === 'boolean') return value;
  return true;
}

/**
 * Get backup directory for safe overwrites from config.
 * Default: '.goodvibes/.backups'
 * @returns Backup directory path
 */
export function getBackupDir(): string {
  const config = loadConfigSync();
  const value = config.backup_dir;
  if (typeof value === 'string' && value.length > 0) return value;
  return '.goodvibes/.backups';
}

/**
 * Get backup git clean skip setting from config.
 * Default: true (skip backup for clean files in git)
 * @returns Whether to skip backup when file is clean in git
 */
export function getBackupGitCleanSkip(): boolean {
  const config = loadConfigSync();
  const value = config.backup_git_clean_skip;
  if (typeof value === 'boolean') return value;
  return true;
}

/**
 * Get max output chars for exec commands from config.
 * Default: 50000
 * @returns Maximum output characters before truncation
 */
export function getExecMaxOutputChars(): number {
  const config = loadConfigSync();
  const value = config.exec_max_output_chars;
  return typeof value === 'number' && value > 0 ? value : 50000;
}

/**
 * Get default timeout for exec commands from config.
 * Default: 120000 (120 seconds)
 * @returns Default timeout in milliseconds
 */
export function getExecDefaultTimeout(): number {
  const config = loadConfigSync();
  const value = config.exec_default_timeout_ms;
  return typeof value === 'number' && value > 0 ? value : 120000;
}

/**
 * Get max output lines for exec commands from config.
 * Default: 500
 * @returns Maximum output lines before truncation
 */
export function getExecMaxOutputLines(): number {
  const config = loadConfigSync();
  const value = config.exec_max_output_lines;
  return typeof value === 'number' && value > 0 ? value : 500;
}

/**
 * Get overflow directory for exec output from config.
 * Default: '.goodvibes/.exec-output'
 * @returns Overflow directory path
 */
export function getExecOverflowDir(): string {
  const config = loadConfigSync();
  const value = config.exec_overflow_dir;
  return typeof value === 'string' && value.length > 0 ? value : '.goodvibes/.exec-output';
}

/**
 * Get max background processes for exec from config.
 * Default: 5
 * @returns Maximum concurrent background processes
 */
export function getExecMaxBackground(): number {
  const config = loadConfigSync();
  const value = config.exec_max_background;
  return typeof value === 'number' && value > 0 ? value : 5;
}

/**
 * Get max exec history entries from config.
 * Default: 100
 * @returns Maximum exec history entries to retain
 */
export function getExecHistoryMax(): number {
  const config = loadConfigSync();
  const value = config.exec_history_max;
  return typeof value === 'number' && value > 0 ? value : 100;
}

/**
 * Set a config value at runtime and persist to config file.
 * Updates both in-memory cache and config file.
 *
 * @param key - Configuration key to set
 * @param value - Value to set
 * @returns Promise that resolves when config is persisted
 */
// Eager initialization: load config (and persist missing defaults) at module import time.
// This ensures the config file gets populated as soon as the MCP server starts,
// regardless of which tool is called first.
loadConfigSync();

export async function setConfigValue(key: string, value: unknown): Promise<void> {
  // Drain any pending fire-and-forget persist
  if (pendingPersist) {
    await pendingPersist;
    pendingPersist = null;
  }

  // Re-read the file to get current contents (user may have edited it manually)
  const configPath = getConfigPath();
  let currentFileConfig: Record<string, unknown> = {};

  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    currentFileConfig = JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to read config file for update, using cached config', {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Fall back to cached configForFile if file can't be read
    if (configForFile) {
      currentFileConfig = { ...configForFile };
    }
  }

  // Apply the new key/value
  currentFileConfig[key] = value;

  // Update in-memory caches
  configForFile = currentFileConfig as PrecisionEngineConfig;
  if (!cachedConfig) {
    cachedConfig = { ...configForFile };
  } else {
    cachedConfig[key] = value;
  }

  // Persist to file
  try {
    await persistConfig(configForFile);
    logger.info('Updated config', { key, value, path: configPath });
  } catch (error) {
    logger.error('Failed to persist config', {
      key,
      value,
      path: configPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
