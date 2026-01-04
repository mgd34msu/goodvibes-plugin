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
import { HookInput } from '../shared.js';
/**
 * Handles detect_stack tool results, caching stack info.
 */
export declare function handleDetectStack(input: HookInput): void;
/**
 * Handles recommend_skills tool results, tracking recommended skills.
 */
export declare function handleRecommendSkills(input: HookInput): void;
/**
 * Handles search tool results, logging usage.
 */
export declare function handleSearch(_input: HookInput): void;
/**
 * Handles validate_implementation tool results, tracking validations and issues.
 */
export declare function handleValidateImplementation(input: HookInput): void;
/**
 * Handles run_smoke_test tool results, reporting failures.
 */
export declare function handleRunSmokeTest(input: HookInput): void;
/**
 * Handles check_types tool results, reporting type errors.
 */
export declare function handleCheckTypes(input: HookInput): void;
