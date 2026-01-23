/* v8 ignore file */
/**
 * Pre Tool Use Hook Entry Point
 *
 * Blocks native tools (Read, Edit, Write, Glob, Grep) and redirects to precision-engine.
 * Exit code 2 + stderr = blocks tool, message shown to Claude
 * Exit code 0 + no output = allows tool to proceed
 */

import { readHookInput, blockTool } from './shared/hook-io.js';
import { TOOL_REPLACEMENTS, formatBlockMessage, isBlockedNativeTool } from './pre-tool-use/subagent-blockers.js';

async function main() {
  const input = await readHookInput();
  const toolName = input.tool_name ?? '';

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
