/**
 * analytics_sync handler — sync JSONL session data into the global analytics database.
 *
 * Scans Claude JSONL project files and upserts session records, API call records,
 * and tool summaries into the GlobalDB. Supports syncing the current project only
 * or all projects discovered under ~/.claude/projects/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { Aggregator } from '../daemon/aggregator.js';
import type { AnalyticsSyncInput } from '../schemas/tools.js';
import { initializeGlobalDb } from '../data/db-init.js';
import { JSONLReader, resolveProjectsBaseDir, sessionIdFromPath } from '../data/jsonl-reader.js';
import type { GlobalDB } from '../data/global-db.js';
import type { GlobalSession, ApiCallRecord, SyncStateRecord } from '../types.js';
import { type HandlerResponse, text } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Handler function signature for analytics_sync. */
export type SyncHandler = (
  aggregator: Aggregator,
  input: AnalyticsSyncInput,
) => Promise<HandlerResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_sync` MCP tool.
 *
 * Scans JSONL files and syncs session data into the global SQLite database.
 * Uses offset-based incremental sync to avoid re-processing already-indexed data.
 *
 * @param aggregator - Live Aggregator instance (provides session_id and config).
 * @param input      - Validated AnalyticsSyncInput.
 * @returns MCP response describing sync results.
 */
export const handleSync: SyncHandler = async (
  aggregator: Aggregator,
  input: AnalyticsSyncInput,
): Promise<HandlerResponse> => {
  try {
    const db = await initializeGlobalDb();

    // Access config via the public getConfig() method on the Aggregator.
    const config = aggregator.getConfig();

    const reader = new JSONLReader({
      cost_per_1k_input_tokens: config.cost_per_1k_input_tokens,
      cost_per_1k_output_tokens: config.cost_per_1k_output_tokens,
    });

    const projectsBaseDir = resolveProjectsBaseDir();
    let projectDirs: string[];

    if (input.scope === 'current') {
      // Sync only the current session's project directory
      const state = aggregator.getState();
      const currentSessionId = state.session_id;
      if (!currentSessionId) {
        return text(
          'No active session detected. Cannot determine current project directory.',
        );
      }
      const dir = findProjectDirForSession(projectsBaseDir, currentSessionId);
      if (!dir) {
        return text(
          `No JSONL directory found for session ${currentSessionId} under ${projectsBaseDir}.\n` +
          'Use scope="all" to scan all projects.',
        );
      }
      projectDirs = [dir];
    } else {
      // scope === 'all': scan all project subdirectories
      projectDirs = listProjectDirs(projectsBaseDir);
      if (projectDirs.length === 0) {
        return text(`No project directories found under ${projectsBaseDir}.`);
      }
    }

    const results = await syncProjectDirs(db, reader, projectDirs);

    return text(buildSyncReport(input.scope, projectDirs.length, results));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_sync error: ${message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Directory scanning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand tilde prefix and list all project subdirectories.
 */
function listProjectDirs(baseDir: string): string[] {
  try {
    const expanded = baseDir.startsWith('~')
      ? path.join(homedir(), baseDir.slice(1))
      : baseDir;
    if (!fs.existsSync(expanded)) return [];
    const entries = fs.readdirSync(expanded, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(expanded, e.name));
  } catch {
    return [];
  }
}

/**
 * Find the project directory containing JSONL files for the given session ID.
 */
function findProjectDirForSession(
  baseDir: string,
  sessionId: string,
): string | null {
  const dirs = listProjectDirs(baseDir);
  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir);
      if (files.some((f) => f === `${sessionId}.jsonl` || f.startsWith(sessionId))) {
        return dir;
      }
    } catch {
      // skip unreadable directories
    }
  }
  return null;
}

/**
 * Discover all JSONL files in a project directory.
 */
function listJsonlFiles(projectDir: string): string[] {
  try {
    const entries = fs.readdirSync(projectDir);
    return entries
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(projectDir, f));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync logic
// ─────────────────────────────────────────────────────────────────────────────

interface SyncFileResult {
  filePath: string;
  sessionId: string;
  status: 'synced' | 'skipped' | 'error';
  newRecords: number;
  errorMessage?: string;
}

interface SyncResults {
  files: SyncFileResult[];
  totalSynced: number;
  totalSkipped: number;
  totalErrors: number;
  totalNewRecords: number;
}

/**
 * Sync all JSONL files across the given project directories.
 */
async function syncProjectDirs(
  db: GlobalDB,
  reader: JSONLReader,
  projectDirs: string[],
): Promise<SyncResults> {
  const results: SyncResults = {
    files: [],
    totalSynced: 0,
    totalSkipped: 0,
    totalErrors: 0,
    totalNewRecords: 0,
  };

  for (const dir of projectDirs) {
    const jsonlFiles = listJsonlFiles(dir);
    const projectHash = path.basename(dir);

    for (const filePath of jsonlFiles) {
      const fileResult = await syncSingleFile(db, reader, filePath, projectHash);
      results.files.push(fileResult);

      switch (fileResult.status) {
        case 'synced':
          results.totalSynced++;
          results.totalNewRecords += fileResult.newRecords;
          break;
        case 'skipped':
          results.totalSkipped++;
          break;
        case 'error':
          results.totalErrors++;
          break;
      }
    }
  }

  // Persist DB after all writes
  db.saveToDisk();

  return results;
}

/**
 * Sync a single JSONL file into the database using incremental byte-offset tracking.
 */
async function syncSingleFile(
  db: GlobalDB,
  reader: JSONLReader,
  filePath: string,
  projectHash: string,
): Promise<SyncFileResult> {
  const sessionId = sessionIdFromPath(filePath);

  try {
    // Check existing sync state for incremental processing
    const syncState: SyncStateRecord | null = db.getSyncState(filePath);
    const fromOffset = syncState?.last_offset ?? 0;

    // Parse new records from offset
    const parseResult = await reader.parseFile(filePath, fromOffset);

    const newRecordCount = parseResult.records.length;
    // If no new records and we've already processed this file, skip it
    if (newRecordCount === 0 && fromOffset > 0) {
      return { filePath, sessionId, status: 'skipped', newRecords: 0 };
    }

    // Extract structured data from parsed records
    const apiCalls: ApiCallRecord[] = reader.extractApiCalls(parseResult.records);
    const sessionInfo = reader.extractSessionInfo(parseResult.records);

    // Compute token and cost totals from API calls
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let totalCostUsd = 0;
    for (const call of apiCalls) {
      totalInputTokens += call.input_tokens;
      totalOutputTokens += call.output_tokens;
      totalCacheReadTokens += call.cache_read_tokens;
      totalCacheWriteTokens += call.cache_write_tokens;
      totalCostUsd += call.cost_usd;
    }

    // Determine session status based on last activity age
    const lastActivityAt = sessionInfo.lastActivityAt;
    const ageMs = Date.now() - new Date(lastActivityAt).getTime();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;
    const isCompleted = ageMs > TWO_HOURS_MS;

    // Upsert the session record into GlobalDB
    const session: Partial<GlobalSession> & { session_id: string } = {
      session_id: sessionId,
      project_hash: projectHash,
      started_at: sessionInfo.startedAt,
      model: sessionInfo.model,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cache_read_tokens: totalCacheReadTokens,
      total_cache_write_tokens: totalCacheWriteTokens,
      total_cost_usd: totalCostUsd,
      total_api_calls: apiCalls.length,
      total_tool_calls: 0,          // Not computable from sessionInfo alone
      total_native_tool_calls: 0,   // Not computable without tool breakdown
      total_precision_tool_calls: 0,
      total_agent_spawns: 0,
      tags: [],
      status: isCompleted ? 'completed' : 'active',
      ...(isCompleted ? { ended_at: lastActivityAt } : {}),
    };

    db.upsertSession(session);

    // Batch-insert API call records for cross-session cost queries
    if (apiCalls.length > 0) {
      db.batchInsertApiCalls(apiCalls);
    }

    // Update sync state with new byte offset
    db.upsertSyncState({
      jsonl_path: filePath,
      session_id: sessionId,
      last_offset: parseResult.newOffset,
      last_synced_at: new Date().toISOString(),
    });

    return { filePath, sessionId, status: 'synced', newRecords: newRecordCount };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { filePath, sessionId, status: 'error', newRecords: 0, errorMessage };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a human-readable sync report.
 */
function buildSyncReport(
  scope: AnalyticsSyncInput['scope'],
  projectCount: number,
  results: SyncResults,
): string {
  const lines: string[] = [
    '=== Analytics Sync Complete ===',
    `Scope:          ${scope === 'all' ? 'all projects' : 'current project'}`,
    `Projects:       ${projectCount}`,
    `Files synced:   ${results.totalSynced}`,
    `Files skipped:  ${results.totalSkipped} (already up to date)`,
    `Errors:         ${results.totalErrors}`,
    `New records:    ${results.totalNewRecords}`,
  ];

  if (results.totalErrors > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const f of results.files.filter((r) => r.status === 'error')) {
      lines.push(`  ${path.basename(f.filePath)}: ${f.errorMessage ?? 'unknown error'}`);
    }
  }

  if (results.totalSynced > 0 && results.files.length <= 20) {
    lines.push('');
    lines.push('Synced files:');
    for (const f of results.files.filter((r) => r.status === 'synced')) {
      lines.push(`  ${path.basename(f.filePath)} — ${f.newRecords} new records`);
    }
  } else if (results.totalSynced > 20) {
    lines.push(
      `\n(${results.totalSynced} files synced — use scope="current" for per-file details)`,
    );
  }

  return lines.join('\n');
}
