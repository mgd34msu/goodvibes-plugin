/**
 * Git Command Handlers for Pre-Tool-Use Hook
 *
 * Handles git commits and other git commands with:
 * - Quality gates for commits (TypeScript, ESLint, Prettier, tests)
 * - Branch guards (prevent force push to main, etc.)
 * - Merge readiness checks
 */

import {
  respond,
  allowTool,
  blockTool,
  debug,
} from '../shared/index.js';
import { loadState } from '../state/index.js';
import { getDefaultConfig } from '../types/config.js';

import {
  checkBranchGuard,
  checkMergeReadiness,
  isMergeCommand,
} from './git-guards.js';
import {
  runQualityGates,
  isCommitCommand as _isCommitCommand,
  formatGateResults,
} from './quality-gates.js';

import type { HookInput } from '../shared/index.js';

/**
 * Extract the bash command from tool input
 *
 * @param input - The hook input containing tool information
 * @returns The command string if this is a Bash tool invocation, null otherwise
 */
export function extractBashCommand(input: HookInput): string | null {
  if (input.tool_name !== 'Bash' && !input.tool_name?.endsWith('__Bash')) {
    return null;
  }
  const toolInput = input.tool_input as { command?: string } | undefined;
  return toolInput?.command || null;
}

/**
 * Handle git commit commands with quality gates
 *
 * @param input - The hook input containing tool information
 * @param command - The git command being executed
 * @returns Promise that resolves when the quality gate check is complete
 */
export async function handleGitCommit(
  input: HookInput,
  command: string
): Promise<void> {
  const cwd = input.cwd || process.cwd();
  const config = getDefaultConfig();

  debug('Git commit detected, running quality gates', { command });

  // Check if quality gates should run before commit
  if (
    !config.automation.building.runBeforeCommit &&
    !config.automation.testing.runBeforeCommit
  ) {
    debug('Quality gates disabled for commits');
    respond(allowTool('PreToolUse'));
    return;
  }

  // Run quality gates
  const gateResult = await runQualityGates(cwd);
  const resultSummary = formatGateResults(gateResult.results);

  debug('Quality gate results', {
    allPassed: gateResult.allPassed,
    blocking: gateResult.blocking,
    results: gateResult.results,
  });

  if (gateResult.blocking) {
    // Block the commit if there are blocking failures
    respond(
      blockTool(
        'PreToolUse',
        `Quality gates failed: ${resultSummary}. Fix issues before committing.`
      ),
      true
    );
    return;
  }

  if (!gateResult.allPassed) {
    // Allow with warning if only non-blocking failures
    respond(
      allowTool(
        'PreToolUse',
        `Quality gates partially passed: ${resultSummary}. Proceeding with commit.`
      )
    );
    return;
  }

  // All gates passed
  respond(
    allowTool('PreToolUse', `All quality gates passed: ${resultSummary}`)
  );
}

/**
 * Handle git commands with branch/merge guards
 *
 * @param input - The hook input containing tool information
 * @param command - The git command being executed
 * @returns Promise that resolves when the guard check is complete
 */
export async function handleGitCommand(
  input: HookInput,
  command: string
): Promise<void> {
  const cwd = input.cwd || process.cwd();
  const state = await loadState(cwd);

  debug('Git command detected, checking guards', { command });

  // Check branch guards (force push, hard reset, etc.)
  const branchGuard = await checkBranchGuard(command, cwd, state);

  if (!branchGuard.allowed) {
    respond(
      blockTool('PreToolUse', branchGuard.reason || 'Git operation blocked'),
      true
    );
    return;
  }

  // Check merge readiness for merge commands
  if (isMergeCommand(command)) {
    const mergeGuard = checkMergeReadiness(cwd, state);

    if (!mergeGuard.allowed) {
      respond(
        blockTool('PreToolUse', mergeGuard.reason || 'Merge blocked'),
        true
      );
      return;
    }

    if (mergeGuard.warning) {
      respond(allowTool('PreToolUse', mergeGuard.warning));
      return;
    }
  }

  // Allow with warning if applicable
  if (branchGuard.warning) {
    respond(allowTool('PreToolUse', branchGuard.warning));
    return;
  }

  respond(allowTool('PreToolUse'));
}
