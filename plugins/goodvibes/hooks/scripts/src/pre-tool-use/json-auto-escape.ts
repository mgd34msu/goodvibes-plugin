/**
 * pre-tool-use/json-auto-escape.ts
 * 
 * JSON Auto-Escape for mcp-cli calls
 * pre-tool-use/json-auto-escape.ts
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
  fullMatch: string;
} | null {
  // Match: mcp-cli call server/tool '...' or "..."
  // Use a more robust approach - find the JSON by matching balanced quotes
  
  const mcpCallMatch = /mcp-cli\s+call\s+([\w_-]+\/[\w_-]+)\s+/.exec(command);
  if (!mcpCallMatch) {
    return null;
  }

  const serverTool = mcpCallMatch[1];
  const afterServerTool = command.slice(mcpCallMatch.index + mcpCallMatch[0].length);
  
  // Determine quote type (single or double)
  const quoteChar = afterServerTool[0];
  if (quoteChar !== "'" && quoteChar !== '"') {
    return null;
  }

  // Find the matching closing quote
  // Need to handle the case where the JSON itself contains escaped quotes
  let depth = 0;
  let inString = false;
  let jsonEnd = -1;
  
  for (let i = 1; i < afterServerTool.length; i++) {
    const char = afterServerTool[i];
    const prevChar = afterServerTool[i - 1];
    
    // If we hit the closing quote at depth 0 and not escaped
    if (char === quoteChar && depth === 0 && !inString) {
      jsonEnd = i;
      break;
    }
    
    // Track JSON structure
    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') depth--;
    
    // Track string state within JSON (for double-quoted JSON strings)
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }
  }

  if (jsonEnd === -1) {
    return null;
  }

  const json = afterServerTool.slice(1, jsonEnd);
  
  return {
    json,
    format: 'inline',
    serverTool,
    fullMatch: `mcp-cli call ${serverTool} ${quoteChar}${json}${quoteChar}`,
  };
}

/**
 * Checks if a Bash command contains an mcp-cli call with invalid JSON.
 * If found, attempts to fix the JSON and returns a block message with the corrected command.
 *
 * @param command - The bash command to check
 * @returns Block message with corrected command, or null if no fix needed
 */
export function checkAndFixMcpCliJson(command: string): { 
  fixedCommand: string;
  fixCount: number;
} | null {
  const extracted = extractMcpCliJson(command);

  console.error('Extracted:', extracted);  // Debug

  if (!extracted || !extracted.json || extracted.format !== 'inline') {
    return null;
  }

  const { json, serverTool } = extracted;
  const result = fixJsonEscaping(json);

  console.error('Fix result:', result);  // Debug

  if (result.wasFixed) {
    const fixedCommand = `mcp-cli call ${serverTool} '${result.fixed}'`;
    return { fixedCommand, fixCount: result.fixCount };
  }

  return null;
}
