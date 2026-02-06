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
let configLoaded = false;

/**
 * Apply defaults and env var overrides to loaded file config.
 * Shared between sync and async load paths.
 */
function applyConfigOverrides(fileConfig: Partial<PrecisionEngineConfig>): PrecisionEngineConfig {
  const config: PrecisionEngineConfig = { ...DEFAULT_CONFIG, ...fileConfig };
  
  // Env var overrides
  if (process.env.ALLOW_EXTERNAL_PATHS === 'true') {
    config.sandbox = false;
    logger.info('Sandbox disabled via ALLOW_EXTERNAL_PATHS env var');
  }
  
  cachedConfig = config;
  configLoaded = true;
  return config;
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
  if (configLoaded && cachedConfig) {
    return cachedConfig;
  }

  let fileConfig: Partial<PrecisionEngineConfig> = {};
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(content);
      logger.debug('Loaded config from file', { path: configPath });
    } else {
      logger.debug('Config file not found, using defaults', { path: configPath });
    }
  } catch (error) {
    logger.warn('Failed to load config file, using defaults', {
      path: configPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return applyConfigOverrides(fileConfig);
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

  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
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

  applyConfigOverrides(fileConfig);
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
 * Set a config value at runtime and persist to config file.
 * Updates both in-memory cache and config file.
 *
 * @param key - Configuration key to set
 * @param value - Value to set
 * @returns Promise that resolves when config is persisted
 */
export async function setConfigValue(key: string, value: unknown): Promise<void> {
  // Ensure config is loaded
  if (!configLoaded || !cachedConfig) {
    await loadConfig();
  }

  // Update in-memory config
  if (!cachedConfig) {
    throw new Error('Failed to initialize configuration');
  }

  cachedConfig[key] = value;

  // Persist to file
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  try {
    // Ensure config directory exists
    await fs.promises.mkdir(configDir, { recursive: true });

    // Write config file
    await fs.promises.writeFile(
      configPath,
      JSON.stringify(cachedConfig, null, 2) + '\n',
      'utf-8'
    );

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
