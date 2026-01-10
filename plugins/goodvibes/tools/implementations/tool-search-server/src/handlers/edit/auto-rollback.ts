/**
 * Auto-rollback handler
 *
 * Provides the auto_rollback MCP tool that runs validation and automatically
 * rolls back git changes if validation fails. Supports multiple validation
 * triggers including tests, type checking, linting, and builds.
 *
 * @module handlers/edit/auto-rollback
 */

import { execSync } from 'child_process';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { detectPackageManager } from '../../utils.js';

/**
 * Trigger types for validation
 */
export type RollbackTrigger =
  | 'test_failure'
  | 'type_error'
  | 'lint_error'
  | 'build_error'
  | 'custom';

/**
 * Arguments for the auto_rollback MCP tool
 */
export interface AutoRollbackArgs {
  /** Validation trigger type */
  trigger: RollbackTrigger;
  /** Custom validation command (required if trigger is 'custom') */
  validation_command?: string;
  /** Stash changes before rollback instead of discarding (default: false) */
  stash_before_rollback?: boolean;
  /** Specific files to revert, or all modified if not specified */
  files?: string[];
  /** Also remove untracked files (default: false) */
  include_untracked?: boolean;
}

/**
 * Result of the auto_rollback operation
 */
export interface AutoRollbackResult {
  /** Whether the validation command passed */
  validation_passed: boolean;
  /** Output from the validation command */
  validation_output: string;
  /** Exit code from the validation command */
  validation_exit_code: number;
  /** Whether a rollback was performed */
  rollback_performed: boolean;
  /** List of files that were reverted */
  files_reverted: string[];
  /** List of untracked files that were deleted */
  files_deleted: string[];
  /** Git stash reference if stashed */
  stash_ref?: string;
  /** Git status before rollback */
  git_status_before: string;
  /** Git status after rollback */
  git_status_after: string;
}

/**
 * Run a command and capture output with exit code
 */
function runCommand(
  cmd: string,
  cwd: string
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000, // 2 minute timeout
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const execError = err as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    const stdout =
      (typeof execError.stdout === 'string'
        ? execError.stdout
        : execError.stdout?.toString() || '') +
      (typeof execError.stderr === 'string'
        ? execError.stderr
        : execError.stderr?.toString() || '');
    return { stdout: stdout.trim(), exitCode: execError.status || 1 };
  }
}

/**
 * Get the validation command based on trigger type
 */
async function getValidationCommand(
  trigger: RollbackTrigger,
  customCommand?: string
): Promise<string> {
  const pm = await detectPackageManager(PROJECT_ROOT);
  const runCmd = pm === 'npm' ? 'npm run' : pm;
  const npxCmd = pm === 'pnpm' ? 'pnpm exec' : pm === 'yarn' ? 'yarn' : 'npx';

  switch (trigger) {
    case 'test_failure':
      return `${runCmd} test`;
    case 'type_error':
      return `${npxCmd} tsc --noEmit`;
    case 'lint_error':
      return `${npxCmd} eslint .`;
    case 'build_error':
      return `${runCmd} build`;
    case 'custom':
      if (!customCommand) {
        throw new Error(
          'validation_command is required when trigger is "custom"'
        );
      }
      return customCommand;
    default:
      throw new Error(`Unknown trigger type: ${trigger}`);
  }
}

/**
 * Parse git status --porcelain output to get file lists
 */
function parseGitStatus(statusOutput: string): {
  modified: string[];
  untracked: string[];
} {
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of statusOutput.split('\n')) {
    if (!line.trim()) continue;

    const status = line.substring(0, 2);
    const file = line.substring(3).trim();

    if (status === '??') {
      untracked.push(file);
    } else {
      modified.push(file);
    }
  }

  return { modified, untracked };
}

/**
 * Handles the auto_rollback MCP tool call.
 *
 * Runs validation and automatically rolls back git changes if validation fails.
 * This is useful for automated workflows where you want to ensure code quality
 * before committing changes.
 *
 * @param args - The auto_rollback tool arguments
 * @returns MCP tool response with rollback results
 *
 * @example
 * // Run type checking and rollback on failure
 * await handleAutoRollback({ trigger: 'type_error' });
 *
 * @example
 * // Run custom validation with stashing
 * await handleAutoRollback({
 *   trigger: 'custom',
 *   validation_command: 'npm run validate',
 *   stash_before_rollback: true,
 * });
 */
export async function handleAutoRollback(
  args: AutoRollbackArgs
): Promise<ToolResponse> {
  const {
    trigger,
    validation_command,
    stash_before_rollback = false,
    files,
    include_untracked = false,
  } = args;

  // Validate custom command is provided when needed
  if (trigger === 'custom' && !validation_command) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'validation_command is required when trigger is "custom"',
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Capture initial git status
  const initialStatus = runCommand('git status --porcelain', PROJECT_ROOT);
  const gitStatusBefore = initialStatus.stdout;

  if (initialStatus.exitCode !== 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Failed to get git status. Is this a git repository?',
              details: initialStatus.stdout,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Parse status to get file lists
  const { modified, untracked } = parseGitStatus(gitStatusBefore);

  // Determine which files to operate on
  const filesToRevert = files
    ? files.filter((f) => modified.includes(f))
    : modified;
  const filesToDelete =
    include_untracked && !files
      ? untracked
      : include_untracked && files
        ? files.filter((f) => untracked.includes(f))
        : [];

  // Get the validation command
  let validationCmd: string;
  try {
    validationCmd = await getValidationCommand(trigger, validation_command);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: err instanceof Error ? err.message : 'Unknown error',
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Run validation
  const validationResult = runCommand(validationCmd, PROJECT_ROOT);
  const validationPassed = validationResult.exitCode === 0;

  // Initialize result
  const result: AutoRollbackResult = {
    validation_passed: validationPassed,
    validation_output: validationResult.stdout.slice(0, 5000), // Limit output size
    validation_exit_code: validationResult.exitCode,
    rollback_performed: false,
    files_reverted: [],
    files_deleted: [],
    git_status_before: gitStatusBefore,
    git_status_after: gitStatusBefore, // Will be updated if rollback occurs
  };

  // If validation passed, no rollback needed
  if (validationPassed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // Validation failed - perform rollback

  // Optionally stash changes first
  if (stash_before_rollback && (filesToRevert.length > 0 || filesToDelete.length > 0)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stashMessage = `auto-rollback-${timestamp}`;
    const stashResult = runCommand(
      `git stash push -m "${stashMessage}"`,
      PROJECT_ROOT
    );

    if (stashResult.exitCode === 0) {
      // Get stash reference
      const stashListResult = runCommand('git stash list -1', PROJECT_ROOT);
      result.stash_ref = stashListResult.stdout.split(':')[0] || stashMessage;
      result.rollback_performed = true;
      result.files_reverted = filesToRevert;

      // Git stash also handles untracked if we include them
      if (include_untracked) {
        const stashUntrackedResult = runCommand(
          `git stash push -u -m "${stashMessage}-untracked"`,
          PROJECT_ROOT
        );
        if (stashUntrackedResult.exitCode === 0) {
          result.files_deleted = filesToDelete;
        }
      }
    }
  } else {
    // Revert modified files
    if (filesToRevert.length > 0) {
      for (const file of filesToRevert) {
        const revertResult = runCommand(
          `git checkout -- "${file}"`,
          PROJECT_ROOT
        );
        if (revertResult.exitCode === 0) {
          result.files_reverted.push(file);
        }
      }
      result.rollback_performed = result.files_reverted.length > 0;
    }

    // Delete untracked files if requested
    if (filesToDelete.length > 0) {
      for (const file of filesToDelete) {
        const cleanResult = runCommand(`git clean -fd "${file}"`, PROJECT_ROOT);
        if (cleanResult.exitCode === 0) {
          result.files_deleted.push(file);
        }
      }
      result.rollback_performed =
        result.rollback_performed || result.files_deleted.length > 0;
    }
  }

  // Capture final git status
  const finalStatus = runCommand('git status --porcelain', PROJECT_ROOT);
  result.git_status_after = finalStatus.stdout;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
