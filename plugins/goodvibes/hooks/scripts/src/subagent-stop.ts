/**
 * Subagent Stop Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) finishes.
 * Can evaluate if subagent completed its task.
 */

import {
  respond,
  readHookInput,
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
    debug('SubagentStop hook starting');

    const input = await readHookInput();
    debug('SubagentStop received input', {
      session_id: input.session_id,
    });

    // Could evaluate subagent output here
    // For now, just continue
    respond(createResponse());

  } catch (error) {
    logError('SubagentStop main', error);
    respond(createResponse());
  }
}

main();
