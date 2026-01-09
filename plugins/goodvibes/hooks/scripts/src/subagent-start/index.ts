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

import type { HookResponse } from '../shared/index.js';
import type { TelemetryTracking } from '../types/telemetry.js';

// Extended hook input interface for SubagentStart
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

interface SubagentStartResponse extends HookResponse {
  additionalContext?: string;
}

/** Creates a hook response with optional system message and additional context. */
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

/** Main entry point for subagent-start hook. Captures telemetry and injects project context. */
async function runSubagentStartHook(): Promise<void> {
  try {
    debug('SubagentStart hook starting');

    const rawInput = await readHookInput();
    debug('Raw input shape:', Object.keys(rawInput || {}));
    const input = rawInput as unknown as SubagentStartInput;

    // Extract subagent info (handle different field names)
    const agentId =
      input.agent_id || input.subagent_id || 'agent_' + Date.now();
    const agentType = input.agent_type || input.subagent_type || 'unknown';
    const taskDescription = input.task_description || input.task || '';
    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id || '';

    const TASK_PREVIEW_LENGTH = 100;
    debug('SubagentStart received input', {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      task_preview: taskDescription?.substring(0, TASK_PREVIEW_LENGTH),
      cwd,
    });

    // Clean up any stale agent entries (from crashed sessions)
    const goodvibesDir = path.join(cwd, '.goodvibes');
    const stateDir = path.join(goodvibesDir, 'state');
    const activeAgentsFile = getActiveAgentsFilePath(goodvibesDir, stateDir);
    await cleanupStaleAgents(activeAgentsFile);

    // Get git information
    const gitInfo = await getGitInfo(cwd);
    debug('Git info', gitInfo);

    // Derive project name
    const projectName = deriveProjectName(cwd);
    debug('Project name', projectName);

    // Create telemetry tracking entry for correlation with SubagentStop
    const tracking: TelemetryTracking = {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      project: cwd,
      project_name: projectName,
      git_branch: gitInfo.branch,
      git_commit: gitInfo.commit,
      started_at: new Date().toISOString(),
    };

    // Save tracking data for correlation with SubagentStop
    await saveAgentTracking(cwd, tracking);
    debug('Saved agent tracking', { agent_id: agentId });

    // Track subagent spawns in session analytics
    const analytics = await loadAnalytics();
    if (analytics) {
      // Ensure array exists with proper typing
      const TASK_MAX_LENGTH = 200;
      analytics.subagents_spawned = analytics.subagents_spawned || [];
      analytics.subagents_spawned.push({
        type: agentType,
        task: taskDescription?.substring(0, TASK_MAX_LENGTH),
        started_at: tracking.started_at,
      });
      await saveAnalytics(analytics);
    }

    // Load state to track session info
    const state = await loadState(cwd);
    if (!state.session.id && sessionId) {
      state.session.id = sessionId;
      state.session.startedAt = new Date().toISOString();
      await saveState(cwd, state);
    }

    // Build additional context for the subagent
    const subagentContext = await buildSubagentContext(
      cwd,
      agentType,
      sessionId
    );

    // Build project reminders for the context
    const reminders: string[] = [];

    // Add stack info if available
    const stackInfo = analytics?.detected_stack;
    if (stackInfo) {
      reminders.push('Detected stack: ' + JSON.stringify(stackInfo));
    }

    // Add git context
    if (gitInfo.branch) {
      reminders.push('Git branch: ' + gitInfo.branch);
    }

    // Add project context
    reminders.push('Project: ' + projectName);

    // Combine context
    // Note: reminders always has at least one element (project name) so we always append
    let additionalContext: string | undefined;
    if (subagentContext.additionalContext) {
      additionalContext =
        subagentContext.additionalContext + '\n\n' + reminders.join('\n');
    } else {
      additionalContext =
        '[GoodVibes Project Context]\n' + reminders.join('\n');
    }

    // Build system message for GoodVibes agents
    const goodvibesAgents = [
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
    ];

    let systemMessage: string | undefined;

    if (goodvibesAgents.includes(agentType)) {
      systemMessage =
        '[GoodVibes] Agent ' +
        agentType +
        ' starting. ' +
        'Project: ' +
        projectName +
        (gitInfo.branch ? ', Branch: ' + gitInfo.branch : '');
    } else {
      // For non-GoodVibes agents, just log telemetry silently
      debug('Non-GoodVibes agent started: ' + agentType);
    }

    respond(
      createResponse({
        systemMessage,
        additionalContext,
      })
    );
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
