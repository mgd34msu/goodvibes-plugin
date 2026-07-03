/**
 * First-party model-pricing fetcher (v2 home: the analytics engine, NOT a
 * session hook — network in hooks was a v1 timeout hazard).
 *
 * Fetches https://platform.claude.com/docs/en/about-claude/pricing.md (the
 * official platform docs, markdown form), parses the "Model pricing" table,
 * and atomically caches it at ~/.claude/model-pricing.json — the overlay file
 * `loadModelPricing()` already reads. Refresh is lazy and non-blocking: cost
 * paths call `refreshPricingIfStale()` fire-and-forget; the current call uses
 * the existing overlay/fallback and the NEXT call sees fresh data.
 *
 * Upgrades over the v1 parser it replaces:
 *  - family-agnostic: recognizes any "Claude <Family> <version>" row (v1 knew
 *    only opus/sonnet/haiku and silently skipped the Claude 5 family);
 *  - keeps ALL model versions (v1 kept only the latest per family), keyed to
 *    match the fallback table's ids (claude-opus-4-8, claude-fable-5, ...);
 *  - date-qualified rows ("through Aug 31, 2026" / "starting September 1,
 *    2026") are resolved to whichever rate is effective TODAY — the live page
 *    currently lists Sonnet 5 at introductory pricing that the static
 *    fallback table does not know about.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteJson } from '../runtime.js';

export const PRICING_URL = 'https://platform.claude.com/docs/en/about-claude/pricing.md';
export const PRICING_CACHE_PATH = join(homedir(), '.claude', 'model-pricing.json');
const TTL_HOURS = 24;
const FETCH_TIMEOUT_MS = 10_000;

export interface FetchedModelPricing {
  name: string;
  inputPrice: number;
  outputPrice: number;
  cacheWrite5Min: number;
  cacheWrite1Hour: number;
  cacheHits: number;
}

export interface PricingCacheFile {
  fetchedAt: string;
  source: string;
  models: Record<string, FetchedModelPricing>;
}

/** "$12.50 / MTok" -> 12.5; throws on anything else. */
function parsePrice(cell: string): number {
  const match = cell.match(/\$(\d+(?:\.\d+)?)\s*\/\s*MTok/i);
  if (!match) throw new Error(`unparseable price cell: ${cell}`);
  return parseFloat(match[1]);
}

/** Strip markdown links and parentheticals from a model-name cell. */
function cleanName(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/\s*\([^)]*\)/g, '') // parenthetical notes
    .trim();
}

/**
 * Decide whether a date-qualified row is effective now. Rows say either
 * "through <date>" (effective until then) or "starting <date>" (effective
 * from then). Unqualified rows are always effective.
 */
function rowEffectiveNow(cleanedName: string, now: Date): boolean {
  const through = cleanedName.match(/through\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  if (through) {
    const until = new Date(through[1]);
    return !isNaN(until.getTime()) ? now <= until : true;
  }
  const starting = cleanedName.match(/starting\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  if (starting) {
    const from = new Date(starting[1]);
    return !isNaN(from.getTime()) ? now >= from : false;
  }
  return true;
}

/** "Claude Opus 4.8 through Aug 31, 2026" -> "claude-opus-4-8" (or null). */
function modelKey(cleanedName: string): { key: string; display: string } | null {
  const match = cleanedName.match(/Claude\s+([A-Za-z]+)\s+([\d.]+)/i);
  if (!match) return null;
  const family = match[1].toLowerCase();
  const version = match[2].replace(/\./g, '-');
  return { key: `claude-${family}-${version}`, display: `Claude ${match[1]} ${match[2]}` };
}

/**
 * Parse the "Model pricing" section's table. Column order per the live page:
 * Model | Base Input | 5m Cache Writes | 1h Cache Writes | Cache Hits | Output.
 * Returns one entry per model key, resolved to the currently-effective row.
 */
export function parsePricingMarkdown(markdown: string, now: Date = new Date()): Record<string, FetchedModelPricing> {
  const section = markdown.match(/##\s*Model pricing[\s\S]*?(?=\n##\s|$)/i);
  if (!section) throw new Error('no "Model pricing" section found');

  const models: Record<string, FetchedModelPricing> = {};
  for (const line of section[0].split('\n')) {
    if (!line.trim().startsWith('|') || /^\|\s*-+/.test(line.trim()) || /\|\s*Model\s*\|/i.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 6) continue;

    const cleaned = cleanName(cells[0]);
    const keyed = modelKey(cleaned);
    if (!keyed) continue;
    if (!rowEffectiveNow(cleaned, now)) continue;
    // First effective row per key wins (introductory rows are listed first).
    if (models[keyed.key]) continue;

    try {
      models[keyed.key] = {
        name: keyed.display,
        inputPrice: parsePrice(cells[1]),
        cacheWrite5Min: parsePrice(cells[2]),
        cacheWrite1Hour: parsePrice(cells[3]),
        cacheHits: parsePrice(cells[4]),
        outputPrice: parsePrice(cells[5]),
      };
    } catch {
      // A malformed row (e.g. "Free" tiers) is skipped, never fatal.
    }
  }

  if (Object.keys(models).length === 0) {
    throw new Error('pricing table parsed to zero models — page layout may have changed');
  }
  return models;
}

/** Age of the cache file in hours; Infinity when absent/unreadable. */
export function cacheAgeHours(cachePath: string = PRICING_CACHE_PATH): number {
  try {
    if (!existsSync(cachePath)) return Infinity;
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as PricingCacheFile;
    const fetched = new Date(cache.fetchedAt).getTime();
    if (isNaN(fetched)) return Infinity;
    return (Date.now() - fetched) / 3_600_000;
  } catch {
    return Infinity;
  }
}

let inFlight: Promise<boolean> | null = null;

/**
 * Refresh the pricing cache from the first-party page when it is older than
 * the TTL. Non-blocking by design: callers fire-and-forget. Returns true when
 * a refresh was performed and written. Never throws — a failed fetch leaves
 * the previous cache (or the fallback table) in effect. Disable with
 * GOODVIBES_NO_PRICING_FETCH=1 (tests, offline work).
 */
export async function refreshPricingIfStale(options: {
  cachePath?: string;
  url?: string;
  ttlHours?: number;
  /** Tests stubbing global fetch set this to bypass the VITEST guard. */
  force?: boolean;
} = {}): Promise<boolean> {
  if (process.env.GOODVIBES_NO_PRICING_FETCH === '1') return false;
  // Never let the test suite (or anything importing config under it) reach
  // the network implicitly; the fetcher's own tests stub fetch and force.
  if (process.env.VITEST && !options.force) return false;
  const cachePath = options.cachePath ?? PRICING_CACHE_PATH;
  if (cacheAgeHours(cachePath) < (options.ttlHours ?? TTL_HOURS)) return false;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      timer.unref?.();
      const response = await fetch(options.url ?? PRICING_URL, {
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!response.ok) return false;
      const markdown = await response.text();
      const models = parsePricingMarkdown(markdown);
      const file: PricingCacheFile = {
        fetchedAt: new Date().toISOString(),
        source: options.url ?? PRICING_URL,
        models,
      };
      atomicWriteJson(cachePath, file);
      return true;
    } catch {
      return false; // stale-but-working beats fresh-but-broken
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
