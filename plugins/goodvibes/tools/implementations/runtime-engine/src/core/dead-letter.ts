/**
 * Dead-Letter Queue — Layer 1
 *
 * Stores events that exhausted all retry attempts.
 *
 * Features:
 *  - Each entry: event + error + timestamp + attempt_count
 *  - Configurable max size (default 500) with oldest-first eviction
 *  - Retrieve by event ID or event type
 *  - Replay capability: re-enqueue an event for processing
 *  - Persistence to a JSON file
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import type { RuntimeEvent, DeadLetterQueueInterface, DeadLetterEntry } from './types.js';

const logger = createLogger('core:dead-letter');

// DeadLetterEntry is defined in types.ts and re-exported here for consumers
// that import directly from dead-letter.ts.
export type { DeadLetterEntry } from './types.js';

export interface DeadLetterQueueOptions {
  /**
   * Maximum number of entries. When exceeded, oldest entries are evicted.
   * Default: 500.
   */
  max_size?: number;
  /**
   * Absolute path to the JSON persistence file.
   * Default: `{cwd}/.goodvibes/memory/dead-letter.json`.
   */
  file_path?: string;
  /**
   * Whether to load/save from disk. Default: true.
   */
  persist?: boolean;
}

/**
 * Dead-letter queue for failed events.
 */
export class DeadLetterQueue implements DeadLetterQueueInterface {
  private entries: DeadLetterEntry[] = [];
  private readonly maxSize: number;
  private readonly filePath: string;
  private readonly persistEnabled: boolean;

  constructor(options: DeadLetterQueueOptions = {}) {
    this.maxSize = options.max_size ?? 500;
    this.persistEnabled = options.persist !== false;

    const cwd = process.cwd();
    const defaultPath = join(cwd, '.goodvibes', 'memory', 'dead-letter.json');
    this.filePath = options.file_path
      ? isAbsolute(options.file_path)
        ? options.file_path
        : join(cwd, options.file_path)
      : defaultPath;

    if (this.persistEnabled) {
      this.load();
    }
  }

  /**
   * Store a failed event in the dead-letter queue.
   * If max_size is exceeded, the oldest entry is evicted.
   *
   * Note on eviction: we use Array.shift() which is O(n). This is intentional
   * — the DLQ is bounded to max_size (default 500) and eviction is rare.
   * A circular buffer or deque would reduce eviction cost to O(1), but adds
   * complexity that is not justified given the expected usage pattern.
   * If the DLQ ever grows significantly larger, reconsider this choice.
   */
  add(entry: DeadLetterEntry): void {
    // Evict oldest if at capacity
    while (this.entries.length >= this.maxSize) {
      this.entries.shift();
    }
    this.entries.push(entry);
    logger.warn('Event dead-lettered', {
      event_id: entry.event.id,
      event_type: entry.event.type,
      trigger_id: entry.trigger_id,
      attempts: entry.attempt_count,
      error: entry.error,
    });
    if (this.persistEnabled) {
      this.persist();
    }
  }

  /**
   * Retrieve a dead-letter entry by event ID.
   */
  getById(event_id: string): DeadLetterEntry | undefined {
    return this.entries.find((e) => e.event.id === event_id);
  }

  /**
   * Retrieve all dead-letter entries for a given event type.
   */
  getByType(event_type: string): DeadLetterEntry[] {
    return this.entries.filter((e) => e.event.type === event_type);
  }

  /**
   * Retrieve all dead-letter entries.
   * Returns a shallow copy so callers cannot mutate internal state.
   */
  getAll(): DeadLetterEntry[] {
    return [...this.entries];
  }

  /**
   * Number of dead-letter entries.
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Remove a dead-letter entry by event ID.
   * @returns true if found and removed.
   */
  remove(event_id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.event.id !== event_id);
    const removed = this.entries.length < before;
    if (removed && this.persistEnabled) this.persist();
    return removed;
  }

  /**
   * Clear all dead-letter entries.
   */
  clear(): void {
    this.entries = [];
    if (this.persistEnabled) this.persist();
  }

  /**
   * Replay a dead-letter entry: removes it from the DLQ and returns its event
   * so the caller can re-enqueue it.
   * @returns The event to re-enqueue, or null if not found.
   */
  replay(event_id: string): RuntimeEvent | null {
    const entry = this.getById(event_id);
    if (!entry) return null;
    this.remove(event_id);
    logger.info('Replaying dead-letter event', {
      event_id,
      event_type: entry.event.type,
    });
    return entry.event;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private load(): void {
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (Array.isArray(parsed)) {
        this.entries = parsed as DeadLetterEntry[];
        logger.debug('Loaded dead-letter queue from disk', {
          path: this.filePath,
          count: this.entries.length,
        });
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        logger.warn('Failed to load dead-letter file; starting empty', {
          path: this.filePath,
          error: toErrorMessage(err),
        });
      }
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const content = JSON.stringify(this.entries, null, 2) + '\n';
      const tmpPath = this.filePath + '.tmp';
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      logger.error('Failed to persist dead-letter queue', {
        path: this.filePath,
        error: toErrorMessage(err),
      });
    }
  }
}
