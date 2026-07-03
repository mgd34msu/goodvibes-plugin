import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { SessionArchive, SessionMetrics, HistoricalComparison } from '../types.js';

const DEFAULT_MAX_SESSIONS = 10;

export class HistoricalStore {
  private sessionsDir: string;
  private maxSessions: number;

  constructor(goodvibesDir: string, maxSessions?: number) {
    this.sessionsDir = path.join(goodvibesDir, 'analytics', 'sessions');
    this.maxSessions = maxSessions ?? DEFAULT_MAX_SESSIONS;
    // NOTE: prune() is intentionally NOT called here to avoid constructor
    // side effects. Callers should invoke prune() explicitly when needed,
    // or it runs automatically after each save().
  }

  /** Ensure the sessions directory exists, creating it if necessary. */
  ensureDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Persist a session archive to disk using an atomic write (write to a temp
   * file in the same directory, then rename) to avoid partial writes.
   * Prunes old sessions after saving.
   */
  save(archive: SessionArchive): void {
    this.ensureDir();
    const filePath = path.join(this.sessionsDir, `${archive.session_id}.json`);
    const content = JSON.stringify(archive, null, 2);
    // Atomic write: temp file is in the same directory to avoid cross-filesystem rename.
    const tmpPath = path.join(this.sessionsDir, `.tmp-${archive.session_id}-${Date.now()}.json`);
    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, filePath);
    this.prune();
  }

  /**
   * Load a session archive by session ID.
   * Returns null if the file does not exist or cannot be parsed.
   */
  load(sessionId: string): SessionArchive | null {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    return this._readFile(filePath);
  }

  /**
   * List all stored session archives, sorted newest first.
   */
  list(): SessionArchive[] {
    if (!existsSync(this.sessionsDir)) {
      return [];
    }
    let files: string[];
    try {
      files = readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json') && !f.startsWith('.tmp-'));
    } catch {
      return [];
    }
    const archives: SessionArchive[] = [];
    for (const file of files) {
      const archive = this._readFile(path.join(this.sessionsDir, file));
      if (archive !== null) {
        archives.push(archive);
      }
    }
    // Sort newest first
    archives.sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
    return archives;
  }

  /**
   * Return up to n most recent session archives.
   */
  getRecent(n: number): SessionArchive[] {
    return this.list().slice(0, n);
  }

  /**
   * Remove oldest sessions beyond maxSessions.
   * Returns the number of sessions pruned.
   * Call this explicitly when needed (e.g. on session-start startup).
   */
  prune(): number {
    if (!existsSync(this.sessionsDir)) {
      return 0;
    }
    const archives = this.list();
    if (archives.length <= this.maxSessions) {
      return 0;
    }
    const toRemove = archives.slice(this.maxSessions);
    let pruned = 0;
    for (const archive of toRemove) {
      const filePath = path.join(this.sessionsDir, `${archive.session_id}.json`);
      try {
        unlinkSync(filePath);
        pruned++;
      } catch {
        // Best-effort removal
      }
    }
    return pruned;
  }

  /**
   * Compute the average metrics across a set of sessions.
   * Uses all stored sessions when sessions is not provided.
   */
  computeAverages(sessions?: SessionArchive[]): SessionMetrics {
    const src = sessions ?? this.list();
    if (src.length === 0) {
      return _emptyMetrics();
    }
    const avg = _emptyMetrics();
    const n = src.length;

    for (const s of src) {
      const m = s.metrics;
      // tokens
      avg.tokens.input += m.tokens.input;
      avg.tokens.output += m.tokens.output;
      avg.tokens.total += m.tokens.total;
      avg.tokens.saved += m.tokens.saved;
      avg.tokens.efficiency += m.tokens.efficiency;
      avg.tokens.api_input += m.tokens.api_input;
      avg.tokens.api_output += m.tokens.api_output;
      avg.tokens.cache_read += m.tokens.cache_read;
      avg.tokens.cache_write += m.tokens.cache_write;
      // cache
      avg.cache.hit_rate += m.cache.hit_rate;
      avg.cache.hits += m.cache.hits;
      avg.cache.misses += m.cache.misses;
      avg.cache.memory_peak_mb += m.cache.memory_peak_mb;
      avg.cache.evictions += m.cache.evictions;
      // cost
      avg.cost.input += m.cost.input;
      avg.cost.output += m.cost.output;
      avg.cost.total += m.cost.total;
      avg.cost.saved += m.cost.saved;
      // tools
      avg.tools.total += m.tools.total;
      avg.tools.success_rate += m.tools.success_rate;
      avg.tools.avg_duration_ms += m.tools.avg_duration_ms;
      avg.tools.total_duration_ms += m.tools.total_duration_ms;
      avg.tools.failures += m.tools.failures;
      // agents
      avg.agents.spawned += m.agents.spawned;
      avg.agents.max_concurrent += m.agents.max_concurrent;
      avg.agents.total_tokens += m.agents.total_tokens;
      avg.agents.active += m.agents.active;
      avg.agents.completed += m.agents.completed;
      // files
      avg.files.unique_read += m.files.unique_read;
      avg.files.modified += m.files.modified;
      avg.files.created += m.files.created;
      avg.files.conflicts += m.files.conflicts;
    }

    // Divide by count
    avg.tokens.input /= n;
    avg.tokens.output /= n;
    avg.tokens.total /= n;
    avg.tokens.saved /= n;
    avg.tokens.efficiency /= n;
    avg.tokens.api_input /= n;
    avg.tokens.api_output /= n;
    avg.tokens.cache_read /= n;
    avg.tokens.cache_write /= n;
    avg.cache.hit_rate /= n;
    avg.cache.hits /= n;
    avg.cache.misses /= n;
    avg.cache.memory_peak_mb /= n;
    avg.cache.evictions /= n;
    avg.cost.input /= n;
    avg.cost.output /= n;
    avg.cost.total /= n;
    avg.cost.saved /= n;
    avg.tools.total /= n;
    avg.tools.success_rate /= n;
    avg.tools.avg_duration_ms /= n;
    avg.tools.total_duration_ms /= n;
    avg.tools.failures /= n;
    avg.agents.spawned /= n;
    avg.agents.max_concurrent /= n;
    avg.agents.total_tokens /= n;
    avg.agents.active /= n;
    avg.agents.completed /= n;
    avg.files.unique_read /= n;
    avg.files.modified /= n;
    avg.files.created /= n;
    avg.files.conflicts /= n;

    return avg;
  }

  /**
   * Compare current session metrics against historical averages.
   * Returns deltas, direction indicators, and the sessions used for averaging.
   */
  compare(current: SessionMetrics, sessions?: SessionArchive[]): HistoricalComparison {
    const src = sessions ?? this.list();
    const average = this.computeAverages(src);
    const deltas: HistoricalComparison['deltas'] = {};

    // Flatten metrics to compute deltas
    const flatCurrent = _flattenMetrics(current);
    const flatAverage = _flattenMetrics(average);

    for (const key of Object.keys(flatCurrent)) {
      const cur = flatCurrent[key]!;
      const avg = flatAverage[key]!;
      if (avg === 0) {
        deltas[key] = { value: cur - avg, percentage: 0, direction: 'stable' };
        continue;
      }
      const pct = (cur - avg) / Math.abs(avg);
      const direction: 'up' | 'down' | 'stable' =
        Math.abs(pct) < 0.01 ? 'stable' : pct > 0 ? 'up' : 'down';
      deltas[key] = {
        value: cur - avg,
        percentage: pct * 100,
        direction,
      };
    }

    return { current, average, deltas, sessions: src };
  }

  /** Returns true when no sessions are stored. */
  isEmpty(): boolean {
    return this.list().length === 0;
  }

  /**
   * Add or update the tag on a stored session.
   * Writes directly to avoid triggering prune via save().
   * Returns false when the session does not exist.
   */
  tagSession(sessionId: string, tag: string): boolean {
    const archive = this.load(sessionId);
    if (!archive) {return false;}
    archive.tag = tag;
    // Keep tags array in sync with deprecated tag field
    archive.tags = archive.tags ? [...new Set([...archive.tags, tag])] : [tag];
    this._writeArchive(sessionId, archive);
    return true;
  }

  /**
   * Rename a stored session.
   * Writes directly to avoid triggering prune via save().
   * Returns false when the session does not exist.
   */
  renameSession(sessionId: string, name: string): boolean {
    const archive = this.load(sessionId);
    if (!archive) {return false;}
    archive.name = name;
    this._writeArchive(sessionId, archive);
    return true;
  }

  // --- Private helpers ---

  /**
   * Write an archive directly to disk without pruning.
   * Used by tagSession/renameSession to avoid unintended side effects.
   */
  private _writeArchive(sessionId: string, archive: SessionArchive): void {
    this.ensureDir();
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    const tmpPath = path.join(this.sessionsDir, `.tmp-${sessionId}-${Date.now()}.json`);
    writeFileSync(tmpPath, JSON.stringify(archive, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  }

  private _readFile(filePath: string): SessionArchive | null {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Minimal shape validation before casting
      if (!parsed || typeof parsed.session_id !== 'string' || typeof parsed.started_at !== 'string') {
        return null;
      }
      return parsed as SessionArchive;
    } catch {
      // Malformed JSON or file not found — skip gracefully
      return null;
    }
  }
}

function _emptyMetrics(): SessionMetrics {
  return {
    tokens: { input: 0, output: 0, total: 0, saved: 0, efficiency: 0, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
    cache: { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 },
    cost: { input: 0, output: 0, total: 0, saved: 0 },
    tools: {
      total: 0,
      success_rate: 0,
      avg_duration_ms: 0,
      total_duration_ms: 0,
      failures: 0,
      slowest: null,
    },
    agents: { spawned: 0, max_concurrent: 0, total_tokens: 0, active: 0, completed: 0 },
    files: { unique_read: 0, modified: 0, created: 0, conflicts: 0 },
  };
}

function _flattenMetrics(m: SessionMetrics): Record<string, number> {
  return {
    'tokens.input': m.tokens.input,
    'tokens.output': m.tokens.output,
    'tokens.total': m.tokens.total,
    'tokens.saved': m.tokens.saved,
    'tokens.efficiency': m.tokens.efficiency,
    'tokens.api_input': m.tokens.api_input,
    'tokens.api_output': m.tokens.api_output,
    'tokens.cache_read': m.tokens.cache_read,
    'tokens.cache_write': m.tokens.cache_write,
    'cache.hit_rate': m.cache.hit_rate,
    'cache.hits': m.cache.hits,
    'cache.misses': m.cache.misses,
    'cache.memory_peak_mb': m.cache.memory_peak_mb,
    'cache.evictions': m.cache.evictions,
    'cost.input': m.cost.input,
    'cost.output': m.cost.output,
    'cost.total': m.cost.total,
    'cost.saved': m.cost.saved,
    'tools.total': m.tools.total,
    'tools.success_rate': m.tools.success_rate,
    'tools.avg_duration_ms': m.tools.avg_duration_ms,
    'tools.total_duration_ms': m.tools.total_duration_ms,
    'tools.failures': m.tools.failures,
    'agents.spawned': m.agents.spawned,
    'agents.max_concurrent': m.agents.max_concurrent,
    'agents.total_tokens': m.agents.total_tokens,
    'agents.active': m.agents.active,
    'agents.completed': m.agents.completed,
    'files.unique_read': m.files.unique_read,
    'files.modified': m.files.modified,
    'files.created': m.files.created,
    'files.conflicts': m.files.conflicts,
  };
}
