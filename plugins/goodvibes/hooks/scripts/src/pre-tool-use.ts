/* v8 ignore file */
/**
 * Pre Tool Use Hook Entry Point
 *
 * Blocks native tools (Read, Edit, Write, Glob, Grep) and redirects to precision-engine.
 * Auto-fixes invalid JSON escapes in mcp-cli call commands.
 * Exit code 2 + stderr = blocks tool, message shown to Claude
 * Exit code 0 + no output = allows tool to proceed
 */

import { readHookInput, blockTool } from './shared/hook-io.js';
import { TOOL_REPLACEMENTS, formatBlockMessage, isBlockedNativeTool } from './pre-tool-use/subagent-blockers.js';
import { checkAndFixMcpCliJson } from './pre-tool-use/json-auto-escape.js';

async function main() {
  const input = await readHookInput();
  console.error('[HOOK START] toolName:', input.tool_name);
  const toolName = input.tool_name ?? '';

  // Check for mcp-cli call with invalid JSON - auto-fix and execute transparently
  if (toolName === 'Bash') {
    const command = (input.tool_input?.command as string) || '';
    // DEBUG
    console.error('[DEBUG] Command:', command);
    const result = checkAndFixMcpCliJson(command);
    console.error('[DEBUG] Result:', JSON.stringify(result));
    if (result && result.fixedCommand) {
      // Return the fixed command via updatedInput - Claude Code will execute it
      const response = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: {
            command: result.fixedCommand
          }
        }
      };
      process.stdout.write(JSON.stringify(response));
      process.exit(0);
    }
  }

  // Check for blocked native tools
  if (isBlockedNativeTool(toolName)) {
    const replacement = TOOL_REPLACEMENTS[toolName];
    if (replacement) {
      blockTool(formatBlockMessage(toolName, replacement));
    }
  }
  
  // Tool not blocked - exit 0 with no output to allow
  process.exit(0);
}

main();
