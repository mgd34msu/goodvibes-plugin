/**
 * Pre-Compact Hook (GoodVibes)
 *
 * Runs before context compression (auto or manual).
 * Can save important context before it's compacted.
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
    debug('PreCompact hook starting');

    const input = await readHookInput();
    debug('PreCompact received input', {
      hook_event_name: input.hook_event_name,
    });

    // Save current analytics state before compact
    const analytics = loadAnalytics();
    if (analytics) {
      const compactBackup = path.join(CACHE_DIR, 'pre-compact-backup.json');
      fs.writeFileSync(compactBackup, JSON.stringify({
        ...analytics,
        compact_at: new Date().toISOString(),
      }, null, 2));
      debug(`Saved pre-compact backup to ${compactBackup}`);
    }

    respond(createResponse());

  } catch (error) {
    logError('PreCompact main', error);
    respond(createResponse());
  }
}

main();
