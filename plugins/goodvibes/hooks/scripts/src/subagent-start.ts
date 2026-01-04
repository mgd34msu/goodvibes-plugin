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
 * - Stores entry to .goodvibes/state/active-agents.json
 * - Optionally returns additionalContext with stack info
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

import {
  registerActiveAgent,
  cleanupStaleAgents,
  getGitInfo,
  deriveProjectName,
  ActiveAgentEntry,
} from './telemetry.js';

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

function createResponse(options?: {
  systemMessage?: string;
  additionalContext?: Record<string, unknown>;
}): HookResponse {
  const response: HookResponse = {
    continue: true,
  };

  if (options?.systemMessage) {
    response.systemMessage = options.systemMessage;
  }

  return response;
}

async function main(): Promise<void> {
  try {
    debug('SubagentStart hook starting');

    const rawInput = await readHookInput();
    debug('Raw input shape:', Object.keys(rawInput || {}));
    const input = rawInput as unknown as SubagentStartInput;

    // Extract subagent info (handle different field names)
    const agentId = input.agent_id || input.subagent_id || ('agent_' + Date.now());
    const agentType = input.agent_type || input.subagent_type || 'unknown';
    const taskDescription = input.task_description || input.task || '';
    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id || '';

    debug('SubagentStart received input', {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      task_preview: taskDescription?.substring(0, 100),
      cwd,
    });

    // Clean up any stale agent entries (from crashed sessions)
    cleanupStaleAgents();

    // Get git information
    const gitInfo = getGitInfo(cwd);
    debug('Git info', gitInfo);

    // Derive project name
    const projectName = deriveProjectName(cwd);
    debug('Project name', projectName);

    // Create and store the active agent entry
    const entry: ActiveAgentEntry = {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      cwd,
      project_name: projectName,
      started_at: new Date().toISOString(),
      git_branch: gitInfo.branch,
      git_commit: gitInfo.commit,
      task_description: taskDescription?.substring(0, 500), // Limit size
    };

    registerActiveAgent(entry);

    // Track subagent spawns in session analytics
    const analytics = loadAnalytics();
    if (analytics) {
      // Ensure array exists with proper typing
      analytics.subagents_spawned = analytics.subagents_spawned || [];
      analytics.subagents_spawned.push({
        type: agentType,
        task: taskDescription?.substring(0, 200),
        started_at: entry.started_at,
      });
      saveAnalytics(analytics);
    }

    // Build response with optional context for GoodVibes agents
    const goodvibesAgents = [
      'goodvibes:factory',
      'goodvibes:skill-creator',
      'goodvibes:backend-engineer',
      'goodvibes:content-platform',
      'goodvibes:devops-deployer',
      'goodvibes:frontend-architect',
      'goodvibes:fullstack-integrator',
      'goodvibes:test-engineer',
    ];

    let systemMessage: string | undefined;

    if (goodvibesAgents.includes(agentType)) {
      // Build context message for GoodVibes agents
      const contextParts: string[] = [
        '[GoodVibes] Agent ' + agentType + ' starting.',
      ];

      // Add stack info if available
      const stackInfo = analytics?.detected_stack;
      if (stackInfo) {
        contextParts.push('Detected stack: ' + JSON.stringify(stackInfo));
      }

      // Add git context
      if (gitInfo.branch) {
        contextParts.push('Git branch: ' + gitInfo.branch);
      }

      // Add project context
      contextParts.push('Project: ' + projectName);

      systemMessage = contextParts.join(' ');
    } else {
      // For non-GoodVibes agents, just log telemetry silently
      debug('Non-GoodVibes agent started: ' + agentType);
    }

    respond(createResponse({ systemMessage }));

  } catch (error) {
    logError('SubagentStart main', error);
    respond(createResponse());
  }
}

main();
