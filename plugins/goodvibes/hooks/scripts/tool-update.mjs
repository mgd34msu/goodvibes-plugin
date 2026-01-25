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

  // =============================================================================
  // Main Hook Logic
  // =============================================================================

  // Read hook input from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString());

  // Only process Bash commands
  if (input.tool_name !== 'Bash') {
    passThrough();
  }

  const cmd = input.tool_input?.command || '';

  // Only process mcp-cli calls with JSON arguments
  const match = cmd.match(MCP_CLI_REGEX);
  if (!match) {
    passThrough();
  }

  const [, prefix, json, suffix] = match;

  // Check if JSON is already valid
  let finalJson;
  try {
    JSON.parse(json);
    finalJson = json;
  } catch {
    // Fix invalid escape sequences (\s -> \\s)
    const fixed = fixInvalidEscapes(json);

    // Verify the fix produces valid JSON
    try {
      JSON.parse(fixed);
      finalJson = fixed;
    } catch {
      passThrough();
    }
  }

  // Reassemble command and double ALL backslashes
  // (Claude Code strips one layer when applying updatedInput)
  const fixedCommand = prefix + finalJson + suffix;
  const doubledCommand = fixedCommand.replace(/\\/g, '\\\\');

  // Send the fixed command
  sendUpdatedCommand(doubledCommand);