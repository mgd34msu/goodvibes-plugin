/**
 * precision_write handler - Create/write files with encoding support
 * Supports batch writes, dry_run mode, and automatic parent directory creation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode } from '../utils/index.js';

interface WriteFileSpec {
  path: string;
  content: string;
  encoding?: BufferEncoding;
  mode?: 'fail_if_exists' | 'overwrite' | 'backup';
}

interface PrecisionWriteInput {
  files: WriteFileSpec[];
  dry_run?: boolean;
  output_mode?: OutputMode;
}

interface FileWriteResult {
  path: string;
  success: boolean;
  action: 'created' | 'overwritten' | 'backed_up' | 'skipped';
  bytes_written?: number;
  backup_path?: string;
  error?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function generateBackupPath(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length || undefined);
  return `${base}.backup-${timestamp}${ext}`;
}

async function writeFile(
  spec: WriteFileSpec,
  dryRun: boolean,
  workDir: string
): Promise<FileWriteResult> {
  const filePath = path.isAbsolute(spec.path) ? spec.path : path.join(workDir, spec.path);
  const encoding = spec.encoding ?? 'utf-8';
  const mode = spec.mode ?? 'fail_if_exists';

  try {
    const exists = await fileExists(filePath);

    if (exists) {
      switch (mode) {
        case 'fail_if_exists':
          return {
            path: spec.path,
            success: false,
            action: 'skipped',
            error: 'File already exists and mode is fail_if_exists',
          };

        case 'backup':
          if (!dryRun) {
            const backupPath = generateBackupPath(filePath);
            await fs.copyFile(filePath, backupPath);
            await fs.writeFile(filePath, spec.content, { encoding });
            return {
              path: spec.path,
              success: true,
              action: 'backed_up',
              bytes_written: Buffer.byteLength(spec.content, encoding),
              backup_path: path.relative(workDir, backupPath),
            };
          }
          return {
            path: spec.path,
            success: true,
            action: 'backed_up',
            bytes_written: Buffer.byteLength(spec.content, encoding),
          };

        case 'overwrite':
          if (!dryRun) {
            await fs.writeFile(filePath, spec.content, { encoding });
          }
          return {
            path: spec.path,
            success: true,
            action: 'overwritten',
            bytes_written: Buffer.byteLength(spec.content, encoding),
          };
      }
    }

    // File doesn't exist - create it
    if (!dryRun) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, spec.content, { encoding });
    }

    return {
      path: spec.path,
      success: true,
      action: 'created',
      bytes_written: Buffer.byteLength(spec.content, encoding),
    };
  } catch (error) {
    return {
      path: spec.path,
      success: false,
      action: 'skipped',
      error: (error as Error).message,
    };
  }
}

export const handlePrecisionWrite: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionWriteInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();
  const dryRun = input.dry_run ?? false;

  try {
    if (!input.files || !Array.isArray(input.files) || input.files.length === 0) {
      return toCallToolResult(errorResult('files array is required', outputMode, getElapsed()));
    }

    const results = await Promise.all(
      input.files.map(f => writeFile(f, dryRun, workDir))
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalBytes = results.reduce((sum, r) => sum + (r.bytes_written ?? 0), 0);

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { files_written: successful, files_failed: failed, total_bytes: totalBytes, dry_run: dryRun };
        break;
      case 'minimal':
        data = { files_written: successful, files_failed: failed, dry_run: dryRun, results: results.map(r => ({ path: r.path, success: r.success, action: r.action })) };
        break;
      default:
        data = { files_written: successful, files_failed: failed, total_bytes: totalBytes, dry_run: dryRun, results };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
