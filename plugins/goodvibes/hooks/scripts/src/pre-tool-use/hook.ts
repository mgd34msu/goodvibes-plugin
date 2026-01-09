/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Main router/dispatcher for pre-tool-use validations.
 *
 * Validates prerequisites before tool execution:
 * - Bash tool: Git command detection and quality gates
 * - MCP tools: Resource availability checks
 *
 * Quality Gates (for git commit):
 * - TypeScript check (tsc --noEmit)
 * - ESLint check with auto-fix
 * - Prettier check with auto-fix
 * - Test runner (if enabled)
 *
 * Git Guards:
 * - Branch protection (prevent force push to main)
 * - Merge readiness checks
 */

import {
  respond,
  readHookInput,
  allowTool,
  debug,
  logError,
} from '../shared/index.js';

import { isGitCommand } from './git-guards.js';
import {
  extractBashCommand,
  handleGitCommit,
  handleGitCommand,
} from './git-handlers.js';
import { isCommitCommand } from './quality-gates.js';
import { TOOL_VALIDATORS } from './tool-validators.js';


import type { HookInput } from '../shared/index.js';

/**
 * Handle Bash tool with git command detection
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves when the bash tool is handled
 */
async function handleBashTool(input: HookInput): Promise<void> {
  const command = extractBashCommand(input);

  if (!command) {
    respond(allowTool('PreToolUse'));
    return;
  }

  // Check for git commit - run quality gates
  if (isCommitCommand(command)) {
    await handleGitCommit(input, command);
    return;
  }

  // Check for other git commands - run git guards
  if (isGitCommand(command)) {
    await handleGitCommand(input, command);
    return;
  }

  // Allow other bash commands
  respond(allowTool('PreToolUse'));
}

/**
 * Main entry point for pre-tool-use hook.
 * Validates tool prerequisites and runs quality gates.
 *
 * @returns Promise that resolves when the hook completes
 */
export async function runPreToolUseHook(): Promise<void> {
  try {
    const input = await readHookInput();
    debug('PreToolUse hook received input', {
      tool_name: input.tool_name,
      cwd: input.cwd,
    });

    // Handle Bash tool specially for git command detection
    if (input.tool_name === 'Bash' || input.tool_name?.endsWith('__Bash')) {
      await handleBashTool(input);
      return;
    }

    // Extract tool name from the full MCP tool name (e.g., "mcp__goodvibes-tools__detect_stack")
    const toolName = input.tool_name?.split('__').pop() || '';
    debug(`Extracted tool name: ${toolName}`);

    const validator = TOOL_VALIDATORS[toolName];
    if (validator) {
      await validator(input);
    } else {
      debug(`Unknown tool '${toolName}', allowing by default`);
      respond(allowTool('PreToolUse'));
    }
  } catch (error: unknown) {
    logError('PreToolUse main', error);
    // On error, allow the tool to proceed but log the issue
    respond(
      allowTool(
        'PreToolUse',
        `Hook error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// Only run when executed directly, not when imported for testing
// Check if this module is the main entry point
/* v8 ignore start -- @preserve: module entry point, not testable in unit tests */
const isMainModule =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMainModule) {
  void runPreToolUseHook();
}
/* v8 ignore stop */
