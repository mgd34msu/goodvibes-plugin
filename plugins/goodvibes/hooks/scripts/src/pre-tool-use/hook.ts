/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Main router/dispatcher for pre-tool-use validations.
 *
 * Validates prerequisites before tool execution:
 * - Platform path mapping (Unix paths -> Windows equivalents)
 * - Shell safety analysis (detect/block shell-unsafe content in mcp-cli calls)
 * - Bash tool: JSON auto-escape for mcp-cli, git command detection, quality gates
 * - Native tools (Read, Edit, Update, Write, Glob, Grep, WebFetch): Block for ALL agents, redirect to precision-engine
 * - MCP tools: Resource availability checks
 *
 * ## Hook Priority Order
 * 1. Platform path mapping (rewrite /tmp, /dev/null on Windows)
 * 2. Shell safety analysis (detect shell-unsafe content in precision tool calls)
 * 3. Bash tool handling (JSON auto-escape, git commands, quality gates)
 * 4. Native tool blocking for ALL agents (Read, Edit, Update, Write, Glob, Grep, WebFetch)
 * 5. MCP tool validators
 *
 * @module pre-tool-use/hook
 */

import {
  respond,
  readHookInput,
  allowTool,
  blockTool,
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
import { rewritePlatformPaths } from './platform-path-mapper.js';
import {
  isMcpPrecisionCall,
  analyzeShellSafety,
  formatBlockMessage,
} from './shell-safety-analyzer.js';

import type { HookInput } from '../shared/index.js';
import type { PreToolUseInput } from './subagent-blockers.js';

/**
 * Handles Bash tool invocations with platform path mapping, shell safety,
 * JSON auto-escape, and git command detection.
 */
async function handleBashTool(input: HookInput): Promise<void> {
  let command = extractBashCommand(input);

    if (!command) {
    respond(allowTool('PreToolUse'));
    return;
  }

  // PROOF OF CONCEPT: Count single quotes and replace command
  const singleQuoteCount = (command.match(/'/g) || []).length;
  if (singleQuoteCount > 0) {
    const modifiedInput = { ...input.tool_input as Record<string, unknown> };
    modifiedInput.command = `echo "${singleQuoteCount} single quotes detected"`;
    respond(allowTool('PreToolUse', undefined, modifiedInput));
    return;
  }


  // LAYER 1: Platform path mapping (rewrite /tmp, /dev/null on Windows)
  const pathResult = rewritePlatformPaths(command);
  if (pathResult.rewritten) {
    command = pathResult.command;
    const toolInput = input.tool_input as Record<string, unknown>;
    toolInput.command = command;
    if (pathResult.warnings.length > 0) {
      console.error('[platform-path-mapper] ' + pathResult.warnings.join('; '));
    }
  }

  // LAYER 2: Shell safety analysis for mcp-cli precision tool calls
  if (isMcpPrecisionCall(command)) {
    const analysis = analyzeShellSafety(command);
    if (!analysis.safe) {
      const toolName = analysis.toolName || 'precision_tool';
      const message = formatBlockMessage(analysis.issues, toolName);
      blockTool(message);
      return;
    }
  }

  // Check for git commit - run quality gates
  if (isCommitCommand(command)) {
    if (pathResult.rewritten) {
      respond(allowTool('PreToolUse', undefined, input.tool_input as Record<string, unknown>));
      return;
    }
    await handleGitCommit(input, command);
    return;
  }

  // Check for other git commands - run git guards
  if (isGitCommand(command)) {
    if (pathResult.rewritten) {
      respond(allowTool('PreToolUse', undefined, input.tool_input as Record<string, unknown>));
      return;
    }
    await handleGitCommand(input, command);
    return;
  }

  // If command was rewritten, respond with updated input
  if (pathResult.rewritten) {
    respond(allowTool('PreToolUse', undefined, input.tool_input as Record<string, unknown>));
    return;
  }

  // Allow other bash commands
  respond(allowTool('PreToolUse'));
}

/**
 * Main entry point for pre-tool-use hook.
 */
export async function runPreToolUseHook(): Promise<void> {
  try {
    const rawInput = await readHookInput();
    const input = rawInput as PreToolUseInput;

    // FIRST: Handle Bash tool
    if (input.tool_name === 'Bash' || input.tool_name?.endsWith('__Bash')) {
      await handleBashTool(input);
      return;
    }

    // SECOND: Check for native tool blocking (ALL AGENTS)
    if (isBlockedNativeTool(input.tool_name ?? '')) {
      const wasBlocked = handleNativeToolBlocking(input);
      if (wasBlocked) {
        return;
      }
    }

    // THIRD: MCP tool validators
    const toolName = input.tool_name?.split('__').pop() ?? '';

    const validator = TOOL_VALIDATORS[toolName];
    if (validator) {
      await validator(input);
    } else {
      respond(allowTool('PreToolUse'));
    }
  } catch (error: unknown) {
    logError('PreToolUse main', error);
    respond(
      allowTool(
        'PreToolUse',
        'Hook error: ' + (error instanceof Error ? error.message : String(error))
      )
    );
  }
}