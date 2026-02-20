/**
 * Configuration constants for project-engine v2.0.0.
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export const SERVER_NAME = 'project-engine';
export const SERVER_VERSION = '2.0.0';

/**
 * Gets the directory containing this config file.
 * Handles both ESM and CJS contexts with appropriate fallbacks.
 */
const getEsmDir = (): string => {
  return dirname(fileURLToPath(import.meta.url));
};

export const getConfigDir = (): string => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try { return getEsmDir(); } catch { return process.cwd(); }
};

/**
 * Root directory of the GoodVibes plugin.
 */
export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), '../../..');

/**
 * Root directory of the current project being analyzed.
 */
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Get plugin root from environment or cwd.
 */
export function getPluginRoot(): string {
  return PLUGIN_ROOT;
}

/**
 * Get project root from environment or cwd.
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
