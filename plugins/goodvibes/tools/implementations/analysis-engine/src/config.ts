/**
 * Configuration constants for analysis-engine.
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { IFuseOptions } from 'fuse.js';
import type { RegistryEntry } from './types.js';

export const SERVER_NAME = 'analysis-engine';
export const SERVER_VERSION = '1.0.0';

/**
 * Gets the directory containing this config file.
 */
const getEsmDir = (): string => {
  // @ts-expect-error - import.meta.url is only available in ESM context
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
 * Get project root from environment or cwd.
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/**
 * Get plugin root from environment.
 */
export function getPluginRoot(): string {
  return process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), '../../..');
}

/**
 * Fuse.js configuration for fuzzy searching registry entries.
 */
export const FUSE_OPTIONS: IFuseOptions<RegistryEntry> = {
  keys: [
    { name: 'name', weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords', weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
};
