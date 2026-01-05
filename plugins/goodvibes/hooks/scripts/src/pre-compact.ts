/**
 * Pre-Compact Hook (GoodVibes)
 *
 * Runs before context compression (auto or manual).
 * Can save important context before it's compacted.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  respond,
  readHookInput,
  loadAnalytics,
  debug,
  logError,
  CACHE_DIR,
  HookResponse,
  parseTranscript,
  fileExistsAsync,
  SessionAnalytics,
} from './shared.js';
import { loadState } from './state.js';
import {
  createPreCompactCheckpoint,
  saveSessionSummary,
  getFilesModifiedThisSession,
} from './pre-compact/index.js';

/** Creates a hook response with optional system message. */
function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

/**
 * Generate a session summary from analytics and state
 */
function generateSessionSummary(
  analytics: SessionAnalytics | null,
  modifiedFiles: string[],
  transcriptSummary: string
): string {
  const lines: string[] = [];

  if (analytics) {
    lines.push(`Session ID: ${analytics.session_id}`);
    lines.push(`Started: ${analytics.started_at}`);
    lines.push(`Tools used: ${analytics.tool_usage.length}`);
    lines.push(`Validations run: ${analytics.validations_run}`);
    lines.push(`Issues found: ${analytics.issues_found}`);

    if (analytics.skills_recommended.length > 0) {
      lines.push(`Skills recommended: ${analytics.skills_recommended.join(', ')}`);
    }
  }

  const MAX_FILES_IN_SUMMARY = 20;
  if (modifiedFiles.length > 0) {
    lines.push('');
    lines.push('## Files Modified This Session');
    for (const file of modifiedFiles.slice(0, MAX_FILES_IN_SUMMARY)) {
      lines.push(`- ${file}`);
    }
    if (modifiedFiles.length > MAX_FILES_IN_SUMMARY) {
      lines.push(`- ... and ${modifiedFiles.length - MAX_FILES_IN_SUMMARY} more files`);
    }
  }

  if (transcriptSummary) {
    lines.push('');
    lines.push('## Last Context');
    lines.push(transcriptSummary);
  }

  return lines.join('\n');
}

/** Main entry point for pre-compact hook. Saves session context before compression. */
async function main(): Promise<void> {
  try {
    debug('PreCompact hook starting');

    const input = await readHookInput();
    debug('PreCompact received input', {
      hook_event_name: input.hook_event_name,
    });

    const cwd = input.cwd || process.cwd();

    // Create checkpoint before compaction if there are uncommitted changes
    await createPreCompactCheckpoint(cwd);

    // Load state and analytics
    const state = await loadState(cwd);
    const analytics = await loadAnalytics();
    const modifiedFiles = getFilesModifiedThisSession(state);

    // Parse transcript for additional context
    let transcriptSummary = '';
    if (input.transcript_path && (await fileExistsAsync(input.transcript_path))) {
      const transcriptData = await parseTranscript(input.transcript_path);
      transcriptSummary = transcriptData.summary;
    }

    // Generate and save session summary
    const summary = generateSessionSummary(analytics, modifiedFiles, transcriptSummary);
    await saveSessionSummary(cwd, summary);

    // Save analytics backup before compact
    if (analytics) {
      const compactBackup = path.join(CACHE_DIR, 'pre-compact-backup.json');
      await fs.writeFile(compactBackup, JSON.stringify({
        ...analytics,
        compact_at: new Date().toISOString(),
        files_modified: modifiedFiles,
      }, null, 2));
      debug(`Saved pre-compact backup to ${compactBackup}`);
    }

    respond(createResponse());

  } catch (error: unknown) {
    logError('PreCompact main', error);
    respond(createResponse());
  }
}

main();
