/**
 * Fix Loop interfaces for Batch Engine
 * @see SPEC-v2 Section 11.2
 */

import type { OperationResult } from './result.js';
import type { Batch } from './batch.js';

/**
 * Error types that can be auto-fixed by the Fix Loop
 */
export type FixableErrorType =
  | 'typescript_error'
  | 'lint_error'
  | 'format_error'
  | 'import_error'
  | 'test_failure'
  | 'build_error'
  | 'runtime_error';

/**
 * Fix strategy to use for each attempt
 * - auto_fix: Attempt 1 - Use AUTO_FIXERS (eslint --fix, prettier, etc.)
 * - agent_fix: Attempt 2 - Spawn code-architect agent
 * - targeted_fix: Attempt 3 - Spawn specialized agent based on error type
 */
export type FixStrategy =
  | 'auto_fix'
  | 'agent_fix'
  | 'targeted_fix';

/**
 * Context passed to fix loop for each fix attempt
 */
export interface FixContext {
  /** The failed operation */
  operation: OperationResult;
  /** The batch containing the operation */
  batch: Batch;
  /** Parsed error information */
  error: FixableError;
  /** Current attempt (1-based) */
  attempt: number;
  /** Max attempts allowed */
  max_attempts: number;
  /** Previous fix attempts */
  prior_attempts: FixAttempt[];
}

/**
 * Parsed error information for fix loop processing
 */
export interface FixableError {
  /** Error type classification */
  type: FixableErrorType;
  /** Error message */
  message: string;
  /** File path where error occurred */
  file?: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Error code (e.g., TS2322, ESLint rule name) */
  code?: string;
  /** Compiler/linter suggestion if available */
  suggestion?: string;
  /** Related errors (e.g., TypeScript related errors) */
  related?: FixableError[];
}

/**
 * Record of a fix attempt
 */
export interface FixAttempt {
  /** Strategy used for this attempt */
  strategy: FixStrategy;
  /** ISO timestamp when attempt started */
  started_at: string;
  /** ISO timestamp when attempt completed */
  completed_at: string;
  /** Whether the attempt succeeded */
  success: boolean;
  /** Actions taken during the attempt */
  actions: FixAction[];
  /** Errors remaining after the attempt */
  remaining_errors: FixableError[];
  /** Tokens consumed during this attempt */
  tokens_used: number;
}

/**
 * Action taken during a fix attempt
 */
export interface FixAction {
  /** Type of action */
  type: 'edit' | 'create' | 'delete' | 'move' | 'command';
  /** File path or command that was targeted */
  target: string;
  /** Human-readable description of what was done */
  description: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if action failed */
  error?: string;
}

/**
 * Result of running the fix loop
 */
export interface FixResult {
  /** Whether all errors were fixed */
  success: boolean;
  /** Number of attempts made */
  attempts: number;
  /** Final strategy that was used */
  final_strategy: FixStrategy;
  /** All actions taken across all attempts */
  actions_taken: FixAction[];
  /** Errors that could not be fixed */
  remaining_errors: FixableError[];
  /** Total tokens consumed across all attempts */
  total_tokens_used: number;
  /** Total duration in milliseconds */
  duration_ms: number;
}

/**
 * Fix Loop configuration
 */
export interface FixLoopConfig {
  /** Maximum number of fix attempts (default: 3) */
  max_attempts: number;
  /** Order of strategies to try */
  strategies: FixStrategy[];
  /** Timeout per attempt in milliseconds */
  timeout_ms: number;
  /** Registry of auto-fixers by error type */
  auto_fixers: Record<FixableErrorType, AutoFixer>;
}

/**
 * Auto-fixer for specific error types
 */
export interface AutoFixer {
  /** Name of the auto-fixer */
  name: string;
  /** Check if this fixer can handle the error */
  can_fix(error: FixableError): boolean;
  /** Attempt to fix the error */
  fix(error: FixableError, context: FixContext): Promise<FixAction[]>;
}

/**
 * Default auto-fixers registry
 * Maps error types to their default fix approach
 */
export const AUTO_FIXERS: Record<FixableErrorType, string> = {
  typescript_error: 'tsc --fix (when available) or targeted edit',
  lint_error: 'eslint --fix',
  format_error: 'prettier --write',
  import_error: 'add/remove import statements',
  test_failure: 'analyze and fix test or code',
  build_error: 'analyze build config and dependencies',
  runtime_error: 'analyze stack trace and fix',
};

/**
 * Fix Loop main interface
 */
export interface FixLoop {
  /** Run the fix loop for the given context */
  run(context: FixContext): Promise<FixResult>;
  /** Check if an error can be fixed */
  canFix(error: FixableError): boolean;
  /** Get the strategy to use for a given attempt number */
  getStrategy(attempt: number): FixStrategy;
}

/**
 * Fix Loop manager with full lifecycle
 */
export interface FixLoopManager extends FixLoop {
  /** Current configuration */
  config: FixLoopConfig;
  /** Register a custom auto-fixer for an error type */
  registerAutoFixer(type: FixableErrorType, fixer: AutoFixer): void;
  /** Parse an error into a FixableError structure */
  parseError(error: Error | string): FixableError;
}
