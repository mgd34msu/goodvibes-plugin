/**
 * Standard error-message formatting, shared by every v2 server.
 * Ported from v1 precision-engine `utils/errors.ts`, trimmed to the generic
 * helpers (the precision-specific TOOL_EXAMPLES map does not carry forward).
 */

/** Format an error for a missing required parameter. */
export function formatMissingParamError(
  toolName: string,
  paramName: string,
  expectedType: string,
): string {
  return `Missing required parameter '${paramName}' for ${toolName}. Expected: ${expectedType}.`;
}

/** Format an error for an invalid parameter value against a set of valid values. */
export function formatInvalidValueError(
  paramName: string,
  actualValue: unknown,
  validValues: string[],
): string {
  return `Invalid value for '${paramName}': ${JSON.stringify(actualValue)}. Valid values: [${validValues.join(', ')}]`;
}

/** Format a type-mismatch error. */
export function formatTypeMismatchError(
  paramName: string,
  expectedType: string,
  actualType: string,
): string {
  return `Type mismatch for '${paramName}'. Expected: ${expectedType}, got: ${actualType}`;
}

/** Format a file-not-found error, optionally with near-miss suggestions. */
export function formatFileNotFoundError(filePath: string, suggestions?: string[]): string {
  let msg = `File not found: ${filePath}`;
  if (suggestions && suggestions.length > 0) {
    msg += `\nDid you mean: ${suggestions.slice(0, 3).join(', ')}?`;
  }
  return msg;
}

/** Format a mutual-exclusivity violation (multiple input sources for one field). */
export function formatMutualExclusivityError(fieldName: string, providedSources: string[]): string {
  return (
    `Multiple input sources provided for '${fieldName}'.\n` +
    `Found: ${providedSources.join(', ')}\n` +
    `Provide only ONE of: ${fieldName}, ${fieldName}_base64, ${fieldName}_file.`
  );
}

/**
 * Standard "native dependency missing" message for a capability whose backing
 * package is one of the externalized native/WASM deps installed by the one-time
 * plugin setup (tree-sitter, sql.js, ast-grep, ripgrep). A tool that reaches a
 * missing dep returns this as a NORMAL error envelope — never a crash, never a
 * hang. The wording also covers the post-update case, where a plugin update
 * replaces the installed `server/<name>/node_modules` and setup must run again.
 *
 * @param capability - the user-facing capability name (e.g. "code_read outline mode").
 */
export function nativeDepMessage(capability: string): string {
  return (
    `${capability} needs native dependencies that are not installed yet - ` +
    `run /goodvibes:plugin setup (one-time). This also happens after a plugin ` +
    `update, which replaces the installed dependencies.`
  );
}

/** Enhance a JSON parse error with a pointer to the offending position. */
export function enhanceJsonParseError(error: SyntaxError, jsonString: string): string {
  const message = error.message;
  const posMatch = message.match(/position (\d+)/i);
  const position = posMatch ? parseInt(posMatch[1], 10) : -1;
  let enhanced = `JSON Parse Error: ${message}`;
  if (position >= 0 && position < jsonString.length) {
    const start = Math.max(0, position - 30);
    const end = Math.min(jsonString.length, position + 30);
    const before = jsonString.slice(start, position);
    const after = jsonString.slice(position, end);
    const char = jsonString[position] || 'EOF';
    enhanced += `\nAt position ${position}: ...${before}[HERE -> '${char}']${after}...`;
  }
  return enhanced;
}
