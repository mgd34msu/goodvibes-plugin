/**
 * FileWatcher — External Events Plugin (Layer 3)
 *
 * Scans a directory for JSON event files, normalizes them via the
 * NormalizerRegistry, enqueues resulting ExternalEvents, and moves
 * processed files out of the incoming directory.
 *
 * All three directories (incoming, processed, errors) are created on
 * first use via ensureDirs().
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EventQueueInterface } from '../../core/types.js';
import { NormalizerRegistry } from './normalizers/index.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface FileWatcherConfig {
  /** Directory to watch for incoming event files. Default: .goodvibes/events/incoming/ */
  incoming_dir: string;
  /** Directory to move successfully processed files to. Default: .goodvibes/events/processed/ */
  processed_dir: string;
  /** Directory to move files that failed to parse/normalize. Default: .goodvibes/events/errors/ */
  error_dir: string;
  /** Maximum number of files to process per scan call. Default: 50 */
  max_files_per_scan: number;
}

export const DEFAULT_FILE_WATCHER_CONFIG: FileWatcherConfig = {
  incoming_dir: '.goodvibes/events/incoming',
  processed_dir: '.goodvibes/events/processed',
  error_dir: '.goodvibes/events/errors',
  max_files_per_scan: 50,
};

// ─── File Drop Payload Schema ─────────────────────────────────────────────────

/**
 * Minimum required structure for a JSON file in the incoming directory.
 * Files dropped by the HTTP listener include these fields automatically.
 */
interface DropFilePayload {
  /** The originating system identifier (e.g. 'github', 'stripe', 'custom'). */
  source: string;
  /** The raw event data from the external system. */
  payload: unknown;
  /** Optional HTTP headers forwarded from the webhook request. */
  headers?: Record<string, string>;
  /** Optional ISO 8601 timestamp when the event was received. */
  received_at?: string;
}

/**
 * Validates that an unknown value conforms to DropFilePayload minimum structure.
 */
function isDropFilePayload(value: unknown): value is DropFilePayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['source'] === 'string' &&
    v['source'].length > 0 &&
    'payload' in v
  );
}

// ─── FileWatcher Class ──────────────────────────────────────────────────────────────

export class FileWatcher {
  /** Tracks filenames enqueued in the current scan cycle to prevent duplicate ingestion. */
  private readonly enqueuedInScan = new Set<string>();

  constructor(
    private readonly queue: EventQueueInterface,
    private readonly normalizers: NormalizerRegistry,
    private readonly config: FileWatcherConfig,
  ) {}

  /**
   * Scan the incoming directory for .json files.
   *
   * For each file (up to max_files_per_scan):
   *   1. Read and parse JSON
   *   2. Validate structure (must have source + payload)
   *   3. Normalize via matching normalizer
   *   4. Enqueue to event queue
   *   5. Move to processed/ on success, errors/ on failure
   *
   * Never throws — individual file failures are isolated.
   */
  async scan(): Promise<{ events_ingested: number }> {
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(this.config.incoming_dir);
      entries = dirEntries.filter((f) => f.endsWith('.json'));
    } catch (err) {
      // Directory may not exist yet; ensureDirs() creates it
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        await this.ensureDirs();
        return { events_ingested: 0 };
      }
      throw err;
    }

    // Honour max_files_per_scan cap
    const batch = entries.slice(0, this.config.max_files_per_scan);
    let events_ingested = 0;

    // Reset per-scan dedup set before processing this batch.
    this.enqueuedInScan.clear();

    for (const filename of batch) {
      const filepath = path.join(this.config.incoming_dir, filename);
      let succeeded = false;

      try {
        // 1. Read file
        const raw = await fs.readFile(filepath, 'utf-8');

        // 2. Parse JSON
        const parsed: unknown = JSON.parse(raw);

        // 3. Validate structure
        if (!isDropFilePayload(parsed)) {
          throw new Error(
            `Invalid drop file format: must have 'source' (string) and 'payload' fields`,
          );
        }

        // 4. Normalize via registry
        const event = this.normalizers.normalize(
          parsed.source,
          parsed.payload,
          parsed.headers,
        );

        // 5. Enqueue (skip if already enqueued this scan cycle to prevent duplicates on rename failure)
        if (!this.enqueuedInScan.has(filename)) {
          this.queue.enqueue(event);
          this.enqueuedInScan.add(filename);
          events_ingested++;
        }
        succeeded = true;
      } catch (scanErr) {
        // Log the error to aid debugging, then move the file for manual inspection
        console.error(`[FileWatcher] Failed to process file '${filename}':`, scanErr);
        // Failure: move to errors directory for manual inspection
        const errorPath = path.join(this.config.error_dir, filename);
        try {
          await fs.rename(filepath, errorPath);
        } catch (moveErr) {
          // If move fails (e.g. cross-device), attempt removal to unblock queue
          try {
            await fs.unlink(filepath);
          } catch {
            // Best effort — cannot do more
          }
        }
        // Error file moved; continue processing remaining files
      }

      if (succeeded) {
        // Move to processed directory with a collision-safe UUID prefix
        const processedName = `${crypto.randomUUID()}_${filename}`;
        const processedPath = path.join(this.config.processed_dir, processedName);
        try {
          await fs.rename(filepath, processedPath);
        } catch (moveErr) {
          // Processed but couldn't move — non-fatal; the enqueuedInScan set prevents
          // duplicate ingestion if the file is seen again on the next scan cycle.
          console.error(`[FileWatcher] Failed to move processed file '${filename}':`, moveErr);
        }
      }
    }

    return { events_ingested };
  }

  /**
   * Ensure all required directories exist.
   * Creates directories recursively if they don't exist.
   */
  async ensureDirs(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.config.incoming_dir, { recursive: true }),
      fs.mkdir(this.config.processed_dir, { recursive: true }),
      fs.mkdir(this.config.error_dir, { recursive: true }),
    ]);
  }
}
