/**
 * SessionReader - Reads precision-engine KVState session files.
 *
 * Session files live at .goodvibes/state/session_{id}.json and follow
 * the SessionStateData shape: { id, started_at, ...arbitraryKVPairs }.
 *
 * This reader is synchronous (readFileSync) because session files are small
 * and this is used by analytics/TUI code, not hot request paths.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

/** Shape of a session file on disk. */
export interface SessionData {
  id: string;
  started_at: string;
  values: Record<string, unknown>;
}

export class SessionReader {
  private readonly stateDir: string;

  constructor(goodvibesDir: string) {
    this.stateDir = path.join(goodvibesDir, 'state');
  }

  /**
   * Find the most recent session file by filesystem mtime.
   * Returns null if the state directory does not exist or is empty.
   */
  getCurrentSessionFile(): string | null {
    const files = this.listSessionFiles();
    if (files.length === 0) return null;

    // Sort descending by mtime — most recent first.
    const sorted = files
      .map((f) => {
        try {
          const fullPath = path.join(this.stateDir, f);
          const mtime = statSync(fullPath).mtimeMs;
          return { file: f, mtime };
        } catch {
          return null;
        }
      })
      .filter((x): x is { file: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime);

    return sorted.length > 0 ? path.join(this.stateDir, sorted[0].file) : null;
  }

  /**
   * Read and parse a session file by session ID.
   * Returns null if the file does not exist or cannot be parsed.
   */
  readSession(sessionId: string): SessionData | null {
    const filePath = path.join(this.stateDir, `session_${sessionId}.json`);
    return this.parseSessionFile(filePath);
  }

  /**
   * Read and parse the most recent (current) session file.
   * Returns null if no session files exist.
   */
  readCurrentSession(): SessionData | null {
    const filePath = this.getCurrentSessionFile();
    if (!filePath) return null;
    return this.parseSessionFile(filePath);
  }

  /**
   * List all available session IDs derived from filenames in the state directory.
   * Returns an empty array if the directory does not exist.
   */
  listSessionIds(): string[] {
    return this.listSessionFiles().map((f) => {
      const match = f.match(/^session_([0-9a-f]{8})\.json$/);
      return match ? match[1] : null;
    }).filter((id): id is string => id !== null);
  }

  /**
   * Retrieve specific KV values from a session file by key name.
   * Missing keys are present in the result with value `undefined`.
   */
  getValues(sessionId: string, keys: string[]): Record<string, unknown> {
    const session = this.readSession(sessionId);
    const result: Record<string, unknown> = {};
    if (!session) {
      for (const key of keys) result[key] = undefined;
      return result;
    }
    for (const key of keys) {
      result[key] = session.values[key];
    }
    return result;
  }

  /**
   * Read the auto-populated session counters from a session file.
   * Uses the current session when no sessionId is provided.
   */
  getSessionCounters(sessionId?: string): {
    tokens_used: number;
    files_modified: string[];
    commands_run: number;
    agents_spawned: number;
  } {
    const session = sessionId
      ? this.readSession(sessionId)
      : this.readCurrentSession();

    const values = session?.values ?? {};

    return {
      tokens_used: toNumber(values['session.tokens_used']),
      files_modified: toStringArray(values['session.files_modified']),
      commands_run: toNumber(values['session.commands_run']),
      agents_spawned: toNumber(values['session.agents_spawned']),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * List raw session filenames from the state directory.
   */
  private listSessionFiles(): string[] {
    try {
      return readdirSync(this.stateDir).filter((f) =>
        /^session_[0-9a-f]{8}\.json$/.test(f)
      );
    } catch {
      return [];
    }
  }

  /**
   * Parse a session JSON file into SessionData.
   * The raw file shape is { id, started_at, ...kvPairs }.
   * We normalise it by pulling id/started_at out and placing the rest in values.
   */
  private parseSessionFile(filePath: string): SessionData | null {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const id = typeof parsed['id'] === 'string' ? parsed['id'] : '';
      const started_at =
        typeof parsed['started_at'] === 'string' ? parsed['started_at'] : '';

      // Everything except the two reserved fields goes into values.
      const values: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (key !== 'id' && key !== 'started_at') {
          values[key] = val;
        }
      }

      return { id, started_at, values };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Coercion utilities
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}
