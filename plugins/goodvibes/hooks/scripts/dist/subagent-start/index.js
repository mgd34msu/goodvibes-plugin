/**
 * Subagent Start Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) starts.
 * Captures telemetry data and stores it for correlation with SubagentStop.
 *
 * Captures:
 * - agent_id, agent_type, session_id, cwd, timestamp
 * - Derives project_name from cwd
 * - Gets git info (branch, commit) if available
 * - Stores entry to .goodvibes/state/agent-tracking.json
 * - Returns additionalContext with project reminders
 */
import * as path from 'path';
import { respond, readHookInput, loadAnalytics, saveAnalytics, debug, logError, isTestEnvironment, } from '../shared/index.js';
import { loadState, saveState } from '../state/index.js';
import { saveAgentTracking } from '../subagent-stop/telemetry.js';
import { cleanupStaleAgents, getGitInfo, deriveProjectName, } from '../telemetry/index.js';
import { getActiveAgentsFilePath } from '../telemetry/index.js';
import { buildSubagentContext } from './context-injection.js';
import { RuntimeClient } from '../shared/runtime-client.js';
import { extractWorkflowId, normalizeAgentFields, mergeSystemMessages } from './wrfc-utils.js';
/**
 * Creates a hook response with optional system message and additional context.
 *
 * @param options - Optional configuration for the response
 * @param options.systemMessage - System message to include
 * @param options.additionalContext - Additional context to inject
 * @returns SubagentStartResponse object with continue: true
 */
function createResponse(options) {
    const response = {
        continue: true,
    };
    if (options?.systemMessage) {
        response.systemMessage = options.systemMessage;
    }
    if (options?.additionalContext) {
        response.additionalContext = options.additionalContext;
    }
    return response;
}
/**
 * Known GoodVibes agent types that receive system messages.
 * These agents are part of the GoodVibes ecosystem and get special handling.
 */
const GOODVIBES_AGENTS = new Set([
    'goodvibes:agent-factory',
    'goodvibes:skill-factory',
    'goodvibes:engineer',
    'goodvibes:reviewer',
    'goodvibes:tester',
    'goodvibes:architect',
    'goodvibes:deployer',
    'goodvibes:integrator',
]);
/**
 * Extracts normalized input fields from raw hook input.
 * Handles field name variations (agent_id vs subagent_id, etc.).
 *
 * @param input - Raw hook input from Claude
 * @returns Normalized fields with consistent naming
 */
function extractStartInputFields(input) {
    return {
        agentId: input.agent_id ?? input.subagent_id ?? 'agent_' + Date.now(),
        agentType: input.agent_type ?? input.subagent_type ?? 'unknown',
        taskDescription: input.task_description ?? input.task ?? '',
        cwd: input.cwd ?? process.cwd(),
        sessionId: input.session_id ?? '',
    };
}
/**
 * Creates a telemetry tracking entry for the starting agent.
 *
 * @param agentId - Unique identifier for the agent
 * @param agentType - Type of agent (e.g., 'backend-engineer')
 * @param sessionId - Current session identifier
 * @param cwd - Current working directory
 * @param projectName - Derived project name
 * @param gitInfo - Git branch and commit information
 * @param taskDescription - Description of the task assigned to this agent
 * @returns TelemetryTracking object for persistence
 */
function createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo, taskDescription, workflowId) {
    return {
        agent_id: agentId,
        agent_type: agentType,
        session_id: sessionId,
        project: cwd,
        project_name: projectName,
        git_branch: gitInfo.branch,
        git_commit: gitInfo.commit,
        started_at: new Date().toISOString(),
        task_description: taskDescription || undefined,
        workflow_id: workflowId || undefined,
    };
}
/**
 * Tracks subagent spawn in analytics.
 * Appends spawn info to the subagents_spawned array.
 *
 * @param agentType - Type of agent being spawned
 * @param taskDescription - Description of the task (truncated to 200 chars)
 * @param startedAt - ISO timestamp of when agent started
 * @returns Loaded analytics object or null if unavailable
 */
async function trackInAnalytics(agentType, taskDescription, startedAt) {
    const analytics = await loadAnalytics();
    if (!analytics) {
        return null;
    }
    const TASK_MAX_LENGTH = 200;
    analytics.subagents_spawned ??= [];
    analytics.subagents_spawned.push({
        type: agentType,
        task: taskDescription?.substring(0, TASK_MAX_LENGTH),
        started_at: startedAt,
    });
    await saveAnalytics(analytics);
    return analytics;
}
/**
 * Builds project reminders for context injection.
 * Includes stack info, git branch, and project name.
 *
 * @param projectName - Name of the current project
 * @param gitBranch - Current git branch, if available
 * @param stackInfo - Detected stack information
 * @returns Array of reminder strings
 */
function buildReminders(projectName, gitBranch, stackInfo) {
    const reminders = [];
    if (stackInfo) {
        reminders.push('Detected stack: ' + JSON.stringify(stackInfo));
    }
    if (gitBranch) {
        reminders.push('Git branch: ' + gitBranch);
    }
    reminders.push('Project: ' + projectName);
    return reminders;
}
/**
 * Combines subagent context with project reminders.
 * Merges agent-specific context with project-level information.
 *
 * @param subagentContext - Context built for the specific agent type
 * @param reminders - Array of project reminder strings
 * @returns Combined context string for injection
 */
function buildAdditionalContext(subagentContext, reminders) {
    if (subagentContext.additionalContext) {
        return subagentContext.additionalContext + '\n\n' + reminders.join('\n');
    }
    return '[GoodVibes Project Context]\n' + reminders.join('\n');
}
/**
 * Builds system message for GoodVibes agents.
 * Only generates messages for known GoodVibes agent types.
 *
 * @param agentType - Type of agent starting
 * @param projectName - Name of the current project
 * @param gitBranch - Current git branch, if available
 * @returns System message string, or undefined for non-GoodVibes agents
 */
function buildSystemMessage(agentType, projectName, gitBranch) {
    if (!GOODVIBES_AGENTS.has(agentType)) {
        debug('Non-GoodVibes agent started: ' + agentType);
        return undefined;
    }
    return ('[GoodVibes] Agent ' +
        agentType +
        ' starting. ' +
        'Project: ' +
        projectName +
        (gitBranch ? ', Branch: ' + gitBranch : ''));
}
/**
 * Main entry point for subagent-start hook.
 * Captures telemetry data, stores tracking info, and injects project context.
 *
 * @returns Promise that resolves when hook processing completes
 */
async function runSubagentStartHook() {
    try {
        debug('SubagentStart hook starting');
        const rawInput = await readHookInput();
        debug('Raw input shape:', Object.keys(rawInput || {}));
        const input = rawInput;
        // ─── Phase 6: Runtime engine integration (non-blocking, no early-return) ───
        // Sends agent:spawned event and queries for a system message / dossier.
        // Falls through to existing context-injection logic always.
        // Resolves workflow_id deterministically via [WRFC:wid] tag first, then
        // falls back to the pending bind queue for non-WRFC agents.
        let runtimeSystemMessage;
        let resolvedWorkflowId = null;
        try {
            const runtimeClient = new RuntimeClient(input.session_id);
            if (runtimeClient.isAvailable()) {
                debug('Phase 6: runtime engine available, sending agent:spawned event');
                const { agent_id, agent_type } = normalizeAgentFields(input);
                // PRIORITY 1: Extract [WRFC:wid] from task description (deterministic, always correct)
                const taskDesc = input.task_description ?? input.task ?? '';
                resolvedWorkflowId = extractWorkflowId(taskDesc);
                if (resolvedWorkflowId) {
                    debug('Phase 6: extracted workflow_id from WRFC tag', { workflow_id: resolvedWorkflowId });
                    // Consume matching pending binds for this workflow to keep the queue clean
                    try {
                        const consumeResult = await runtimeClient.query({ kind: 'consume_pending_bind', workflow_id: resolvedWorkflowId });
                        if (consumeResult?.kind === 'pending_bind_consumed') {
                            debug('Phase 6: consumed pending binds', { removed: consumeResult.removed });
                        }
                    }
                    catch {
                        // Non-critical: cleanup failure doesn't break binding
                        debug('Phase 6: consume_pending_bind cleanup failed, non-critical');
                    }
                }
                // PRIORITY 2: Fall back to pending bind queue (for agents without WRFC tag).
                // Use normalizedAgentType (guaranteed string) — agent_type may be undefined
                // if Claude Code didn't provide the field, which would cause the guard to
                // skip the lookup entirely and prevent auto-workflow creation.
                const normalizedAgentTypeForBind = agent_type;
                if (!resolvedWorkflowId) {
                    debug('Phase 6: no WRFC tag found, trying pending bind queue', { agent_type: normalizedAgentTypeForBind });
                    const pendingBindResult = await runtimeClient.query({ kind: 'resolve_pending_bind', agent_type: normalizedAgentTypeForBind });
                    if (pendingBindResult?.kind === 'pending_bind' && pendingBindResult.workflow_id) {
                        resolvedWorkflowId = pendingBindResult.workflow_id;
                        debug('Phase 6: resolved pending bind from runtime', { workflow_id: resolvedWorkflowId, agent_type: normalizedAgentTypeForBind });
                    }
                    else {
                        debug('Phase 6: no pending bind found for agent', { agent_type: normalizedAgentTypeForBind });
                    }
                }
                // agent_type MUST be a string in the payload so the runtime can decide
                // whether this agent needs review. normalizedAgentTypeForBind (defined above)
                // is the guaranteed-string version — reuse it here to avoid duplication.
                debug('Phase 6: agent fields', { agent_id, agent_type: normalizedAgentTypeForBind, resolved_workflow_id: resolvedWorkflowId });
                const spawnedData = {
                    ...rawInput,
                    agent_id,
                    agent_type: normalizedAgentTypeForBind,
                };
                if (resolvedWorkflowId) {
                    spawnedData['workflow_id'] = resolvedWorkflowId;
                }
                debug('Phase 6: sending agent:spawned event', { has_workflow_id: !!resolvedWorkflowId, agent_type: normalizedAgentTypeForBind });
                await runtimeClient.sendHookEvent('agent:spawned', spawnedData);
                const queryResult = await runtimeClient.query({ kind: 'get_system_message' });
                if (queryResult?.kind === 'system_message') {
                    debug('Phase 6: runtime returned system message for subagent, storing for merge');
                    runtimeSystemMessage = queryResult.message;
                }
            }
        }
        catch {
            // Runtime integration must never break the hook — fall through
            debug('Phase 6: runtime integration error, falling through to existing logic');
        }
        // ─── End Phase 6 integration ───
        const { agentId, agentType, taskDescription, cwd, sessionId } = extractStartInputFields(input);
        const TASK_PREVIEW_LENGTH = 100;
        debug('SubagentStart received input', {
            agent_id: agentId,
            agent_type: agentType,
            session_id: sessionId,
            task_preview: taskDescription?.substring(0, TASK_PREVIEW_LENGTH),
            cwd,
        });
        // Clean up stale agent entries
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        const activeAgentsFile = getActiveAgentsFilePath(goodvibesDir, stateDir);
        await cleanupStaleAgents(activeAgentsFile);
        const gitInfo = await getGitInfo(cwd);
        debug('Git info', gitInfo);
        const projectName = deriveProjectName(cwd);
        debug('Project name', projectName);
        const tracking = createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo, taskDescription, resolvedWorkflowId);
        await saveAgentTracking(cwd, tracking);
        debug('Saved agent tracking', { agent_id: agentId });
        const analytics = await trackInAnalytics(agentType, taskDescription, tracking.started_at);
        // Update session state if needed
        const state = await loadState(cwd);
        if (!state.session.id && sessionId) {
            state.session.id = sessionId;
            state.session.startedAt = new Date().toISOString();
            await saveState(cwd, state);
        }
        const subagentContext = await buildSubagentContext(cwd, agentType, sessionId);
        const reminders = buildReminders(projectName, gitInfo.branch, analytics?.detected_stack);
        let additionalContext = buildAdditionalContext(subagentContext, reminders);
        const systemMessage = buildSystemMessage(agentType, projectName, gitInfo.branch);
        // Inject WRFC workflow binding into additionalContext so the agent knows its wid
        if (resolvedWorkflowId) {
            additionalContext += '\n\n[WRFC Binding] This agent is bound to workflow ' + resolvedWorkflowId + '. Include [WRFC:' + resolvedWorkflowId + '] in your output.';
            debug('Phase 6: injecting WRFC workflow binding into additionalContext', { workflow_id: resolvedWorkflowId });
        }
        // Merge runtime system message (if any) with the hook-built system message
        const mergedSystemMessage = mergeSystemMessages(runtimeSystemMessage, systemMessage);
        respond(createResponse({ systemMessage: mergedSystemMessage, additionalContext }));
    }
    catch (error) {
        logError('SubagentStart main', error);
        respond(createResponse());
    }
}
// Only run the hook if not in test mode
if (!isTestEnvironment()) {
    runSubagentStartHook().catch((error) => {
        logError('SubagentStart uncaught', error);
        respond(createResponse());
    });
}
// Re-export for testing
export { buildSubagentContext };
