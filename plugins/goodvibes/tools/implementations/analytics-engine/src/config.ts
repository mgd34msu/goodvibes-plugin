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

// ─────────────────────────────────────────────────────────────────────────────
// Model pricing types and loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-model pricing information, mirroring the format used by the hook
 * cost-analysis system. Prices are in USD per million tokens ($/MTok).
 */
export interface ModelPricingInfo {
  name?: string;
  inputPrice: number;       // $/MTok
  outputPrice: number;      // $/MTok
  cacheWrite5Min: number;   // $/MTok
  cacheWrite1Hour: number;  // $/MTok
  cacheHits: number;        // $/MTok
}

/** Map from model ID to its pricing info. */
export type ModelPricingMap = Record<string, ModelPricingInfo>;

/** Path to the model pricing cache written by the session-start hook. */
const MODEL_PRICING_CACHE_PATH = join(homedir(), '.claude', 'model-pricing.json');

/** Fallback pricing used when the cache file is absent or unreadable. */
const FALLBACK_MODEL_PRICING: ModelPricingMap = {
  'claude-opus-4.5': {
    name: 'Claude Opus 4.5',
    inputPrice: 15.00,
    outputPrice: 75.00,
    cacheWrite5Min: 18.75,
    cacheWrite1Hour: 30.00,
    cacheHits: 1.50,
  },
  'claude-sonnet-4.5': {
    name: 'Claude Sonnet 4.5',
    inputPrice: 3.00,
    outputPrice: 15.00,
    cacheWrite5Min: 3.75,
    cacheWrite1Hour: 6.00,
    cacheHits: 0.30,
  },
  'claude-haiku-4.5': {
    name: 'Claude Haiku 4.5',
    inputPrice: 1.00,
    outputPrice: 5.00,
    cacheWrite5Min: 1.25,
    cacheWrite1Hour: 2.00,
    cacheHits: 0.10,
  },
  'claude-sonnet-4-6': {
    name: 'Claude Sonnet 4.6',
    inputPrice: 3.00,
    outputPrice: 15.00,
    cacheWrite5Min: 3.75,
    cacheWrite1Hour: 6.00,
    cacheHits: 0.30,
  },
  'claude-opus-4-6': {
    name: 'Claude Opus 4.6',
    inputPrice: 15.00,
    outputPrice: 75.00,
    cacheWrite5Min: 18.75,
    cacheWrite1Hour: 30.00,
    cacheHits: 1.50,
  },
};

/**
 * Load model pricing from `~/.claude/model-pricing.json`.
 *
 * This file is written by the session-start hook's pricing fetcher.
 * Falls back to FALLBACK_MODEL_PRICING if the file is absent or cannot be parsed.
 *
 * @returns Map of model ID to ModelPricingInfo (prices in $/MTok).
 */
export function loadModelPricing(): ModelPricingMap {
  try {
    if (existsSync(MODEL_PRICING_CACHE_PATH)) {
      const content = readFileSync(MODEL_PRICING_CACHE_PATH, 'utf-8');
      const cache = JSON.parse(content) as { models?: ModelPricingMap };
      if (cache.models && typeof cache.models === 'object') {
        return cache.models;
      }
    }
  } catch {
    // Fall through to fallback.
  }
  return { ...FALLBACK_MODEL_PRICING };
}

/**
 * Get pricing rates for a specific model ID.
 *
 * Falls back to claude-opus-4.5 rates if the model is not found,
 * and to DEFAULT_CONFIG rates if the fallback is also missing.
 *
 * @param modelId   - Claude model identifier (e.g. 'claude-sonnet-4-6').
 * @param pricingMap - Model pricing map from loadModelPricing().
 * @returns Pricing info for the model (prices in $/MTok).
 */
export function getModelRates(
  modelId: string,
  pricingMap: ModelPricingMap,
): ModelPricingInfo {
  // Exact match first.
  if (pricingMap[modelId]) return pricingMap[modelId]!;

  // Try normalised key: e.g. 'claude-sonnet-4-6' matches 'claude-sonnet-4.6'
  const normalisedId = modelId.replace(/-/g, '.');
  const dotKey = Object.keys(pricingMap).find(
    (k) => k.replace(/-/g, '.') === normalisedId,
  );
  if (dotKey) return pricingMap[dotKey]!;

  // Partial prefix match (e.g. 'claude-opus' matches first opus entry).
  const prefixKey = Object.keys(pricingMap).find(
    (k) => modelId.startsWith(k) || k.startsWith(modelId),
  );
  if (prefixKey) return pricingMap[prefixKey]!;

  // Final fallback: opus rates.
  const opusKey = Object.keys(pricingMap).find((k) => k.includes('opus'));
  if (opusKey) return pricingMap[opusKey]!;

  // Last-resort defaults ($/MTok equivalent of old $/1k config).
  return {
    inputPrice: DEFAULT_CONFIG.cost_per_1k_input_tokens * 1000,
    outputPrice: DEFAULT_CONFIG.cost_per_1k_output_tokens * 1000,
    cacheWrite5Min: DEFAULT_CONFIG.cost_per_1k_input_tokens * 1000 * 1.25,
    cacheWrite1Hour: DEFAULT_CONFIG.cost_per_1k_input_tokens * 1000 * 2,
    cacheHits: DEFAULT_CONFIG.cost_per_1k_input_tokens * 1000 * 0.1,
  };
}

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
