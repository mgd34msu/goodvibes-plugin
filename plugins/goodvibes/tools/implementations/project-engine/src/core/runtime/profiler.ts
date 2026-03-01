/**
 * Function profiler utilities for the runtime domain.
 *
 * @module core/runtime/profiler
 */

/**
 * Extracts a named function from a dynamically imported module's exports.
 *
 * Handles direct named exports and named methods on the `default` export.
 *
 * @param module - Module object from a dynamic import
 * @param functionName - Name of the function to extract
 * @returns The function if found, or null if not available
 *
 * @example
 * const module = await import('./myModule.js');
 * const fn = extractFunction(module, 'myFunction');
 * if (fn) fn('arg1', 'arg2');
 */
export function extractFunction(
  module: Record<string, unknown>,
  functionName: string
): ((...args: unknown[]) => unknown) | null {
  // Direct export
  if (typeof module[functionName] === 'function') {
    return module[functionName] as (...args: unknown[]) => unknown;
  }

  // Default export with named function
  const defaultExport = module.default;
  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    typeof (defaultExport as Record<string, unknown>)[functionName] === 'function'
  ) {
    return (defaultExport as Record<string, unknown>)[functionName] as (...args: unknown[]) => unknown;
  }

  return null;
}
