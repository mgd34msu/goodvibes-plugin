/**
 * MCP Tool Handlers for Post-Tool-Use Hook
 *
 * Handles results from GoodVibes MCP tools:
 * - detect_stack: Caches stack detection results
 * - recommend_skills: Tracks recommended skills in analytics
 * - search_*: Logs search tool usage
 * - validate_implementation: Tracks validation results and issues
 * - run_smoke_test: Reports test failures
 * - check_types: Reports type errors
 */
import { HookInput } from '../shared/index.js';
/**
 * Handles detect_stack tool results, caching stack info.
 * Writes the detected stack configuration to .goodvibes/detected-stack.json
 * and logs usage for analytics tracking.
 *
 * @param input - The hook input containing tool_input with stack detection results
 *
 * @example
 * // Called automatically when detect_stack MCP tool completes
 * await handleDetectStack(input);
 */
export declare function handleDetectStack(input: HookInput): Promise<void>;
/**
 * Handles recommend_skills tool results, tracking recommended skills.
 * Extracts skill paths from recommendations and adds them to analytics tracking.
 *
 * @param input - The hook input containing tool_input with recommendations array
 *
 * @example
 * // Called automatically when recommend_skills MCP tool completes
 * await handleRecommendSkills(input);
 */
export declare function handleRecommendSkills(input: HookInput): Promise<void>;
/**
 * Handles search tool results, logging usage.
 * Records search tool invocation for analytics tracking.
 *
 * @param _input - The hook input (unused, search results are passed through)
 *
 * @example
 * // Called automatically when search_* MCP tools complete
 * await handleSearch(input);
 */
export declare function handleSearch(_input: HookInput): Promise<void>;
/**
 * Handles validate_implementation tool results, tracking validations and issues.
 * Increments validation counter and adds any errors/warnings to issues_found analytics.
 *
 * @param input - The hook input containing tool_input with summary of errors and warnings
 *
 * @example
 * // Called automatically when validate_implementation MCP tool completes
 * await handleValidateImplementation(input);
 */
export declare function handleValidateImplementation(input: HookInput): Promise<void>;
/**
 * Handles run_smoke_test tool results, reporting failures.
 * Returns a system message if tests failed with count of failures.
 *
 * @param input - The hook input containing tool_input with passed status and summary
 *
 * @example
 * // Called automatically when run_smoke_test MCP tool completes
 * await handleRunSmokeTest(input);
 */
export declare function handleRunSmokeTest(input: HookInput): Promise<void>;
/**
 * Handles check_types tool results, reporting type errors.
 * Tracks error count in analytics and returns system message with error count.
 *
 * @param input - The hook input containing tool_input with errors array
 *
 * @example
 * // Called automatically when check_types MCP tool completes
 * await handleCheckTypes(input);
 */
export declare function handleCheckTypes(input: HookInput): Promise<void>;
