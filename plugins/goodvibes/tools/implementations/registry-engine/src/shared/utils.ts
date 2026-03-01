/**
 * Shared utility functions for registry-engine.
 * Zero domain knowledge — generic helpers only.
 */

import * as fsPromises from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Check if a file exists asynchronously.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the directory containing this ESM module.
 * Handles both ESM and CJS contexts with appropriate fallbacks.
 *
 * Resolution order:
 * 1. __dirname (if defined, indicates CJS context)
 * 2. dirname(fileURLToPath(import.meta.url)) (ESM context)
 * 3. process.cwd() (fallback when import.meta fails)
 *
 * @returns The directory path of the calling module
 */
export const resolveEsmDir = (): string => {
  return dirname(fileURLToPath(import.meta.url));
};

/**
 * Resolves the module directory, handling both ESM and CJS contexts.
 *
 * @returns The directory path of the current module
 */
export const resolveModuleDir = (): string => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // ESM context: use import.meta.url to get the directory
  try { return resolveEsmDir(); } catch { return process.cwd(); }
};

/**
 * Start a timer and return a function to get elapsed milliseconds.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/**
 * Estimate token count from a string.
 * Rough approximation: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
