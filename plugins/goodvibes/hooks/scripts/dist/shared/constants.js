/**
 * Constants
 *
 * Environment constants and package manager lockfile definitions.
 */
import * as path from 'path';
/**
 * Package manager lockfiles for detection.
 * Used to identify which package manager a project uses (pnpm, yarn, npm, or bun).
 */
export const LOCKFILES = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
    'bun.lockb',
];
/**
 * Root directory of the GoodVibes plugin itself.
 * Uses official Claude Code environment variable or falls back to parent directory.
 */
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');
/**
 * Root directory of the user's project.
 * Uses official Claude Code environment variable or falls back to current working directory.
 */
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
/**
 * Cache directory for temporary plugin data.
 * Located at PLUGIN_ROOT/.cache for storing analytics and other ephemeral data.
 */
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
/**
 * Path to the analytics JSON file.
 * Stores session analytics data including tool usage and skill recommendations.
 */
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');
