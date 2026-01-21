/**
 * Configuration for Registry Engine MCP Server
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { IFuseOptions } from 'fuse.js';
import { RegistryEntry } from './types.js';

export const SERVER_NAME = 'registry-engine';
export const SERVER_VERSION = '1.0.0';

/**
 * Gets the directory containing this config file.
 * Handles both ESM and CJS contexts with appropriate fallbacks.
 *
 * Resolution order:
 * 1. __dirname (if defined, indicates CJS context)
 * 2. dirname(fileURLToPath(import.meta.url)) (ESM context)
 * 3. process.cwd() (fallback when import.meta fails)
 *
 * @returns The directory path of the config module
 * @internal Exported for testing purposes
 */
const getEsmDir = (): string => {
  // @ts-expect-error - import.meta.url is only available in ESM context; this code runs in both ESM and CJS bundles
  return dirname(fileURLToPath(import.meta.url));
};

export const getConfigDir = (): string => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // ESM context: use import.meta.url to get the directory
  try { return getEsmDir(); } catch { return process.cwd(); }
};

/**
 * Root directory of the GoodVibes plugin.
 * Resolved from environment variables or relative to config location.
 * @example "/home/user/project/plugins/goodvibes"
 */
export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), '../../..');

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

/**
 * Fuse.js configuration for fuzzy searching registry entries.
 * Weighted search across name, description, and keywords fields.
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
