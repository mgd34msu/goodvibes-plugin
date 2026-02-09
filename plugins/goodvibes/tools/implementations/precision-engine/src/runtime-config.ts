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

  /** Maximum stdout/stderr characters before overflow (default: 50000) */
  exec_max_output_chars?: number;
  /** Command timeout in milliseconds (default: 120000) */
  exec_default_timeout_ms?: number;
  /** Maximum output lines before truncation (default: 500) */
  exec_max_output_lines?: number;
  /** Directory path for overflow output files (default: '.goodvibes/.exec-output') */
  exec_overflow_dir?: string;
  /** Maximum concurrent background processes (default: 5) */
  exec_max_background?: number;
  /** Maximum exec history entries to retain (default: 100) */
  exec_history_max?: number;

  /** Symbol search timeout in discover tool (default: 120000ms = 120s) */
  discover_symbol_timeout_ms?: number;

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
 * Default values for exec configuration.
 */
const EXEC_DEFAULTS = {
  /** Maximum stdout/stderr characters before overflow */
  MAX_OUTPUT_CHARS: 50000,
  /** Command timeout in milliseconds */
  DEFAULT_TIMEOUT_MS: 120000,
  /** Maximum output lines before truncation */
  MAX_OUTPUT_LINES: 500,
  /** Directory path for overflow output files */
  OVERFLOW_DIR: '.goodvibes/.exec-output',
  /** Maximum concurrent background processes */
  MAX_BACKGROUND: 5,
  /** Maximum exec history entries to retain */
  HISTORY_MAX: 100,
  /** Symbol search timeout in discover tool */
  DISCOVER_SYMBOL_TIMEOUT_MS: 120000,
} as const;

/**
 * Default values for non-exec configuration.
 */
const CONFIG_DEFAULTS = {
  /** Maximum diff characters before truncation */
  MAX_DIFF_CHARS: 10000,
  /** Slow filesystem detection threshold in milliseconds */
  SLOW_FS_THRESHOLD_MS: 50,
  /** Maximum file size in bytes before size gate prompts pagination */
  MAX_FILE_BYTES: 524288,
  /** Maximum estimated tokens before size gate prompts pagination */
  MAX_TOKEN_ESTIMATE: 50000,
  /** Lines per page when paginating large file reads */
  PAGE_SIZE_LINES: 200,
  /** Maximum memory budget for file cache in megabytes */
  CACHE_MAX_MB: 200,
  /** Default backup directory path. */
  BACKUP_DIR: '.goodvibes/.backups',
  /** Default safe overwrite setting. */
  SAFE_OVERWRITE: true,
  /** Default backup git clean skip setting. */
  BACKUP_GIT_CLEAN_SKIP: true,
  /** Default cache mode. */
  CACHE_MODE: 'with_content' as const,
  /** Default slow filesystem path prefixes. */
  SLOW_FS_PREFIXES: ['/mnt/'] as readonly string[],
} as const;

/**
 * Validate and return a numeric config value with fallback to default.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @param value - The config value to validate
 * @param defaultValue - The default value to return if validation fails
 * @returns The validated value or the default
 */
function getValidNumber(value: unknown, defaultValue: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : defaultValue;
}

/**
 * Validate and return a string config value with fallback to default.
 * Rejects empty strings.
 *
 * @param value - The config value to validate
 * @param defaultValue - The default value to return if validation fails
 * @returns The validated string or the default
 */
function getValidString(value: unknown, defaultValue: string): string {
  return typeof value === 'string' && value.length > 0 ? value : defaultValue;
}

/**
 * Validate and return a boolean config value, or fall back to the default.
 *
 * @param value - The config value to validate
 * @param defaultValue - The default value to return if validation fails
 * @returns The validated boolean or the default
 */
function getValidBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

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
  
  // Return the actual value if it exists
  const value = config[key];
  if (value !== undefined) {
    return value as T;
  }
  
  // Return default values for known config keys
  switch (key) {
    case 'sandbox':
      return false as T;
    case 'max_diff_chars':
      return CONFIG_DEFAULTS.MAX_DIFF_CHARS as T;
    case 'max_file_bytes':
      return CONFIG_DEFAULTS.MAX_FILE_BYTES as T;
    case 'max_token_estimate':
      return CONFIG_DEFAULTS.MAX_TOKEN_ESTIMATE as T;
    case 'page_size_lines':
      return CONFIG_DEFAULTS.PAGE_SIZE_LINES as T;
    case 'slow_fs_stat_threshold_ms':
      return CONFIG_DEFAULTS.SLOW_FS_THRESHOLD_MS as T;
    case 'slow_fs_known_prefixes':
      return CONFIG_DEFAULTS.SLOW_FS_PREFIXES as T;
    case 'cache_mode':
      return CONFIG_DEFAULTS.CACHE_MODE as T;
    case 'cache_max_mb':
      return CONFIG_DEFAULTS.CACHE_MAX_MB as T;
    case 'safe_overwrite':
      return CONFIG_DEFAULTS.SAFE_OVERWRITE as T;
    case 'backup_dir':
      return CONFIG_DEFAULTS.BACKUP_DIR as T;
    case 'backup_git_clean_skip':
      return CONFIG_DEFAULTS.BACKUP_GIT_CLEAN_SKIP as T;
    case 'exec_max_output_chars':
      return EXEC_DEFAULTS.MAX_OUTPUT_CHARS as T;
    case 'exec_default_timeout_ms':
      return EXEC_DEFAULTS.DEFAULT_TIMEOUT_MS as T;
    case 'exec_max_output_lines':
      return EXEC_DEFAULTS.MAX_OUTPUT_LINES as T;
    case 'exec_overflow_dir':
      return EXEC_DEFAULTS.OVERFLOW_DIR as T;
    case 'exec_max_background':
      return EXEC_DEFAULTS.MAX_BACKGROUND as T;
    case 'exec_history_max':
      return EXEC_DEFAULTS.HISTORY_MAX as T;
    case 'discover_symbol_timeout_ms':
      return EXEC_DEFAULTS.DISCOVER_SYMBOL_TIMEOUT_MS as T;
    default:
      // For unknown keys or optional nested objects like verbosity_defaults,
      // return undefined
      return undefined as T;
  }
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
  return getValidNumber(config.max_diff_chars, CONFIG_DEFAULTS.MAX_DIFF_CHARS);
}

/**
 * Get the slow filesystem stat threshold from config.
 * Returns 50ms if not configured.
 *
 * @returns Threshold in milliseconds for detecting slow filesystems
 */
export function getSlowFsThreshold(): number {
  const config = loadConfigSync();
  return getValidNumber(config.slow_fs_stat_threshold_ms, CONFIG_DEFAULTS.SLOW_FS_THRESHOLD_MS);
}

/**
 * Get the known slow filesystem prefixes from config.
 * Returns ["/mnt/"] if not configured.
 *
 * Array validation is inline since this is the only array-typed config value.
 *
 * @returns Array of path prefixes known to be slow filesystems
 */
export function getSlowFsPrefixes(): string[] {
  const config = loadConfigSync();
  return Array.isArray(config.slow_fs_known_prefixes) ? config.slow_fs_known_prefixes : [...CONFIG_DEFAULTS.SLOW_FS_PREFIXES];
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
  return getValidNumber(config.max_file_bytes, CONFIG_DEFAULTS.MAX_FILE_BYTES);
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
  return getValidNumber(config.max_token_estimate, CONFIG_DEFAULTS.MAX_TOKEN_ESTIMATE);
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
  return getValidNumber(config.page_size_lines, CONFIG_DEFAULTS.PAGE_SIZE_LINES);
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
  return CONFIG_DEFAULTS.CACHE_MODE;
}

/**
 * Get maximum memory budget for file cache in megabytes.
 * Default: 200 MB
 * @returns Maximum cache memory in megabytes
 */
export function getCacheMaxMb(): number {
  const config = loadConfigSync();
  return getValidNumber(config.cache_max_mb, CONFIG_DEFAULTS.CACHE_MAX_MB);
}

/**
 * Get safe overwrite protection setting from config.
 * Default: true
 * @returns Whether to enable automatic backup on first-time overwrite
 */
export function getSafeOverwrite(): boolean {
  const config = loadConfigSync();
  return getValidBool(config.safe_overwrite, CONFIG_DEFAULTS.SAFE_OVERWRITE);
}

/**
 * Get backup directory for safe overwrites from config.
 * Default: '.goodvibes/.backups'
 * @returns Backup directory path
 */
export function getBackupDir(): string {
  const config = loadConfigSync();
  return getValidString(config.backup_dir, CONFIG_DEFAULTS.BACKUP_DIR);
}

/**
 * Get backup git clean skip setting from config.
 * Default: true (skip backup for clean files in git)
 * @returns Whether to skip backup when file is clean in git
 */
export function getBackupGitCleanSkip(): boolean {
  const config = loadConfigSync();
  return getValidBool(config.backup_git_clean_skip, CONFIG_DEFAULTS.BACKUP_GIT_CLEAN_SKIP);
}

/**
 * Get max output chars for exec commands from config.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @returns Maximum output characters before truncation (default: 50000)
 */
export function getExecMaxOutputChars(): number {
  const config = loadConfigSync();
  return getValidNumber(config.exec_max_output_chars, EXEC_DEFAULTS.MAX_OUTPUT_CHARS);
}

/**
 * Get default timeout for exec commands from config.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @returns Default timeout in milliseconds (default: 120000)
 */
export function getExecDefaultTimeout(): number {
  const config = loadConfigSync();
  return getValidNumber(config.exec_default_timeout_ms, EXEC_DEFAULTS.DEFAULT_TIMEOUT_MS);
}

/**
 * Get max output lines for exec commands from config.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @returns Maximum output lines before truncation (default: 500)
 */
export function getExecMaxOutputLines(): number {
  const config = loadConfigSync();
  return getValidNumber(config.exec_max_output_lines, EXEC_DEFAULTS.MAX_OUTPUT_LINES);
}

/**
 * Get overflow directory for exec output from config.
 * Rejects empty strings.
 *
 * @returns Overflow directory path (default: '.goodvibes/.exec-output')
 */
export function getExecOverflowDir(): string {
  const config = loadConfigSync();
  return getValidString(config.exec_overflow_dir, EXEC_DEFAULTS.OVERFLOW_DIR);
}

/**
 * Get max background processes for exec from config.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @returns Maximum concurrent background processes (default: 5)
 */
export function getExecMaxBackground(): number {
  const config = loadConfigSync();
  return getValidNumber(config.exec_max_background, EXEC_DEFAULTS.MAX_BACKGROUND);
}

/**
 * Get max exec history entries from config.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @returns Maximum exec history entries to retain (default: 100)
 */
export function getExecHistoryMax(): number {
  const config = loadConfigSync();
  return getValidNumber(config.exec_history_max, EXEC_DEFAULTS.HISTORY_MAX);
}

/**
 * Get symbol search timeout for discover tool from config.
 * Rejects NaN, Infinity, negative numbers, and zero.
 *
 * @returns Symbol search timeout in milliseconds (default: 120000)
 */
export function getDiscoverSymbolTimeout(): number {
  const config = loadConfigSync();
  return getValidNumber(config.discover_symbol_timeout_ms, EXEC_DEFAULTS.DISCOVER_SYMBOL_TIMEOUT_MS);
}

/**
 * Eager initialization: load config (and persist missing defaults) at module import time.
 * This ensures the config file gets populated as soon as the MCP server starts,
 * regardless of which tool is called first.
 */
loadConfigSync();

/**
 * Set a config value at runtime and persist to config file.
 * Updates both in-memory cache and config file.
 *
 * @param key - Configuration key to set
 * @param value - Value to set
 * @returns Promise that resolves when config is persisted
 */
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
