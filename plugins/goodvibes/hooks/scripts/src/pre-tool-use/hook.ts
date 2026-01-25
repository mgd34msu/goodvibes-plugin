/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Main router/dispatcher for pre-tool-use validations.
 *
 * Validates prerequisites before tool execution:
 * - Bash tool: JSON auto-escape for mcp-cli, git command detection, quality gates
 * - Native tools (Read, Edit, Write, Glob, Grep): Block for ALL agents, redirect to precision-engine
 * - MCP tools: Resource availability checks
 *
 * ## Hook Priority Order
 * 1. Bash tool handling (JSON auto-escape, git commands, quality gates)
 *    - JSON auto-escape MUST fire first due to updatedInput constraints
 * 2. Native tool blocking for ALL agents (Read, Edit, Write, Glob, Grep)
 * 3. MCP tool validators
 *
 * ## Native Tool Blocking (ALL AGENTS)
 * All agents must use precision-engine tools for efficiency:
 * - Read -> precision_read
 * - Edit -> precision_edit
 * - Write -> precision_write
 * - Glob -> precision_glob
 * - Grep -> precision_grep
 *
 * ## Quality Gates (for git commit)
 * - TypeScript check (tsc --noEmit)
 * - ESLint check with auto-fix
 * - Prettier check with auto-fix
 * - Test runner (if enabled)
 *
 * ## Git Guards
 * - Branch protection (prevent force push to main)
 * - Merge readiness checks
 *
 * @module pre-tool-use/hook
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
import {
  handleNativeToolBlocking,
  isBlockedNativeTool,
} from './subagent-blockers.js';
import { TOOL_VALIDATORS } from './tool-validators.js';
import { checkAndFixMcpCliJson } from './json-auto-escape.js';

import type { HookInput } from '../shared/index.js';
import type { PreToolUseInput } from './subagent-blockers.js';

/**
 * Handles Bash tool invocations with JSON auto-escape and git command detection.
 *
 * Processing order:
 * 1. JSON auto-escape for mcp-cli calls (uses updatedInput, MUST be first)
 * 2. Git commit commands -> quality gates
 * 3. Other git commands -> git guards
 * 4. Allow other bash commands
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

  // FIRST: Check for mcp-cli calls with invalid JSON (uses updatedInput)
  // This MUST happen before any other processing due to updatedInput constraints
  const jsonFix = checkAndFixMcpCliJson(command);
  if (jsonFix) {
    debug('JSON auto-escape applied', {
      fixCount: jsonFix.fixCount,
      command: command.substring(0, 50) + '...',
    });
    respond(allowTool(
      'PreToolUse',
      undefined,
      { command: jsonFix.fixedCommand }
    ));
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
 * Priority order (important for updatedInput handling):
 * 1. Bash tool handling (JSON auto-escape MUST fire first)
 * 2. Native tool blocking for ALL agents (Read, Edit, Write, Glob, Grep)
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

    // FIRST: Handle Bash tool (JSON auto-escape uses updatedInput, must be first)
    if (input.tool_name === 'Bash' || input.tool_name?.endsWith('__Bash')) {
      await handleBashTool(input);
      return;
    }

    // SECOND: Check for native tool blocking (ALL AGENTS)
    if (isBlockedNativeTool(input.tool_name ?? '')) {
      const wasBlocked = handleNativeToolBlocking(input);
      if (wasBlocked) {
        return; // Already responded with block
      }
    }

    // THIRD: MCP tool validators
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

// Entry point is handled by pre-tool-use.ts - do not call here to avoid duplicate execution
