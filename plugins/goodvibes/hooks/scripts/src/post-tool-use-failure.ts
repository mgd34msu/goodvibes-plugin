/**
 * Post Tool Use Failure Hook (GoodVibes)
 *
 * Runs when a tool call fails.
 * Tracks failures, suggests fixes, and recommends relevant skills.
 */

import {
  respond,
  readHookInput,
  loadAnalytics,
  saveAnalytics,
  debug,
  logError,
  HookResponse,
} from './shared.js';

function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

async function main(): Promise<void> {
  try {
    debug('PostToolUseFailure hook starting');

    const input = await readHookInput();
    const toolName = input.tool_name || 'unknown';
    const errorMessage = (input as unknown as Record<string, unknown>).error as string || 'Unknown error';

    debug('PostToolUseFailure received input', {
      tool_name: toolName,
      error: errorMessage,
    });

    // Track the failure in analytics
    const analytics = loadAnalytics();
    if (analytics) {
      if (!analytics.tool_failures) {
        analytics.tool_failures = [];
      }
      analytics.tool_failures.push({
        tool: toolName,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
      analytics.issues_found++;
      saveAnalytics(analytics);
    }

    // Extract the base tool name (remove MCP prefix)
    const baseTool = toolName.split('__').pop() || toolName;

    // Suggest relevant skills based on failure type
    let suggestion = '';

    if (errorMessage.includes('type') || errorMessage.includes('TypeScript')) {
      suggestion = '💡 Consider using check_types tool to validate TypeScript before running.';
    } else if (errorMessage.includes('version') || errorMessage.includes('dependency')) {
      suggestion = '💡 Consider using check_versions tool to verify package compatibility.';
    } else if (errorMessage.includes('schema') || errorMessage.includes('database')) {
      suggestion = '💡 Consider using get_schema tool to verify database structure.';
    } else if (errorMessage.includes('config') || errorMessage.includes('configuration')) {
      suggestion = '💡 Consider using read_config tool to check configuration files.';
    } else if (baseTool === 'detect_stack' || baseTool === 'scan_patterns') {
      suggestion = '💡 Make sure you are in a project directory with recognizable files (package.json, etc).';
    }

    if (suggestion) {
      respond(createResponse(suggestion));
    } else {
      respond(createResponse());
    }

  } catch (error) {
    logError('PostToolUseFailure main', error);
    respond(createResponse());
  }
}

main();
