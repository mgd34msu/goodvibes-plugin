/**
 * precision_write handler - Create/write files with encoding support
 * SPEC-v2 Section 13.1.6 compliant
 *
 * Features:
 * - Template engine support (handlebars, ejs, none)
 * - Atomic transactions with rollback
 * - Post-write validation
 * - Multiple output modes (count_only, minimal, with_preview, verbose)
 * - tokens_used tracking
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { startTimer, estimateTokens } from '../logging.js';
import type { OutputMode, ValidationStep, ValidationResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, parseJsonField } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { randomUUID } from 'crypto';
import { validateFilePath } from '../utils/path-validation.js';
import { FileStateCache } from '../state/file-cache.js';
import { performSafeOverwrite } from '../utils/safe-overwrite.js';

// Simple template engines - inline to avoid extra dependencies
function renderHandlebars(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(data[key] ?? '');
  });
}

function renderEjs(template: string, data: Record<string, unknown>): string {
  // Simple EJS-like: <%= var %> for escaped, <%- var %> for unescaped
  return template
    .replace(/<%=\s*(\w+)\s*%>/g, (_, key) => {
      const val = String(data[key] ?? '');
      return val.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
    })
    .replace(/<%-\s*(\w+)\s*%>/g, (_, key) => String(data[key] ?? ''));
}

interface WriteSpec {
  path: string;
  content?: string;
  content_base64?: string;
  content_file?: string;
  encoding?: BufferEncoding;
  mode?: 'fail_if_exists' | 'overwrite' | 'backup';
}

interface TemplateConfig {
  engine: 'handlebars' | 'ejs' | 'none';
  data?: Record<string, unknown>;
}

interface TransactionConfig {
  mode: 'atomic' | 'partial' | 'none';
}

interface ValidationConfig {
  after?: ValidationStep[];
}

interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'with_preview' | 'verbose';
  preview_lines?: number;
  max_tokens?: number;
}

interface PrecisionWriteInput {
  files: WriteSpec[];
  overwrite?: boolean;
  create_dirs?: boolean;
  backup?: boolean;
  template?: TemplateConfig;
  transaction?: TransactionConfig;
  validate?: ValidationConfig;
  dry_run?: boolean;
  output?: OutputConfig;
  output_mode?: OutputMode;  // Legacy support
}

interface WriteResult {
  path: string;
  status: 'created' | 'overwritten' | 'skipped' | 'failed';
  size?: number;
  error?: string;
  preview?: string[];
  safety?: {
    first_overwrite: boolean;
    pre_snapshot?: string;
    backup?: string;
    git_status?: 'clean' | 'dirty' | 'staged' | 'untracked' | null;
    warning?: string;
    recoverable_via?: string;
  };
}

interface RollbackInfo {
  path: string;
  backup_path?: string;
  was_new: boolean;
}

// Store rollback info for atomic transactions
const rollbackStore = new Map<string, RollbackInfo[]>();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveContent(spec: WriteSpec, workDir: string): Promise<string> {
  const sources = [spec.content, spec.content_base64, spec.content_file].filter(Boolean);
  if (sources.length > 1) {
    throw new Error("Cannot specify multiple content sources. Use only one of: content, content_base64, content_file");
  }
  if (spec.content_base64) {
    try {
      return Buffer.from(spec.content_base64, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error(`Invalid base64 in content_base64: ${(e as Error).message}`);
    }
  }
  if (spec.content_file) {
    try {
      // Validate content_file path against sandbox boundary (content_file must exist)
      const contentFilePath = path.isAbsolute(spec.content_file) ? spec.content_file : path.join(workDir, spec.content_file);
      await validateFilePath(contentFilePath, workDir, true);
      return await fs.readFile(contentFilePath, 'utf-8');
    } catch (e) {
      throw new Error(`Failed to read content_file '${spec.content_file}': ${(e as Error).message}`);
    }
  }
  if (spec.content === undefined) {
    throw new Error("One of 'content', 'content_base64', or 'content_file' is required.");
  }
  return spec.content;
}

/**
 * Generate inline backup path for mode:'backup' writes.
 * Separate from safe-overwrite.ts generateBackupPath which uses a dedicated backup directory.
 * Path traversal is not a concern here because filePath was already validated by validateFilePath().
 * @param filePath - Already-validated absolute file path
 * @returns Inline backup path adjacent to the original file
 */
function generateBackupPath(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length || undefined);
  return `${base}.backup-${timestamp}${ext}`;
}

function applyTemplate(content: string, template?: TemplateConfig): string {
  if (!template || template.engine === 'none' || !template.data) {
    return content;
  }

  switch (template.engine) {
    case 'handlebars':
      return renderHandlebars(content, template.data);
    case 'ejs':
      return renderEjs(content, template.data);
    default:
      return content;
  }
}

async function runValidation(files: string[], steps: ValidationStep[]): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let fixed = 0;

  for (const step of steps) {
    let cmd: string;
    let args: string[] = [];

    switch (step.type) {
      case 'typescript':
        cmd = 'npx';
        args = ['tsc', '--noEmit', ...files];
        break;
      case 'eslint':
        cmd = 'npx';
        args = ['eslint', ...(step.fix ? ['--fix'] : []), ...files];
        break;
      case 'prettier':
        cmd = 'npx';
        args = ['prettier', ...(step.fix ? ['--write'] : ['--check']), ...files];
        break;
      case 'custom':
        if (!step.command) continue;
        const parts = step.command.split(' ');
        cmd = parts[0];
        args = [...parts.slice(1), ...files];
        break;
      default:
        continue;
    }

    try {
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const proc = spawn(cmd, args, { shell: true, windowsHide: true });
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          resolve({ code: code ?? 1, stdout, stderr });
        });

        proc.on('error', (err) => {
          resolve({ code: 1, stdout: '', stderr: err.message });
        });
      });

      if (result.code !== 0) {
        errors.push(`${step.type}: ${result.stderr || result.stdout}`.slice(0, 500));
      } else if (step.fix) {
        fixed++;
      }
    } catch (err) {
      errors.push(`${step.type} validation failed: ${(err as Error).message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    fixed: fixed > 0 ? fixed : undefined,
  };
}

async function writeFile(
  spec: WriteSpec,
  dryRun: boolean,
  workDir: string,
  options: {
    overwrite: boolean;
    createDirs: boolean;
    backup: boolean;
    template?: TemplateConfig;
    previewLines?: number;
  }
): Promise<{ result: WriteResult; rollback?: RollbackInfo }> {
  const filePath = path.isAbsolute(spec.path) ? spec.path : path.join(workDir, spec.path);
  const encoding = spec.encoding ?? 'utf-8';

  // Validate path against sandbox boundary (mustExist=false since we may be creating new files)
  const validatedPath = await validateFilePath(filePath, workDir, false);

  try {
    const exists = await fileExists(validatedPath);

    // Resolve content from spec
    const resolvedContent = await resolveContent(spec, workDir);

    // Apply template
    const content = applyTemplate(resolvedContent, options.template);
    const size = Buffer.byteLength(content, encoding);

    // Generate preview
    const preview = options.previewLines
      ? content.split('\n').slice(0, options.previewLines)
      : undefined;

    // Determine effective overwrite/backup from spec.mode or global options
    let effectiveOverwrite = options.overwrite;
    let effectiveBackup = options.backup;

    if (spec.mode) {
      switch (spec.mode) {
        case 'fail_if_exists':
          effectiveOverwrite = false;
          effectiveBackup = false;
          break;
        case 'overwrite':
          effectiveOverwrite = true;
          effectiveBackup = false;
          break;
        case 'backup':
          effectiveOverwrite = true;
          effectiveBackup = true;
          break;
        default:
          // Exhaustiveness check - TypeScript will error if a case is missed
          const _exhaustive: never = spec.mode;
          throw new Error(`Unknown mode: ${_exhaustive}`);
      }
    }

    if (exists && !effectiveOverwrite) {
      const reason = spec.mode === 'fail_if_exists'
        ? 'File exists and mode=fail_if_exists'
        : 'File exists and overwrite=false';
      return {
        result: {
          path: spec.path,
          status: 'skipped',
          error: reason,
        },
      };
    }

    // Layer 3: Safe overwrite detection and handling
    let safeOverwriteResult;
    if (exists && effectiveOverwrite && !dryRun) {
      safeOverwriteResult = await performSafeOverwrite(validatedPath, workDir, exists);
    }

    let rollback: RollbackInfo | undefined;

    if (!dryRun) {
      // Create parent directories
      if (options.createDirs) {
        await fs.mkdir(path.dirname(validatedPath), { recursive: true });
      }

      // Backup existing file
      if (exists && effectiveBackup) {
        const backupPath = generateBackupPath(validatedPath);
        await fs.copyFile(validatedPath, backupPath);
        rollback = { path: validatedPath, backup_path: backupPath, was_new: false };
      } else if (!exists) {
        rollback = { path: validatedPath, was_new: true };
      } else {
        rollback = { path: validatedPath, was_new: false };
      }

      // Write the file
      await fs.writeFile(validatedPath, content, { encoding });

      // Update FileStateCache with new content
      try {
        const cache = FileStateCache.getInstance();
        cache.update(validatedPath, content, 'precision_write', undefined, `wrote ${spec.path}`);
      } catch {
        // Cache update is non-critical — don't fail the write
      }
    }

    // Build safety metadata if we performed safe overwrite
    let safety;
    if (safeOverwriteResult && (safeOverwriteResult.backupPath || safeOverwriteResult.snapshotVersion || safeOverwriteResult.warning)) {
      safety = {
        first_overwrite: true,
        pre_snapshot: safeOverwriteResult.snapshotVersion 
          ? `cached (version ${safeOverwriteResult.snapshotVersion})` 
          : undefined,
        backup: safeOverwriteResult.backupPath,
        git_status: safeOverwriteResult.gitStatus.status,
        warning: safeOverwriteResult.warning,
        recoverable_via: safeOverwriteResult.recoverableVia,
      };
    }

    return {
      result: {
        path: spec.path,
        status: exists ? 'overwritten' : 'created',
        size,
        preview,
        safety,
      },
      rollback,
    };
  } catch (error) {
    return {
      result: {
        path: spec.path,
        status: 'failed',
        error: (error as Error).message,
      },
    };
  }
}

async function performRollback(rollbackId: string): Promise<void> {
  const infos = rollbackStore.get(rollbackId);
  if (!infos) return;

  for (const info of infos) {
    try {
      if (info.was_new) {
        // Delete newly created file
        await fs.unlink(info.path);
      } else if (info.backup_path) {
        // Restore from backup
        await fs.copyFile(info.backup_path, info.path);
        await fs.unlink(info.backup_path);
      }
    } catch {
      // Best effort rollback
    }
  }

  rollbackStore.delete(rollbackId);
}

export const handlePrecisionWrite: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionWriteInput;
  const input = { ...rawInput, files: parseJsonField(rawInput.files) } as PrecisionWriteInput;
  const outputMode = parseOutputMode(args, "precision_write");
  const workDir = process.cwd();
  const dryRun = input.dry_run ?? false;

  // Parse options with defaults
  const overwrite = input.overwrite ?? false;
  const createDirs = input.create_dirs ?? true;
  const backup = input.backup ?? true;
  const transactionMode = input.transaction?.mode ?? 'none';
  const previewLines = input.output?.preview_lines ?? 10;

  try {
    if (!input.files || !Array.isArray(input.files) || input.files.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_write', 'files', 'array of file specifications'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    const results: WriteResult[] = [];
    const rollbackInfos: RollbackInfo[] = [];
    let rollbackId: string | undefined;

    // For atomic mode, generate rollback ID
    if (transactionMode === 'atomic' && !dryRun) {
      rollbackId = randomUUID();
    }

    // Write all files
    for (const spec of input.files) {
      const { result, rollback } = await writeFile(spec, dryRun, workDir, {
        overwrite,
        createDirs,
        backup,
        template: input.template,
        previewLines: outputMode === 'with_preview' || outputMode === 'verbose' ? previewLines : 0,
      });

      results.push(result);
      if (rollback) rollbackInfos.push(rollback);

      // For atomic mode, rollback on any failure
      if (transactionMode === 'atomic' && result.status === 'failed' && rollbackInfos.length > 0) {
        // Rollback all previous writes
        for (const info of rollbackInfos) {
          try {
            if (info.was_new) {
              await fs.unlink(info.path);
            } else if (info.backup_path) {
              await fs.copyFile(info.backup_path, info.path);
              await fs.unlink(info.backup_path);
            }
          } catch {
            // Best effort
          }
        }
        break;
      }

      // For partial mode, just stop on failure (no rollback)
      if (transactionMode === 'partial' && result.status === 'failed') {
        break;
      }
    }

    // Store rollback info for later if atomic and successful
    if (rollbackId && rollbackInfos.length > 0) {
      rollbackStore.set(rollbackId, rollbackInfos);
      // Auto-cleanup after 5 minutes
      setTimeout(() => rollbackStore.delete(rollbackId), 5 * 60 * 1000);
    }

    // Run post-write validation
    let validation: ValidationResult | undefined;
    if (input.validate?.after && input.validate.after.length > 0 && !dryRun) {
      const writtenFiles = results
        .filter(r => r.status === 'created' || r.status === 'overwritten')
        .map(r => path.isAbsolute(r.path) ? r.path : path.join(workDir, r.path));

      if (writtenFiles.length > 0) {
        validation = await runValidation(writtenFiles, input.validate.after);
      }
    }

    // Calculate summary
    const filesCreated = results.filter(r => r.status === 'created').length;
    const filesOverwritten = results.filter(r => r.status === 'overwritten').length;
    const filesFailed = results.filter(r => r.status === 'failed').length;
    const bytesWritten = results.reduce((sum, r) => sum + (r.size ?? 0), 0);

    // Build response based on output mode
    let data: Record<string, unknown>;

    switch (outputMode) {
      case 'count_only':
        data = {
          summary: {
            files_created: filesCreated,
            files_overwritten: filesOverwritten,
            files_failed: filesFailed,
            bytes_written: bytesWritten,
          },
          dry_run: dryRun,
        };
        break;

      case 'minimal':
        data = {
          files: results.map(r => ({
            path: r.path,
            status: r.status,
            ...(r.safety && { safety: r.safety }),
          })),
          summary: {
            files_created: filesCreated,
            files_overwritten: filesOverwritten,
            files_failed: filesFailed,
            bytes_written: bytesWritten,
          },
          dry_run: dryRun,
        };
        break;

      case 'with_preview':
        data = {
          files: results.map(r => ({
            path: r.path,
            status: r.status,
            size: r.size,
            preview: r.preview,
            error: r.error,
            ...(r.safety && { safety: r.safety }),
          })),
          summary: {
            files_created: filesCreated,
            files_overwritten: filesOverwritten,
            files_failed: filesFailed,
            bytes_written: bytesWritten,
          },
          dry_run: dryRun,
        };
        break;

      case 'verbose':
      default:
        data = {
          files: results,
          summary: {
            files_created: filesCreated,
            files_overwritten: filesOverwritten,
            files_failed: filesFailed,
            bytes_written: bytesWritten,
          },
          dry_run: dryRun,
        };
        break;
    }

    // Add optional fields
    if (validation) {
      data.validation = validation;
    }
    if (rollbackId) {
      data.rollback_id = rollbackId;
    }

    // Calculate tokens_used
    const responseJson = JSON.stringify(data);
    data.tokens_used = estimateTokens(responseJson);

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
