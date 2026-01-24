/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Main router/dispatcher for pre-tool-use validations.
 *
 * Validates prerequisites before tool execution:
 * - Native tools (Read, Edit, Write, Glob, Grep): Block for ALL agents, redirect to precision-engine
 * - Bash tool: Git command detection and quality gates
 * - MCP tools: Resource availability checks
 *
 * Native Tool Blocking (ALL AGENTS):
 * - All agents must use precision-engine tools for efficiency
 * - Read -> precision_read, Edit -> precision_edit, Write -> precision_write
 * - Glob -> precision_glob, Grep -> precision_grep
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
  blockTool,
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
import {
  handleNativeToolBlocking,
  isBlockedNativeTool,
} from './subagent-blockers.js';
import { TOOL_VALIDATORS } from './tool-validators.js';

import type { HookInput } from '../shared/index.js';
import type { PreToolUseInput } from './subagent-blockers.js';
import { checkAndFixMcpCliJson } from './json-auto-escape.js';

/**
 * Handles Bash tool invocations with git command detection.
 * Routes git commits through quality gates, other git commands through
 * git guards (branch protection, merge readiness), and allows other commands.
 *
 * @param input - The hook input containing tool_input with command
 * @returns Promise that resolves when validation is complete
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

  // Check for mcp-cli calls with invalid JSON
  const jsonFix = checkAndFixMcpCliJson(command);
  if (jsonFix) {
    respond(blockTool(
      `Invalid JSON escape sequences detected. Use this corrected command:\n\n${jsonFix.fixedCommand}`
    ));
    return;
  }

  // Allow other bash commands
  respond(allowTool('PreToolUse'));
}

/**
 * Main entry point for pre-tool-use hook.
 * Validates tool prerequisites and runs quality gates.
 *
 * Priority order:
 * 1. Native tool blocking for ALL agents (Read, Edit, Write, Glob, Grep)
 * 2. Bash tool handling (git commands, quality gates)
 * 3. MCP tool validators
 *
 * @returns Promise that resolves when the hook completes
 */
export async function runPreToolUseHook(): Promise<void> {
  try {
    const rawInput = await readHookInput();
    const input = rawInput as PreToolUseInput;

    debug('PreToolUse hook received input', {
      tool_name: input.tool_name,
      cwd: input.cwd,
      is_subagent: input.is_subagent,
    });

    // FIRST: Check for native tool blocking (ALL AGENTS)
    // This must happen before any other processing
    if (isBlockedNativeTool(input.tool_name ?? '')) {
      // handleNativeToolBlocking will respond and exit if blocked
      const wasBlocked = handleNativeToolBlocking(input);
      if (wasBlocked) {
        return; // Already responded with block
      }
    }

    // Handle Bash tool specially for git command detection
    if (input.tool_name === 'Bash' || input.tool_name?.endsWith('__Bash')) {
      await handleBashTool(input);
      return;
    }

    // Extract tool name from the full MCP tool name (e.g., "mcp__goodvibes-tools__detect_stack")
    const toolName = input.tool_name?.split('__').pop() ?? '';
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
