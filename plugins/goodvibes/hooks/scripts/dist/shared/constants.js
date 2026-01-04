/**
 * Constants
 *
 * Environment constants and package manager lockfile definitions.
 */
import * as path from 'path';
/** Package manager lockfiles for detection. */
export const LOCKFILES = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb'];
// Environment - using official Claude Code environment variable names
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');
