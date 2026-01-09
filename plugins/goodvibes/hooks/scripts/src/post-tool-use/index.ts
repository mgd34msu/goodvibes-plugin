/**
 * Post-Tool-Use Hook (GoodVibes)
 *
 * Processes tool results and triggers automation:
 * - Track file modifications (Edit, Write tools)
 * - Check if checkpoint commit should be created
 * - Detect and monitor dev server commands (Bash tool)
 * - Optionally run tests for modified files
 * - Optionally check build status
 * - Check if feature branch should be created
 * - Process MCP tool results (detect_stack, validate_implementation, etc.)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { fileExists } from '../shared/file-utils.js';
import {
  respond,
  readHookInput,
  debug,
  logError,
  isTestEnvironment,
} from '../shared/index.js';
import { loadState, saveState } from '../state/index.js';
import { getDefaultConfig, type GoodVibesConfig } from '../types/config.js';

import { handleBashTool } from './bash-handler.js';
import { processFileAutomation } from './file-automation.js';
import {
  handleDetectStack,
  handleRecommendSkills,
  handleSearch,
  handleValidateImplementation,
  handleRunSmokeTest,
  handleCheckTypes,
} from './mcp-handlers.js';
import { createResponse, combineMessages } from './response.js';

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(
        result[key] as object,
        source[key] as object
      ) as T[typeof key];
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[typeof key];
    }
  }
  return result;
}

/**
 * Load automation configuration from .goodvibes/automation.json if it exists,
 * otherwise return default config from types/config.ts.
 * This provides build/test/git automation settings.
 */
async function loadAutomationConfig(cwd: string): Promise<GoodVibesConfig> {
  const configPath = path.join(cwd, '.goodvibes', 'automation.json');
  const defaults = getDefaultConfig();

  if (!(await fileExists(configPath))) {
    return defaults;
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const userConfig: unknown = JSON.parse(content);
    if (typeof userConfig === 'object' && userConfig !== null) {
      return deepMerge(defaults, userConfig as Partial<GoodVibesConfig>);
    }
    return defaults;
  } catch (error: unknown) {
    debug('loadAutomationConfig failed', { error: String(error) });
    return defaults;
  }
}

/**
 * Main entry point for post-tool-use hook.
 * Processes tool results and triggers automation.
 */
async function runPostToolUseHook(): Promise<void> {
  try {
    const input = await readHookInput();
    debug('PostToolUse hook received input', { tool_name: input.tool_name });

    const cwd = input.cwd;

    // Load state and config
    let state = await loadState(cwd);
    const config = await loadAutomationConfig(cwd);

    // Extract tool name (handle both MCP and built-in tools)
    // MCP tools: "mcp__goodvibes-tools__detect_stack" -> "detect_stack"
    // Built-in tools: "Edit", "Write", "Bash"
    const fullToolName = input.tool_name ?? '';
    const toolName = fullToolName.includes('__')
      ? fullToolName.split('__').pop() ?? ''
      : fullToolName;

    debug(`Processing tool: ${toolName} (full: ${fullToolName})`);

    let automationMessages: string[] = [];

    // Handle built-in tools with automation
    switch (toolName) {
      case 'Edit':
      case 'Write': {
        const result = await processFileAutomation(
          state,
          config,
          input,
          toolName
        );
        state = result.state;
        automationMessages = result.messages;
        break;
      }

      case 'Bash': {
        const bashResult = handleBashTool(state, input);
        const MAX_ERRORS_TO_DISPLAY = 3;
        if (bashResult.errors.length > 0) {
          automationMessages.push(
            `Dev server errors detected: ${bashResult.errors.slice(0, MAX_ERRORS_TO_DISPLAY).join(', ')}`
          );
        }
        break;
      }

      // MCP GoodVibes tools
      case 'detect_stack':
        await saveState(cwd, state);
        void handleDetectStack(input);
        return;

      case 'recommend_skills':
        await saveState(cwd, state);
        void handleRecommendSkills(input);
        return;

      case 'search_skills':
      case 'search_agents':
      case 'search_tools':
        await saveState(cwd, state);
        void handleSearch(input);
        return;

      case 'validate_implementation':
        await saveState(cwd, state);
        void handleValidateImplementation(input);
        return;

      case 'run_smoke_test':
        await saveState(cwd, state);
        void handleRunSmokeTest(input);
        return;

      case 'check_types':
        await saveState(cwd, state);
        void handleCheckTypes(input);
        return;

      default:
        debug(`Tool '${toolName}' - no special handling`);
    }

    // Save state after processing
    await saveState(cwd, state);

    // Build system message from automation results
    const systemMessage = combineMessages(automationMessages);

    respond(createResponse(systemMessage));
  } catch (error: unknown) {
    logError('PostToolUse main', error);
    respond(
      createResponse(
        `Hook error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// Only run the hook if not in test mode
if (!isTestEnvironment()) {
  runPostToolUseHook().catch((error: unknown) => {
    logError('PostToolUse uncaught', error);
    respond(createResponse(`Uncaught error: ${String(error)}`));
  });
}

// Re-export sub-modules for testing
export { handleBashTool } from './bash-handler.js';
export { handleFileModification, processFileAutomation } from './file-automation.js';
export {
  handleDetectStack,
  handleRecommendSkills,
  handleSearch,
  handleValidateImplementation,
  handleRunSmokeTest,
  handleCheckTypes,
} from './mcp-handlers.js';
export { createResponse, combineMessages, type AutomationMessages } from './response.js';
export {
  maybeRunTests,
  maybeRunBuild,
  maybeCreateCheckpoint,
  maybeCreateBranch,
} from './automation-runners.js';
export {
  trackFileModification,
  trackFileCreation,
  clearCheckpointTracking,
  getModifiedFileCount,
} from './file-tracker.js';
export {
  shouldCheckpoint,
  createCheckpointIfNeeded,
  type CheckpointTrigger,
} from './checkpoint-manager.js';
export {
  shouldCreateFeatureBranch,
  maybeCreateFeatureBranch,
  shouldMergeFeature,
  maybeMergeFeature,
} from './git-branch-manager.js';
export {
  isDevServerCommand,
  registerDevServer,
  unregisterDevServer,
  recordDevServerError,
  parseDevServerErrors,
} from './dev-server-monitor.js';
