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
/** Creates a hook response with optional system message and additional context. */
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
/** Known GoodVibes agent types that receive system messages. */
const GOODVIBES_AGENTS = new Set([
    'goodvibes:factory',
    'goodvibes:skill-creator',
    'goodvibes:backend-engineer',
    'goodvibes:content-platform',
    'goodvibes:devops-deployer',
    'goodvibes:frontend-architect',
    'goodvibes:fullstack-integrator',
    'goodvibes:test-engineer',
    'goodvibes:brutal-reviewer',
    'goodvibes:workflow-planner',
]);
/** Extracts normalized input fields from raw hook input. */
function extractStartInputFields(input) {
    return {
        agentId: input.agent_id ?? input.subagent_id ?? 'agent_' + Date.now(),
        agentType: input.agent_type ?? input.subagent_type ?? 'unknown',
        taskDescription: input.task_description ?? input.task ?? '',
        cwd: input.cwd ?? process.cwd(),
        sessionId: input.session_id ?? '',
    };
}
/** Creates a telemetry tracking entry. */
function createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo) {
    return {
        agent_id: agentId,
        agent_type: agentType,
        session_id: sessionId,
        project: cwd,
        project_name: projectName,
        git_branch: gitInfo.branch,
        git_commit: gitInfo.commit,
        started_at: new Date().toISOString(),
    };
}
/** Tracks subagent spawn in analytics. */
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
/** Builds project reminders for context injection. */
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
/** Combines subagent context with project reminders. */
function buildAdditionalContext(subagentContext, reminders) {
    if (subagentContext.additionalContext) {
        return subagentContext.additionalContext + '\n\n' + reminders.join('\n');
    }
    return '[GoodVibes Project Context]\n' + reminders.join('\n');
}
/** Builds system message for GoodVibes agents. */
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
/** Main entry point for subagent-start hook. Captures telemetry and injects project context. */
async function runSubagentStartHook() {
    try {
        debug('SubagentStart hook starting');
        const rawInput = await readHookInput();
        debug('Raw input shape:', Object.keys(rawInput || {}));
        const input = rawInput;
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
        const tracking = createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo);
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
        const additionalContext = buildAdditionalContext(subagentContext, reminders);
        const systemMessage = buildSystemMessage(agentType, projectName, gitInfo.branch);
        respond(createResponse({ systemMessage, additionalContext }));
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
