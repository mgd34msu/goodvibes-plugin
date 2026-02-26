/**
 * UserPromptSubmit Handler
 *
 * Delivers pending WRFC directives via additionalContext when a task-notification
 * arrives as the user's prompt. This is the in-process equivalent of
 * user-prompt-submit-directives.mjs.
 */

import type { HookEvent } from '../../../extensions/events/hook-event.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { DirectiveQueue } from '../../../directives/directive-queue.js';
import type { DaemonTickHandler } from '../../../lifecycle/daemon-tick-handler.js';
import type { ExecutorModeManager } from '../../../lifecycle/executor-mode.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:user-prompt-submit');

/** Pattern that identifies a task-notification message from Claude Code. */
const TASK_NOTIFICATION_PATTERN = '<task-notification>';

export interface UserPromptSubmitDeps {
  directiveQueue: DirectiveQueue | null;
  /** DaemonTickHandler for processing daemon tick commands. */
  daemonTickHandler: DaemonTickHandler | null;
  /** ExecutorModeManager for checking the current executor mode. */
  executorMode: ExecutorModeManager | null;
}

/**
 * Creates a UserPromptSubmit handler.
 *
 * When the user prompt is a task-notification (background agent completed),
 * drains pending directives from the queue and injects them via
 * hookSpecificOutput.additionalContext so the orchestrator receives them.
 */
export function createUserPromptSubmitHandler(
  deps: UserPromptSubmitDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handleUserPromptSubmit(
    _event: HookEvent,
    input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const prompt = typeof input['prompt'] === 'string' ? input['prompt'] : '';

    // Check for daemon tick command (before task-notification check)
    const mode = deps.executorMode?.getMode();
    if ((mode === 'daemon' || mode === 'hybrid') && deps.daemonTickHandler) {
      const tickCommand = deps.daemonTickHandler.getTickCommand();
      if (prompt.trim() === tickCommand) {
        logger.info('Daemon tick received via UserPromptSubmit');
        const result = await deps.daemonTickHandler.handleTick();
        const tickContext = JSON.stringify({
          action: 'daemon_tick',
          tick_number: result.tick_number,
          events_processed: result.events_processed,
          budget_status: result.budget_status,
        });
        return {
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: `<gv>${tickContext}</gv>`,
          },
        };
      }
    }

    // Fast path: not a task-notification
    if (!prompt.includes(TASK_NOTIFICATION_PATTERN)) {
      return null;
    }

    if (!deps.directiveQueue) {
      return null;
    }

    const directives = deps.directiveQueue.drain('subagent_stop');
    if (directives.length === 0) {
      return null;
    }

    logger.info('Injecting directives via UserPromptSubmit', {
      count: directives.length,
    });

    const directivePayload = JSON.stringify({
      action: 'directives',
      directives,
    });
    const gvTag = `<gv>${directivePayload}</gv>`;

    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: gvTag,
      },
    };
  };
}
