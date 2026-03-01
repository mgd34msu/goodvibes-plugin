/**
 * Runtime configuration for project-engine v2.0.0.
 *
 * Provides environment-derived path constants used throughout the engine.
 */

import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { logger } from './logger.js';

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Gets the directory containing this module file.
 * Handles ESM context via import.meta.url.
 */
const resolveEsmDir = (): string => {
  return dirname(fileURLToPath(import.meta.url));
};

/**
 * Resolve the current module directory, handling both ESM and CJS contexts.
 *
 * @returns Absolute path to the directory containing this module
 */
export function resolveModuleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try { return resolveEsmDir(); } catch { return process.cwd(); }
}

// =============================================================================
// Path Constants
// =============================================================================

/**
 * Root directory of the GoodVibes plugin.
 * Resolved from PLUGIN_ROOT env var, CLAUDE_PLUGIN_ROOT env var, or relative to module.
 */
export const PLUGIN_ROOT = ((): string => {
  try {
    return (
      process.env.PLUGIN_ROOT ||
      process.env.CLAUDE_PLUGIN_ROOT ||
      nodePath.resolve(resolveModuleDir(), '../../..')
    );
  } catch (err) {
    logger.warn('[config] Failed to resolve PLUGIN_ROOT, falling back to cwd', err);
    return process.cwd();
  }
})();

/**
 * Root directory of the current project being analyzed.
 * Resolved from PROJECT_ROOT env var, CLAUDE_PROJECT_DIR env var, or process.cwd().
 */
export const PROJECT_ROOT =
  process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();

// =============================================================================
// Accessor Functions
// =============================================================================

/**
 * Get the plugin root directory.
 *
 * @returns Absolute path to the GoodVibes plugin root
 */
export function getPluginRoot(): string {
  return PLUGIN_ROOT;
}

/**
 * Get the project root directory being analyzed.
 *
 * @returns Absolute path to the current project root
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
