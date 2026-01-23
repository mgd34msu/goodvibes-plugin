/**
 * Standard Error Formatting Utilities
 *
 * All precision-engine tools should use these utilities for consistent error messages.
 */

// Example calls for each tool (used in error messages)
export const TOOL_EXAMPLES: Record<string, string> = {
  precision_read: "{\"files\": [{\"path\": \"src/index.ts\"}], \"output_mode\": \"standard\"}",
  precision_write: "{\"files\": [{\"path\": \"output.txt\", \"content\": \"Hello\"}], \"output_mode\": \"minimal\"}",
  precision_edit: "{\"edits\": [{\"path\": \"file.ts\", \"old\": \"foo\", \"new\": \"bar\"}], \"output_mode\": \"with_diff\"}",
  precision_grep: "{\"queries\": [{\"id\": \"search\", \"pattern\": \"TODO\"}], \"output_mode\": \"standard\"}",
  precision_glob: "{\"patterns\": [\"**/*.ts\"], \"output_mode\": \"paths_only\"}",
  precision_symbols: "{\"files\": [\"src/index.ts\"], \"output_mode\": \"signatures\"}",
  precision_exec: "{\"command\": \"echo hello\", \"output_mode\": \"standard\"}",
  precision_fetch: "{\"url\": \"https://example.com\", \"output_mode\": \"standard\"}",
  discover: "{\"queries\": [{\"id\": \"find\", \"type\": \"glob\", \"patterns\": [\"**/*.ts\"]}], \"output_mode\": \"files_only\"}",
};

/**
 * Format error for missing required parameter
 */
export function formatMissingParamError(
  toolName: string,
  paramName: string,
  expectedType: string
): string {
  const example = TOOL_EXAMPLES[toolName] || "{}";
  return `Missing required parameter '${paramName}'. Expected: ${expectedType}.
Example: ${example}`;
}

/**
 * Format error for invalid parameter value
 */
export function formatInvalidValueError(
  paramName: string,
  actualValue: unknown,
  validValues: string[]
): string {
  return `Invalid value for '${paramName}': ${JSON.stringify(actualValue)}. Valid values: [${validValues.join(", ")}]`;
}

/**
 * Format error for type mismatch
 */
export function formatTypeMismatchError(
  paramName: string,
  expectedType: string,
  actualType: string
): string {
  return `Type mismatch for '${paramName}'. Expected: ${expectedType}, got: ${actualType}`;
}

/**
 * Format error for file not found
 */
export function formatFileNotFoundError(
  filePath: string,
  suggestions?: string[]
): string {
  let msg = `File not found: ${filePath}`;
  if (suggestions && suggestions.length > 0) {
    msg += `
Did you mean: ${suggestions.slice(0, 3).join(", ")}?`;
  }
  return msg;
}

/**
 * Create standard error result object
 */
export function createErrorResult(error: string, meta?: Record<string, unknown>) {
  return {
    success: false,
    error,
    meta: {
      output_mode: "minimal",
      token_estimate: Math.ceil(error.length / 4),
      execution_ms: 0,
      ...meta,
    },
  };
}

/**
 * Enhances a JSON parse error with helpful context
 */
export function enhanceJsonParseError(
  error: SyntaxError,
  jsonString: string
): string {
  const message = error.message;

  // Extract position from error message like "at position 104"
  const posMatch = message.match(/position (\d+)/i);
  const position = posMatch ? parseInt(posMatch[1], 10) : -1;

  let enhanced = `JSON Parse Error: ${message}
`;

  if (position >= 0 && position < jsonString.length) {
    // Show context around error
    const start = Math.max(0, position - 30);
    const end = Math.min(jsonString.length, position + 30);
    const before = jsonString.slice(start, position);
    const after = jsonString.slice(position, end);
    const char = jsonString[position] || 'EOF';

    enhanced += `
Error at position ${position}:
`;
    enhanced += `  ...${before}[HERE -> '${char}']${after}...
`;
  }

  // Detect common escaping issues
  if (message.includes('escape') || message.includes('backslash')) {
    enhanced += formatEscapingSuggestion();
  }

  return enhanced;
}

/**
 * Formats a suggestion for using base64 encoding
 */
export function formatEscapingSuggestion(): string {
  return `
Suggestion: Use base64 encoding for patterns with special characters.

Example - encode your pattern:
  echo -n 'your-pattern\.here' | base64

Then use the *_base64 field instead:
  {
    "pattern_base64": "eW91ci1wYXR0ZXJuXC5oZXJl"
  }

Alternatively, use a file reference:
  {
    "pattern_file": "/path/to/pattern.txt"
  }
`;
}

/**
 * Formats an error for mutual exclusivity violations
 */
export function formatMutualExclusivityError(
  fieldName: string,
  providedSources: string[]
): string {
  return `Multiple input sources provided for '${fieldName}'.
Found: ${providedSources.join(', ')}
Please provide only ONE of:
  - ${fieldName}: Direct string value
  - ${fieldName}_base64: Base64-encoded value
  - ${fieldName}_file: Path to file containing value
`;
}
