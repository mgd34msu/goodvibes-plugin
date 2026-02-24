/**
 * Tool Validators for Pre-Tool-Use Hook
 *
 * Validates prerequisites before MCP tool execution:
 * - detect_stack: Check project has package.json
 * - get_schema: Check schema file exists
 * - run_smoke_test: Check npm/pnpm available
 * - check_types: Check TypeScript available
 * - validate_implementation: Check files exist
 */
import type { HookInput } from '../shared/index.js';
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
export declare function validateImplementation(_input: HookInput): Promise<void>;
/**
 * Registry of tool validators keyed by MCP tool name.
 * Each validator checks prerequisites before the tool executes.
 * Tools not in this registry are allowed by default.
 *
 * @example
 * const validator = TOOL_VALIDATORS['detect_stack'];
 * if (validator) {
 *   await validator(input);  // Checks for package.json
 * }
 */
export declare const TOOL_VALIDATORS: Record<string, (_input: HookInput) => Promise<void>>;
