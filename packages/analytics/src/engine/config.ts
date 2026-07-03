/**
 * Shared analytics configuration loader.
 *
 * Extracted here to avoid circular imports between the engine entry point and
 * its data readers. All entry points should import `loadConfig` from this module.
 *
 * Config resolution order:
 *   1. Global: ~/.claude/.goodvibes/analytics/analytics.json
 *   2. Per-project: {goodvibesDir}/analytics.json
 *   3. DEFAULT_CONFIG (built-in defaults)
 */

import {
  readFileSync,
  existsSync,
  watchFile,
  unwatchFile,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AnalyticsConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { atomicWriteFileSync } from './runtime.js';
import { refreshPricingIfStale } from './data/pricing-fetcher.js';

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

/**
 * Standard Anthropic prompt-cache multipliers relative to a model's base input
 * rate: a 5-minute cache write costs 1.25x, a 1-hour cache write 2x, and a cache
 * read (hit) 0.1x. Deriving cache rates from these keeps the maintained table
 * DRY and cache-aware by construction.
 */
export const CACHE_WRITE_5MIN_MULT = 1.25;
export const CACHE_WRITE_1HOUR_MULT = 2;
export const CACHE_HIT_MULT = 0.1;

/** Build a cache-aware ModelPricingInfo from a model's base input/output rates ($/MTok). */
export function priced(name: string, inputPrice: number, outputPrice: number): ModelPricingInfo {
  return {
    name,
    inputPrice,
    outputPrice,
    cacheWrite5Min: inputPrice * CACHE_WRITE_5MIN_MULT,
    cacheWrite1Hour: inputPrice * CACHE_WRITE_1HOUR_MULT,
    cacheHits: inputPrice * CACHE_HIT_MULT,
  };
}

/**
 * Maintained per-model pricing table (USD per million tokens), current as of
 * 2026-07. This is the cache-aware replacement for v1's flat two-rate model and
 * its stale/incorrect Opus rates. A newer table may be dropped at
 * `~/.claude/model-pricing.json` by the session-start pricing fetcher;
 * `loadModelPricing()` prefers that file and falls back to this table.
 */
export const FALLBACK_MODEL_PRICING: ModelPricingMap = {
  'claude-fable-5':    priced('Claude Fable 5', 10, 50),
  'claude-mythos-5':   priced('Claude Mythos 5', 10, 50),
  'claude-opus-4-8':   priced('Claude Opus 4.8', 5, 25),
  'claude-opus-4-7':   priced('Claude Opus 4.7', 5, 25),
  'claude-opus-4-6':   priced('Claude Opus 4.6', 5, 25),
  'claude-opus-4-5':   priced('Claude Opus 4.5', 5, 25),
  'claude-sonnet-5':   priced('Claude Sonnet 5', 3, 15),
  'claude-sonnet-4-6': priced('Claude Sonnet 4.6', 3, 15),
  'claude-sonnet-4-5': priced('Claude Sonnet 4.5', 3, 15),
  'claude-haiku-4-5':  priced('Claude Haiku 4.5', 1, 5),
};

/**
 * Load model pricing: the first-party overlay merged over the fallback table.
 *
 * The overlay at `~/.claude/model-pricing.json` is maintained by the engine's
 * own lazy fetcher (`data/pricing-fetcher.ts`), which pulls the official
 * platform docs pricing page on a 24h TTL. Fetched rates win per model; the
 * fallback fills anything the page doesn't list. Calling this also kicks a
 * non-blocking staleness refresh so the NEXT cost query sees fresh data —
 * this call never waits on the network.
 *
 * @returns Map of model ID to ModelPricingInfo (prices in $/MTok).
 */
export function loadModelPricing(): ModelPricingMap {
  // Fire-and-forget: never blocks, never throws; no-op when fresh or when
  // GOODVIBES_NO_PRICING_FETCH=1.
  void refreshPricingIfStale();

  try {
    if (existsSync(MODEL_PRICING_CACHE_PATH)) {
      const content = readFileSync(MODEL_PRICING_CACHE_PATH, 'utf-8');
      const cache = JSON.parse(content) as { models?: ModelPricingMap };
      if (cache.models && typeof cache.models === 'object') {
        return { ...FALLBACK_MODEL_PRICING, ...cache.models };
      }
    }
  } catch {
    // Fall through to fallback.
  }
  return { ...FALLBACK_MODEL_PRICING };
}

/** Where the current pricing numbers come from — surfaced in cost output. */
export interface PricingProvenance {
  source: 'first-party' | 'fallback-table';
  url?: string;
  fetchedAt?: string;
  ageHours?: number;
}

/** Report provenance of the pricing data `loadModelPricing()` returns. */
export function pricingProvenance(): PricingProvenance {
  try {
    if (existsSync(MODEL_PRICING_CACHE_PATH)) {
      const cache = JSON.parse(readFileSync(MODEL_PRICING_CACHE_PATH, 'utf-8')) as {
        fetchedAt?: string;
        source?: string;
        models?: unknown;
      };
      if (cache.models && cache.fetchedAt) {
        const age = (Date.now() - new Date(cache.fetchedAt).getTime()) / 3_600_000;
        return {
          source: 'first-party',
          url: cache.source ?? 'https://platform.claude.com/docs/en/about-claude/pricing.md',
          fetchedAt: cache.fetchedAt,
          ageHours: isNaN(age) ? undefined : Math.round(age * 10) / 10,
        };
      }
    }
  } catch {
    // Fall through.
  }
  return { source: 'fallback-table' };
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
  if (pricingMap[modelId]) {return pricingMap[modelId]!;}

  // Try normalised key: e.g. 'claude-sonnet-4-6' matches 'claude-sonnet-4.6'
  const normalisedId = modelId.replace(/-/g, '.');
  const dotKey = Object.keys(pricingMap).find(
    (k) => k.replace(/-/g, '.') === normalisedId,
  );
  if (dotKey) {return pricingMap[dotKey]!;}

  // Partial prefix match: model ID from JSONL is typically longer than the pricing key.
  // Only match in one direction: normalizedId starts with the key (not the reverse).
  const normalizedId = modelId.replace(/\./g, '-');
  const prefixKey = Object.keys(pricingMap).find((k) => {
    const normalizedKey = k.replace(/\./g, '-');
    return normalizedId.startsWith(normalizedKey);
  });
  if (prefixKey) {return pricingMap[prefixKey]!;}

  // Final fallback: explicit opus key lookup.
  const opusKey = 'claude-opus-4-5';
  const opusPricing = pricingMap[opusKey];
  if (opusPricing) {return opusPricing;}

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
  if (!existsSync(filePath)) {return null;}
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
  if (globalConfig) {return globalConfig;}

  // 2. Try per-project config
  const projectConfig = tryLoadFile(join(goodvibesDir, 'analytics.json'));
  if (projectConfig) {return projectConfig;}

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
  atomicWriteFileSync(filePath, JSON.stringify(config, null, 2));
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
    if (debounceTimer) {clearTimeout(debounceTimer);}
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const config = tryLoadFile(filePath);
      if (config) {callback(config);}
    }, WATCH_DEBOUNCE_MS);
    // Never hold the event loop open for a debounced config reload (issue 9).
    debounceTimer.unref?.();
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
