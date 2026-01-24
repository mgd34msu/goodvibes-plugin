/**
 * JSON Auto-Escape for mcp-cli calls
 *
 * Automatically detects and fixes invalid JSON escape sequences in mcp-cli call commands.
 * When a Bash command contains `mcp-cli call` with malformed JSON, this module:
 * 1. Extracts the JSON argument (inline, stdin, or file)
 * 2. Validates the JSON
 * 3. Attempts to fix invalid escape sequences
 * 4. Blocks with a helpful message containing the corrected command
 *
 * This ensures agents can retry with properly escaped JSON without manual intervention.
 *
 * @module pre-tool-use/json-auto-escape
 */

/**
 * Set of valid JSON escape sequences (characters that can follow a backslash).
 * Valid escapes: \" \ \/ \b \f \n \r \t \uXXXX
 */
const VALID_JSON_ESCAPES = new Set([
  '"',        // quote
  '\\',       // backslash
  '/',        // forward slash
  'b',        // backspace
  'f',        // form feed
  'n',        // newline
  'r',        // carriage return
  't',        // tab
  'u',        // unicode (must be followed by 4 hex digits)
]);

const BACKSLASH = '\\';

/**
 * Attempts to fix invalid JSON escape sequences in a JSON string.
 *
 * Algorithm:
 * 1. Parse character by character, tracking whether we're inside a string
 * 2. When inside a string and we encounter a backslash:
 *    - Check if the next character is a valid JSON escape
 *    - If invalid, double the backslash to escape it properly
 *    - Special case for \u: validate that 4 hex digits follow
 * 3. Return the fixed JSON if it parses successfully
 *
 * @param jsonString - The potentially malformed JSON string
 * @returns The fixed JSON string, or original if already valid or unfixable
 */
export function fixJsonEscaping(jsonString: string): {
  fixed: string;
  wasFixed: boolean;
  fixCount: number;
} {
  // Try parsing first - if valid, return as-is
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  } catch (e) {
    // Continue to fix attempt
  }

  let result = '';
  let inString = false;
  let fixCount = 0;
  let i = 0;

  while (i < jsonString.length) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    // Track string boundaries (accounting for escaped quotes)
    if (char === '"') {
      // Count preceding backslashes to determine if this quote is escaped
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === BACKSLASH) {
        backslashCount++;
        j--;
      }
      // If even number of backslashes (including 0), this quote toggles string state
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      i++;
      continue;
    }

    // Inside a string, check for invalid escape sequences
    if (inString && char === BACKSLASH) {
      // End of string - just add the backslash
      if (nextChar === undefined) {
        result += char;
        i++;
        continue;
      }

      // Check if next character is a valid escape
      if (!VALID_JSON_ESCAPES.has(nextChar)) {
        // Invalid escape - double the backslash to escape it
        result += BACKSLASH + BACKSLASH;
        fixCount++;
        i++;
        continue;
      }

      // Special handling for \u - must be followed by 4 hex digits
      if (nextChar === 'u') {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          // Invalid unicode escape - double the backslash
          result += BACKSLASH + BACKSLASH;
          fixCount++;
          i++;
          continue;
        }
      }
    }

    result += char;
    i++;
  }

  // Verify the fix worked
  try {
    JSON.parse(result);
    return { fixed: result, wasFixed: fixCount > 0, fixCount };
  } catch (e) {
    // Fix failed - return original
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  }
}

/**
 * Extracts JSON argument from an mcp-cli call command.
 *
 * Supports three formats:
 * 1. Inline JSON: mcp-cli call server/tool '{...}'
 * 2. Stdin: mcp-cli call server/tool - (with heredoc or pipe)
 * 3. File: mcp-cli call server/tool --json-file path/to/file.json
 *
 * @param command - The bash command string
 * @returns Extracted JSON and metadata, or null if not extractable
 */
export function extractMcpCliJson(command: string): {
  json: string;
  format: 'inline' | 'stdin' | 'file';
  serverTool: string;
} | null {
  // Match: mcp-cli call server/tool ...
  const mcpCallMatch = /mcp-cli\s+call\s+([\w_-]+\/[\w_-]+)(.*)$/i.exec(command);
  if (!mcpCallMatch) {
    return null;
  }

  const serverTool = mcpCallMatch[1];
  const argsSection = mcpCallMatch[2].trim();

  // Format 1: Inline JSON - look for quoted JSON object/array
  // Match single-quoted or double-quoted JSON
  const inlineMatch = /['"]([{\[].*)['"]\s*$/.exec(argsSection);
  if (inlineMatch) {
    return {
      json: inlineMatch[1],
      format: 'inline',
      serverTool,
    };
  }

  // Format 2: Stdin - command ends with '-' or contains heredoc/pipe
  if (/\s+-\s*$/.test(argsSection) || /<</.test(command) || /\|/.test(command)) {
    // Can't extract JSON from stdin in pre-tool-use hook
    // We'd need to parse heredoc or wait for pipe input
    return {
      json: '',
      format: 'stdin',
      serverTool,
    };
  }

  // Format 3: File - --json-file flag
  if (/--json-file/.test(argsSection)) {
    // Can't extract JSON from file without reading it
    return {
      json: '',
      format: 'file',
      serverTool,
    };
  }

  return null;
}

/**
 * Checks if a Bash command contains an mcp-cli call with invalid JSON.
 * If found, attempts to fix the JSON and returns a block message with the corrected command.
 *
 * @param command - The bash command to check
 * @returns Block message with corrected command, or null if no fix needed
 */
export function checkAndFixMcpCliJson(command: string): string | null {
  const extracted = extractMcpCliJson(command);

  // Not an mcp-cli call, or using stdin/file (can't validate here)
  if (!extracted || !extracted.json || extracted.format !== 'inline') {
    return null;
  }

  const { json, serverTool } = extracted;
  const result = fixJsonEscaping(json);

  // JSON was invalid and we fixed it
  if (result.wasFixed) {
    const correctedCommand = `mcp-cli call ${serverTool} '${result.fixed}'`;

    return (
      `JSON escape error detected in mcp-cli call.\n\n` +
      `Invalid escape sequences found: ${result.fixCount}\n` +
      `Common issue: Regex patterns like \. \d \w need double escaping in JSON.\n\n` +
      `Fixed command:\n` +
      `${correctedCommand}\n\n` +
      `Please use the corrected command above.\n`
    );
  }

  // JSON is valid, no fix needed
  return null;
}
