/**
 * Analytics Directory Utility
 *
 * Shared utility for ensuring the global analytics directory exists.
 * Used by session-start and session-end hooks.
 */

import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { debug, logError } from './logging.js';

/**
 * Ensures the global analytics directory exists at ~/.claude/.goodvibes/analytics/.
 * Lightweight directory check — full DB initialization is handled by the analytics engine.
 * Wrapped in try/catch to never crash the hook.
 */
export function ensureGlobalAnalyticsDir(): void {
  try {
    const analyticsDir = join(homedir(), '.claude', '.goodvibes', 'analytics');
    if (!existsSync(analyticsDir)) {
      mkdirSync(analyticsDir, { recursive: true });
      debug('Global analytics directory created');
    }
  } catch (err) {
    // Non-fatal: analytics engine will handle init on first use
    logError('ensureGlobalAnalyticsDir', err);
  }
}
