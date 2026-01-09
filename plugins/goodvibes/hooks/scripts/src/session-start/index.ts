/**
 * Session Start Hook
 *
 * Initializes the GoodVibes plugin:
 * - Loads or initializes persistent state
 * - Checks for crash recovery scenarios
 * - Validates registries exist
 * - Creates cache directory
 * - Initializes analytics
 * - Gathers and injects project context (Smart Context Injection)
 * - Updates session state (increment session count, record start time)
 * - Saves state for future sessions
 */

// Session-start specific modules
import {
  respond,
  readHookInput,
  validateRegistries,
  ensureCacheDir,
  isTestEnvironment,
  saveAnalytics,
  debug,
  logError,
  createResponse,
  PROJECT_ROOT,
} from '../shared/index.js';
import {
  loadState,
  saveState,
  updateSessionState,
  initializeSession,
} from '../state/index.js';
import { createDefaultState } from '../types/state.js';

import {
  gatherProjectContext,
  createFailedContextResult,
  type ContextGatheringResult,
} from './context-builder.js';
import {
  checkCrashRecovery,
  type RecoveryInfo,
} from './crash-recovery.js';
import { buildSystemMessage } from './response-formatter.js';

import type { HooksState } from '../types/state.js';

/** Default recovery info when crash recovery check fails */
const DEFAULT_RECOVERY_INFO: RecoveryInfo = {
  needsRecovery: false,
  previousFeature: null,
  onBranch: null,
  uncommittedFiles: [],
  pendingIssues: [],
  lastCheckpoint: null,
};

/** Loads the plugin state, returning default state on error */
async function loadPluginState(projectDir: string): Promise<HooksState> {
  try {
    const state = await loadState(projectDir);
    debug('State loaded', {
      sessionId: state.session.id,
      mode: state.session.mode,
    });
    return state;
  } catch (stateError) {
    logError('State loading', stateError);
    return createDefaultState(); // Explicit fallback - no recursion
  }
}

/** Performs crash recovery check with error handling */
async function performCrashRecoveryCheck(
  projectDir: string
): Promise<RecoveryInfo> {
  try {
    const recoveryInfo = await checkCrashRecovery(projectDir);
    debug('Crash recovery check', {
      needsRecovery: recoveryInfo.needsRecovery,
    });
    return recoveryInfo;
  } catch (recoveryError) {
    logError('Crash recovery check', recoveryError);
    return DEFAULT_RECOVERY_INFO;
  }
}

/** Gathers project context with error handling */
async function gatherContextSafely(
  projectDir: string,
  recoveryInfo: RecoveryInfo,
  startTime: number
): Promise<ContextGatheringResult> {
  debug(`Gathering project context from: ${projectDir}`);

  try {
    return await gatherProjectContext(projectDir, recoveryInfo, startTime);
  } catch (contextError) {
    logError('Context gathering', contextError);
    return createFailedContextResult(startTime);
  }
}

/** Saves the plugin state with error handling */
async function savePluginState(
  projectDir: string,
  state: HooksState
): Promise<void> {
  try {
    await saveState(projectDir, state);
    debug('State saved');
  } catch (saveError) {
    logError('State saving', saveError);
    // Continue even if state save fails
  }
}

/** Initializes analytics for the session */
function initializeAnalytics(
  sessionId: string,
  contextResult: ContextGatheringResult
): void {
  void saveAnalytics({
    session_id: sessionId,
    started_at: new Date().toISOString(),
    tool_usage: [],
    skills_recommended: [],
    validations_run: 0,
    issues_found: contextResult.issueCount,
    detected_stack: {
      isEmptyProject: contextResult.isEmptyProject,
      hasIssues: contextResult.hasIssues,
      gatherTimeMs: contextResult.gatherTimeMs,
      needsRecovery: contextResult.needsRecovery,
    },
  });
  debug(`Analytics initialized for session ${sessionId}`);
}

/** Main entry point for session-start hook. Initializes plugin state and gathers project context. */
async function runSessionStartHook(): Promise<void> {
  const startTime = Date.now();

  try {
    debug('SessionStart hook starting');

    // Read hook input from stdin (contains session info)
    const input = await readHookInput();
    debug('SessionStart received input', {
      session_id: input.session_id,
      hook_event_name: input.hook_event_name,
    });

    // Determine project directory
    const projectDir = input.cwd || PROJECT_ROOT;
    debug(`Project directory: ${projectDir}`);

    // Step 1: Load or initialize state
    let state = await loadPluginState(projectDir);

    // Initialize session ID
    const sessionId = input.session_id || `session_${Date.now()}`;
    state = initializeSession(state, sessionId);

    // Ensure cache directory exists
    await ensureCacheDir();
    debug('Cache directory ensured');

    // Validate registries
    const { valid, missing } = await validateRegistries();
    debug('Registry validation', { valid, missing });

    if (!valid) {
      respond(
        createResponse({
          systemMessage: `GoodVibes: Warning - Missing registries: ${missing.join(', ')}. Run build-registries script.`,
        })
      );
      return;
    }

    // Step 2: Check for crash recovery scenario
    const recoveryInfo = await performCrashRecoveryCheck(projectDir);

    // Step 3: Gather all context
    const contextResult = await gatherContextSafely(
      projectDir,
      recoveryInfo,
      startTime
    );

    // Step 4: Update session state
    state = updateSessionState(state, {
      startedAt: new Date().toISOString(),
    });

    // Step 5: Save state
    await savePluginState(projectDir, state);

    // Step 6: Initialize analytics
    initializeAnalytics(sessionId, contextResult);

    // Build system message
    const systemMessage = buildSystemMessage(sessionId, contextResult);

    // Success response with context injection
    respond(
      createResponse({
        systemMessage,
        additionalContext: contextResult.additionalContext || undefined,
      })
    );
  } catch (error: unknown) {
    logError('SessionStart main', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    respond(
      createResponse({ systemMessage: `GoodVibes: Init error - ${message}` })
    );
  }
}

// Only run the hook if not in test mode
// In tests, the hook functions are imported but not executed
if (!isTestEnvironment()) {
  runSessionStartHook().catch((error: unknown) => {
    logError('SessionStart uncaught', error);
    respond(createResponse());
  });
}

// Re-export for testing
export { formatRecoveryContext, checkCrashRecovery } from './crash-recovery.js';
export { buildSystemMessage } from './response-formatter.js';
export {
  gatherProjectContext,
  createFailedContextResult,
} from './context-builder.js';
export { gatherAndFormatContext } from './context-injection.js';
