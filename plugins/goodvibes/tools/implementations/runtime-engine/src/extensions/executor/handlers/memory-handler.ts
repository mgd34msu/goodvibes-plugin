/**
 * Memory Handler
 *
 * TriggerActionHandler implementation that updates `.goodvibes/memory/*.json`
 * files in response to trigger events. Reads the existing file, applies the
 * update, and writes it back atomically.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import type { TriggerActionHandler } from '../../../core/types.js';

const log = createLogger('handler:memory');

/** Allowlist of valid memory file base names (without .json extension). */
const ALLOWED_MEMORY_FILES = new Set([
  'decisions',
  'failures',
  'patterns',
  'preferences',
  'runtime-state',
]);

/**
 * Safely reads and parses a JSON file, returning an empty object on any error.
 *
 * @param filePath - Absolute path to the JSON file.
 * @returns Parsed object, or `{}` if the file does not exist or is invalid.
 */
async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Factory that creates a TriggerActionHandler that updates a memory JSON file.
 *
 * Expected trigger args:
 * - `file`  (string) — base name of the memory file (e.g. `'failures'`, `'decisions'`).
 * - `key`   (string) — top-level key within the JSON object to set.
 * - `value` (any)   — value to store at `key`.
 *
 * The file is resolved to `<projectRoot>/.goodvibes/memory/<file>.json`.
 * Only files in the allowlist are permitted to prevent path traversal.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A TriggerActionHandler.
 */
export function updateMemory(projectRoot: string): TriggerActionHandler {
  return async (
    args: Record<string, unknown>,
    _event: RuntimeEvent,
  ): Promise<void> => {
    const file = typeof args['file'] === 'string' ? args['file'] : '';
    const key = typeof args['key'] === 'string' ? args['key'] : '';
    const value = args['value'];

    if (!file) {
      log.warn('updateMemory called without args.file');
      return;
    }
    if (!key) {
      log.warn('updateMemory called without args.key', { file });
      return;
    }

    // Sanitise: allow only known file names, block path traversal
    const safeName = file.replace(/[^a-z0-9-]/gi, '');
    if (!ALLOWED_MEMORY_FILES.has(safeName)) {
      log.warn('updateMemory blocked unknown memory file', { file, safeName });
      return;
    }

    const memoryDir = join(projectRoot, '.goodvibes', 'memory');
    const filePath = join(memoryDir, `${safeName}.json`);

    try {
      await mkdir(dirname(filePath), { recursive: true });
      const existing = await readJsonFile(filePath);
      existing[key] = value;
      await writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8');
      log.info('Memory updated', { file: safeName, key, filePath });
    } catch (err) {
      log.error('Failed to update memory file', { error: toErrorMessage(err), filePath, key });
    }
  };
}
