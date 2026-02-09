/**
 * Deprecation warning utilities for precision-engine
 * Centralizes deprecation warnings to avoid spam and provide consistent messaging
 */

// Track which warnings have been shown to avoid repeated logging
const shownWarnings = new Set<string>();

/**
 * Log a deprecation warning for a parameter, only once per session.
 * Centralized deprecation warning to avoid spam and provide consistent messaging.
 * 
 * @param oldName - The deprecated parameter name (e.g., "file", "max_files")
 * @param newName - The new parameter name to use instead (e.g., "path", "max_results")
 * @param toolName - The tool where this parameter is used (e.g., "precision_edit", "precision_grep")
 * @returns void
 * 
 * @example
 * warnDeprecatedParam('file', 'path', 'precision_edit');
 * // Logs: [precision_edit] Parameter "file" is deprecated. Use "path" instead.
 */
export function warnDeprecatedParam(oldName: string, newName: string, toolName: string): void {
  const key = `${toolName}:${oldName}`;
  if (shownWarnings.has(key)) return;

  shownWarnings.add(key);
  console.warn(`[${toolName}] Parameter "${oldName}" is deprecated. Use "${newName}" instead.`);
}

/**
 * Clear all shown warnings (useful for testing)
 */
export function clearDeprecationWarnings(): void {
  shownWarnings.clear();
}
