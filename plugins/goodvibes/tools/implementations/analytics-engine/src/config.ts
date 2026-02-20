/**
 * Shared analytics configuration loader.
 *
 * Extracted here to avoid circular imports between index.ts, mini.ts, and full.ts.
 * All entry points should import `loadConfig` from this module.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyticsConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

export { DEFAULT_CONFIG };

/**
 * Load analytics configuration from `{goodvibesDir}/analytics.json`.
 * Falls back to DEFAULT_CONFIG if the file is absent or malformed.
 *
 * @param goodvibesDir - Absolute or relative path to the .goodvibes directory.
 * @returns Merged analytics configuration.
 */
export function loadConfig(goodvibesDir: string): AnalyticsConfig {
  try {
    const raw = readFileSync(join(goodvibesDir, 'analytics.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...DEFAULT_CONFIG, ...(parsed as Partial<AnalyticsConfig>) };
    }
    return { ...DEFAULT_CONFIG };
  } catch (err) {
    if (existsSync(join(goodvibesDir, 'analytics.json'))) {
      console.warn('[analytics] Config load failed, using defaults:', err instanceof Error ? err.message : String(err));
    }
    return { ...DEFAULT_CONFIG };
  }
}
