/**
 * Event Log
 *
 * JSONL append-only event log with query, compaction, and statistics.
 *
 * Each event is written as a single JSON line followed by a newline character.
 * Writes are buffered (non-blocking): the `append()` method is synchronous from
 * the caller's perspective (adds to an in-memory buffer) but the underlying
 * file I/O is non-blocking. The buffer is flushed on a 100 ms interval or when
 * it exceeds 64 KB.
 *
 * Compaction moves events older than the configured threshold to per-day archive
 * files, atomically replacing the main log with only the retained events.
 */

import {
  writeFileSync,
  renameSync,
  mkdirSync,
  statSync,
  createWriteStream,
  createReadStream,
} from 'fs';
import * as readline from 'readline';
import { join, dirname } from 'path';
import type { WriteStream } from 'fs';
import type { RuntimeEvent, EventFilter } from './types.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

const logger = createLogger('event-log');

/** Flush interval in milliseconds. */
const FLUSH_INTERVAL_MS = 100;

/** Flush buffer when it exceeds this many bytes. */
const FLUSH_THRESHOLD_BYTES = 64 * 1024; // 64 KB

/** Statistics snapshot for the event log. */
export interface EventLogStats {
  /** Total number of events in the log. */
  total_events: number;
  /** Current size of the log file in bytes. */
  file_size_bytes: number;
  /** ISO-8601 timestamp of the oldest event in the log, or undefined if empty. */
  oldest_event?: string;
  /** ISO-8601 timestamp of the newest event in the log, or undefined if empty. */
  newest_event?: string;
  /** Event count broken down by event type. */
  events_per_type: Record<string, number>;
}

/**
 * JSONL append-only event log with query and compaction support.
 *
 * @example
 * const log = new EventLog('/path/to/state', config.persistence);
 * await log.initialize();
 * log.append(event);
 * const recent = await log.query({ types: ['hook:post_tool_use'], limit: 100 });
 */
export class EventLog {
  /** Absolute path to the active JSONL log file. */
  private readonly logPath: string;
  /** Directory for archived JSONL files. */
  private readonly archiveDir: string;
  /** The most recently seen sequence number (recovered on init). */
  private latestSeq: number = 0;
  /** Count of events in the current log file. */
  private eventCount: number = 0;
  /** Cached per-type event counts (updated on every append). */
  private typeCountCache: Record<string, number> = {};
  /** Timestamp of the oldest event (recovered on init). */
  private oldestEvent?: string;
  /** Timestamp of the newest event (updated on every append). */
  private newestEvent?: string;
  /** Maximum log file size in megabytes before rotation is needed. */
  private readonly maxSizeMb: number;
  /** Events older than this many hours are eligible for compaction. */
  private readonly compactAfterHours: number;

  // ─── Async write state ──────────────────────────────────────────────────────

  /** Active write stream for non-blocking appends. Created lazily. */
  private writeStream: WriteStream | null = null;
  /** Pending write buffer (not yet flushed to disk). */
  private writeBuffer: string = '';
  /** Size of writeBuffer in bytes. */
  private writeBufferBytes: number = 0;
  /** NodeJS timer handle for the periodic flush. */
  private flushTimer: NodeJS.Timeout | null = null;
  /** Whether the stream has been closed (post-shutdown). */
  private closed: boolean = false;
  /** Whether we are currently draining the buffer to disk (prevents re-entry). */
  private flushing: boolean = false;
  /** Queue of flush waiters (resolve/reject pairs). */
  private flushWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  /**
   * Creates a new EventLog instance.
   *
   * @param stateDir - Absolute path to the directory where the JSONL log file
   *   and archive subdirectory will be stored. Created on first write if absent.
   * @param config - Configuration for log size and compaction:
   *   - `event_log_max_size_mb`: Informational threshold for triggering log
   *     rotation. Currently not actively enforced inside `append()` — it is
   *     the caller's responsibility to call `compact()` or rotate when the
   *     reported `file_size_bytes` exceeds this value. Passing `0` does not
   *     cause errors; it simply means no size-based rotation threshold is set.
   *   - `compact_after_hours`: Events older than this many hours are eligible
   *     for archival when `compact()` is called. Passing `0` means the cutoff
   *     is `now`, so **every** existing event will be archived on the next
   *     `compact()` call, leaving the main log empty. This is valid but
   *     aggressive — use with care in production.
   */
  constructor(
    stateDir: string,
    config: { event_log_max_size_mb: number; compact_after_hours: number },
  ) {
    this.logPath = join(stateDir, 'events.jsonl');
    this.archiveDir = join(stateDir, 'event-archives');
    this.maxSizeMb = config.event_log_max_size_mb;
    this.compactAfterHours = config.compact_after_hours;
  }

  /**
   * Initialises the event log by streaming the existing file (if any) to recover
   * the latest sequence number, event count, and oldest/newest timestamps.
   *
   * Safe to call on a fresh (non-existent) log file.
   */
  async initialize(): Promise<void> {
    try {
      let skippedLines = 0;
      await this.streamLines(this.logPath, (line) => {
        try {
          const event = JSON.parse(line) as RuntimeEvent;
          if (typeof event.metadata?.sequence === 'number' && event.metadata.sequence > this.latestSeq) {
            this.latestSeq = event.metadata.sequence;
          }
          if (event.type) {
            this.typeCountCache[event.type] = (this.typeCountCache[event.type] ?? 0) + 1;
          }
          const ts = event.timestamp;
          if (ts) {
            if (!this.oldestEvent || ts < this.oldestEvent) this.oldestEvent = ts;
            if (!this.newestEvent || ts > this.newestEvent) this.newestEvent = ts;
          }
          this.eventCount++;
        } catch {
          skippedLines++;
        }
      });
      if (skippedLines > 0) {
        logger.warn('Skipped malformed lines during initialize', { count: skippedLines, file: this.logPath });
      }

      logger.info('Event log initialised', {
        events: this.eventCount,
        latest_seq: this.latestSeq,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // Fresh log — nothing to recover
        logger.debug('Event log file not found, starting fresh');
      } else {
        logger.warn('Error reading event log on init', { error: toErrorMessage(err) });
      }
    }

    // Open the write stream now that the directory is guaranteed to exist
    this.openWriteStream();
  }

  /**
   * Appends an event to the write buffer.
   *
   * This method is synchronous from the caller's perspective — it adds
   * the serialised event to an in-memory buffer and triggers a background
   * flush if the buffer exceeds the threshold. Actual disk I/O is async.
   *
   * @param event - The event to persist.
   */
  append(event: RuntimeEvent): void {
    if (this.closed) return;

    const line = JSON.stringify(event) + '\n';
    this.writeBuffer += line;
    this.writeBufferBytes += Buffer.byteLength(line, 'utf-8');

    // Update in-memory state
    if (typeof event.metadata?.sequence === 'number' && event.metadata.sequence > this.latestSeq) {
      this.latestSeq = event.metadata.sequence;
    }
    this.eventCount++;
    if (event.type) {
      this.typeCountCache[event.type] = (this.typeCountCache[event.type] ?? 0) + 1;
    }
    if (event.timestamp) {
      if (!this.oldestEvent) this.oldestEvent = event.timestamp;
      this.newestEvent = event.timestamp;
    }

    // Flush immediately if buffer exceeds threshold
    if (this.writeBufferBytes >= FLUSH_THRESHOLD_BYTES) {
      this.scheduleFlush();
    }

    // Ensure the interval flush timer is running
    this.ensureFlushTimer();
  }

  /**
   * Explicitly flushes the write buffer to disk.
   *
   * Call before checkpoint saves or shutdown to guarantee durability.
   *
   * @returns A Promise that resolves once the buffer has been written.
   */
  async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;

    return new Promise<void>((resolve, reject) => {
      this.flushWaiters.push({ resolve, reject });
      this.scheduleFlush();
    });
  }

  /**
   * Flushes the buffer and closes the write stream.
   *
   * Should be called during engine shutdown after all appends are complete.
   *
   * @returns A Promise that resolves once the stream is fully closed.
   */
  async close(): Promise<void> {
    this.closed = true;
    this.stopFlushTimer();

    // Flush remaining buffer
    if (this.writeBuffer.length > 0) {
      await this.drainBuffer();
    }

    // Sync fallback if drainBuffer restored data to the buffer after a failure
    if (this.writeBuffer.length > 0) {
      try {
        const { appendFileSync } = await import('fs');
        appendFileSync(this.logPath, this.writeBuffer, 'utf-8');
        this.writeBuffer = '';
        this.writeBufferBytes = 0;
      } catch (syncErr) {
        logger.debug('Sync fallback write failed during close', { error: toErrorMessage(syncErr) });
      }
    }

    // Close the write stream
    if (this.writeStream) {
      await new Promise<void>((resolve) => {
        this.writeStream!.end(() => {
          this.writeStream = null;
          resolve();
        });
      });
    }
  }

  /**
   * Queries the log using streaming reads, applying filters during streaming.
   *
   * Supports early termination when `limit` is reached without reading the
   * full file.
   *
   * @param filter - Optional filter criteria.
   * @returns Array of matching events in chronological order.
   */
  async query(filter: EventFilter = {}): Promise<RuntimeEvent[]> {
    // Flush buffered writes so newly appended events are visible in the query
    if (this.writeBuffer.length > 0) {
      await this.drainBuffer();
    }

    const results: RuntimeEvent[] = [];
    const limit = filter.limit;

    let skippedLines = 0;
    try {
      await this.streamLines(this.logPath, (line) => {
        if (limit !== undefined && results.length >= limit) {
          return false; // signal early termination
        }
        try {
          const event = JSON.parse(line) as RuntimeEvent;
          if (this.matchesFilter(event, filter)) {
            results.push(event);
          }
        } catch {
          skippedLines++;
        }
        return true; // continue
      });
      if (skippedLines > 0) {
        logger.warn('Skipped malformed lines during query', { count: skippedLines, file: this.logPath });
      }
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      throw err;
    }

    return results;
  }

  /**
   * Returns events with a sequence number greater than `sequence`.
   *
   * @param sequence - The last sequence number the caller has seen.
   * @param limit - Maximum number of events to return.
   */
  async since(sequence: number, limit?: number): Promise<RuntimeEvent[]> {
    return this.query({
      since_sequence: sequence,
      limit,
    });
  }

  /**
   * Returns the latest sequence number seen in the log.
   */
  getLatestSequence(): number {
    return this.latestSeq;
  }

  /**
   * Compacts the event log by archiving events older than the configured
   * threshold to a per-day archive file.
   *
   * The main log is atomically replaced with only the retained events
   * (tmp write + rename, matching the state-store pattern).
   *
   * @param beforeTimestamp - Optional ISO-8601 cutoff; events before this
   *   timestamp are archived. Defaults to `compactAfterHours` ago.
   * @returns Counts of archived and remaining events.
   */
  async compact(
    beforeTimestamp?: string,
  ): Promise<{ archived: number; remaining: number }> {
    // Flush any buffered writes before reading the file for compaction
    if (this.writeBuffer.length > 0) {
      await this.drainBuffer();
    }

    const cutoff =
      beforeTimestamp ??
      new Date(
        Date.now() - this.compactAfterHours * 60 * 60 * 1000,
      ).toISOString();

    const toArchive: string[] = [];
    const toKeep: string[] = [];

    let skippedLines = 0;
    try {
      await this.streamLines(this.logPath, (line) => {
        try {
          const event = JSON.parse(line) as RuntimeEvent;
          // Timestamps are compared as ISO 8601 strings (UTC); lexicographic order
          // matches chronological order only when all values share the same UTC offset.
          const ts = event.timestamp ?? '';
          if (ts < cutoff) {
            toArchive.push(line);
          } else {
            toKeep.push(line);
          }
        } catch {
          // Keep malformed lines in the main log (don't lose data)
          toKeep.push(line);
          skippedLines++;
        }
        return true;
      });
      if (skippedLines > 0) {
        logger.warn('Skipped malformed lines during compact', { count: skippedLines, file: this.logPath });
      }
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return { archived: 0, remaining: 0 };
      }
      throw err;
    }

    if (toArchive.length === 0) {
      logger.debug('Compaction: no events to archive');
      return { archived: 0, remaining: toKeep.length };
    }

    // Close write stream before replacing the main log file
    await this.closeWriteStream();

    // Write archive file
    mkdirSync(this.archiveDir, { recursive: true });
    const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const archivePath = join(
      this.archiveDir,
      `events-archive-${archiveDate}.jsonl`,
    );

    // Append to archive if it already exists for today (O(1) append, no re-read)
    try {
      const { appendFileSync } = await import('fs');
      appendFileSync(archivePath, toArchive.join('\n') + '\n', 'utf-8');
    } catch (archiveErr) {
      logger.debug('Archive append failed, creating new archive file', { error: toErrorMessage(archiveErr) });
      writeFileSync(archivePath, toArchive.join('\n') + '\n', 'utf-8');
    }

    // Atomically replace the main log
    const tmpPath = this.logPath + '.tmp';
    writeFileSync(tmpPath, toKeep.join('\n') + (toKeep.length > 0 ? '\n' : ''), 'utf-8');
    renameSync(tmpPath, this.logPath);

    // Reopen write stream after file replacement
    if (!this.closed) {
      this.openWriteStream();
    }

    // Update in-memory counters
    this.eventCount = toKeep.length;
    // Re-scan kept events for oldest/newest
    this.rebuildCacheFromLines(toKeep);

    logger.info('Compaction complete', {
      archived: toArchive.length,
      remaining: toKeep.length,
      archive_file: archivePath,
    });

    return { archived: toArchive.length, remaining: toKeep.length };
  }

  /**
   * Returns a statistics snapshot for the event log.
   *
   * Uses cached in-memory values where available; stats the file for size.
   */
  getStats(): EventLogStats {
    let fileSizeBytes = 0;
    try {
      fileSizeBytes = statSync(this.logPath).size;
    } catch {
      // File doesn't exist yet
    }
    // Include buffered but not yet flushed bytes in the size estimate
    fileSizeBytes += this.writeBufferBytes;

    return {
      total_events: this.eventCount,
      file_size_bytes: fileSizeBytes,
      oldest_event: this.oldestEvent,
      newest_event: this.newestEvent,
      events_per_type: { ...this.typeCountCache },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Opens (or re-opens) the write stream in append mode.
   * Silently ignores errors so appends remain safe even if the stream fails.
   */
  private openWriteStream(): void {
    try {
      // Ensure the parent directory exists
      const dir = dirname(this.logPath);
      mkdirSync(dir, { recursive: true });

      this.writeStream = createWriteStream(this.logPath, { flags: 'a', encoding: 'utf-8' });
      this.writeStream.on('error', (err) => {
        logger.error('Write stream error', { error: err.message });
        this.writeStream = null;
      });
    } catch (err) {
      logger.error('Failed to open event log write stream', { error: toErrorMessage(err) });
      this.writeStream = null;
    }
  }

  /**
   * Closes the write stream without closing the EventLog itself.
   * Used before compaction to safely replace the underlying file.
   */
  private async closeWriteStream(): Promise<void> {
    if (!this.writeStream) return;
    const stream = this.writeStream;
    this.writeStream = null;
    await new Promise<void>((resolve) => {
      stream.end(() => resolve());
    });
  }

  /**
   * Ensures the periodic flush timer is running.
   */
  private ensureFlushTimer(): void {
    if (this.flushTimer !== null || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.scheduleFlush();
    }, FLUSH_INTERVAL_MS);
    // Unref so the timer does not prevent process exit
    this.flushTimer.unref();
  }

  /**
   * Stops the periodic flush timer.
   */
  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Schedules an async flush of the write buffer.
   * If a flush is already in progress, it will drain again when done.
   */
  private scheduleFlush(): void {
    if (this.flushing || this.writeBuffer.length === 0) {
      // Resolve waiters if buffer is empty
      if (this.writeBuffer.length === 0 && this.flushWaiters.length > 0) {
        const waiters = this.flushWaiters.splice(0);
        for (const { resolve } of waiters) resolve();
      }
      return;
    }
    // Kick off async drain — do not await
    this.drainBuffer().catch((err) => {
      logger.warn('Event log flush error', { error: toErrorMessage(err) });
    });
  }

  /**
   * Drains the write buffer to disk.
   * Resolves all queued flush waiters once complete.
   */
  private async drainBuffer(): Promise<void> {
    if (this.flushing || this.writeBuffer.length === 0) return;
    this.flushing = true;

    const data = this.writeBuffer;
    this.writeBuffer = '';
    this.writeBufferBytes = 0;

    let drainError: Error | undefined;
    try {
      if (this.writeStream) {
        await new Promise<void>((resolve, reject) => {
          this.writeStream!.write(data, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        // Fallback: open stream was not available (e.g., before initialize or after stream error)
        // Write synchronously as a safety net
        const { appendFileSync } = await import('fs');
        appendFileSync(this.logPath, data, 'utf-8');
      }
    } catch (err) {
      drainError = err instanceof Error ? err : new Error(toErrorMessage(err));
      logger.error('Failed to flush event log buffer', { error: toErrorMessage(err) });
      // Restore buffer so data is not lost
      this.writeBuffer = data + this.writeBuffer;
      this.writeBufferBytes = Buffer.byteLength(this.writeBuffer, 'utf-8');
    } finally {
      this.flushing = false;

      // Notify waiters — reject on failure so callers know the flush did not persist
      if (this.flushWaiters.length > 0) {
        const waiters = this.flushWaiters.splice(0);
        if (drainError) {
          for (const { reject } of waiters) reject(drainError);
        } else {
          for (const { resolve } of waiters) resolve();
        }
      }

      // If more data arrived while we were flushing, schedule another flush
      if (this.writeBuffer.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Streams a JSONL file line by line, invoking `onLine` for each non-empty line.
   *
   * If `onLine` returns `false`, streaming stops early (for limit support).
   * Rejects if the file cannot be opened.
   *
   * @param filePath - Absolute path to the JSONL file.
   * @param onLine   - Callback for each non-empty line. Return false to stop early.
   */
  private streamLines(
    filePath: string,
    onLine: (line: string) => boolean | void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      let done = false;

      const cleanup = () => {
        if (!done) {
          done = true;
          rl.close();
          stream.destroy();
        }
      };

      rl.on('line', (line) => {
        if (done) return;
        const trimmed = line.trim();
        if (trimmed.length === 0) return;
        const result = onLine(trimmed);
        if (result === false) {
          cleanup();
          resolve();
        }
      });

      rl.on('close', () => {
        if (!done) {
          done = true;
          resolve();
        }
      });

      stream.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /** Returns true when `event` matches all criteria in `filter`. */
  private matchesFilter(event: RuntimeEvent, filter: EventFilter): boolean {
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type as (typeof filter.types)[number])) return false;
    }
    if (filter.since && event.timestamp && event.timestamp < filter.since) return false;
    if (filter.until && event.timestamp && event.timestamp > filter.until) return false;
    if (filter.since_sequence !== undefined && (
      typeof event.metadata?.sequence !== 'number' ||
      event.metadata.sequence <= filter.since_sequence
    )) return false;
    if (filter.correlation_id && event.metadata?.correlation_id !== filter.correlation_id) return false;
    if (filter.source) {
      const src = filter.source;
      if (src.kind && event.source.kind !== src.kind) return false;
      if ('hook_name' in src && src.hook_name) {
        if (event.source.kind !== 'hook' || (event.source as { kind: 'hook'; hook_name: string }).hook_name !== src.hook_name) return false;
      }
      if ('workflow_id' in src && src.workflow_id) {
        if (event.source.kind !== 'workflow' || (event.source as { kind: 'workflow'; workflow_id: string }).workflow_id !== src.workflow_id) return false;
      }
      if ('agent_id' in src && src.agent_id) {
        if (event.source.kind !== 'agent' || (event.source as { kind: 'agent'; agent_id: string }).agent_id !== src.agent_id) return false;
      }
      if ('trigger_id' in src && src.trigger_id) {
        if (event.source.kind !== 'trigger' || (event.source as { kind: 'trigger'; trigger_id: string }).trigger_id !== src.trigger_id) return false;
      }
      if ('tool_name' in src && src.tool_name) {
        if (event.source.kind !== 'mcp_tool' || (event.source as { kind: 'mcp_tool'; tool_name: string }).tool_name !== src.tool_name) return false;
      }
      if ('client_id' in src && src.client_id) {
        if (event.source.kind !== 'ipc' || (event.source as { kind: 'ipc'; client_id: string }).client_id !== src.client_id) return false;
      }
    }
    return true;
  }

  /** Rebuilds the in-memory type/oldest/newest cache from a set of raw JSONL lines. */
  private rebuildCacheFromLines(lines: string[]): void {
    const typeCount: Record<string, number> = {};
    let oldest: string | undefined;
    let newest: string | undefined;

    let skippedLines = 0;
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as RuntimeEvent;
        if (event.type) {
          typeCount[event.type] = (typeCount[event.type] ?? 0) + 1;
        }
        const ts = event.timestamp;
        if (ts) {
          if (!oldest || ts < oldest) oldest = ts;
          if (!newest || ts > newest) newest = ts;
        }
      } catch {
        skippedLines++;
      }
    }
    if (skippedLines > 0) {
      logger.warn('Skipped malformed lines during cache rebuild', { count: skippedLines, file: this.logPath });
    }

    this.typeCountCache = typeCount;
    this.oldestEvent = oldest;
    this.newestEvent = newest;
  }
}
