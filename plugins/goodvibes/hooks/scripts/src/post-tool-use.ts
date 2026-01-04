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

// State management
import { loadState, saveState, updateTestState, updateBuildState } from './state.js';
import type { HooksState } from './types/state.js';

// Configuration
import { getDefaultConfig, type GoodVibesConfig } from './types/config.js';

// Automation modules - file tracking
import { trackFileModification, trackFileCreation, getModifiedFileCount } from './post-tool-use/file-tracker.js';

// Automation modules - git operations
import { createCheckpointIfNeeded } from './post-tool-use/checkpoint-manager.js';
import { maybeCreateFeatureBranch } from './post-tool-use/git-branch-manager.js';

// Automation modules - dev server monitoring
import { isDevServerCommand, registerDevServer, parseDevServerErrors, recordDevServerError } from './post-tool-use/dev-server-monitor.js';

// Automation modules - testing and building
import { findTestsForFile, runTests, type TestResult } from './automation/test-runner.js';
import { runBuild, runTypeCheck, type BuildResult } from './automation/build-runner.js';

// Config loader from shared (for telemetry/quality/memory/checkpoints settings)
import { loadSharedConfig } from './shared.js';

interface AutomationMessages {
  messages: string[];
}

/** Creates a hook response with optional system message. */
function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

/**
 * Load automation configuration (from types/config.ts)
 * This provides build/test/git automation settings.
 */
function loadAutomationConfig(_cwd: string): GoodVibesConfig {
  // Return the default automation config
  // In the future, this could load from .goodvibes/automation.json
  return getDefaultConfig();
}

/**
 * Handle file modification tracking for Edit and Write tools
 */
function handleFileModification(
  state: HooksState,
  input: HookInput,
  toolName: string
): { tracked: boolean; filePath: string | null } {
  const toolInput = input.tool_input as Record<string, unknown> | undefined;
  const filePath = toolInput?.file_path as string | undefined;

  if (!filePath) {
    return { tracked: false, filePath: null };
  }

  if (toolName === 'Write') {
    trackFileCreation(state, filePath);
    debug(`Tracked file creation: ${filePath}`);
  } else {
    trackFileModification(state, filePath);
    debug(`Tracked file modification: ${filePath}`);
  }

  return { tracked: true, filePath };
}

/**
 * Handle Bash tool for dev server detection
 */
function handleBashTool(
  state: HooksState,
  input: HookInput
): { isDevServer: boolean; errors: string[] } {
  const toolInput = input.tool_input as Record<string, unknown> | undefined;
  const command = toolInput?.command as string | undefined;
  const output = toolInput?.output as string | undefined;

  if (!command) {
    return { isDevServer: false, errors: [] };
  }

  // Check if this is a dev server command
  if (isDevServerCommand(command)) {
    // Register the dev server (we don't have PID, use command as identifier)
    const pid = `bash_${Date.now()}`;
    registerDevServer(state, pid, command, 3000); // Default port
    debug(`Registered dev server: ${command}`);
    return { isDevServer: true, errors: [] };
  }

  // Check for errors in command output
  if (output) {
    const errors = parseDevServerErrors(output);
    if (errors.length > 0) {
      // Record errors for any running dev servers
      for (const pid of Object.keys(state.devServers)) {
        recordDevServerError(state, pid, errors.join('; '));
      }
      return { isDevServer: false, errors };
    }
  }

  return { isDevServer: false, errors: [] };
}

/**
 * Run tests for modified files if enabled
 */
async function maybeRunTests(
  state: HooksState,
  config: GoodVibesConfig,
  filePath: string,
  cwd: string
): Promise<{ ran: boolean; result: TestResult | null }> {
  if (!config.automation.enabled || !config.automation.testing.runAfterFileChange) {
    return { ran: false, result: null };
  }

  // Skip if file is a test file itself
  if (filePath.includes('.test.') || filePath.includes('.spec.')) {
    return { ran: false, result: null };
  }

  // Find tests for this file
  const testFiles = findTestsForFile(filePath);
  if (testFiles.length === 0) {
    debug(`No tests found for: ${filePath}`);
    return { ran: false, result: null };
  }

  debug(`Running tests for: ${filePath}`, { testFiles });

  try {
    const result = await runTests(testFiles, cwd);

    // Update state with test results
    if (result.passed) {
      updateTestState(state, {
        lastQuickRun: new Date().toISOString(),
        passingFiles: [...new Set([...state.tests.passingFiles, ...testFiles])],
        failingFiles: state.tests.failingFiles.filter(f => !testFiles.includes(f)),
      });
    } else {
      updateTestState(state, {
        lastQuickRun: new Date().toISOString(),
        failingFiles: [...new Set([...state.tests.failingFiles, ...testFiles])],
        passingFiles: state.tests.passingFiles.filter(f => !testFiles.includes(f)),
        pendingFixes: result.failures.map(f => ({
          testFile: f.testFile,
          error: f.error,
          fixAttempts: 0,
        })),
      });
    }

    return { ran: true, result };
  } catch (error) {
    logError('maybeRunTests', error);
    return { ran: false, result: null };
  }
}

/**
 * Run build/typecheck if threshold reached
 */
async function maybeRunBuild(
  state: HooksState,
  config: GoodVibesConfig,
  cwd: string
): Promise<{ ran: boolean; result: BuildResult | null }> {
  if (!config.automation.enabled) {
    return { ran: false, result: null };
  }

  const modifiedCount = getModifiedFileCount(state);
  const threshold = config.automation.building.runAfterFileThreshold;

  if (modifiedCount < threshold) {
    debug(`Build skipped: ${modifiedCount} files modified (threshold: ${threshold})`);
    return { ran: false, result: null };
  }

  debug(`Running typecheck after ${modifiedCount} file modifications`);

  try {
    const result = await runTypeCheck(cwd);

    // Update build state
    updateBuildState(state, {
      lastRun: new Date().toISOString(),
      status: result.passed ? 'passing' : 'failing',
      errors: result.errors,
      fixAttempts: result.passed ? 0 : state.build.fixAttempts + 1,
    });

    return { ran: true, result };
  } catch (error) {
    logError('maybeRunBuild', error);
    return { ran: false, result: null };
  }
}

/**
 * Check if checkpoint should be created and create it
 */
async function maybeCreateCheckpoint(
  state: HooksState,
  config: GoodVibesConfig,
  cwd: string
): Promise<{ created: boolean; message: string }> {
  if (!config.automation.enabled || !config.automation.git.autoCheckpoint) {
    return { created: false, message: '' };
  }

  return await createCheckpointIfNeeded(state, cwd);
}

/**
 * Check if feature branch should be created
 */
async function maybeCreateBranch(
  state: HooksState,
  config: GoodVibesConfig,
  cwd: string
): Promise<{ created: boolean; branchName: string | null }> {
  if (!config.automation.enabled || !config.automation.git.autoFeatureBranch) {
    return { created: false, branchName: null };
  }

  return await maybeCreateFeatureBranch(state, cwd);
}

/**
 * Process automation for file-modifying tools (Edit, Write)
 */
async function processFileAutomation(
  state: HooksState,
  config: GoodVibesConfig,
  input: HookInput,
  toolName: string
): Promise<AutomationMessages> {
  const messages: string[] = [];
  const cwd = input.cwd;

  // Track file modification
  const { tracked, filePath } = handleFileModification(state, input, toolName);
  if (!tracked || !filePath) {
    return { messages };
  }

  // Run tests for modified file
  const testResult = await maybeRunTests(state, config, filePath, cwd);
  if (testResult.ran && testResult.result) {
    if (!testResult.result.passed) {
      messages.push(`Tests failed: ${testResult.result.summary}`);
    }
  }

  // Check if build should run
  const buildResult = await maybeRunBuild(state, config, cwd);
  if (buildResult.ran && buildResult.result) {
    if (!buildResult.result.passed) {
      messages.push(`Build check: ${buildResult.result.summary}`);
    }
  }

  // Check if checkpoint should be created
  const checkpoint = await maybeCreateCheckpoint(state, config, cwd);
  if (checkpoint.created) {
    messages.push(checkpoint.message);
  }

  // Check if feature branch should be created
  const branch = await maybeCreateBranch(state, config, cwd);
  if (branch.created && branch.branchName) {
    messages.push(`Created feature branch: ${branch.branchName}`);
  }

  return { messages };
}

// =============================================================================
// MCP Tool Handlers (existing functionality)
// =============================================================================

/** Handles detect_stack tool results, caching stack info. */
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

/** Handles recommend_skills tool results, tracking recommended skills. */
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

/** Handles search tool results, logging usage. */
function handleSearch(_input: HookInput): void {
  logToolUsage({
    tool: 'search',
    timestamp: new Date().toISOString(),
    success: true,
  });

  respond(createResponse());
}

/** Handles validate_implementation tool results, tracking validations and issues. */
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

/** Handles run_smoke_test tool results, reporting failures. */
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

/** Handles check_types tool results, reporting type errors. */
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

// =============================================================================
// Main Entry Point
// =============================================================================

/** Main entry point for post-tool-use hook. Processes tool results and triggers automation. */
async function main(): Promise<void> {
  try {
    const input = await readHookInput();
    debug('PostToolUse hook received input', { tool_name: input.tool_name });

    const cwd = input.cwd;

    // Load state and config
    const state = await loadState(cwd);
    const config = loadAutomationConfig(cwd);

    // Extract tool name (handle both MCP and built-in tools)
    // MCP tools: "mcp__goodvibes-tools__detect_stack" -> "detect_stack"
    // Built-in tools: "Edit", "Write", "Bash"
    const fullToolName = input.tool_name || '';
    const toolName = fullToolName.includes('__')
      ? fullToolName.split('__').pop() || ''
      : fullToolName;

    debug(`Processing tool: ${toolName} (full: ${fullToolName})`);

    let automationMessages: string[] = [];

    // Handle built-in tools with automation
    switch (toolName) {
      case 'Edit':
      case 'Write': {
        const result = await processFileAutomation(state, config, input, toolName);
        automationMessages = result.messages;
        break;
      }

      case 'Bash': {
        const bashResult = handleBashTool(state, input);
        const MAX_ERRORS_TO_DISPLAY = 3;
        if (bashResult.errors.length > 0) {
          automationMessages.push(`Dev server errors detected: ${bashResult.errors.slice(0, MAX_ERRORS_TO_DISPLAY).join(', ')}`);
        }
        break;
      }

      // MCP GoodVibes tools
      case 'detect_stack':
        await saveState(cwd, state);
        handleDetectStack(input);
        return;

      case 'recommend_skills':
        await saveState(cwd, state);
        handleRecommendSkills(input);
        return;

      case 'search_skills':
      case 'search_agents':
      case 'search_tools':
        await saveState(cwd, state);
        handleSearch(input);
        return;

      case 'validate_implementation':
        await saveState(cwd, state);
        handleValidateImplementation(input);
        return;

      case 'run_smoke_test':
        await saveState(cwd, state);
        handleRunSmokeTest(input);
        return;

      case 'check_types':
        await saveState(cwd, state);
        handleCheckTypes(input);
        return;

      default:
        debug(`Tool '${toolName}' - no special handling`);
    }

    // Save state after processing
    await saveState(cwd, state);

    // Build system message from automation results
    const systemMessage = automationMessages.length > 0
      ? automationMessages.join(' | ')
      : undefined;

    respond(createResponse(systemMessage));
  } catch (error) {
    logError('PostToolUse main', error);
    respond(createResponse(`Hook error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

main();
