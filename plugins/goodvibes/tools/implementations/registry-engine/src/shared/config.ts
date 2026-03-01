/**
 * Root directory configuration for registry-engine.
 * Excludes server identity (see constants.ts) and search options (see core/search).
 */

import * as path from 'node:path';
import { resolveModuleDir } from './utils.js';

/**
 * Root directory of the GoodVibes plugin.
 * Resolved from environment variables or relative to config location.
 * @example "/home/user/project/plugins/goodvibes"
 */
function computePluginRoot(): string {
  if (process.env.PLUGIN_ROOT) return process.env.PLUGIN_ROOT;
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  try {
    return path.resolve(resolveModuleDir(), '../../..');
  } catch (err) {
    const fallback = process.cwd();
    // eslint-disable-next-line no-console
    console.warn(`[registry-engine] Failed to resolve PLUGIN_ROOT via module path, falling back to cwd: ${fallback}`, err);
    return fallback;
  }
}

export const PLUGIN_ROOT = computePluginRoot();

/**
 * Root directory of the current project being analyzed.
 * Falls back to current working directory if not set.
 * @example "/home/user/my-project"
 */
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Gets the current PROJECT_ROOT dynamically.
 * Useful when process.env.PROJECT_ROOT may change at runtime (e.g., in tests).
 * @returns The project root directory path
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}
