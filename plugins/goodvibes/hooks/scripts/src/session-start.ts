/**
 * Session Start Hook
 *
 * Initializes the GoodVibes plugin:
 * - Validates registries exist
 * - Creates cache directory
 * - Initializes analytics
 * - Warms up indexes (optional)
 */

import {
  respond,
  readHookInput,
  validateRegistries,
  ensureCacheDir,
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
    debug('SessionStart hook starting');

    // Read hook input from stdin (contains session info)
    const input = await readHookInput();
    debug('SessionStart received input', { session_id: input.session_id, hook_event_name: input.hook_event_name });

    // Ensure cache directory exists
    ensureCacheDir();
    debug('Cache directory ensured');

    // Validate registries
    const { valid, missing } = validateRegistries();
    debug('Registry validation', { valid, missing });

    if (!valid) {
      respond(createResponse(`GoodVibes: Warning - Missing registries: ${missing.join(', ')}. Run build-registries script.`));
      return;
    }

    // Initialize analytics for this session
    const sessionId = input.session_id || `session_${Date.now()}`;
    saveAnalytics({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      tool_usage: [],
      skills_recommended: [],
      validations_run: 0,
      issues_found: 0,
    });
    debug(`Analytics initialized for session ${sessionId}`);

    // Success response
    respond(createResponse(`GoodVibes plugin v2.1.0 initialized. 17 tools available. Session: ${sessionId.slice(-8)}`));

  } catch (error) {
    logError('SessionStart main', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    respond(createResponse(`GoodVibes: Init error - ${message}`));
  }
}

main();
