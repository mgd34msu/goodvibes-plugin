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
import * as fs from 'fs';
import * as path from 'path';
import { respond, loadAnalytics, saveAnalytics, logToolUsage, ensureCacheDir, debug, logError, CACHE_DIR, } from '../shared.js';
import { createResponse } from './response.js';
/**
 * Handles detect_stack tool results, caching stack info.
 * Writes the detected stack configuration to .goodvibes/detected-stack.json
 * and logs usage for analytics tracking.
 *
 * @param input - The hook input containing tool_input with stack detection results
 *
 * @example
 * // Called automatically when detect_stack MCP tool completes
 * handleDetectStack(input);
 */
export function handleDetectStack(input) {
    try {
        debug('handleDetectStack called', { has_tool_input: !!input.tool_input });
        // Cache the stack detection result from tool_input
        ensureCacheDir();
        const cacheFile = path.join(CACHE_DIR, 'detected-stack.json');
        if (input.tool_input) {
            fs.writeFileSync(cacheFile, JSON.stringify(input.tool_input, null, 2));
            debug(`Cached stack detection to ${cacheFile}`);
        }
        // Log usage
        logToolUsage({
            tool: 'detect_stack',
            timestamp: new Date().toISOString(),
            success: true,
        });
        respond(createResponse('Stack detected. Consider using recommend_skills for relevant skill suggestions.'));
    }
    catch (error) {
        logError('handleDetectStack', error);
        respond(createResponse(`Error caching stack: ${error instanceof Error ? error.message : String(error)}`));
    }
}
/**
 * Handles recommend_skills tool results, tracking recommended skills.
 * Extracts skill paths from recommendations and adds them to analytics tracking.
 *
 * @param input - The hook input containing tool_input with recommendations array
 *
 * @example
 * // Called automatically when recommend_skills MCP tool completes
 * handleRecommendSkills(input);
 */
export function handleRecommendSkills(input) {
    try {
        const analytics = loadAnalytics();
        if (analytics && input.tool_input) {
            // Track recommended skills from tool input
            const toolInput = input.tool_input;
            if (toolInput.recommendations && Array.isArray(toolInput.recommendations)) {
                const skillPaths = toolInput.recommendations
                    .filter((r) => typeof r === 'object' && r !== null && 'path' in r && typeof r.path === 'string')
                    .map((r) => r.path);
                analytics.skills_recommended.push(...skillPaths);
                saveAnalytics(analytics);
            }
        }
        logToolUsage({
            tool: 'recommend_skills',
            timestamp: new Date().toISOString(),
            success: true,
        });
        respond(createResponse());
    }
    catch (error) {
        debug('handler failed', { error: String(error) });
        respond(createResponse());
    }
}
/**
 * Handles search tool results, logging usage.
 * Records search tool invocation for analytics tracking.
 *
 * @param _input - The hook input (unused, search results are passed through)
 *
 * @example
 * // Called automatically when search_* MCP tools complete
 * handleSearch(input);
 */
export function handleSearch(_input) {
    logToolUsage({
        tool: 'search',
        timestamp: new Date().toISOString(),
        success: true,
    });
    respond(createResponse());
}
/**
 * Handles validate_implementation tool results, tracking validations and issues.
 * Increments validation counter and adds any errors/warnings to issues_found analytics.
 *
 * @param input - The hook input containing tool_input with summary of errors and warnings
 *
 * @example
 * // Called automatically when validate_implementation MCP tool completes
 * handleValidateImplementation(input);
 */
export function handleValidateImplementation(input) {
    try {
        const analytics = loadAnalytics();
        if (analytics) {
            analytics.validations_run += 1;
            // Try to count issues from tool input
            const toolInput = input.tool_input;
            if (toolInput?.summary) {
                const summary = toolInput.summary;
                analytics.issues_found += (summary.errors || 0) + (summary.warnings || 0);
            }
            saveAnalytics(analytics);
        }
        logToolUsage({
            tool: 'validate_implementation',
            timestamp: new Date().toISOString(),
            success: true,
        });
        respond(createResponse());
    }
    catch (error) {
        debug('handler failed', { error: String(error) });
        respond(createResponse());
    }
}
/**
 * Handles run_smoke_test tool results, reporting failures.
 * Returns a system message if tests failed with count of failures.
 *
 * @param input - The hook input containing tool_input with passed status and summary
 *
 * @example
 * // Called automatically when run_smoke_test MCP tool completes
 * handleRunSmokeTest(input);
 */
export function handleRunSmokeTest(input) {
    try {
        logToolUsage({
            tool: 'run_smoke_test',
            timestamp: new Date().toISOString(),
            success: true,
        });
        // Check if tests failed and add system message
        const toolInput = input.tool_input;
        if (toolInput?.passed === false) {
            const summary = toolInput.summary;
            const failed = summary?.failed || 0;
            respond(createResponse(`Smoke test: ${failed} check(s) failed. Review output for details.`));
            return;
        }
        respond(createResponse());
    }
    catch (error) {
        debug('handler failed', { error: String(error) });
        respond(createResponse());
    }
}
/**
 * Handles check_types tool results, reporting type errors.
 * Tracks error count in analytics and returns system message with error count.
 *
 * @param input - The hook input containing tool_input with errors array
 *
 * @example
 * // Called automatically when check_types MCP tool completes
 * handleCheckTypes(input);
 */
export function handleCheckTypes(input) {
    try {
        const analytics = loadAnalytics();
        logToolUsage({
            tool: 'check_types',
            timestamp: new Date().toISOString(),
            success: true,
        });
        // Check for type errors
        const toolInput = input.tool_input;
        if (toolInput?.errors && Array.isArray(toolInput.errors) && analytics) {
            analytics.issues_found += toolInput.errors.length;
            saveAnalytics(analytics);
            respond(createResponse(`TypeScript: ${toolInput.errors.length} type error(s) found.`));
            return;
        }
        respond(createResponse());
    }
    catch (error) {
        debug('handler failed', { error: String(error) });
        respond(createResponse());
    }
}
