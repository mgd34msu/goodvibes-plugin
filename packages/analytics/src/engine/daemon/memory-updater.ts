/**
 * MemoryUpdater — Writes analytics-derived insights back to .goodvibes/memory/.
 *
 * Analyses a DashboardState snapshot and produces:
 *   - PatternUpdate[] — new or updated entries for patterns.json
 *   - PreferenceUpdate[] — usage-driven updates for preferences.json
 *
 * All file operations are synchronous (called during daemon shutdown where
 * async teardown is unreliable). Writes are atomic: content is written to a
 * sibling .tmp file and then renamed to the target path within the same
 * directory, avoiding partial-write corruption.
 *
 * Merge semantics: existing entries are preserved; new entries are appended;
 * entries with the same id are replaced if the new data is more specific.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DashboardState } from '../types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A pattern entry to merge into patterns.json. */
export interface PatternUpdate {
  /** Unique, stable identifier for this pattern. */
  id: string;
  /** Short human-readable name. */
  name: string;
  /** What this pattern does and why it matters. */
  description: string;
  /** Conditions under which this pattern should be applied. */
  when_to_use: string;
  /** Representative file paths that demonstrate the pattern. */
  example_files: string[];
  /** Search keywords for discovery. */
  keywords: string[];
}

/** A preference entry to merge into preferences.json. */
export interface PreferenceUpdate {
  /** Dot-separated preference key (e.g. 'precision.default_extract_mode'). */
  key: string;
  /** Preferred value derived from observed usage. */
  value: unknown;
  /** Human-readable explanation for the preference. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Detection thresholds
// ---------------------------------------------------------------------------

/** A file accessed this many times or more triggers an outline-mode suggestion. */
const HIGH_READ_COUNT = 5;

/** Commands averaging longer than this (ms) are flagged for optimisation. */
const SLOW_COMMAND_MS = 20_000;

/** Cache hit rate at or above this fraction is recorded as a positive pattern. */
const GOOD_CACHE_RATE = 0.7;

/** Conflict count at or above this triggers a coordination suggestion. */
const HIGH_CONFLICT_COUNT = 5;

// ---------------------------------------------------------------------------
// MemoryUpdater
// ---------------------------------------------------------------------------

/**
 * Analyses a DashboardState and writes insights back to .goodvibes/memory/.
 *
 * @example
 * const updater = new MemoryUpdater('/path/to/.goodvibes/memory');
 * const updates = updater.analyze(state);
 * updater.apply(updates);
 */
export class MemoryUpdater {
  private readonly memoryDir: string;

  /**
   * @param memoryDir - Absolute path to the .goodvibes/memory/ directory.
   */
  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Analyse a dashboard state snapshot and produce pattern/preference updates.
   *
   * Does NOT write anything to disk — call apply() to persist the results.
   *
   * @param state - Current DashboardState from the analytics daemon.
   * @returns Object with `patterns` and `preferences` arrays.
   */
  analyze(state: DashboardState): { patterns: PatternUpdate[]; preferences: PreferenceUpdate[] } {
    const patterns: PatternUpdate[] = [];
    const preferences: PreferenceUpdate[] = [];

    // --- Pattern: files read many times → suggest outline mode ---
    const hotFiles = state.file_hotspots.filter((h) => h.reads >= HIGH_READ_COUNT);
    if (hotFiles.length > 0) {
      patterns.push({
        id: 'pat_analytics_outline_mode',
        name: 'FrequentlyReadFilesOutlineMode',
        description:
          `${hotFiles.length} file(s) were read ${HIGH_READ_COUNT}+ times this session. ` +
          'Use extract: outline or extract: symbols for repeated reads to save tokens.',
        when_to_use:
          'When reading the same file more than 5 times in a session to understand its structure.',
        example_files: hotFiles.slice(0, 3).map((h) => h.path),
        keywords: ['outline', 'symbols', 'frequent-reads', 'token-efficiency', 'precision_read'],
      });

      preferences.push({
        key: 'precision.default_extract_mode',
        value: 'outline',
        reason:
          `${hotFiles.length} file(s) were read ${HIGH_READ_COUNT}+ times. Defaulting repeated ` +
          'reads to outline mode reduces token consumption.',
      });
    }

    // --- Pattern: slow commands → flag for optimisation ---
    // SessionMetrics exposes per-tool timing under `tools` (there is no separate
    // `commands` field); tool timing is the command-latency signal here.
    const commands = state.metrics.tools;
    if (commands.avg_duration_ms > SLOW_COMMAND_MS) {
      patterns.push({
        id: 'pat_analytics_slow_commands',
        name: 'SlowCommandOptimisation',
        description:
          `Commands averaged ${Math.round(commands.avg_duration_ms / 1000)}s this session. ` +
          'Consider caching results, parallelising steps, or using incremental builds.',
        when_to_use: 'When command execution is a bottleneck in the development loop.',
        example_files: [],
        keywords: ['slow', 'commands', 'performance', 'build', 'optimisation'],
      });
    }

    // --- Pattern: high cache hit rate → positive reinforcement ---
    const { cache } = state.metrics;
    if (cache.hit_rate >= GOOD_CACHE_RATE) {
      patterns.push({
        id: 'pat_analytics_cache_efficiency',
        name: 'HighCacheHitRate',
        description:
          `Cache hit rate was ${Math.round(cache.hit_rate * 100)}% this session. ` +
          'Current precision_read usage patterns are token-efficient — maintain them.',
        when_to_use:
          'When deciding whether to change file-reading patterns; current approach is working well.',
        example_files: [],
        keywords: ['cache', 'hit-rate', 'efficiency', 'precision_read', 'positive'],
      });

      preferences.push({
        key: 'cache.strategy',
        value: 'with_content',
        reason:
          `High cache hit rate (${Math.round(cache.hit_rate * 100)}%) observed. ` +
          'Keep content caching enabled.',
      });
    }

    // --- Pattern: high conflict count → coordination strategy ---
    const { files } = state.metrics;
    if (files.conflicts >= HIGH_CONFLICT_COUNT) {
      patterns.push({
        id: 'pat_analytics_conflict_coordination',
        name: 'HighConflictCoordination',
        description:
          `${files.conflicts} file conflicts detected this session. ` +
          'Use agent scoping (per-feature subdirectories) to reduce concurrent write contention.',
        when_to_use:
          'When multiple agents are writing to overlapping file paths in the same session.',
        example_files: [],
        keywords: ['conflicts', 'coordination', 'agent', 'concurrency', 'scoping'],
      });
    }

    return { patterns, preferences };
  }

  /**
   * Persist the provided updates to .goodvibes/memory/patterns.json and
   * .goodvibes/memory/preferences.json.
   *
   * Merge semantics:
   *   - Existing entries with the same id/key are replaced.
   *   - New entries are appended.
   *   - Entries absent from the update are preserved unchanged.
   *
   * Writes are atomic: content goes to a .tmp sibling first, then renamed.
   *
   * @param updates - Output from analyze().
   */
  apply(updates: { patterns: PatternUpdate[]; preferences: PreferenceUpdate[] }): void {
    // Ensure memory directory exists.
    try {
      mkdirSync(this.memoryDir, { recursive: true });
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }

    if (updates.patterns.length > 0) {
      this.mergeAndWrite(
        join(this.memoryDir, 'patterns.json'),
        updates.patterns as Array<PatternUpdate & Record<string, unknown>>,
        'id',
      );
    }

    if (updates.preferences.length > 0) {
      this.mergeAndWrite(
        join(this.memoryDir, 'preferences.json'),
        updates.preferences as Array<PreferenceUpdate & Record<string, unknown>>,
        'key',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Read an existing JSON array file, merge new entries by key, and atomically
   * write the result back.
   *
   * @param filePath  - Absolute path to the target .json file.
   * @param updates   - Array of items to merge in.
   * @param mergeKey  - Property name used as the unique identifier for merging.
   */
  private mergeAndWrite<T extends Record<string, unknown>>(
    filePath: string,
    updates: T[],
    mergeKey: keyof T & string,
  ): void {
    // Read existing data.
    const existing = this.readJsonArray<T>(filePath);

    // Build a map of existing entries for O(1) lookup.
    const byKey = new Map<unknown, T>();
    for (const entry of existing) {
      byKey.set(entry[mergeKey], entry);
    }

    // Merge: updates replace existing entries with the same key.
    for (const update of updates) {
      byKey.set(update[mergeKey], { ...byKey.get(update[mergeKey]), ...update });
    }

    // Preserve insertion order: existing entries first (in original order),
    // then brand-new entries not previously in the file.
    const merged: T[] = [];

    for (const entry of existing) {
      const key = entry[mergeKey];
      const updated = byKey.get(key);
      if (updated !== undefined) {
        merged.push(updated);
      }
    }

    // Append brand-new entries (those not already in `existing`).
    const existingKeys = new Set(existing.map((e) => e[mergeKey]));
    for (const update of updates) {
      if (!existingKeys.has(update[mergeKey])) {
        merged.push(update);
      }
    }

    // Atomic write.
    this.atomicWriteJson(filePath, merged);
  }

  /**
   * Read a JSON array file. Returns an empty array on any read/parse error.
   */
  private readJsonArray<T>(filePath: string): T[] {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Atomically write a JSON-serialisable value to filePath.
   *
   * Writes to filePath + '.tmp' within the same directory, then renames.
   * rename() on the same filesystem is atomic on POSIX systems.
   *
   * @throws If the write or rename fails.
   */
  private atomicWriteJson(filePath: string, data: unknown): void {
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    const content = JSON.stringify(data, null, 2) + '\n';
    try {
      writeFileSync(tmpPath, content, { encoding: 'utf-8' });
      renameSync(tmpPath, filePath);
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
      throw err;
    }
  }
}
