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
 *
 * NOTE: Hook registration is handled by plugin.json -> hooks/hooks.json
 * Do NOT inject hooks into .claude/settings.json - it causes duplicate firing.
 */
// Session-start specific modules
import { respond, readHookInput, validateRegistries, ensureCacheDir, isTestEnvironment, saveAnalytics, debug, logError, createResponse, PROJECT_ROOT, } from '../shared/index.js';
import { loadState, saveState, updateSessionState, initializeSession, } from '../state/index.js';
import { createDefaultState } from '../types/state.js';
import { gatherProjectContext, createFailedContextResult, } from './context-builder.js';
import { checkCrashRecovery, } from './crash-recovery.js';
import { buildSystemMessage } from './response-formatter.js';
import { checkForUpdates } from './version-checker.js';
import { fetchPricingIfStale } from './pricing-fetcher.js';
import { ensureClaudeMdImports } from './claude-md-manager.js';
import { buildProjectIndex } from './project-indexer.js';
/**
 * Default recovery info when crash recovery check fails.
 * Used as a fallback to ensure the hook continues gracefully.
 */
const DEFAULT_RECOVERY_INFO = {
    needsRecovery: false,
    previousFeature: null,
    onBranch: null,
    uncommittedFiles: [],
    pendingIssues: [],
    lastCheckpoint: null,
};
/** Loads the plugin state, returning default state on error */
async function loadPluginState(projectDir) {
    try {
        const state = await loadState(projectDir);
        debug('State loaded', {
            sessionId: state.session.id,
            mode: state.session.mode,
        });
        return state;
    }
    catch (stateError) {
        logError('State loading', stateError);
        return createDefaultState(); // Explicit fallback - no recursion
    }
}
/** Performs crash recovery check with error handling */
async function performCrashRecoveryCheck(projectDir) {
    try {
        const recoveryInfo = await checkCrashRecovery(projectDir);
        debug('Crash recovery check', {
            needsRecovery: recoveryInfo.needsRecovery,
        });
        return recoveryInfo;
    }
    catch (recoveryError) {
        logError('Crash recovery check', recoveryError);
        return DEFAULT_RECOVERY_INFO;
    }
}
/** Gathers project context with error handling */
async function gatherContextSafely(projectDir, recoveryInfo, startTime) {
    debug(`Gathering project context from: ${projectDir}`);
    try {
        return await gatherProjectContext(projectDir, recoveryInfo, startTime);
    }
    catch (contextError) {
        logError('Context gathering', contextError);
        return createFailedContextResult(startTime);
    }
}
/** Saves the plugin state with error handling */
async function savePluginState(projectDir, state) {
    try {
        await saveState(projectDir, state);
        debug('State saved');
    }
    catch (saveError) {
        logError('State saving', saveError);
        // Continue even if state save fails
    }
}
/** Initializes analytics for the session */
function initializeAnalytics(sessionId, contextResult) {
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
async function runSessionStartHook() {
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
        // NOTE: Hook injection removed - plugin.json -> hooks/hooks.json handles registration
        // Validate registries
        const { valid, missing } = await validateRegistries();
        debug('Registry validation', { valid, missing });
        if (!valid) {
            respond(createResponse({
                systemMessage: `GoodVibes: Warning - Missing registries: ${missing.join(', ')}. Run build-registries script.`,
            }));
            return;
        }
        // Step 2: Check for crash recovery scenario
        const recoveryInfo = await performCrashRecoveryCheck(projectDir);
        // Step 2.5: Fetch pricing data if stale (async, non-blocking)
        fetchPricingIfStale().catch((err) => logError('Pricing fetch failed in background', err));
        // Step 3: Gather all context
        const contextResult = await gatherContextSafely(projectDir, recoveryInfo, startTime);
        // Step 4: Update session state
        state = updateSessionState(state, {
            startedAt: new Date().toISOString(),
        });
        // Step 5: Save state
        await savePluginState(projectDir, state);
        // Step 5.25: Build project file index (must complete before respond() calls process.exit)
        try {
            await buildProjectIndex(projectDir);
        }
        catch (err) {
            logError('Project indexer failed', err instanceof Error ? err : new Error(String(err)));
        }
        // Step 5.5: Ensure CLAUDE.md import architecture is installed
        await ensureClaudeMdImports(projectDir);
        // Step 6: Initialize analytics
        initializeAnalytics(sessionId, contextResult);
        // Step 7: Check for plugin updates
        const versionCheck = await checkForUpdates();
        debug('Version check', { isUpToDate: versionCheck.isUpToDate, local: versionCheck.localVersion, remote: versionCheck.remoteVersion });
        // Build system message
        const systemMessage = buildSystemMessage(sessionId, contextResult, versionCheck);
        // Success response with context injection
        respond(createResponse({
            systemMessage,
            additionalContext: contextResult.additionalContext || undefined,
        }));
    }
    catch (error) {
        logError('SessionStart main', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        respond(createResponse({ systemMessage: `GoodVibes: Init error - ${message}` }));
    }
}
// Only run the hook if not in test mode
// In tests, the hook functions are imported but not executed
if (!isTestEnvironment()) {
    runSessionStartHook().catch((error) => {
        logError('SessionStart uncaught', error);
        respond(createResponse());
    });
}
// Re-export for testing
export { formatRecoveryContext, checkCrashRecovery } from './crash-recovery.js';
export { buildSystemMessage } from './response-formatter.js';
export { gatherProjectContext, createFailedContextResult, } from './context-builder.js';
export { gatherAndFormatContext } from './context-injection.js';
// NOTE: injectSettings export removed - no longer used at runtime
