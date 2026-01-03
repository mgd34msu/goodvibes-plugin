/**
 * Post-Tool-Use Hook (GoodVibes)
 *
 * Processes tool results:
 * - detect_stack: Cache results, suggest running recommend_skills
 * - search_*: Log queries for analytics
 * - validate_implementation: Track issues found
 * - run_smoke_test: Summarize failures
 * - check_types: Track type errors
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  respond,
  readHookInput,
  loadAnalytics,
  saveAnalytics,
  logToolUsage,
  ensureCacheDir,
  debug,
  logError,
  CACHE_DIR,
  HookInput,
  HookResponse,
} from './shared.js';

function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

function handleDetectStack(input: HookInput): void {
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

function handleRecommendSkills(input: HookInput): void {
  try {
    const analytics = loadAnalytics();
    if (analytics && input.tool_input) {
      // Track recommended skills from tool input
      const toolInput = input.tool_input as Record<string, unknown>;
      if (toolInput.recommendations && Array.isArray(toolInput.recommendations)) {
        const skillPaths = toolInput.recommendations
          .filter((r): r is { path: string } => typeof r === 'object' && r !== null && 'path' in r && typeof (r as Record<string, unknown>).path === 'string')
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
  } catch {
    respond(createResponse());
  }
}

function handleSearch(input: HookInput): void {
  logToolUsage({
    tool: 'search',
    timestamp: new Date().toISOString(),
    success: true,
  });

  respond(createResponse());
}

function handleValidateImplementation(input: HookInput): void {
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
  } catch {
    respond(createResponse());
  }
}

function handleRunSmokeTest(input: HookInput): void {
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
  } catch {
    respond(createResponse());
  }
}

function handleCheckTypes(input: HookInput): void {
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
  } catch {
    respond(createResponse());
  }
}

async function main(): Promise<void> {
  try {
    const input = await readHookInput();
    debug('PostToolUse hook received input', { tool_name: input.tool_name });

    // Extract tool name from the full MCP tool name (e.g., "mcp__goodvibes-tools__detect_stack")
    const toolName = input.tool_name?.split('__').pop() || '';
    debug(`Extracted tool name: ${toolName}`);

    switch (toolName) {
      case 'detect_stack':
        handleDetectStack(input);
        break;
      case 'recommend_skills':
        handleRecommendSkills(input);
        break;
      case 'search_skills':
      case 'search_agents':
      case 'search_tools':
        handleSearch(input);
        break;
      case 'validate_implementation':
        handleValidateImplementation(input);
        break;
      case 'run_smoke_test':
        handleRunSmokeTest(input);
        break;
      case 'check_types':
        handleCheckTypes(input);
        break;
      default:
        debug(`Unknown tool '${toolName}', continuing`);
        respond(createResponse());
    }
  } catch (error) {
    logError('PostToolUse main', error);
    respond(createResponse(`Hook error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

main();
