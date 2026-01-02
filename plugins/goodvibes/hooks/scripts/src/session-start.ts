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
  validateRegistries,
  ensureCacheDir,
  saveAnalytics,
  PLUGIN_ROOT,
} from './shared.js';

function main(): void {
  try {
    // Ensure cache directory exists
    ensureCacheDir();

    // Validate registries
    const { valid, missing } = validateRegistries();

    if (!valid) {
      respond({
        decision: 'allow',
        systemMessage: `GoodVibes: Warning - Missing registries: ${missing.join(', ')}. Run build-registries script.`,
      });
      return;
    }

    // Initialize analytics for this session
    const sessionId = `session_${Date.now()}`;
    saveAnalytics({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      tool_usage: [],
      skills_recommended: [],
      validations_run: 0,
      issues_found: 0,
    });

    // Success response
    respond({
      decision: 'allow',
      systemMessage: `GoodVibes plugin v2.1.0 initialized. 17 tools available. Session: ${sessionId.slice(-8)}`,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    respond({
      decision: 'allow',
      systemMessage: `GoodVibes: Init warning - ${message}`,
    });
  }
}

main();
