/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Validates prerequisites before tool execution:
 * - detect_stack: Check project has package.json
 * - get_schema: Check schema file exists
 * - run_smoke_test: Check npm/pnpm available
 * - check_types: Check TypeScript available
 * - validate_implementation: Check files exist
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

import path from 'node:path';

import {
  checkBranchGuard,
  checkMergeReadiness,
  isGitCommand,
  isMergeCommand,
} from './pre-tool-use/git-guards.js';
import {
  runQualityGates,
  isCommitCommand,
  formatGateResults,
} from './pre-tool-use/quality-gates.js';
import {
  respond,
  readHookInput,
  allowTool,
  blockTool,
  fileExistsRelative,
  fileExists,
  debug,
  logError,
} from './shared/index.js';
import { loadState } from './state.js';
import { getDefaultConfig } from './types/config.js';

import type { HookInput } from './shared/index.js';

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

/**
 * Handle Bash tool with git command detection
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves when the bash tool is handled
 */
export async function handleBashTool(input: HookInput): Promise<void> {
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
 * Validates prerequisites for detect_stack tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateDetectStack(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  if (!(await fileExists(path.join(cwd, 'package.json')))) {
    respond(
      blockTool(
        'PreToolUse',
        'No package.json found in project root. Cannot detect stack.'
      ),
      true
    );
    return;
  }
  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for get_schema tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateGetSchema(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  // Check for common schema files
  const schemaFiles = [
    'prisma/schema.prisma',
    'drizzle.config.ts',
    'drizzle/schema.ts',
  ];

  const results = await Promise.all(
    schemaFiles.map((f) => fileExists(path.join(cwd, f)))
  );
  const found = results.some(Boolean);

  if (!found) {
    // Allow but warn
    respond(
      allowTool('PreToolUse', 'No schema file detected. get_schema may fail.')
    );
    return;
  }
  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for run_smoke_test tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateRunSmokeTest(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  // Check if package.json exists
  if (!(await fileExists(path.join(cwd, 'package.json')))) {
    respond(
      blockTool('PreToolUse', 'No package.json found. Cannot run smoke tests.'),
      true
    );
    return;
  }

  // Check for package manager
  const [hasPnpm, hasYarn, hasNpm] = await Promise.all([
    fileExists(path.join(cwd, 'pnpm-lock.yaml')),
    fileExists(path.join(cwd, 'yarn.lock')),
    fileExists(path.join(cwd, 'package-lock.json')),
  ]);

  if (!hasPnpm && !hasYarn && !hasNpm) {
    respond(
      allowTool(
        'PreToolUse',
        'No lockfile detected. Install dependencies first.'
      )
    );
    return;
  }

  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for check_types tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateCheckTypes(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  // Check for TypeScript config
  if (!(await fileExists(path.join(cwd, 'tsconfig.json')))) {
    respond(
      blockTool(
        'PreToolUse',
        'No tsconfig.json found. TypeScript not configured.'
      ),
      true
    );
    return;
  }

  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for validate_implementation tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateImplementation(input: HookInput): Promise<void> {
  // Just allow and let the tool handle validation
  respond(allowTool('PreToolUse'));
}

/** Tool validators keyed by tool name */
const TOOL_VALIDATORS: Record<string, (input: HookInput) => Promise<void>> = {
  detect_stack: validateDetectStack,
  get_schema: validateGetSchema,
  run_smoke_test: validateRunSmokeTest,
  check_types: validateCheckTypes,
  validate_implementation: validateImplementation,
};

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
  runPreToolUseHook();
}
/* v8 ignore stop */
