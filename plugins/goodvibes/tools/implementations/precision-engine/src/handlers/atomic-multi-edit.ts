/**
 * atomic_multi_edit handler - Apply multiple file edits atomically
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult, EditSpec, EditResult } from '../types.js';
import { successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { toCallToolResult, ToolHandler } from '../utils/index.js';

const execAsync = promisify(exec);

interface AtomicMultiEditInput {
  edits: EditSpec[];
  validation?: { run_typecheck?: boolean; run_tests?: boolean; run_lint?: boolean };
  dry_run?: boolean;
  output_mode?: OutputMode;
}

interface Backup {
  path: string;
  content: string | null;
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(search, pos)) !== -1) {
    count++;
    pos += 1;
  }
  return count;
}

function findLineNumber(content: string, search: string): number | undefined {
  const index = content.indexOf(search);
  if (index === -1) return undefined;
  return content.substring(0, index).split('\n').length;
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function applyEdit(content: string | null, edit: EditSpec): { content: string; status: EditResult['status']; line?: number; error?: string } {
  switch (edit.operation) {
    case 'create':
      if (content !== null) return { content, status: 'conflict', error: 'File already exists' };
      if (!edit.new_content) return { content: '', status: 'failed', error: 'new_content required' };
      return { content: edit.new_content, status: 'applied', line: 1 };

    case 'replace':
      if (content === null) return { content: '', status: 'not_found', error: 'File does not exist' };
      if (!edit.old_content) return { content, status: 'failed', error: 'old_content required' };
      const occurrences = countOccurrences(content, edit.old_content);
      if (occurrences === 0) return { content, status: 'not_found', error: 'old_content not found' };
      if (occurrences > 1) return { content, status: 'ambiguous', error: `Found ${occurrences} occurrences` };
      return { content: content.replace(edit.old_content, edit.new_content ?? ''), status: 'applied', line: findLineNumber(content, edit.old_content) };

    case 'delete':
      if (content === null) return { content: '', status: 'not_found', error: 'File does not exist' };
      if (!edit.old_content) return { content, status: 'failed', error: 'old_content required' };
      const deleteOccurrences = countOccurrences(content, edit.old_content);
      if (deleteOccurrences === 0) return { content, status: 'not_found', error: 'old_content not found' };
      if (deleteOccurrences > 1) return { content, status: 'ambiguous', error: `Found ${deleteOccurrences} occurrences` };
      return { content: content.replace(edit.old_content, ''), status: 'applied', line: findLineNumber(content, edit.old_content) };

    case 'insert':
      if (!edit.new_content) return { content: content ?? '', status: 'failed', error: 'new_content required' };
      if (!edit.position) return { content: content ?? '', status: 'failed', error: 'position required' };
      const lines = (content ?? '').split('\n');
      const { line, character } = edit.position;
      if (line < 1 || line > lines.length + 1) return { content: content ?? '', status: 'failed', error: 'Invalid line' };
      if (line > lines.length) {
        return { content: (content ?? '') + '\n' + edit.new_content, status: 'applied', line };
      }
      const targetLine = lines[line - 1];
      lines[line - 1] = targetLine.slice(0, character) + edit.new_content + targetLine.slice(character);
      return { content: lines.join('\n'), status: 'applied', line };

    default:
      return { content: content ?? '', status: 'failed', error: `Unknown operation: ${edit.operation}` };
  }
}

export const handleAtomicMultiEdit: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as AtomicMultiEditInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();

  try {
    if (!input.edits || !Array.isArray(input.edits) || input.edits.length === 0) {
      return toCallToolResult(errorResult('edits array is required', outputMode, getElapsed()));
    }

    // Read all files and create backups
    const backups: Backup[] = [];
    const fileContents = new Map<string, string | null>();
    const uniqueFiles = [...new Set(input.edits.map(e => path.resolve(workDir, e.file)))];

    for (const filePath of uniqueFiles) {
      const content = await readFileOrNull(filePath);
      fileContents.set(filePath, content);
      backups.push({ path: filePath, content });
    }

    // Apply edits in memory
    const results: EditResult[] = [];
    const newContents = new Map<string, string>();
    let hasFailures = false;

    for (const edit of input.edits) {
      const filePath = path.resolve(workDir, edit.file);
      const currentContent = newContents.get(filePath) ?? fileContents.get(filePath) ?? null;
      const { content, status, line, error } = applyEdit(currentContent, edit);

      results.push({ file: edit.file, operation: edit.operation, status, line, error });

      if (status === 'applied') {
        newContents.set(filePath, content);
      } else {
        hasFailures = true;
      }
    }

    // If dry run or failures, return without writing
    if (input.dry_run || hasFailures) {
      const applied = results.filter(r => r.status === 'applied').length;
      const failed = results.filter(r => r.status !== 'applied').length;

      let data: unknown;
      switch (outputMode) {
        case 'count_only':
          data = { files_modified: 0, edits_applied: 0, edits_failed: failed, dry_run: input.dry_run };
          break;
        case 'minimal':
          data = { files_modified: 0, edits_applied: 0, edits_failed: failed, results: results.map(r => ({ file: r.file, status: r.status })) };
          break;
        default:
          data = { files_modified: 0, edits_applied: applied, edits_failed: failed, results };
      }
      return toCallToolResult(successResult(data, outputMode, getElapsed()));
    }

    // Write changes
    for (const [filePath, content] of newContents) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }

    // Run validation if requested
    if (input.validation?.run_typecheck) {
      try {
        await execAsync('npx tsc --noEmit', { cwd: workDir, timeout: 60000 });
      } catch (error) {
        // Rollback
        for (const backup of backups) {
          if (backup.content === null) {
            await fs.unlink(backup.path).catch(() => {});
          } else {
            await fs.writeFile(backup.path, backup.content, 'utf-8');
          }
        }
        return toCallToolResult(errorResult(`Typecheck failed, changes rolled back: ${(error as Error).message}`, outputMode, getElapsed()));
      }
    }

    const applied = results.filter(r => r.status === 'applied').length;
    const filesModified = new Set(results.filter(r => r.status === 'applied').map(r => r.file)).size;

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { files_modified: filesModified, edits_applied: applied, edits_failed: 0 };
        break;
      case 'minimal':
        data = { files_modified: filesModified, edits_applied: applied, edits_failed: 0, results: results.map(r => ({ file: r.file, status: r.status })) };
        break;
      default:
        data = { files_modified: filesModified, edits_applied: applied, edits_failed: 0, results };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
