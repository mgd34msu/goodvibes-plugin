  /**
   * @fileoverview Claude Code PreToolUse hook for auto-fixing invalid JSON escapes in mcp-cli commands.
   *
   * @description
   * When Claude generates mcp-cli calls with regex patterns (e.g., `\s`, `\d`, `\w`),
   * these are invalid JSON escape sequences. This hook intercepts Bash commands,
   * detects mcp-cli calls, and fixes the JSON by doubling invalid backslash escapes.
   *
   * Additionally, Claude Code strips one layer of backslashes when applying `updatedInput`,
   * so this hook doubles ALL backslashes in the final command to compensate.
   *
   * @example
   * Input:  mcp-cli call server/tool '{"pattern": "function\s+\w+"}'
   * Output: mcp-cli call server/tool '{"pattern": "function\\s+\\w+"}'
   *
   * @author GoodVibes
   * @license MIT
   */

  /**
   * Regex to match mcp-cli call commands with JSON in single quotes.
   * Captures: [1] prefix, [2] JSON content, [3] suffix
   */
  const MCP_CLI_REGEX = /^(mcp-cli\s+call\s+\S+\s+')(.+)('\s*)$/;

  /**
   * Send a pass-through response (allow original command to execute).
   */
  function passThrough() {
    console.log('{"continue":true}');
    process.exit(0);
  }

  /**
   * Send an updatedInput response with a modified command.
   * @param {string} command - The modified command to execute
   */
  function sendUpdatedCommand(command) {
    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { command }
      }
    }));
  }

  /**
   * Fix unescaped quotes inside JSON string values.
   * Detects patterns like: "key": ""value"..."
   * And converts to: "key": "\"value\"..."
   *
   * @param {string} json - JSON string with potentially unescaped quotes
   * @returns {string} Fixed JSON string
   */
  function fixUnescapedQuotes(json) {
    let result = '';
    let i = 0;
    let inString = false;

    while (i < json.length) {
      const char = json[i];
      const prevChar = i > 0 ? json[i-1] : '';
      const nextChar = i < json.length - 1 ? json[i+1] : '';

      if (char === '"' && prevChar !== '\\') {
        if (!inString) {
          // Starting a string
          inString = true;
          result += char;

          // Check for "" pattern where second quote should be escaped
          if (nextChar === '"' && i + 2 < json.length) {
            const afterNext = json[i + 2];
            // If after "" we have alphanumeric, the second quote is content
            if (afterNext && /[a-zA-Z0-9]/.test(afterNext)) {
              // Skip the next quote and escape it
              result += '\\"';
              i += 2;
              continue;
            }
          }
        } else {
          // Inside string - is this the end or an internal quote?
          // Look ahead: if next is ,}]: or end, it's the real end
          if (nextChar === '' || /[,:}\]]/.test(nextChar)) {
            inString = false;
            result += char;
          } else {
            // Quote inside string - escape it
            result += '\\' + char;
          }
        }
      } else {
        result += json[i];
      }
      i++;
    }
    return result;
  }

  /**
   * Recover lost backslashes in common regex patterns.
   *
   * When backslashes are stripped during JSON transport, patterns like:
   * - \s becomes s, \d becomes d, \w becomes w
   * - \S becomes S, \D becomes D, \W becomes W
   * - \b becomes b (word boundary)
   *
   * This function detects likely regex quantifier patterns and restores backslashes.
   * E.g., "s*:" likely was "\s*:", "w+" likely was "\w+"
   *
   * @param {string} json - JSON with potentially stripped backslashes
   * @returns {string} JSON with recovered backslashes
   */
  function recoverLostBackslashes(json) {
    // Common regex character classes that lose their backslash
    // Pattern: letter followed by quantifier (*, +, ?, {n}) suggests it was \letter
    const REGEX_CHARS = 'sdwSWDb';

    let result = '';
    let i = 0;

    while (i < json.length) {
      const char = json[i];
      const nextChar = json[i + 1] || '';
      const prevChar = json[i - 1] || '';

      // Check if this looks like a stripped regex character class
      // Pattern: [sdwSWDb] followed by quantifier [*+?{] or end of pattern context
      if (REGEX_CHARS.includes(char) && prevChar !== '\\') {
        // Check if followed by a quantifier
        if (/[*+?{]/.test(nextChar)) {
          // This is likely a stripped regex class - add backslash
          result += '\\' + char;
          i++;
          continue;
        }
      }

      result += char;
      i++;
    }

    return result;
  }

  /**
   * Fix invalid JSON escape sequences by doubling backslashes.
   *
   * Valid JSON escapes per RFC 8259:
   * - Single char: \" \\ \/ \b \f \n \r \t
   * - Unicode: \uXXXX (exactly 4 hex digits)
   *
   * Any other \X sequence is invalid and must become \\X.
   *
   * @param {string} json - JSON string with potentially invalid escapes
   * @returns {string} Fixed JSON string
   */
  function fixInvalidEscapes(json) {
    const VALID_ESCAPES = '"\\/bfnrt';
    let result = '';
    let i = 0;

    while (i < json.length) {
      if (json[i] === '\\' && i + 1 < json.length) {
        const nextChar = json[i + 1];

        if (VALID_ESCAPES.includes(nextChar)) {
          // Valid single-char escape - pass through
          result += json[i] + nextChar;
          i += 2;
        } else if (nextChar === 'u') {
          // Check for valid \uXXXX (exactly 4 hex digits)
          const hex = json.slice(i + 2, i + 6);
          if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
            // Valid unicode escape - pass through
            result += json.slice(i, i + 6);
            i += 6;
          } else {
            // Invalid \u - double the backslash
            result += '\\\\' + nextChar;
            i += 2;
          }
        } else {
          // Invalid escape - double the backslash
          result += '\\\\' + nextChar;
          i += 2;
        }
      } else {
        result += json[i];
        i++;
      }
    }

    return result;
  }

  /**
   * Attempt to fix JSON by applying all fix strategies.
   * @param {string} json - Potentially invalid JSON
   * @returns {string|null} Fixed JSON or null if unfixable
   */
  function tryFixJson(json) {
    // Try original first
    try {
      JSON.parse(json);
      return json;
    } catch {}

    // Try fixing unescaped quotes first (structural fix)
    let fixed = fixUnescapedQuotes(json);
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {}

    // Try fixing invalid escapes
    fixed = fixInvalidEscapes(json);
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {}

    // Try both: quotes first, then escapes
    fixed = fixInvalidEscapes(fixUnescapedQuotes(json));
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {}

    // Try recovering lost backslashes, then fix escapes
    fixed = fixInvalidEscapes(recoverLostBackslashes(fixUnescapedQuotes(json)));
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {}

    return null;
  }

  // =============================================================================
  // Main Hook Logic
  // =============================================================================

  const { appendFileSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const LOG = join(tmpdir(), 'hook-debug.log');
  const log = (msg) => appendFileSync(LOG, msg + '\n');

  // Read hook input from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString());

  log(`\n=== ${new Date().toISOString()} ===`);
  log(`Tool: ${input.tool_name}`);

  // Only process Bash commands
  if (input.tool_name !== 'Bash') {
    log('Not Bash, passing through');
    passThrough();
  }

  const cmd = input.tool_input?.command || '';
  log(`Command: ${cmd}`);

  // Only process mcp-cli calls with JSON arguments
  const match = cmd.match(MCP_CLI_REGEX);
  if (!match) {
    log('Regex did not match, passing through');
    passThrough();
  }

  const [, prefix, json, suffix] = match;
  log(`Extracted JSON: ${json}`);

  // Try to fix the JSON
  const finalJson = tryFixJson(json);
  log(`Fixed JSON: ${finalJson}`);
  if (!finalJson) {
    log('Could not fix JSON, passing through');
    passThrough();
  }

  // Reassemble command and double ALL backslashes
  // (Claude Code strips one layer when applying updatedInput)
  const fixedCommand = prefix + finalJson + suffix;
  const doubledCommand = fixedCommand.replace(/\\/g, '\\\\');
  log(`Final command: ${doubledCommand}`);

  // Send the fixed command
  sendUpdatedCommand(doubledCommand);