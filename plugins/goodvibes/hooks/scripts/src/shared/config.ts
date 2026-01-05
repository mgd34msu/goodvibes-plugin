/**
 * Configuration
 *
 * Shared configuration loading and default settings for GoodVibes hooks.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from './logging.js';
import { fileExists } from './file-utils.js';

/**
 * Timeout in milliseconds for waiting on stdin input before using defaults.
 * Can be overridden via GOODVIBES_STDIN_TIMEOUT_MS environment variable.
 */
export const STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? '100',
  10
);

/** Triggers that determine when quality checkpoints should run. */
export const CHECKPOINT_TRIGGERS = {
  fileCountThreshold: 5,
  afterAgentComplete: true,
  afterMajorChange: true,
};

/** Default quality gate checks with auto-fix commands. */
export const QUALITY_GATES = [
  { name: 'TypeScript', check: 'npx tsc --noEmit', autoFix: null, blocking: true },
  { name: 'ESLint', check: 'npx eslint . --max-warnings=0', autoFix: 'npx eslint . --fix', blocking: true },
  { name: 'Prettier', check: 'npx prettier --check .', autoFix: 'npx prettier --write .', blocking: false },
  { name: 'Tests', check: 'npm test', autoFix: null, blocking: true },
];

/**
 * Shared configuration for GoodVibes hooks (telemetry, quality, memory, checkpoints).
 * Note: This is separate from the automation config in ../types/config.ts which
 * handles build/test/git automation settings.
 */
export interface SharedConfig {
  telemetry?: {
    enabled?: boolean;
    anonymize?: boolean;
  };
  quality?: {
    gates?: Array<{
      name: string;
      check: string;
      autoFix: string | null;
      blocking: boolean;
    }>;
    autoFix?: boolean;
  };
  memory?: {
    enabled?: boolean;
    maxEntries?: number;
  };
  checkpoints?: {
    enabled?: boolean;
    triggers?: typeof CHECKPOINT_TRIGGERS;
  };
}

/**
 * Returns the default shared configuration for GoodVibes hooks.
 *
 * Provides sensible defaults for all configuration sections:
 * - Telemetry: enabled with anonymization
 * - Quality: all default gates with auto-fix enabled
 * - Memory: enabled with 100 entry limit
 * - Checkpoints: enabled with default triggers
 *
 * @returns The default SharedConfig object with all sections populated
 *
 * @example
 * const config = getDefaultSharedConfig();
 * console.log(config.telemetry?.enabled); // true
 * console.log(config.quality?.gates?.length); // 4 (TypeScript, ESLint, Prettier, Tests)
 */
export function getDefaultSharedConfig(): SharedConfig {
  return {
    telemetry: {
      enabled: true,
      anonymize: true,
    },
    quality: {
      gates: QUALITY_GATES,
      autoFix: true,
    },
    memory: {
      enabled: true,
      maxEntries: 100,
    },
    checkpoints: {
      enabled: true,
      triggers: CHECKPOINT_TRIGGERS,
    },
  };
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] as object, source[key] as object) as T[typeof key];
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[typeof key];
    }
  }
  return result;
}

/**
 * Loads shared configuration from the .goodvibes/settings.json file.
 *
 * Reads the user's configuration file and deep-merges it with defaults.
 * If the file doesn't exist or is invalid, returns the default configuration.
 *
 * The configuration file can contain either a `goodvibes` key with nested
 * settings or the settings at the root level.
 *
 * @param cwd - The current working directory (project root) containing .goodvibes folder
 * @returns Promise resolving to the merged SharedConfig with user overrides applied to defaults
 *
 * @example
 * // Load config from project directory
 * const config = await loadSharedConfig('/path/to/project');
 *
 * // Check if telemetry is enabled
 * if (config.telemetry?.enabled) {
 *   collectTelemetry();
 * }
 *
 * @example
 * // Example settings.json structure:
 * // {
 * //   "goodvibes": {
 * //     "telemetry": { "enabled": false },
 * //     "quality": { "autoFix": false }
 * //   }
 * // }
 */
export async function loadSharedConfig(cwd: string): Promise<SharedConfig> {
  const configPath = path.join(cwd, '.goodvibes', 'settings.json');
  const defaults = getDefaultSharedConfig();

  if (!(await fileExists(configPath))) {
    return defaults;
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    return deepMerge(defaults, userConfig.goodvibes || userConfig);
  } catch (error: unknown) {
    debug('loadSharedConfig failed', { error: String(error) });
    return defaults;
  }
}
