/**
 * Session End Hook (GoodVibes)
 *
 * Runs when a Claude Code session ends.
 * Handles cleanup, logging, and saving session state.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  respond,
  readHookInput,
  loadAnalytics,
  saveAnalytics,
  debug,
  logError,
  CACHE_DIR,
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
    debug('SessionEnd hook starting');

    const input = await readHookInput();
    debug('SessionEnd received input', {
      session_id: input.session_id,
    });

    const analytics = loadAnalytics();

    if (analytics) {
      // Finalize analytics
      analytics.ended_at = new Date().toISOString();

      // Calculate session duration
      const started = new Date(analytics.started_at).getTime();
      const ended = new Date(analytics.ended_at).getTime();
      const durationMinutes = Math.round((ended - started) / 60000);

      // Save final analytics
      saveAnalytics(analytics);

      // Create session summary file
      const summaryFile = path.join(CACHE_DIR, `session-${analytics.session_id}.json`);
      fs.writeFileSync(summaryFile, JSON.stringify({
        session_id: analytics.session_id,
        duration_minutes: durationMinutes,
        tools_used: analytics.tool_usage.length,
        unique_tools: [...new Set(analytics.tool_usage.map(u => u.tool))],
        skills_recommended: analytics.skills_recommended.length,
        validations_run: analytics.validations_run,
        issues_found: analytics.issues_found,
        ended_reason: 'session_end',
      }, null, 2));

      debug(`Session ended. Duration: ${durationMinutes}m, Tools: ${analytics.tool_usage.length}`);
    }

    respond(createResponse());

  } catch (error) {
    logError('SessionEnd main', error);
    respond(createResponse());
  }
}

main();
