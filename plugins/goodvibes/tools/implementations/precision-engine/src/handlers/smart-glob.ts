/**
 * smart_glob handler - Find files with intelligent filtering
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult, GlobResult } from '../types.js';
import { successResult, errorResult, parseOutputMode, isTextFile } from '../utils/index.js';
import { toCallToolResult, ToolHandler } from '../utils/index.js';
import { DEFAULT_EXCLUDES } from '../config.js';

interface SmartGlobInput {
  patterns: string[];
  exclude?: string[];
  limit?: number;
  preview?: { enabled: boolean; lines?: number };
  output_mode?: OutputMode;
}

export const handleSmartGlob: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as SmartGlobInput;
  const outputMode = parseOutputMode(args);

  try {
    if (!input.patterns || !Array.isArray(input.patterns) || input.patterns.length === 0) {
      return toCallToolResult(errorResult('patterns array is required', outputMode, getElapsed()));
    }

    const excludes = [...DEFAULT_EXCLUDES, ...(input.exclude || [])];
    const limit = input.limit ?? 100;

    const files = await fg(input.patterns, {
      ignore: excludes,
      dot: false,
      onlyFiles: true,
      absolute: true,
      stats: outputMode !== 'count_only',
    });

    // Get stats and sort by modification time
    const fileInfos: Array<{ path: string; size: number; modified: Date }> = [];

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        fileInfos.push({
          path: file,
          size: stats.size,
          modified: stats.mtime,
        });
      } catch {
        // Skip files we can't stat
      }
    }

    fileInfos.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    const limited = fileInfos.slice(0, limit);

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = {
          total_files: fileInfos.length,
          total_size: fileInfos.reduce((sum, f) => sum + f.size, 0),
        };
        break;
      case 'minimal':
        data = limited.map(f => f.path);
        break;
      default: // standard
        const results: GlobResult[] = await Promise.all(
          limited.map(async (f): Promise<GlobResult> => {
            const result: GlobResult = {
              path: f.path,
              size: f.size,
              modified: f.modified.toISOString(),
            };

            if (input.preview?.enabled && isTextFile(f.path)) {
              try {
                const content = await fs.readFile(f.path, 'utf-8');
                const lines = content.split('\n').slice(0, input.preview.lines ?? 10);
                result.preview = lines;
              } catch {
                // Skip preview on error
              }
            }

            return result;
          })
        );
        data = results;
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
