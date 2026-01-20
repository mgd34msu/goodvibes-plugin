/**
 * batch_read handler - Read multiple files with per-file precision
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult, FileReadResult } from '../types.js';
import { successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { toCallToolResult, ToolHandler } from './index.js';

interface FileSpec {
  path: string;
  offset?: number;
  limit?: number;
}

interface BatchReadInput {
  files: (string | FileSpec)[];
  output_mode?: OutputMode;
}

function normalizeFileSpec(file: string | FileSpec): FileSpec {
  return typeof file === 'string' ? { path: file } : file;
}

async function readSingleFile(spec: FileSpec, workDir: string): Promise<FileReadResult> {
  const filePath = path.isAbsolute(spec.path) ? spec.path : path.join(workDir, spec.path);

  try {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');

    const offset = spec.offset ?? 0;
    const limit = spec.limit ?? allLines.length;
    const lines = allLines.slice(offset, offset + limit);

    return {
      path: spec.path,
      exists: true,
      content: lines.join('\n'),
      lines,
      line_count: lines.length,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      truncated: offset + limit < allLines.length,
    };
  } catch (error) {
    return {
      path: spec.path,
      exists: false,
      error: (error as Error).message,
    };
  }
}

export const handleBatchRead: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as BatchReadInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();

  try {
    if (!input.files || !Array.isArray(input.files) || input.files.length === 0) {
      return toCallToolResult(errorResult('files array is required', outputMode, getElapsed()));
    }

    const specs = input.files.map(normalizeFileSpec);
    const results = await Promise.all(specs.map(spec => readSingleFile(spec, workDir)));

    const filesRead = results.filter(r => r.exists).length;
    const totalLines = results.reduce((sum, r) => sum + (r.line_count || 0), 0);

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { files_read: filesRead, total_lines: totalLines };
        break;
      case 'minimal':
        data = results.map(r => ({ path: r.path, exists: r.exists, line_count: r.line_count }));
        break;
      case 'verbose':
        data = results;
        break;
      default: // standard
        data = results.map(r => ({ path: r.path, exists: r.exists, content: r.content, line_count: r.line_count }));
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
