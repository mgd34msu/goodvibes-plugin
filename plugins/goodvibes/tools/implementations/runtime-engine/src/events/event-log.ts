/**
 * Event Log
 *
 * JSONL append-only event log with query, compaction, and statistics.
 *
 * Each event is written as a single JSON line followed by a newline character.
 * The `append()` method is synchronous (appendFileSync) because it is called
 * directly from EventBus.emit() in the hot path.
 *
 * Compaction moves events older than the configured threshold to per-day archive
 * files, atomically replacing the main log with only the retained events.
 */

import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  statSync,
} from 'fs';
import { join } from 'path';
import type { RuntimeEvent, EventFilter } from './types.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('event-log');

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
   * Initialises the event log by reading the existing file (if any) to recover
   * the latest sequence number, event count, and oldest/newest timestamps.
   *
   * Safe to call on a fresh (non-existent) log file.
   */
  async initialize(): Promise<void> {
    try {
      const content = readFileSync(this.logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      this.eventCount = lines.length;

      const typeCount: Record<string, number> = {};
      let oldestTs: string | undefined;
      let newestTs: string | undefined;

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as RuntimeEvent;
          if (typeof event.metadata?.sequence === 'number' && event.metadata.sequence > this.latestSeq) {
            this.latestSeq = event.metadata.sequence;
          }
          if (event.type) {
            typeCount[event.type] = (typeCount[event.type] ?? 0) + 1;
          }
          const ts = event.timestamp;
          if (ts) {
            if (!oldestTs || ts < oldestTs) oldestTs = ts;
            if (!newestTs || ts > newestTs) newestTs = ts;
          }
        } catch {
          // Skip malformed lines silently
        }
      }

      this.typeCountCache = typeCount;
      this.oldestEvent = oldestTs;
      this.newestEvent = newestTs;

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
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Error reading event log on init', { error: msg });
      }
    }
  }

  /**
   * Appends an event to the log synchronously.
   *
   * This method is called from the EventBus hot path and must not block
   * the event loop with async I/O. Uses `appendFileSync` for durability.
   *
   * @param event - The event to persist.
   */
  append(event: RuntimeEvent): void {
    const line = JSON.stringify(event) + '\n';
    try {
      appendFileSync(this.logPath, line, 'utf-8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to append event to log', { error: msg, event_id: event.id });
      return;
    }

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
  }

  /**
   * Queries the log, returning events that match the given filter.
   *
   * Reads the entire log file; suitable for Phase 2. Future phases should
   * add an index for high-frequency queries.
   *
   * @param filter - Optional filter criteria.
   * @returns Array of matching events in chronological order.
   */
  async query(filter: EventFilter = {}): Promise<RuntimeEvent[]> {
    let content: string;
    try {
      content = readFileSync(this.logPath, 'utf-8');
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

    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const results: RuntimeEvent[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as RuntimeEvent;
        if (this.matchesFilter(event, filter)) {
          results.push(event);
          if (filter.limit !== undefined && results.length >= filter.limit) break;
        }
      } catch {
        // Skip malformed lines
      }
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
      since: undefined,
      limit,
    }).then((events) =>
      events.filter(
        (e) => typeof e.metadata?.sequence === 'number' && e.metadata.sequence > sequence,
      ),
    );
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
    const cutoff =
      beforeTimestamp ??
      new Date(
        Date.now() - this.compactAfterHours * 60 * 60 * 1000,
      ).toISOString();

    let content: string;
    try {
      content = readFileSync(this.logPath, 'utf-8');
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

    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    const toArchive: string[] = [];
    const toKeep: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as RuntimeEvent;
        const ts = event.timestamp ?? '';
        if (ts < cutoff) {
          toArchive.push(line);
        } else {
          toKeep.push(line);
        }
      } catch {
        // Keep malformed lines in the main log (don't lose data)
        toKeep.push(line);
      }
    }

    if (toArchive.length === 0) {
      logger.debug('Compaction: no events to archive');
      return { archived: 0, remaining: toKeep.length };
    }

    // Write archive file
    mkdirSync(this.archiveDir, { recursive: true });
    const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const archivePath = join(
      this.archiveDir,
      `events-archive-${archiveDate}.jsonl`,
    );

    // Append to archive if it already exists for today
    let existingArchive = '';
    try {
      existingArchive = readFileSync(archivePath, 'utf-8');
    } catch {
      // New archive file
    }
    const archiveContent =
      (existingArchive.endsWith('\n') || existingArchive.length === 0
        ? existingArchive
        : existingArchive + '\n') +
      toArchive.join('\n') +
      '\n';
    const tmpArchive = archivePath + '.tmp';
    writeFileSync(tmpArchive, archiveContent, 'utf-8');
    renameSync(tmpArchive, archivePath);

    // Atomically replace the main log
    const tmpPath = this.logPath + '.tmp';
    writeFileSync(tmpPath, toKeep.join('\n') + (toKeep.length > 0 ? '\n' : ''), 'utf-8');
    renameSync(tmpPath, this.logPath);

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

  /** Returns true when `event` matches all criteria in `filter`. */
  private matchesFilter(event: RuntimeEvent, filter: EventFilter): boolean {
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type as (typeof filter.types)[number])) return false;
    }
    if (filter.since && event.timestamp && event.timestamp < filter.since) return false;
    if (filter.until && event.timestamp && event.timestamp > filter.until) return false;
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
        // Skip malformed lines
      }
    }

    this.typeCountCache = typeCount;
    this.oldestEvent = oldest;
    this.newestEvent = newest;
  }
}
