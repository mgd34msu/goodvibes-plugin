/**
 * Notification Idle Hook (GoodVibes)
 *
 * Handles idle_prompt notifications from Claude Code.
 * Triggered when Claude is waiting for user input after 60+ seconds of idle time.
 * Used to remind the orchestrator to check agent work and continue the WRFC loop.
 *
 */
import type { HookResponse } from './index.js';
/**
 * The reminder message shown when agents finish and Claude becomes idle.
 * This prompts the orchestrator to verify work and continue the WRFC loop.
 */
declare const IDLE_PROMPT_MESSAGE = "CRITICAL: IF YOU ARE WORKING ON A LONG TASK CHECK IF AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!";
/**
 * Creates a hook response with optional system message.
 *
 * @param systemMessage - Optional message to include in the response
 * @returns A HookResponse object with continue=true
 * @internal
 */
declare function createResponse(systemMessage?: string): HookResponse;
/**
 * Main entry point for notification idle hook.
 *
 * Handles idle_prompt notifications from Claude Code. When triggered,
 * returns a system message reminding the orchestrator to check completed
 * agent work, commit verified changes, and continue the WRFC loop.
 *
 * @internal
 */
declare function runNotificationIdleHook(): Promise<void>;
export { runNotificationIdleHook, createResponse, IDLE_PROMPT_MESSAGE };
