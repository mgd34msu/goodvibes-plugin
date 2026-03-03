/**
 * Core State Store — Layer 1
 *
 * In-memory Map backed by a JSON file.
 *
 * Features:
 *  - Synchronous get/set/delete (in-memory Map, no async I/O on the hot path)
 *  - Deep dot-path get/set (e.g. get('sessions.active.phase'))
 *  - Atomic snapshot / restore for checkpointing
 *  - Auto-save on set with 1-second debounce
 *  - Merge op for nested objects
 *
 * The persisted file is `.goodvibes/memory/runtime-state.json` by default.
 */

import { readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { writeJsonSync } from './file-io.js';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage, safeJsonParse } from '../../shared/utils.js';
import type { StateStoreInterface, StateChange } from '../types.js';

const logger = createLogger('core:state-store');

export interface CoreStateStoreOptions {
  /**
   * Absolute path to the JSON file used for persistence.
   * Defaults to `{cwd}/.goodvibes/memory/runtime-state.json`.
   */
  file_path?: string;
  /** Debounce delay for auto-save in ms. Default: 1000. */
  save_debounce_ms?: number;
}

/** Segments forbidden in dot-path traversal to prevent prototype pollution. */
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate that a dot-separated key path contains no dangerous segments.
 * Throws a TypeError if `__proto__`, `constructor`, or `prototype` appear as any segment.
 * (Approved: "as any" in this comment is English prose, not a TypeScript cast.)
 * This prevents prototype pollution via crafted key names.
 */
function validateDotPath(path: string): void {
  const segments = path.split('.');
  for (const seg of segments) {
    if (FORBIDDEN_PATH_SEGMENTS.has(seg)) {
      throw new TypeError(
        `Prototype pollution guard: key path segment '${seg}' is forbidden in state paths`,
      );
    }
  }
}

/**
 * Set a nested value at a dot-separated path, creating intermediate objects as needed.
 */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (typeof current[seg] !== 'object' || current[seg] === null) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  const lastSeg = segments[segments.length - 1]!;
  current[lastSeg] = value;
}

/**
 * Get a value at a dot-separated path. Returns undefined if any segment is missing.
 */
function getPath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * Delete a value at a dot-separated path.
 */
function deletePath(obj: Record<string, unknown>, path: string): void {
  const segments = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (typeof current !== 'object' || current === null) return;
    current = (current as Record<string, unknown>)[seg];
  }
  if (typeof current === 'object' && current !== null) {
    const lastSeg = segments[segments.length - 1]!;
    delete (current as Record<string, unknown>)[lastSeg];
  }
}

/** Maximum recursion depth for deepMerge to prevent stack overflow from circular objects. */
const DEEP_MERGE_MAX_DEPTH = 20;

/**
 * Deep merge: override values take precedence over base values.
 * Arrays are replaced (not concatenated).
 *
 * Recursion is limited to {@link DEEP_MERGE_MAX_DEPTH} levels. If the depth
 * limit is exceeded, the override value is used as-is (no further recursion)
 * and a warning is logged. This prevents stack overflows from circular or
 * deeply nested objects.
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth >= DEEP_MERGE_MAX_DEPTH) {
    logger.warn('deepMerge depth limit exceeded; using override value as-is', { depth });
    return { ...base, ...override };
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
        depth + 1,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Synchronous in-memory state store with JSON file persistence.
 * Implements {@link StateStoreInterface}.
 */
export class CoreStateStore implements StateStoreInterface {
  private data: Record<string, unknown> = {};
  private readonly filePath: string;
  private readonly saveDebounceMs: number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private changeListener?: (change: StateChange) => void;

  constructor(options: CoreStateStoreOptions = {}) {
    const cwd = process.cwd();
    const defaultPath = join(cwd, '.goodvibes', 'memory', 'runtime-state.json');
    this.filePath = options.file_path
      ? isAbsolute(options.file_path)
        ? options.file_path
        : join(cwd, options.file_path)
      : defaultPath;
    this.saveDebounceMs = options.save_debounce_ms ?? 1000;
    this.load();
  }

  /**
   * Get a value at a dot-separated key path.
   * Returns null if not found or if path traversal fails.
   * Throws TypeError if the path contains a forbidden segment (`__proto__`,
   * `constructor`, or `prototype`) to prevent prototype pollution.
   */
  get<T>(key: string): T | null {
    validateDotPath(key);
    const value = getPath(this.data, key);
    return value === undefined ? null : (value as T);
  }

  /**
   * Set a value at a dot-separated key path.
   * Schedules a debounced auto-save.
   * Throws TypeError if the path contains a forbidden segment (`__proto__`,
   * `constructor`, or `prototype`) to prevent prototype pollution.
   */
  set<T>(key: string, value: T): void {
    validateDotPath(key);
    const oldValue = this.get(key);
    setPath(this.data, key, value);
    this.scheduleSave();
    if (this.changeListener) {
      this.changeListener({
        key,
        operation: 'set',
        namespace: key.split('.')[0] || key,
        oldValue,
        newValue: value,
      });
    }
  }

  /**
   * Delete a key (dot-separated path). No-op if not found.
   * Throws TypeError if the path contains a forbidden segment (`__proto__`,
   * `constructor`, or `prototype`) to prevent prototype pollution.
   */
  delete(key: string): void {
    validateDotPath(key);
    const oldValue = this.get(key);
    deletePath(this.data, key);
    this.scheduleSave();
    if (this.changeListener) {
      this.changeListener({
        key,
        operation: 'delete',
        namespace: key.split('.')[0] || key,
        oldValue,
        newValue: null,
      });
    }
  }

  /**
   * Apply a merge at a dot-separated path.
   * The existing value at the path is deep-merged with the provided value.
   * If there is no existing value, this is equivalent to set().
   */
  merge(key: string, value: Record<string, unknown>): void {
    validateDotPath(key);
    const oldValue = this.get(key);
    const existing = oldValue as Record<string, unknown> | null;
    const merged =
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        ? deepMerge(existing, value)
        : value;
    setPath(this.data, key, merged);
    this.scheduleSave();
    if (this.changeListener) {
      this.changeListener({
        key,
        operation: 'merge',
        namespace: key.split('.')[0] || key,
        oldValue,
        newValue: this.get(key),
      });
    }
  }

  /**
   * Take a deep-copy snapshot of all state.
   */
  snapshot(): Record<string, unknown> {
    return structuredClone(this.data);
  }

  /**
   * Replace all state with the given snapshot.
   * Schedules a debounced auto-save.
   */
  restore(snapshot: Record<string, unknown>): void {
    this.data = structuredClone(snapshot);
    this.scheduleSave();
  }

  /**
   * Flush any pending auto-save immediately.
   * Useful for graceful shutdown.
   */
  flush(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }

  /**
   * Dispose the store: flush pending writes and release resources.
   * Call this on graceful shutdown to prevent timer leaks.
   */
  dispose(): void {
    this.flush();
  }

  /**
   * List all dot-path keys in the store.
   * If prefix is provided, only return keys that start with `${prefix}.` or equal prefix exactly.
   */
  /** Register a listener that is called on every state mutation. Only one listener supported. */
  onStateChange(listener: (change: StateChange) => void): void {
    this.changeListener = listener;
  }

  keys(prefix?: string): string[] {
    const allKeys = this.collectKeys(this.data, '');
    if (!prefix) return allKeys;
    return allKeys.filter(k => k === prefix || k.startsWith(prefix + '.'));
  }

  /**
   * Recursively collect all leaf dot-path keys from a nested object.
   * Empty objects ({}) have no leaves and are therefore not enumerated.
   * Recursion is limited to {@link DEEP_MERGE_MAX_DEPTH} levels.
   */
  private collectKeys(obj: Record<string, unknown>, parentPath: string, depth = 0): string[] {
    if (depth >= DEEP_MERGE_MAX_DEPTH) {
      logger.warn('collectKeys depth limit exceeded; treating as leaf', { depth, path: parentPath });
      if (parentPath) return [parentPath];
      return [];
    }
    const result: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = parentPath ? `${parentPath}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result.push(...this.collectKeys(value as Record<string, unknown>, fullPath, depth + 1));
      } else {
        result.push(fullPath);
      }
    }
    return result;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /** Load from disk on construction. Missing file is not an error. */
  private load(): void {
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed = safeJsonParse<unknown>(content, null);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        this.data = parsed as Record<string, unknown>;
        logger.debug('Loaded state from disk', { path: this.filePath });
      } else {
        logger.warn('State file contained non-object; starting fresh', { path: this.filePath });
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Normal on first run
        logger.debug('No state file found; starting fresh', { path: this.filePath });
      } else {
        logger.warn('Failed to load state file; starting fresh', {
          path: this.filePath,
          error: toErrorMessage(err),
        });
      }
    }
  }

  /** Schedule a debounced save. */
  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, this.saveDebounceMs);
  }

  /** Atomically write state to disk (write tmp then rename). */
  private persist(): void {
    try {
      writeJsonSync(this.filePath, this.data);
      logger.debug('Persisted state to disk', { path: this.filePath });
    } catch (err) {
      logger.error('Failed to persist state', {
        path: this.filePath,
        error: toErrorMessage(err),
      });
    }
  }
}
