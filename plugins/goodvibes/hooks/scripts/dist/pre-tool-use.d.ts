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
import type { HookInput } from './shared/index.js';
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
/**
 * Handle Bash tool with git command detection
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves when the bash tool is handled
 */
export declare function handleBashTool(input: HookInput): Promise<void>;
/**
 * Validates prerequisites for detect_stack tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export declare function validateDetectStack(input: HookInput): Promise<void>;
/**
 * Validates prerequisites for get_schema tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export declare function validateGetSchema(input: HookInput): Promise<void>;
/**
 * Validates prerequisites for run_smoke_test tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export declare function validateRunSmokeTest(input: HookInput): Promise<void>;
/**
 * Validates prerequisites for check_types tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export declare function validateCheckTypes(input: HookInput): Promise<void>;
/**
 * Validates prerequisites for validate_implementation tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export declare function validateImplementation(input: HookInput): Promise<void>;
/**
 * Main entry point for pre-tool-use hook.
 * Validates tool prerequisites and runs quality gates.
 *
 * @returns Promise that resolves when the hook completes
 */
export declare function runPreToolUseHook(): Promise<void>;
