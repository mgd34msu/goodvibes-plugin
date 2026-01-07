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
 */
export declare function extractBashCommand(input: HookInput): string | null;
/**
 * Handle git commit commands with quality gates
 */
export declare function handleGitCommit(input: HookInput, command: string): Promise<void>;
/**
 * Handle git commands with branch/merge guards
 */
export declare function handleGitCommand(input: HookInput, command: string): Promise<void>;
/**
 * Handle Bash tool with git command detection
 */
export declare function handleBashTool(input: HookInput): Promise<void>;
/** Validates prerequisites for detect_stack tool. */
export declare function validateDetectStack(input: HookInput): Promise<void>;
/** Validates prerequisites for get_schema tool. */
export declare function validateGetSchema(input: HookInput): Promise<void>;
/** Validates prerequisites for run_smoke_test tool. */
export declare function validateRunSmokeTest(input: HookInput): Promise<void>;
/** Validates prerequisites for check_types tool. */
export declare function validateCheckTypes(input: HookInput): Promise<void>;
/** Validates prerequisites for validate_implementation tool. */
export declare function validateImplementation(input: HookInput): Promise<void>;
/** Main entry point for pre-tool-use hook. Validates tool prerequisites and runs quality gates. */
export declare function runPreToolUseHook(): Promise<void>;
