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
 *   - Stack detection (frameworks, package manager, TypeScript)
 *   - Git context (branch, uncommitted changes, recent commits)
 *   - Environment status (.env files, missing vars)
 *   - TODO/FIXME scanner
 *   - Project health checks
 *   - Folder structure analysis
 *   - Port status for dev servers
 *   - Project memory (decisions, patterns, failures)
 * - Updates session state (increment session count, record start time)
 * - Saves state for future sessions
 */
import { respond, readHookInput, validateRegistries, ensureCacheDir, saveAnalytics, debug, logError, PROJECT_ROOT, } from './shared.js';
// Context gathering modules
import { detectStack, formatStackInfo, getGitContext, formatGitContext, checkEnvStatus, formatEnvStatus, scanTodos, formatTodos, checkProjectHealth, formatHealthStatus, analyzeFolderStructure, formatFolderAnalysis, isEmptyProject, formatEmptyProjectContext, checkPorts, formatPortStatus, } from './context/index.js';
// Session-start specific modules
import { checkCrashRecovery, formatRecoveryContext, } from './session-start/index.js';
// Memory module
import { loadProjectMemory, formatMemoryContext } from './memory/index.js';
// State management
import { loadState, saveState, updateSessionState, initializeSession, } from './state.js';
/** Creates a hook response with optional system message and additional context. */
function createResponse(systemMessage, additionalContext) {
    const response = {
        continue: true,
        systemMessage,
    };
    if (additionalContext) {
        response.additionalContext = additionalContext;
    }
    return response;
}
/** Main entry point for session-start hook. Initializes plugin state and gathers project context. */
async function main() {
    const startTime = Date.now();
    try {
        debug('SessionStart hook starting');
        // Read hook input from stdin (contains session info)
        const input = await readHookInput();
        debug('SessionStart received input', { session_id: input.session_id, hook_event_name: input.hook_event_name });
        // Determine project directory
        const projectDir = input.cwd || PROJECT_ROOT;
        debug(`Project directory: ${projectDir}`);
        // Step 1: Load or initialize state
        let state;
        try {
            state = await loadState(projectDir);
            debug('State loaded', { sessionId: state.session.id, mode: state.session.mode });
        }
        catch (stateError) {
            logError('State loading', stateError);
            state = await loadState(projectDir); // Will return default state
        }
        // Initialize session ID
        const sessionId = input.session_id || `session_${Date.now()}`;
        initializeSession(state, sessionId);
        // Ensure cache directory exists
        ensureCacheDir();
        debug('Cache directory ensured');
        // Validate registries
        const { valid, missing } = validateRegistries();
        debug('Registry validation', { valid, missing });
        if (!valid) {
            respond(createResponse(`GoodVibes: Warning - Missing registries: ${missing.join(', ')}. Run build-registries script.`));
            return;
        }
        // Step 2: Check for crash recovery scenario
        let recoveryInfo;
        try {
            recoveryInfo = await checkCrashRecovery(projectDir);
            debug('Crash recovery check', { needsRecovery: recoveryInfo.needsRecovery });
        }
        catch (recoveryError) {
            logError('Crash recovery check', recoveryError);
            recoveryInfo = { needsRecovery: false, previousFeature: null, onBranch: null, uncommittedFiles: [], pendingIssues: [], lastCheckpoint: null };
        }
        // Step 3: Gather all context
        debug(`Gathering project context from: ${projectDir}`);
        let contextResult;
        try {
            // Check for empty project first
            const isEmpty = await isEmptyProject(projectDir);
            if (isEmpty) {
                contextResult = {
                    additionalContext: formatEmptyProjectContext(),
                    summary: 'New project (empty directory)',
                    isEmptyProject: true,
                    hasIssues: false,
                    issueCount: 0,
                    gatherTimeMs: Date.now() - startTime,
                    needsRecovery: false,
                };
            }
            else {
                // Gather all context in parallel for performance
                const [stackInfo, gitContext, envStatus, todos, healthStatus, folderAnalysis, memory, portStatus,] = await Promise.all([
                    detectStack(projectDir),
                    getGitContext(projectDir),
                    checkEnvStatus(projectDir),
                    scanTodos(projectDir),
                    checkProjectHealth(projectDir),
                    analyzeFolderStructure(projectDir),
                    loadProjectMemory(projectDir),
                    checkPorts(projectDir),
                ]);
                // Format the context with clean section headers
                const contextParts = [];
                // Header
                const SECTION_SEPARATOR_LENGTH = 50;
                contextParts.push('[GoodVibes SessionStart]');
                contextParts.push('='.repeat(SECTION_SEPARATOR_LENGTH));
                contextParts.push('');
                // Recovery section (if needed)
                if (recoveryInfo.needsRecovery) {
                    const recoveryStr = formatRecoveryContext(recoveryInfo);
                    if (recoveryStr) {
                        contextParts.push(recoveryStr);
                        contextParts.push('');
                    }
                }
                // Project Overview section
                contextParts.push('## Project Overview');
                contextParts.push('');
                // Stack info
                const stackStr = formatStackInfo(stackInfo);
                if (stackStr) {
                    contextParts.push(stackStr);
                }
                // Folder structure
                const folderStr = formatFolderAnalysis(folderAnalysis);
                if (folderStr) {
                    contextParts.push(folderStr);
                }
                contextParts.push('');
                // Git section
                contextParts.push('## Git Status');
                contextParts.push('');
                const gitStr = formatGitContext(gitContext);
                if (gitStr) {
                    contextParts.push(gitStr);
                }
                contextParts.push('');
                // Environment section
                const envStr = formatEnvStatus(envStatus);
                if (envStr) {
                    contextParts.push('## Environment');
                    contextParts.push('');
                    contextParts.push(envStr);
                    contextParts.push('');
                }
                // Dev Server / Ports section
                const portStr = formatPortStatus(portStatus);
                if (portStr && portStr !== 'No dev servers detected') {
                    contextParts.push('## Dev Servers');
                    contextParts.push('');
                    contextParts.push(portStr);
                    contextParts.push('');
                }
                // Memory section (decisions, patterns, failures)
                const memoryStr = formatMemoryContext(memory);
                if (memoryStr) {
                    contextParts.push('## Project Memory');
                    contextParts.push('');
                    contextParts.push(memoryStr);
                    contextParts.push('');
                }
                // TODOs section
                const todoStr = formatTodos(todos);
                if (todoStr) {
                    contextParts.push('## Code TODOs');
                    contextParts.push('');
                    contextParts.push(todoStr);
                    contextParts.push('');
                }
                // Health section
                const healthStr = formatHealthStatus(healthStatus);
                if (healthStr && healthStr !== 'Health: All good') {
                    contextParts.push('## Health Checks');
                    contextParts.push('');
                    contextParts.push(healthStr);
                    contextParts.push('');
                }
                // Footer
                contextParts.push('='.repeat(SECTION_SEPARATOR_LENGTH));
                // Calculate issues
                const issueCount = healthStatus.checks.filter(c => c.status === 'warning' || c.status === 'error').length
                    + envStatus.warnings.length
                    + todos.length;
                // Build summary
                const summaryParts = [];
                const MAX_FRAMEWORKS_IN_SUMMARY = 3;
                if (stackInfo.frameworks.length > 0) {
                    summaryParts.push(stackInfo.frameworks.slice(0, MAX_FRAMEWORKS_IN_SUMMARY).join(', '));
                }
                if (gitContext.branch) {
                    summaryParts.push(`on ${gitContext.branch}`);
                }
                if (gitContext.hasUncommittedChanges) {
                    summaryParts.push(`${gitContext.uncommittedFileCount} uncommitted`);
                }
                if (issueCount > 0) {
                    summaryParts.push(`${issueCount} issues`);
                }
                contextResult = {
                    additionalContext: contextParts.join('\n'),
                    summary: summaryParts.join(' | ') || 'Project analyzed',
                    isEmptyProject: false,
                    hasIssues: issueCount > 0,
                    issueCount,
                    gatherTimeMs: Date.now() - startTime,
                    needsRecovery: recoveryInfo.needsRecovery,
                };
            }
            debug(`Context gathered in ${contextResult.gatherTimeMs}ms`, {
                isEmptyProject: contextResult.isEmptyProject,
                hasIssues: contextResult.hasIssues,
                issueCount: contextResult.issueCount,
                needsRecovery: contextResult.needsRecovery,
            });
        }
        catch (contextError) {
            // Context gathering failed - continue without context
            logError('Context gathering', contextError);
            contextResult = {
                additionalContext: '',
                summary: 'Context gathering failed',
                isEmptyProject: false,
                hasIssues: false,
                issueCount: 0,
                gatherTimeMs: Date.now() - startTime,
                needsRecovery: false,
            };
        }
        // Step 5: Update session state
        updateSessionState(state, {
            startedAt: new Date().toISOString(),
        });
        // Step 6: Save state
        try {
            await saveState(projectDir, state);
            debug('State saved');
        }
        catch (saveError) {
            logError('State saving', saveError);
            // Continue even if state save fails
        }
        // Save analytics with detected stack info
        saveAnalytics({
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
        // Build system message
        const systemMessage = buildSystemMessage(sessionId, contextResult);
        // Success response with context injection
        respond(createResponse(systemMessage, contextResult.additionalContext || undefined));
    }
    catch (error) {
        logError('SessionStart main', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        respond(createResponse(`GoodVibes: Init error - ${message}`));
    }
}
/**
 * Build the system message based on context gathering results
 */
function buildSystemMessage(sessionId, context) {
    const parts = [];
    // Base message
    parts.push(`GoodVibes plugin v2.1.0 initialized.`);
    parts.push(`17 tools available.`);
    parts.push(`Session: ${sessionId.slice(-8)}`);
    // Recovery indicator
    if (context.needsRecovery) {
        parts.push('| RECOVERY MODE');
    }
    // Context summary
    if (context.isEmptyProject) {
        parts.push('| Empty project detected - scaffolding tools available.');
    }
    else if (context.summary) {
        parts.push(`| ${context.summary}`);
    }
    // Performance note
    if (context.gatherTimeMs > 0) {
        parts.push(`(context: ${context.gatherTimeMs}ms)`);
    }
    return parts.join(' ');
}
main();
