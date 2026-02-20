/**
 * SessionArchiver — Session archive orchestrator.
 *
 * Thin wrapper around HistoricalStore that coordinates session archival,
 * historical comparison, tagging, and renaming. All persistence is delegated
 * to HistoricalStore which handles atomic writes.
 */

import { HistoricalStore } from '../data/historical-store.js';
import type {
  SessionMetrics,
  Anomaly,
  HistoricalComparison,
  SessionArchive,
} from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// SessionArchiver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates session archival using HistoricalStore.
 *
 * @example
 * ```ts
 * const archiver = new SessionArchiver('/path/to/.goodvibes');
 * archiver.archive('session-abc', metrics, anomalies);
 * const comparison = archiver.getComparison(currentMetrics);
 * ```
 */
export class SessionArchiver {
  private readonly store: HistoricalStore;

  /**
   * @param goodvibesDir - Absolute path to the .goodvibes directory.
   */
  constructor(goodvibesDir: string) {
    this.store = new HistoricalStore(goodvibesDir);
    this.store.ensureDir();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Archive a completed session to disk.
   *
   * Constructs a `SessionArchive` from the provided metrics and delegates
   * persistence to HistoricalStore. After saving, the store is pruned to
   * stay within the configured retention limit.
   *
   * @param sessionId - Unique identifier of the session to archive.
   * @param metrics   - Final aggregated session metrics.
   * @param anomalies - Anomalies detected during the session.
   * @param startedAt - ISO 8601 timestamp when the session started. Defaults
   *                    to the current time when the actual start is unavailable.
   * @throws {Error} If the archive write fails.
   */
  archive(sessionId: string, metrics: SessionMetrics, anomalies: Anomaly[], startedAt?: string): void {
    const now = new Date().toISOString();
    const durationMinutes = this.estimateDurationMinutes(metrics);

    const archive: SessionArchive = {
      session_id: sessionId,
      tags: [],
      project_hash: '',
      started_at: startedAt ?? now,
      ended_at: now,
      duration_minutes: durationMinutes,
      metrics,
      tools_breakdown: {},
      project_snapshot: {
        total_files: 0,
        total_estimated_tokens: 0,
      },
    };

    // Tag with the most severe anomaly type for quick session categorization
    if (anomalies.length > 0) {
      const anomalyTag = anomalies[0]?.type;
      if (anomalyTag) {
        archive.tags = [anomalyTag];
        // Keep deprecated field in sync for backward compatibility
        archive.tag = anomalyTag;
      }
    }

    this.store.save(archive);
    this.store.prune();
  }

  /**
   * Get a historical comparison for the current session against past sessions.
   *
   * Returns `null` if there are no archived sessions to compare against.
   *
   * @param current - Current session metrics to compare.
   * @returns A HistoricalComparison, or null if no history is available.
   */
  getComparison(current: SessionMetrics): HistoricalComparison | null {
    if (this.store.isEmpty()) return null;
    return this.store.compare(current);
  }

  /**
   * Tag a previously archived session.
   *
   * Tags are short user-defined labels (e.g. 'feature', 'bugfix') that can
   * be used to categorize sessions in reports.
   *
   * @param sessionId - Session to tag.
   * @param tags      - Array of tag strings; the first element is applied.
   * @throws {Error} If the session does not exist in the archive.
   */
  tagSession(sessionId: string, tags: string[]): void {
    if (tags.length === 0) return;
    const [firstTag] = tags;
    if (!firstTag) return;
    const success = this.store.tagSession(sessionId, firstTag);
    if (!success) {
      throw new Error(
        `SessionArchiver.tagSession: session '${sessionId}' not found in archive`,
      );
    }
  }

  /**
   * Rename a previously archived session.
   *
   * Names provide a human-readable label for the session (e.g. 'Fix auth bug').
   *
   * @param sessionId - Session to rename.
   * @param name      - New human-readable name for the session.
   * @throws {Error} If the session does not exist in the archive.
   */
  renameSession(sessionId: string, name: string): void {
    const success = this.store.renameSession(sessionId, name);
    if (!success) {
      throw new Error(
        `SessionArchiver.renameSession: session '${sessionId}' not found in archive`,
      );
    }
  }

  /**
   * List all archived session IDs, ordered from oldest to newest.
   *
   * @returns Array of session ID strings.
   */
  listArchived(): string[] {
    return this.store.list().map((a) => a.session_id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Estimate session duration in minutes from the commands total_duration_ms.
   *
   * Falls back to 0 when command timing is unavailable.
   *
   * @param metrics - Session metrics to derive duration from.
   */
  private estimateDurationMinutes(metrics: SessionMetrics): number {
    const totalMs = metrics.commands.total_duration_ms;
    return totalMs > 0 ? Math.round(totalMs / 60_000) : 0;
  }
}
