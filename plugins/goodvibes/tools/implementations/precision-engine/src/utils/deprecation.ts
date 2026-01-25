/**
 * Deprecation warning utilities for precision-engine
 * Centralizes deprecation warnings to avoid spam and provide consistent messaging
 */

// Track which warnings have been shown to avoid repeated logging
const shownWarnings = new Set<string>();

/**
 * Log a deprecation warning for a parameter, only once per session
 * @param oldName - The deprecated parameter name
 * @param newName - The new parameter name to use
 * @param toolName - The tool where this parameter is used
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
