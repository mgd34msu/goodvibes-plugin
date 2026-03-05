/**
 * Workflow State Persistence
 *
 * Provides atomic write-then-rename persistence for individual workflow
 * instances. Each instance is written to its own JSON file keyed by instance
 * ID. A cleanup method removes terminal workflow files older than the
 * configured TTL.
 *
 * Designed as a lightweight complement to the SnapshotManager — snapshots
 * capture a full runtime state point-in-time, while WorkflowPersistence
 * provides per-workflow granular durability on every state transition.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('workflow-persistence');

/** Default TTL: 24 hours. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface WorkflowPersistenceConfig {
  /** Directory to store workflow state files, e.g. '.goodvibes/state/workflows/'. */
  stateDir: string;
  /**
   * Milliseconds after completion before a terminal workflow file is removed.
   * Defaults to 24 hours if not specified.
   */
  ttlMs?: number;
  /** When false, all operations are no-ops. Defaults to true. */
  enabled?: boolean;
}

/**
 * Provides atomic per-workflow state persistence using write-then-rename.
 *
 * Files are stored as `<stateDir>/<instance.id>.json`. Writes use a `.tmp`
 * intermediary to ensure atomicity — a partial write never results in a
 * corrupt final file.
 */
export class WorkflowPersistence {
  private readonly stateDir: string;
  private readonly ttlMs: number;
  private readonly enabled: boolean;

  constructor(config: WorkflowPersistenceConfig) {
    this.stateDir = config.stateDir;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Atomically persist a workflow instance to disk.
   *
   * Uses write-then-rename: writes to `<id>.tmp`, then renames to `<id>.json`.
   * If the write fails for any reason, the error is logged and swallowed —
   * persistence failures must never interrupt workflow execution.
   *
   * @param instance - Any object with an `id: string` field.
   */
  async persist(instance: { id: string; [key: string]: unknown }): Promise<void> {
    if (!this.enabled) return;
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      const tmpPath = path.join(this.stateDir, `${instance.id}.tmp`);
      const finalPath = path.join(this.stateDir, `${instance.id}.json`);
      await fs.writeFile(tmpPath, JSON.stringify(instance, null, 2), 'utf-8');
      await fs.rename(tmpPath, finalPath);
      log.debug('Workflow instance persisted', { id: instance.id });
    } catch (err) {
      log.warn('Failed to persist workflow state', {
        id: instance.id,
        error: String(err),
      });
    }
  }

  /**
   * Restore all persisted workflow instances from disk.
   *
   * Skips malformed files with a warning. Returns an empty array when the
   * state directory does not exist or is empty.
   *
   * @returns Array of parsed workflow instance objects.
   */
  async restore(): Promise<Array<Record<string, unknown>>> {
    if (!this.enabled) return [];
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      const files = await fs.readdir(this.stateDir);
      const instances: Array<Record<string, unknown>> = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.stateDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          instances.push(JSON.parse(content) as Record<string, unknown>);
        } catch {
          log.warn('Failed to restore workflow state file', { file });
        }
      }
      log.debug('Workflow instances restored', { count: instances.length });
      return instances;
    } catch {
      return [];
    }
  }

  /**
   * Remove state files for completed or failed workflows older than `ttlMs`.
   *
   * A workflow file is eligible for removal if:
   * 1. Its `status` field is `'completed'` or `'failed'`.
   * 2. The `completed_at`, `updated_at`, or epoch 0 timestamp is older than TTL.
   *
   * Malformed files and I/O errors are silently skipped.
   *
   * @returns Number of files removed.
   */
  async cleanup(): Promise<number> {
    if (!this.enabled) return 0;
    try {
      const files = await fs.readdir(this.stateDir);
      let removed = 0;
      const now = Date.now();
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.stateDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as Record<string, unknown>;
          const isTerminal =
            data['status'] === 'completed' ||
            data['status'] === 'failed' ||
            data['status'] === 'cancelled' ||
            data['status'] === 'timed_out';
          if (isTerminal) {
            const completedAt =
              (data['completed_at'] as number | undefined) ??
              (data['updated_at'] as number | undefined) ??
              0;
            if (now - completedAt > this.ttlMs) {
              await fs.unlink(filePath);
              removed++;
              log.debug('Removed expired workflow state file', { file });
            }
          }
        } catch {
          // Skip malformed or inaccessible files
        }
      }
      if (removed > 0) {
        log.info('Workflow state cleanup complete', { removed });
      }
      return removed;
    } catch {
      return 0;
    }
  }

  /**
   * Remove the state file for a specific workflow instance.
   *
   * Used when a workflow is explicitly cancelled or deleted. Errors are
   * logged and swallowed.
   *
   * @param instanceId - The workflow instance ID whose file should be removed.
   */
  async remove(instanceId: string): Promise<void> {
    if (!this.enabled) return;
    const filePath = path.join(this.stateDir, `${instanceId}.json`);
    try {
      await fs.unlink(filePath);
      log.debug('Workflow state file removed', { id: instanceId });
    } catch (err) {
      // ENOENT is benign — file may not have been persisted
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        log.warn('Failed to remove workflow state file', {
          id: instanceId,
          error: String(err),
        });
      }
    }
  }
}
