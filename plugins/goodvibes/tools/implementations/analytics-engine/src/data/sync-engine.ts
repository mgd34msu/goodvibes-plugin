/**
 * sync-engine.ts — Orchestrates JSONL scanning, parsing, and GlobalDB insertion.
 *
 * The SyncEngine provides incremental, idempotent backfill of historical JSONL
 * session data into the global analytics database. It uses `JSONLScanner` to
 * discover files, `JSONLReader` to parse them from the last-processed byte
 * offset, and `GlobalDB` to store the results.
 *
 * Key properties:
 *  - Incremental: `sync_state` table tracks the last processed byte offset per
 *    file. Only new bytes are read on subsequent syncs.
 *  - Idempotent: Re-running sync on a fully-processed file is a no-op.
 *  - Transactional: API call records are bulk-inserted inside transactions.
 *  - Graceful: Missing or malformed JSONL lines are skipped with error tracking.
 */

import * as path from 'node:path';
import { JSONLReader, sessionIdFromPath } from './jsonl-reader.js';
import type { GlobalDB } from './global-db.js';
import { JSONLScanner } from './jsonl-scanner.js';
import type { GlobalSession, ApiCallRecord, SyncStateRecord } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for SyncEngine construction.
 */
export interface SyncEngineConfig {
  /** USD cost per 1,000 input tokens (for cost calculation). */
  costPer1kInputTokens: number;
  /** USD cost per 1,000 output tokens (for cost calculation). */
  costPer1kOutputTokens: number;
}

/**
 * Result of a single-file sync operation.
 */
export interface SyncFileResult {
  /** Absolute path to the JSONL file. */
  filePath: string;
  /** Session ID derived from the filename. */
  sessionId: string;
  /** Outcome of the sync attempt. */
  status: 'synced' | 'skipped' | 'error';
  /** Number of new JSONL records processed (0 for skipped/error). */
  newRecords: number;
  /** Number of bytes read from the file during this sync (0 for skipped/error). */
  bytesProcessed: number;
  /** Error description if status is 'error'. */
  errorMessage?: string;
}

/**
 * Aggregated result from a sync operation covering one or more project directories.
 */
export interface SyncProgress {
  /** Number of JSONL files that had new data and were processed. */
  sessionsProcessed: number;
  /** Total JSONL records (lines) processed across all files. */
  recordsProcessed: number;
  /** Total bytes processed across all files. */
  bytesProcessed: number;
  /** Number of files skipped (already up to date). */
  filesSkipped: number;
  /** Per-file error details. Empty when all syncs succeed. */
  errors: Array<{ filePath: string; sessionId: string; message: string }>;
  /** Number of project directories successfully scanned. */
  projectsScanned: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SyncEngine
// ─────────────────────────────────────────────────────────────────────────────

/** Two-hour threshold for marking sessions as completed. */
const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;

/**
 * SyncEngine — orchestrates JSONL file scanning and GlobalDB insertion.
 *
 * Typical usage:
 * ```ts
 * const engine = new SyncEngine(db, { costPer1kInputTokens: 0.003, costPer1kOutputTokens: 0.015 });
 * const progress = await engine.syncAllProjects();
 * ```
 */
export class SyncEngine {
  private readonly db: GlobalDB;
  private readonly reader: JSONLReader;
  private readonly scanner: JSONLScanner;

  /**
   * @param db     - Initialized GlobalDB instance for data persistence.
   * @param config - Pricing config for API call cost calculation.
   * @param scanner - Optional custom JSONLScanner (defaults to standard scanner).
   */
  constructor(db: GlobalDB, config: SyncEngineConfig, scanner?: JSONLScanner) {
    this.db = db;
    this.reader = new JSONLReader({
      cost_per_1k_input_tokens: config.costPer1kInputTokens,
      cost_per_1k_output_tokens: config.costPer1kOutputTokens,
    });
    this.scanner = scanner ?? new JSONLScanner();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Sync JSONL files for a specific project directory.
   *
   * Scans the given directory for `.jsonl` files and incrementally
   * processes any new content since the last sync.
   *
   * @param projectDir - Absolute path to a single project directory
   *   (e.g. `~/.claude/projects/<hash>`).
   * @returns Progress summary for the sync operation.
   */
  async syncCurrentProject(projectDir: string): Promise<SyncProgress> {
    const scanResult = this.scanner.scanProjectDir(projectDir);
    return this.processFiles(scanResult.files, scanResult.projectsScanned);
  }

  /**
   * Sync JSONL files across ALL Claude project directories.
   *
   * Iterates over all subdirectories of `~/.claude/projects/` and
   * incrementally processes any new JSONL content.
   *
   * @returns Progress summary aggregated across all projects.
   */
  async syncAllProjects(): Promise<SyncProgress> {
    const scanResult = this.scanner.scanAllProjects();
    return this.processFiles(scanResult.files, scanResult.projectsScanned);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private implementation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Process a list of JSONL files and return aggregated progress.
   */
  private async processFiles(
    files: Array<{ filePath: string; projectHash: string; sessionId: string; sizeBytes: number; isSubagent: boolean; parentSessionId: string | null }>,
    projectsScanned: number,
  ): Promise<SyncProgress> {
    const progress: SyncProgress = {
      sessionsProcessed: 0,
      recordsProcessed: 0,
      bytesProcessed: 0,
      filesSkipped: 0,
      errors: [],
      projectsScanned,
    };

    for (const fileInfo of files) {
      const result = await this.syncSingleFile(
        fileInfo.filePath,
        fileInfo.projectHash,
        fileInfo.isSubagent,
        fileInfo.parentSessionId,
      );

      switch (result.status) {
        case 'synced':
          progress.sessionsProcessed++;
          progress.recordsProcessed += result.newRecords;
          progress.bytesProcessed += result.bytesProcessed;
          break;
        case 'skipped':
          progress.filesSkipped++;
          break;
        case 'error':
          progress.errors.push({
            filePath: result.filePath,
            sessionId: result.sessionId,
            message: result.errorMessage ?? 'unknown error',
          });
          break;
      }
    }

    // Flush all pending writes to disk after processing all files
    this.db.saveToDisk();

    return progress;
  }

  /**
   * Incrementally sync a single JSONL file into GlobalDB.
   *
   * Algorithm:
   * 1. Look up prior sync state (last processed byte offset).
   * 2. Parse new records from the offset forward.
   * 3. If no new records and already processed, return 'skipped'.
   * 4. Extract API calls and session metadata from new records.
   * 5. Upsert the session record (accumulates totals).
   * 6. Batch-insert new API call records in a transaction.
   * 7. For subagent sessions, link to parent if known.
   * 8. Update sync_state with the new byte offset.
   */
  private async syncSingleFile(
    filePath: string,
    projectHash: string,
    isSubagent: boolean,
    parentSessionId: string | null,
  ): Promise<SyncFileResult> {
    const sessionId = sessionIdFromPath(filePath);

    try {
      // Step 1: Check incremental state
      const syncState: SyncStateRecord | null = this.db.getSyncState(filePath);
      const fromOffset = syncState?.last_offset ?? 0;

      // Step 2: Parse only the new portion of the file
      const parseResult = await this.reader.parseFile(filePath, fromOffset);

      const newRecordCount = parseResult.records.length;

      // Step 3: Skip if no new content (including empty first-sync to avoid ghost sessions)
      if (newRecordCount === 0) {
        return { filePath, sessionId, status: 'skipped', newRecords: 0, bytesProcessed: 0 };
      }

      // Compute bytes read during this incremental parse
      const bytesProcessed = parseResult.newOffset - fromOffset;

      // Step 4: Extract structured data
      const apiCalls: ApiCallRecord[] = this.reader.extractApiCalls(parseResult.records);
      const sessionInfo = this.reader.extractSessionInfo(parseResult.records);

      // Compute session-level totals from individual API call records
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

      // Determine session status: sessions with no activity in 2+ hours are completed
      const lastActivityAt = sessionInfo.lastActivityAt;
      const ageMs = Date.now() - new Date(lastActivityAt).getTime();
      const isCompleted = ageMs > TWO_HOURS_MS;

      // Step 5: Upsert the session record
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
        // Tool call counts not extractable from JSONL alone; zeroed for initial sync
        total_tool_calls: 0,
        total_native_tool_calls: 0,
        total_precision_tool_calls: 0,
        total_agent_spawns: 0,
        tags: [],
        status: isCompleted ? 'completed' : 'active',
        ...(isCompleted ? { ended_at: lastActivityAt } : {}),
      };

      this.db.upsertSession(session);

      // Step 6: Batch-insert API calls within a transaction
      if (apiCalls.length > 0) {
        this.db.batchInsertApiCalls(apiCalls);
      }

      // Step 7: For subagent sessions, register parent attribution via agent record
      if (isSubagent && parentSessionId) {
        // Record subagent linkage. Use the file modification basename as agent_id
        // since there is no dedicated agent UUID in the JSONL naming convention.
        const agentId = path.basename(filePath, '.jsonl');
        this.db.upsertAgent({
          session_id: parentSessionId,
          agent_id: agentId,
          agent_type: 'subagent',
          parent_session_id: parentSessionId,
          model: sessionInfo.model,
          spawned_at: sessionInfo.startedAt,
          completed_at: isCompleted ? lastActivityAt : undefined,
          total_tokens: totalInputTokens + totalOutputTokens,
          duration_ms: 0,
        });
      }

      // Step 8: Update sync state
      this.db.upsertSyncState({
        jsonl_path: filePath,
        session_id: sessionId,
        last_offset: parseResult.newOffset,
        last_synced_at: new Date().toISOString(),
      });

      return { filePath, sessionId, status: 'synced', newRecords: newRecordCount, bytesProcessed };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { filePath, sessionId, status: 'error', newRecords: 0, bytesProcessed: 0, errorMessage };
    }
  }
}
