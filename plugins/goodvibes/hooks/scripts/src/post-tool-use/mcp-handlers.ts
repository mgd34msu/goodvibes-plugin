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
import {
  respond,
  loadAnalytics,
  saveAnalytics,
  logToolUsage,
  ensureCacheDir,
  debug,
  logError,
  CACHE_DIR,
  HookInput,
} from '../shared.js';
import { createResponse } from './response.js';

/**
 * Handles detect_stack tool results, caching stack info.
 */
export function handleDetectStack(input: HookInput): void {
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
  } catch (error) {
    logError('handleDetectStack', error);
    respond(createResponse(`Error caching stack: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Handles recommend_skills tool results, tracking recommended skills.
 */
export function handleRecommendSkills(input: HookInput): void {
  try {
    const analytics = loadAnalytics();
    if (analytics && input.tool_input) {
      // Track recommended skills from tool input
      const toolInput = input.tool_input as Record<string, unknown>;
      if (toolInput.recommendations && Array.isArray(toolInput.recommendations)) {
        const skillPaths = toolInput.recommendations
          .filter((r): r is { path: string } =>
            typeof r === 'object' && r !== null && 'path' in r && typeof (r as Record<string, unknown>).path === 'string'
          )
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
  } catch (error) {
    debug('handler failed', { error: String(error) });
    respond(createResponse());
  }
}

/**
 * Handles search tool results, logging usage.
 */
export function handleSearch(_input: HookInput): void {
  logToolUsage({
    tool: 'search',
    timestamp: new Date().toISOString(),
    success: true,
  });

  respond(createResponse());
}

/**
 * Handles validate_implementation tool results, tracking validations and issues.
 */
export function handleValidateImplementation(input: HookInput): void {
  try {
    const analytics = loadAnalytics();
    if (analytics) {
      analytics.validations_run += 1;

      // Try to count issues from tool input
      const toolInput = input.tool_input as Record<string, unknown>;
      if (toolInput?.summary) {
        const summary = toolInput.summary as Record<string, number>;
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
  } catch (error) {
    debug('handler failed', { error: String(error) });
    respond(createResponse());
  }
}

/**
 * Handles run_smoke_test tool results, reporting failures.
 */
export function handleRunSmokeTest(input: HookInput): void {
  try {
    logToolUsage({
      tool: 'run_smoke_test',
      timestamp: new Date().toISOString(),
      success: true,
    });

    // Check if tests failed and add system message
    const toolInput = input.tool_input as Record<string, unknown>;
    if (toolInput?.passed === false) {
      const summary = toolInput.summary as Record<string, number> | undefined;
      const failed = summary?.failed || 0;
      respond(createResponse(`Smoke test: ${failed} check(s) failed. Review output for details.`));
      return;
    }

    respond(createResponse());
  } catch (error) {
    debug('handler failed', { error: String(error) });
    respond(createResponse());
  }
}

/**
 * Handles check_types tool results, reporting type errors.
 */
export function handleCheckTypes(input: HookInput): void {
  try {
    const analytics = loadAnalytics();

    logToolUsage({
      tool: 'check_types',
      timestamp: new Date().toISOString(),
      success: true,
    });

    // Check for type errors
    const toolInput = input.tool_input as Record<string, unknown>;
    if (toolInput?.errors && Array.isArray(toolInput.errors) && analytics) {
      analytics.issues_found += toolInput.errors.length;
      saveAnalytics(analytics);

      respond(createResponse(`TypeScript: ${toolInput.errors.length} type error(s) found.`));
      return;
    }

    respond(createResponse());
  } catch (error) {
    debug('handler failed', { error: String(error) });
    respond(createResponse());
  }
}
