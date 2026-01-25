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
 * @module pre-tool-use/tool-update
 */

// =============================================================================
// Types
// =============================================================================

/** Input received from Claude Code hook system via stdin */
interface HookInput {
  /** Name of the tool being invoked */
  tool_name: string;
  /** Tool-specific input parameters */
  tool_input?: {
    /** Command string for Bash tool */
    command?: string;
    [key: string]: unknown;
  };
  /** Current working directory */
  cwd?: string;
}

/** Response structure for pass-through (allow original command) */
export interface PassThroughResponse {
  continue: true;
}

/** Response structure for command modification */
export interface UpdatedInputResponse {
  continue: true;
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow';
    updatedInput: {
      command: string;
    };
  };
}

export type HookResponse = PassThroughResponse | UpdatedInputResponse;

// =============================================================================
// Constants
// =============================================================================

/**
 * Regex to match mcp-cli call commands with JSON in single quotes.
 * Captures: [1] prefix, [2] JSON content, [3] suffix
 */
export const MCP_CLI_REGEX = /^(mcp-cli\s+call\s+\S+\s+')(.+)('\s*)$/;

// =============================================================================
// Response Functions
// =============================================================================

/**
 * Send a pass-through response (allow original command to execute).
 */
export function passThrough(): never {
  const response: PassThroughResponse = { continue: true };
  console.log(JSON.stringify(response));
  process.exit(0);
}

/**
 * Send an updatedInput response with a modified command.
 * @param command - The modified command to execute
 */
export function sendUpdatedCommand(command: string): void {
  const response: UpdatedInputResponse = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { command }
    }
  };
  console.log(JSON.stringify(response));
}

// =============================================================================
// JSON Fix Functions
// =============================================================================

/**
 * Fix invalid JSON escape sequences by doubling backslashes.
 * Converts \s, \d, \w, etc. to \\s, \\d, \\w, etc.
 * @param json - JSON string with potentially invalid escapes
 * @returns Fixed JSON string
 */
export function fixInvalidEscapes(json: string): string {
  return json.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
}

/**
 * Check if a string is valid JSON.
 * @param str - String to validate
 * @returns True if valid JSON, false otherwise
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Main Hook Logic
// =============================================================================

export async function main(): Promise<void> {
  // Read hook input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input: HookInput = JSON.parse(Buffer.concat(chunks).toString());

  // Only process Bash commands
  if (input.tool_name !== 'Bash') {
    passThrough();
  }

  const cmd = input.tool_input?.command ?? '';

  // Only process mcp-cli calls with JSON arguments
  const match = cmd.match(MCP_CLI_REGEX);
  if (!match) {
    passThrough();
  }

  const [, prefix, json, suffix] = match;

  // Determine final JSON (fix if needed, use as-is if already valid)
  let finalJson: string;

  if (isValidJson(json)) {
    finalJson = json;
  } else {
    const fixed = fixInvalidEscapes(json);

    if (isValidJson(fixed)) {
      finalJson = fixed;
    } else {
      passThrough();
    }
  }

  // Reassemble command and double ALL backslashes
  // (Claude Code strips one layer when applying updatedInput)
  const fixedCommand = prefix + finalJson + suffix;
  const doubledCommand = fixedCommand.replace(/\\/g, '\\\\');

  // Send the fixed command
  sendUpdatedCommand(doubledCommand);
}

main();
