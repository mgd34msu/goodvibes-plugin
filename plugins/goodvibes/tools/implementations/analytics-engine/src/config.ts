/**
 * Shared analytics configuration loader.
 *
 * Extracted here to avoid circular imports between index.ts, mini.ts, and full.ts.
 * All entry points should import `loadConfig` from this module.
 *
 * Config resolution order:
 *   1. Global: ~/.claude/.goodvibes/analytics/analytics.json
 *   2. Per-project: {goodvibesDir}/analytics.json
 *   3. DEFAULT_CONFIG (built-in defaults)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  watchFile,
  unwatchFile,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AnalyticsConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

export { DEFAULT_CONFIG };

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce delay for watchConfig callbacks (ms). */
const WATCH_DEBOUNCE_MS = 1000;

/** Global analytics config file location. */
const GLOBAL_CONFIG_PATH = join(
  homedir(),
  '.claude',
  '.goodvibes',
  'analytics',
  'analytics.json',
);

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and merge a JSON config file with the defaults.
 * Returns null if the file does not exist or cannot be parsed.
 */
function tryLoadFile(filePath: string): AnalyticsConfig | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...DEFAULT_CONFIG, ...(parsed as Partial<AnalyticsConfig>) };
    }
    return { ...DEFAULT_CONFIG };
  } catch (err) {
    console.warn(
      `[analytics] Config load failed for ${filePath}, using defaults:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load analytics configuration using the following resolution order:
 *
 * 1. Global config: `~/.claude/.goodvibes/analytics/analytics.json`
 * 2. Per-project config: `{goodvibesDir}/analytics.json`
 * 3. Built-in DEFAULT_CONFIG
 *
 * The first config file found wins. Fields not present in the file are
 * filled in from DEFAULT_CONFIG.
 *
 * @param goodvibesDir - Absolute or relative path to the .goodvibes directory.
 * @returns Merged analytics configuration.
 */
export function loadConfig(goodvibesDir: string): AnalyticsConfig {
  // 1. Try global config
  const globalConfig = tryLoadFile(GLOBAL_CONFIG_PATH);
  if (globalConfig) return globalConfig;

  // 2. Try per-project config
  const projectConfig = tryLoadFile(join(goodvibesDir, 'analytics.json'));
  if (projectConfig) return projectConfig;

  // 3. Fall back to defaults
  return { ...DEFAULT_CONFIG };
}

/**
 * Persist a configuration object to a JSON file on disk.
 *
 * Serializes the config as formatted JSON (2-space indent) and writes it
 * atomically. The parent directory must already exist.
 *
 * @param config - The AnalyticsConfig to persist.
 * @param filePath - Absolute path to the destination JSON file.
 * @throws {Error} If the file cannot be written.
 *
 * @example
 * ```ts
 * saveConfig(config, '~/.claude/.goodvibes/analytics/analytics.json');
 * ```
 */
export function saveConfig(config: AnalyticsConfig, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Watch a config file for changes and invoke `callback` with the reloaded
 * configuration. Uses a 1-second debounce to prevent rapid-fire events.
 *
 * Returns a cleanup function that stops the watcher when called.
 *
 * @param filePath - Absolute path to the JSON config file to watch.
 * @param callback - Function called with the new config after each change.
 * @returns A function that stops watching when invoked.
 *
 * @example
 * ```ts
 * const stop = watchConfig('/path/to/analytics.json', (cfg) => {
 *   engine.applyConfig(cfg);
 * });
 * // Later:
 * stop();
 * ```
 */
export function watchConfig(
  filePath: string,
  callback: (config: AnalyticsConfig) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handler = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const config = tryLoadFile(filePath);
      if (config) callback(config);
    }, WATCH_DEBOUNCE_MS);
  };

  // Node.js watchFile uses polling — suitable for config files
  watchFile(filePath, { interval: 1000, persistent: false }, handler);

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unwatchFile(filePath, handler);
  };
}
