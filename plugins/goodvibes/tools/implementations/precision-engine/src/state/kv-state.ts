/**
 * KVState - Session-scoped key-value state store.
 *
 * Persists working state in separate session files under .goodvibes/state/.
 * Keeps goodvibes.json clean — configuration only, no session data.
 *
 * Key design decisions:
 * - Singleton per process lifetime (session ID generated once)
 * - Atomic writes: write to temp file, then rename (crash-safe)
 * - Lazy load: disk read deferred until first operation
 * - resetInstance() provided for test isolation
 */

import { readFile, writeFile, mkdir, rename, readdir, unlink, stat } from 'fs/promises';
import { randomBytes } from 'crypto';
import * as path from 'path';

/** Shape of data stored in a session file. */
export interface SessionStateData {
  /** 8-character hex session identifier. */
  id: string;
  /** ISO timestamp of session creation. */
  started_at: string;
  /** Flexible KV store — any JSON-serializable values. */
  [key: string]: unknown;
}

/**
 * KVState manages per-session key-value state persisted to disk.
 *
 * Files are stored at: <cwd>/.goodvibes/state/session_{id}.json
 * Operations are fully async; internal data is kept in-memory between calls.
 *
 * Usage:
 *   const state = KVState.getInstance();
 *   await state.set({ 'session.task': 'implement-auth' });
 *   const result = await state.get(['session.task']);
 */
export class KVState {
  /** Singleton instance — null until first call to getInstance(). */
  private static instance: KVState | null = null;

  /** 8-character hex session ID, generated once per process. */
  private readonly sessionId: string;

  /** Absolute path to this session's JSON file. */
  private readonly sessionFile: string;

  /** Absolute path to the .goodvibes/state/ directory. */
  private readonly stateDir: string;

  /** In-memory snapshot of the persisted state object. */
  private data: SessionStateData;

  /** Whether the data has been loaded from disk at least once. */
  private loaded = false;

  private constructor() {
    this.sessionId = randomBytes(4).toString('hex');
    this.stateDir = path.join(process.cwd(), '.goodvibes', 'state');
    this.sessionFile = path.join(this.stateDir, `session_${this.sessionId}.json`);
    this.data = {
      id: this.sessionId,
      started_at: new Date().toISOString(),
    };
  }

  /**
   * Return the singleton KVState instance, creating it if needed.
   */
  static getInstance(): KVState {
    if (!KVState.instance) {
      KVState.instance = new KVState();
    }
    return KVState.instance;
  }

  /**
   * Destroy the singleton instance.
   * Primarily for test isolation — allows each test to start fresh.
   */
  static resetInstance(): void {
    KVState.instance = null;
  }

  /**
   * The current session ID (8-character hex string).
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Retrieve values for the given keys from session state.
   *
   * @param keys - Key names to retrieve. Missing keys return undefined in the result.
   * @returns Record mapping each requested key to its value (or undefined).
   */
  async get(keys: string[]): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = this.data[key];
    }
    return result;
  }

  /**
   * Set one or more key-value pairs in session state and persist to disk.
   *
   * Reserved keys (id, started_at) cannot be overwritten.
   *
   * @param values - Object of key-value pairs to merge into state.
   */
  async set(values: Record<string, unknown>): Promise<void> {
    await this.ensureLoaded();
    const RESERVED = new Set(['id', 'started_at', '__proto__', 'constructor', 'prototype']);
    for (const [key, value] of Object.entries(values)) {
      if (RESERVED.has(key)) continue;
      this.data[key] = value;
    }
    await this.persist();
  }

  /**
   * List all key-value pairs in session state, optionally filtered by prefix.
   *
   * The reserved keys `id` and `started_at` are always included when no prefix
   * is given, and only included when the prefix matches them.
   *
   * @param prefix - If provided, only keys starting with this string are returned.
   * @returns Record of matching key-value pairs.
   */
  async list(prefix?: string): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.data)) {
      if (!prefix || key.startsWith(prefix)) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Remove specific keys from session state and persist to disk.
   *
   * Reserved keys (id, started_at) are silently skipped.
   *
   * @param keys - Keys to remove.
   */
  async clear(keys: string[]): Promise<void> {
    await this.ensureLoaded();
    for (const key of keys) {
      if (key === 'id' || key === 'started_at') continue;
      delete this.data[key];
    }
    await this.persist();
  }

  /**
   * List all session file IDs found in the state directory.
   * Returns session IDs for all matching session files.
   *
   * @returns Array of session ID strings.
   */
  async listSessions(): Promise<string[]> {
    try {
      const entries = await readdir(this.stateDir);
      const ids: string[] = [];

      for (const entry of entries) {
        const match = entry.match(/^session_([0-9a-f]{8})\.json$/);
        if (match) {
          ids.push(match[1]);
        }
      }

      return ids;
    } catch {
      return [];
    }
  }

  /**
   * Remove old session files, keeping only the N most recent.
   *
   * @param keepCount - Number of recent sessions to retain (default: 5).
   * @returns Number of session files deleted.
   */
  async cleanupOldSessions(keepCount = 5): Promise<number> {
    try {
      const entries = await readdir(this.stateDir);
      const results = await Promise.all(
        entries.filter(e => /^session_[0-9a-f]{8}\.json$/.test(e)).map(async (entry) => {
          try {
            const s = await stat(path.join(this.stateDir, entry));
            return { file: entry, mtime: s.mtimeMs };
          } catch {
            return null;
          }
        })
      );
      const sessionFiles = results.filter((r): r is { file: string; mtime: number } => r !== null);

      // Sort oldest first so we delete from the front
      sessionFiles.sort((a, b) => a.mtime - b.mtime);

      const toDelete = sessionFiles.slice(0, Math.max(0, sessionFiles.length - keepCount));
      await Promise.all(
        toDelete.map(({ file }) => unlink(path.join(this.stateDir, file)).catch(() => {}))
      );

      return toDelete.length;
    } catch {
      return 0;
    }
  }

  /**
   * Load state from disk if not yet loaded.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.load();
  }

  /**
   * Load (or reload) the session state from disk.
   * Creates the state directory if it does not exist.
   * If the session file does not exist, in-memory defaults are kept.
   */
  async load(): Promise<void> {
    try {
      await mkdir(this.stateDir, { recursive: true });
    } catch {
      // Already exists or unrecoverable — proceed with in-memory defaults
    }

    try {
      const raw = await readFile(this.sessionFile, 'utf-8');
      const parsed = JSON.parse(raw) as SessionStateData;
      const savedId = this.data.id;
      const savedStartedAt = this.data.started_at;
      this.data = { ...this.data, ...parsed, id: savedId, started_at: savedStartedAt };
    } catch {
      // File doesn't exist or is corrupt — keep in-memory defaults
    }

    // Mark as loaded AFTER all I/O completes
    this.loaded = true;
  }

  /**
   * Persist current state to disk using an atomic temp-then-rename strategy.
   * Prevents corrupt session files on crash mid-write.
   */
  async persist(): Promise<void> {
    try {
      await mkdir(this.stateDir, { recursive: true });

      const tempFile = `${this.sessionFile}.tmp`;
      const json = JSON.stringify(this.data, null, 2);

      await writeFile(tempFile, json, { encoding: 'utf-8' });
      try {
        await rename(tempFile, this.sessionFile);
      } catch (err) {
        await unlink(tempFile).catch(() => {});
        throw err;
      }
    } catch (err) {
      throw new Error(`Failed to persist session state to ${this.sessionFile}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Singleton KVState instance for managing per-session key-value state.
 * Use this export for application-level access.
 */
export const kvState = KVState.getInstance();
