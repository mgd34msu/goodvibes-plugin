/* v8 ignore file */
/**
 * Pre Tool Use Hook Entry Point
 *
 * Blocks native tools (Read, Edit, Write, Glob, Grep) and redirects to precision-engine.
 * Auto-fixes invalid JSON escapes in mcp-cli call commands.
 * Exit code 2 + stderr = blocks tool, message shown to Claude
 * Exit code 0 + no output = allows tool to proceed
 */

import { readHookInput, allowTool, blockTool, respond } from './shared/hook-io.js';

//import { TOOL_REPLACEMENTS, formatBlockMessage, isBlockedNativeTool } from './pre-tool-use/subagent-blockers.js';
//import { checkAndFixMcpCliJson } from './pre-tool-use/json-auto-escape.js';
import { writeFileSync } from 'fs';
async function main() {
  const input = await readHookInput();
  const toolName = input.tool_name ?? '';

  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    console.error(`[TOOL] ${input.tool_name}`);
    console.log(JSON.stringify(allowTool('PreToolUse')));
  });
  writeFileSync('/tmp/hook-debug.log', `Tool Name: ${JSON.stringify(toolName)}\n`, { flag: 'a' });
/**
  // Check for mcp-cli call with invalid JSON - auto-fix via updatedInput
  if (toolName === 'Bash') {
    const command = (input.tool_input?.command as string) || '';
    const result = checkAndFixMcpCliJson(command);
    if (result && result.fixedCommand) {
      // Use respond() with updatedInput to transparently fix the command
      respond({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            command: result.fixedCommand
          }
        }
      });
    }
  }

  // Check for blocked native tools
  if (isBlockedNativeTool(toolName)) {
    const replacement = TOOL_REPLACEMENTS[toolName];
    if (replacement) {
      blockTool(formatBlockMessage(toolName, replacement));
    }
  }
  */
  // Tool not blocked - exit 0 with no output to allow
  //process.exit(0);
}

main();
