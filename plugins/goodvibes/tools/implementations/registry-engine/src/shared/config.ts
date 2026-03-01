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
export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(resolveModuleDir(), '../../..');

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
