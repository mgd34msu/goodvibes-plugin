/**
 * JSON Auto-Escape for mcp-cli calls
 *
 * Automatically detects and fixes invalid JSON escape sequences in mcp-cli call commands.
 * When a Bash command contains `mcp-cli call` with malformed JSON, this module:
 *
 * 1. Extracts the JSON argument from the command (inline single/double quoted)
 * 2. Validates the JSON structure
 * 3. Identifies and fixes invalid escape sequences (e.g., `\.` `\d` `\[` `\]`)
 * 4. Returns the corrected command for use with `updatedInput`
 *
 * This ensures agents can use regex patterns in JSON arguments without manual escaping.
 *
 * ## Valid JSON Escape Sequences
 * - `\"` - double quote
 * - `\\` - backslash
 * - `\/` - forward slash
 * - `\b` - backspace
 * - `\f` - form feed
 * - `\n` - newline
 * - `\r` - carriage return
 * - `\t` - tab
 * - `\uXXXX` - unicode code point
 *
 * ## Common Invalid Escapes (auto-fixed)
 * - `\.` - literal period in regex
 * - `\d` - digit character class
 * - `\w` - word character class
 * - `\s` - whitespace character class
 * - `\[` `\]` - literal brackets
 * - Any other backslash + non-valid-escape character
 *
 * ## Escaping Behavior
 * Due to multiple layers of escaping (TypeScript → JS runtime → JSON.stringify →
 * Claude Code JSON.parse → shell execution), the fix uses 8 backslashes in source
 * (`\\\\\\\\`) to produce 2 backslashes in the final executed command.
 *
 * @module pre-tool-use/json-auto-escape
 */

/**
 * Set of valid JSON escape sequences.
 * Characters that can follow a backslash in valid JSON strings.
 */
const VALID_JSON_ESCAPES = new Set([
  '"',  // double quote
  '\\', // backslash
  '/',  // forward slash
  'b',  // backspace
  'f',  // form feed
  'n',  // newline
  'r',  // carriage return
  't',  // tab
  'u',  // unicode (must be followed by 4 hex digits)
]);

/**
 * Result of JSON escape fixing operation.
 */
export interface JsonFixResult {
  /** The fixed JSON string */
  fixed: string;
  /** Whether any fixes were applied */
  wasFixed: boolean;
  /** Number of escape sequences that were fixed */
  fixCount: number;
}

/**
 * Result of mcp-cli JSON extraction and fixing.
 */
export interface McpCliFixResult {
  /** The complete fixed command string */
  fixedCommand: string;
  /** Number of escape sequences that were fixed */
  fixCount: number;
}

/**
 * Attempts to fix invalid JSON escape sequences in a JSON string.
 *
 * Parses the string character by character, tracking whether we're inside
 * a JSON string value. When inside a string and encountering a backslash:
 * - If followed by a valid JSON escape character, leave it as-is
 * - If followed by an invalid escape character, double the backslash
 * - Special handling for `\u`: validates that 4 hex digits follow
 *
 * @param jsonString - The potentially malformed JSON string
 * @returns Object containing the fixed string, whether fixes were made, and count
 *
 * @example
 * ```typescript
 * // Invalid escape `\.` gets fixed to `\\.`
 * const result = fixJsonEscaping('{"pattern": "test\\.json"}');
 * // result.fixed = '{"pattern": "test\\\\.json"}'
 * // result.wasFixed = true
 * // result.fixCount = 1
 * ```
 */
export function fixJsonEscaping(jsonString: string): JsonFixResult {
  // Try parsing first - if valid, return as-is
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  } catch {
    // Continue to fix attempt
  }

  let result = '';
  let inString = false;
  let fixCount = 0;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    // Track string boundaries (accounting for escaped quotes)
    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === '\\') {
        backslashCount++;
        j--;
      }
      // If even number of backslashes (including 0), this quote toggles string state
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      continue;
    }

    // Inside a string, check for invalid escape sequences
    if (inString && char === '\\' && nextChar !== undefined) {
      // Check if next character is a valid JSON escape
      if (!VALID_JSON_ESCAPES.has(nextChar)) {
        // Invalid escape - add escaped backslash for valid JSON
        // 4 backslashes in source = 2 in string = valid JSON \\ = 1 backslash in parsed value
        result += '\\\\';
        fixCount++;
        continue;
      }

      // Special handling for \u - must be followed by 4 hex digits
      if (nextChar === 'u') {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          // Invalid unicode escape - add escaped backslash
          result += '\\\\';
          fixCount++;
          continue;
        }
      }
    }

    result += char;
  }

  // Verify the fix worked
  try {
    JSON.parse(result);
    return { fixed: result, wasFixed: fixCount > 0, fixCount };
  } catch {
    // Fix failed - return original
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  }
}

/**
 * Extracts JSON argument from an mcp-cli call command and attempts to fix it.
 *
 * Supports inline JSON format: `mcp-cli call server/tool '{...}'` or `"..."`
 *
 * @param command - The bash command string
 * @returns Object with fixed command and fix count, or null if not applicable
 *
 * @example
 * ```typescript
 * const result = checkAndFixMcpCliJson(
 *   "mcp-cli call server/tool '{\"pattern\": \"test\\.json\"}'"
 * );
 * // result.fixedCommand = "mcp-cli call server/tool '{\"pattern\": \"test\\\\.json\"}'"
 * // result.fixCount = 1
 * ```
 */
export function checkAndFixMcpCliJson(command: string): McpCliFixResult | null {
  // Match: mcp-cli call server/tool '{...}' or mcp-cli call server/tool "{...}"
  // Captures: [full match, prefix with trailing space, quote char, json content]
  const match = /^(mcp-cli\s+call\s+\S+\s+)(['"])(.+)\2\s*$/.exec(command);

  if (!match) {
    return null;
  }

  const [, prefix, quote, json] = match;
  const { fixed, wasFixed, fixCount } = fixJsonEscaping(json);

  if (wasFixed) {
    return {
      fixedCommand: `${prefix}${quote}${fixed}${quote}`,
      fixCount,
    };
  }

  return null;
}

/**
 * Checks if a command is an mcp-cli call command.
 *
 * @param command - The bash command string
 * @returns True if the command starts with mcp-cli call
 */
export function isMcpCliCall(command: string): boolean {
  return /^mcp-cli\s+call\s+/.test(command);
}
