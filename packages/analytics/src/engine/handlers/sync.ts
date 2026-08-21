/**
 * analytics_sync handler, sync JSONL session data into the global analytics database.
 *
 * Delegates to SyncEngine which orchestrates JSONL scanning, incremental
 * parsing, and GlobalDB insertion. Supports syncing the current project only
 * or all projects discovered under ~/.claude/projects/.
 */

import type { Aggregator } from '../daemon/aggregator.js';
import type { AnalyticsSyncInput } from '../schemas/tools.js';
import { initializeGlobalDb } from '../data/db-init.js';
import { SqlJsUnavailableError } from '../data/global-db.js';
import { SyncEngine } from '../data/sync-engine.js';
import { JSONLScanner } from '../data/jsonl-scanner.js';
import type { SyncProgress } from '../data/sync-engine.js';
import { type HandlerResponse, text } from './types.js';
import { nativeDepMessage } from '@goodvibes/core/envelope';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Handler function signature for analytics_sync. */
export type SyncHandler = (
  aggregator: Aggregator,
  input: AnalyticsSyncInput,
  goodvibesDir: string,
) => Promise<HandlerResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_sync` MCP tool.
 *
 * Initialises GlobalDB and SyncEngine, then delegates to the engine
 * for incremental, idempotent JSONL backfill.
 *
 * @param aggregator - Live Aggregator instance (provides session_id and config).
 * @param input      - Validated AnalyticsSyncInput.
 * @returns MCP response describing sync progress.
 */
export const handleSync: SyncHandler = async (
  aggregator: Aggregator,
  input: AnalyticsSyncInput,
  _goodvibesDir: string,
): Promise<HandlerResponse> => {
  try {
    const db = await initializeGlobalDb();
    const config = aggregator.getConfig();

    const engine = new SyncEngine(db, {
      costPer1kInputTokens: config.cost_per_1k_input_tokens,
      costPer1kOutputTokens: config.cost_per_1k_output_tokens,
    });

    let progress: SyncProgress;

    if (input.scope === 'current') {
      // Sync only the current session's project directory
      const state = aggregator.getState();
      const currentSessionId = state.session_id;

      if (!currentSessionId) {
        return text(
          'No active session detected. Cannot determine current project directory.',
        );
      }

      const scanner = new JSONLScanner();
      const projectDir = scanner.findProjectDirForSession(currentSessionId);

      if (!projectDir) {
        return text(
          `No JSONL directory found for session ${currentSessionId}.\n` +
          'Use scope="all" to scan all projects.',
        );
      }

      progress = await engine.syncCurrentProject(projectDir);
    } else {
      // scope === 'all': scan all project directories
      progress = await engine.syncAllProjects();
    }

    return text(buildSyncReport(input.scope, progress));
  } catch (err) {
    // Sync writes into the SQLite store; when sql.js is not installed yet,
    // return the honest setup pointer instead of a raw "module not found".
    if (err instanceof SqlJsUnavailableError) {
      return text(nativeDepMessage('analytics sync (cross-project history store)'));
    }
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_sync error: ${message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Report formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a human-readable sync progress report.
 */
function buildSyncReport(
  scope: AnalyticsSyncInput['scope'],
  progress: SyncProgress,
): string {
  const lines: string[] = [
    '=== Analytics Sync Complete ===',
    `Scope:              ${scope === 'all' ? 'all projects' : 'current project'}`,
    `Projects scanned:   ${progress.projectsScanned}`,
    `Sessions processed: ${progress.sessionsProcessed}`,
    `Records processed:  ${progress.recordsProcessed}`,
    `Files skipped:      ${progress.filesSkipped} (already up to date)`,
    `Error count:        ${progress.errors.length}`,
  ];

  if (progress.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const err of progress.errors) {
      lines.push(`  ${err.sessionId}: ${err.message}`);
    }
  }

  return lines.join('\n');
}
