/**
 * grep_with_content handler - Search files with regex and context
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult, GrepMatch } from '../types.js';
import { successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { toCallToolResult, ToolHandler } from './index.js';
import { DEFAULT_EXCLUDES } from '../config.js';

interface GrepWithContentInput {
  pattern: string;
  glob?: string;
  paths?: string[];
  max_matches?: number;
  context_before?: number;
  context_after?: number;
  output_mode?: OutputMode;
}

export const handleGrepWithContent: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as GrepWithContentInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();

  try {
    if (!input.pattern) {
      return toCallToolResult(errorResult('pattern is required', outputMode, getElapsed()));
    }

    if (!input.glob && (!input.paths || input.paths.length === 0)) {
      return toCallToolResult(errorResult('Either glob or paths must be provided', outputMode, getElapsed()));
    }

    const regex = new RegExp(input.pattern, 'g');
    const maxMatches = input.max_matches ?? 100;
    const contextBefore = input.context_before ?? 0;
    const contextAfter = input.context_after ?? 0;

    // Get files to search
    let files: string[];
    if (input.paths && input.paths.length > 0) {
      files = input.paths.map(p => path.isAbsolute(p) ? p : path.join(workDir, p));
    } else {
      files = await fg(input.glob!, {
        ignore: DEFAULT_EXCLUDES,
        absolute: true,
        onlyFiles: true,
      });
    }

    const matches: GrepMatch[] = [];
    const filesWithMatches = new Set<string>();
    let totalMatches = 0;

    for (const filePath of files) {
      if (totalMatches >= maxMatches) break;

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(workDir, filePath);

        for (let i = 0; i < lines.length && totalMatches < maxMatches; i++) {
          const line = lines[i];
          regex.lastIndex = 0;

          let match: RegExpExecArray | null;
          while ((match = regex.exec(line)) !== null && totalMatches < maxMatches) {
            filesWithMatches.add(relativePath);
            totalMatches++;

            const before: string[] = [];
            const after: string[] = [];

            if (contextBefore > 0) {
              for (let j = Math.max(0, i - contextBefore); j < i; j++) {
                before.push(lines[j]);
              }
            }

            if (contextAfter > 0) {
              for (let j = i + 1; j <= Math.min(lines.length - 1, i + contextAfter); j++) {
                after.push(lines[j]);
              }
            }

            matches.push({
              file: relativePath,
              line: i + 1,
              column: match.index + 1,
              content: line,
              before,
              after,
            });

            if (match[0].length === 0) regex.lastIndex++;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { file_count: filesWithMatches.size, match_count: totalMatches };
        break;
      case 'minimal':
        data = { file_count: filesWithMatches.size, match_count: totalMatches, files: Array.from(filesWithMatches) };
        break;
      case 'verbose':
        data = matches;
        break;
      default: // standard
        data = matches.map(m => ({ file: m.file, line: m.line, column: m.column, content: m.content }));
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
