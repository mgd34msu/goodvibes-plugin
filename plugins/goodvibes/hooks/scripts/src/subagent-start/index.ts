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

import {
  respond,
  readHookInput,
  loadAnalytics,
  saveAnalytics,
  debug,
  logError,
  isTestEnvironment,
} from '../shared/index.js';
import { loadState, saveState } from '../state/index.js';
import { saveAgentTracking } from '../subagent-stop/telemetry.js';
import {
  cleanupStaleAgents,
  getGitInfo,
  deriveProjectName,
} from '../telemetry/index.js';
import { getActiveAgentsFilePath } from '../telemetry/index.js';

import { buildSubagentContext } from './context-injection.js';
import { RuntimeClient } from '../shared/runtime-client.js';

import type { HookResponse } from '../shared/index.js';
import type { TelemetryTracking } from '../types/telemetry.js';

/**
 * Extended hook input interface for SubagentStart.
 * Contains session, agent, and task information from the hook trigger.
 */
interface SubagentStartInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  // Subagent-specific fields
  agent_id?: string;
  subagent_id?: string;
  agent_type?: string;
  subagent_type?: string;
  task_description?: string;
  task?: string;
}

/**
 * Response structure for the SubagentStart hook.
 * Extends HookResponse with optional additional context for injection.
 */
interface SubagentStartResponse extends HookResponse {
  /** Additional context to inject into the subagent session */
  additionalContext?: string;
}

/**
 * Creates a hook response with optional system message and additional context.
 *
 * @param options - Optional configuration for the response
 * @param options.systemMessage - System message to include
 * @param options.additionalContext - Additional context to inject
 * @returns SubagentStartResponse object with continue: true
 */
function createResponse(options?: {
  systemMessage?: string;
  additionalContext?: string;
}): SubagentStartResponse {
  const response: SubagentStartResponse = {
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
function extractStartInputFields(input: SubagentStartInput): {
  agentId: string;
  agentType: string;
  taskDescription: string;
  cwd: string;
  sessionId: string;
} {
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
function createTrackingEntry(
  agentId: string,
  agentType: string,
  sessionId: string,
  cwd: string,
  projectName: string,
  gitInfo: { branch?: string; commit?: string },
  taskDescription: string
): TelemetryTracking {
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
async function trackInAnalytics(
  agentType: string,
  taskDescription: string,
  startedAt: string
): Promise<Awaited<ReturnType<typeof loadAnalytics>>> {
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
function buildReminders(
  projectName: string,
  gitBranch: string | undefined,
  stackInfo: unknown
): string[] {
  const reminders: string[] = [];

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
function buildAdditionalContext(
  subagentContext: Awaited<ReturnType<typeof buildSubagentContext>>,
  reminders: string[]
): string {
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
function buildSystemMessage(
  agentType: string,
  projectName: string,
  gitBranch: string | undefined
): string | undefined {
  if (!GOODVIBES_AGENTS.has(agentType)) {
    debug('Non-GoodVibes agent started: ' + agentType);
    return undefined;
  }

  return (
    '[GoodVibes] Agent ' +
    agentType +
    ' starting. ' +
    'Project: ' +
    projectName +
    (gitBranch ? ', Branch: ' + gitBranch : '')
  );
}

/**
 * Main entry point for subagent-start hook.
 * Captures telemetry data, stores tracking info, and injects project context.
 *
 * @returns Promise that resolves when hook processing completes
 */
async function runSubagentStartHook(): Promise<void> {
  try {
    debug('SubagentStart hook starting');

    const rawInput = await readHookInput();
    debug('Raw input shape:', Object.keys(rawInput || {}));
    const input = rawInput as unknown as SubagentStartInput;

    // ─── Phase 6: Runtime engine integration (early-return when available) ───
    // Sends agent:spawned event and queries for a system message / dossier.
    // Falls through to existing context-injection logic when not available.
    try {
      const runtimeClient = new RuntimeClient();
      if (runtimeClient.isAvailable()) {
        debug('Phase 6: runtime engine available, sending agent:spawned event');
        await runtimeClient.sendHookEvent(
          'agent:spawned',
          rawInput as unknown as Record<string, unknown>
        );
        const queryResult = await runtimeClient.query({ kind: 'get_system_message' });
        if (queryResult?.kind === 'system_message') {
          debug('Phase 6: runtime returned system message for subagent, using it');
          respond(createResponse({ systemMessage: queryResult.message }));
          return;
        }
      }
    } catch {
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

    const tracking = createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo, taskDescription);
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
  } catch (error: unknown) {
    logError('SubagentStart main', error);
    respond(createResponse());
  }
}

// Only run the hook if not in test mode
if (!isTestEnvironment()) {
  runSubagentStartHook().catch((error: unknown) => {
    logError('SubagentStart uncaught', error);
    respond(createResponse());
  });
}

// Re-export for testing
export { buildSubagentContext };
