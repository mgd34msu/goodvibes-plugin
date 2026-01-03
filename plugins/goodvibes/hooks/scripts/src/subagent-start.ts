/**
 * Subagent Start Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) starts.
 * Can inject context, validate agent selection, or track usage.
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

function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

async function main(): Promise<void> {
  try {
    debug('SubagentStart hook starting');

    const input = await readHookInput();

    // Extract subagent info from input
    const inputRecord = input as unknown as Record<string, unknown>;
    const subagentType = inputRecord.subagent_type as string || 'unknown';
    const taskDescription = inputRecord.task_description as string || '';

    debug('SubagentStart received input', {
      session_id: input.session_id,
      subagent_type: subagentType,
      task_description: taskDescription?.substring(0, 100),
    });

    // Track subagent spawns in analytics
    const analytics = loadAnalytics();
    if (analytics) {
      if (!analytics.subagents_spawned) {
        analytics.subagents_spawned = [];
      }
      analytics.subagents_spawned.push({
        type: subagentType,
        task: taskDescription?.substring(0, 200),
        started_at: new Date().toISOString(),
      });
      saveAnalytics(analytics);
    }

    // Check if this is a GoodVibes agent and provide context
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

    if (goodvibesAgents.includes(subagentType)) {
      // Could inject cached stack detection or other context here
      const stackInfo = analytics?.detected_stack;
      if (stackInfo) {
        respond(createResponse(
          `[GoodVibes] Agent ${subagentType} starting. Detected stack: ${JSON.stringify(stackInfo)}`
        ));
        return;
      }
    }

    respond(createResponse());

  } catch (error) {
    logError('SubagentStart main', error);
    respond(createResponse());
  }
}

main();
