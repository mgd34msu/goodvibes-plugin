/**
 * Git Command Handlers for Pre-Tool-Use Hook
 *
 * Handles git commits and other git commands with:
 * - Quality gates for commits (TypeScript, ESLint, Prettier, tests)
 * - Branch guards (prevent force push to main, etc.)
 * - Merge readiness checks
 */
import type { HookInput } from '../shared/index.js';
/**
 * Extract the bash command from tool input
 *
 * @param input - The hook input containing tool information
 * @returns The command string if this is a Bash tool invocation, null otherwise
 */
export declare function extractBashCommand(input: HookInput): string | null;
/**
 * Handle git commit commands with quality gates
 *
 * @param input - The hook input containing tool information
 * @param command - The git command being executed
 * @returns Promise that resolves when the quality gate check is complete
 */
export declare function handleGitCommit(input: HookInput, command: string): Promise<void>;
/**
 * Handle git commands with branch/merge guards
 *
 * @param input - The hook input containing tool information
 * @param command - The git command being executed
 * @returns Promise that resolves when the guard check is complete
 */
export declare function handleGitCommand(input: HookInput, command: string): Promise<void>;
