import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';

export interface RipgrepSearchOptions {
  pattern: string;
  path: string;
  glob?: string;
  exclude?: string[];
  caseInsensitive?: boolean;
  wholeWord?: boolean;
  multiline?: boolean;
  includeBinary?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  maxCount?: number;
  maxColumns?: number;
  timeoutMs?: number;
}

export interface RipgrepMatch {
  file: string;
  line: number;
  column: number;
  matchText: string;
  lineContent: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

export interface RipgrepSearchResult {
  matches: RipgrepMatch[];
  fileCount: number;
  matchCount: number;
  truncated: boolean;
}

export interface RipgrepListOptions {
  timeoutMs?: number;
  patterns?: string[];
  path: string;
  exclude?: string[];
}

interface RipgrepJsonMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

interface RipgrepJsonContext {
  type: 'context';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

interface RipgrepJsonSummary {
  type: 'summary';
  data: {
    elapsed_total: {
      secs: number;
      nanos: number;
    };
    stats: {
      searches: number;
      matched_lines: number;
    };
  };
}

type RipgrepJsonOutput = RipgrepJsonMatch | RipgrepJsonContext | RipgrepJsonSummary;

/**
 * Core wrapper around ripgrep binary for fast search and file discovery.
 * Uses @vscode/ripgrep for cross-platform binary access.
 */
export class RipgrepCore {
  /**
   * Search for pattern in files and return structured match results.
   */
  async search(options: RipgrepSearchOptions): Promise<RipgrepSearchResult> {
    const args = this.buildSearchArgs(options);

    try {
      const output = await this.executeRipgrep(args, options.timeoutMs);
      return this.parseSearchResults(output, options);
    } catch (error) {
      throw new Error(`Ripgrep search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List files matching patterns (equivalent to rg --files).
   */
  async listFiles(options: RipgrepListOptions): Promise<string[]> {
    const args = ['--files'];

    if (options.patterns && options.patterns.length > 0) {
      args.push(...options.patterns.flatMap(p => ['--glob', p]));
    }

    if (options.exclude && options.exclude.length > 0) {
      args.push(...options.exclude.flatMap(e => ['--glob', `!${e}`]));
    }

    args.push(options.path);

    try {
      const output = await this.executeRipgrep(args, options.timeoutMs);
      return this.parseFileList(output);
    } catch (error) {
      throw new Error(`Ripgrep list files failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get list of files that contain matches (equivalent to rg -l).
   */
  async filesWithMatches(pattern: string, path: string, glob?: string, timeoutMs?: number): Promise<string[]> {
    const args = ['--files-with-matches', '--json', pattern];

    if (glob) {
      args.push('--glob', glob);
    }

    args.push(path);

    try {
      const output = await this.executeRipgrep(args, timeoutMs);
      return this.parseFilesWithMatches(output);
    } catch (error) {
      throw new Error(`Ripgrep files with matches failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build ripgrep command line arguments from search options.
   */
  private buildSearchArgs(options: RipgrepSearchOptions): string[] {
    const args = ['--json'];

    // Pattern and path
    args.push(options.pattern);

    // File filtering
    if (options.glob) {
      args.push('--glob', options.glob);
    }

    if (options.exclude && options.exclude.length > 0) {
      options.exclude.forEach(pattern => {
        args.push('--glob', `!${pattern}`);
      });
    }

    // Search behavior
    if (options.caseInsensitive) {
      args.push('--ignore-case');
    }

    if (options.wholeWord) {
      args.push('--word-regexp');
    }

    if (options.multiline) {
      args.push('--multiline');
    }

    if (options.includeBinary) {
      args.push('--text');
    }

    // Context lines
    if (options.contextBefore !== undefined && options.contextBefore > 0) {
      args.push('--before-context', String(options.contextBefore));
    }

    if (options.contextAfter !== undefined && options.contextAfter > 0) {
      args.push('--after-context', String(options.contextAfter));
    }

    // Limits
    if (options.maxCount !== undefined && options.maxCount > 0) {
      args.push('--max-count', String(options.maxCount));
    }

    if (options.maxColumns !== undefined && options.maxColumns > 0) {
      args.push('--max-columns', String(options.maxColumns));
    }

    args.push(options.path);

    return args;
  }

  /**
   * Execute ripgrep binary and return output.
   */
  private executeRipgrep(args: string[], timeoutMs?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(rgPath, args);

      // Set up timeout
      const timeout = timeoutMs ?? 30000;
      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Ripgrep search timed out after ${timeout}ms`));
      }, timeout);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
    clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn ripgrep: ${error.message}`));
      });

      process.on('close', (code) => {
        clearTimeout(timeoutId);
        // ripgrep returns:
        // 0 - matches found
        // 1 - no matches found (not an error)
        // 2+ - error
        if (code !== null && code > 1) {
          reject(new Error(`Ripgrep exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }


  /**
   * Parse ripgrep JSON output line-by-line.
   */
  private parseJsonOutput(output: string): RipgrepJsonOutput[] {
    const records: RipgrepJsonOutput[] = [];
    for (const line of output.split('\n')) {
      if (line.trim()) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
    return records;
  }
  private parseSearchResults(output: string, options: RipgrepSearchOptions): RipgrepSearchResult {
    const matches: RipgrepMatch[] = [];
    const files = new Set<string>();
    let totalMatches = 0;
    let truncated = false;

    // Parse all JSON records first
    const records = this.parseJsonOutput(output);

    // Process records with two-pass context handling
    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      if (record.type === 'match') {
        const { data } = record;
        const file = data.path.text;
        const lineNumber = data.line_number;
        const lineContent = data.lines.text.replace(/\n$/, '');

        files.add(file);

        // Look backward for contextBefore
        const contextBefore: string[] = [];
        if (options.contextBefore && options.contextBefore > 0) {
          for (let j = i - 1; j >= 0 && contextBefore.length < options.contextBefore; j--) {
            const prevRecord = records[j];
            if (prevRecord.type === 'context' && prevRecord.data.path.text === file && prevRecord.data.line_number < lineNumber) {
              contextBefore.unshift(prevRecord.data.lines.text.replace(/\n$/, ''));
            } else if (prevRecord.type === 'match') {
              break; // Stop at previous match
            }
          }
        }

        // Look forward for contextAfter
        const contextAfter: string[] = [];
        if (options.contextAfter && options.contextAfter > 0) {
          for (let j = i + 1; j < records.length && contextAfter.length < options.contextAfter; j++) {
            const nextRecord = records[j];
            if (nextRecord.type === 'context' && nextRecord.data.path.text === file && nextRecord.data.line_number > lineNumber) {
              contextAfter.push(nextRecord.data.lines.text.replace(/\n$/, ''));
            } else if (nextRecord.type === 'match') {
              break; // Stop at next match
            }
          }
        }

        // Extract match text from submatches
        for (const submatch of data.submatches) {
          const match: RipgrepMatch = {
            file,
            line: lineNumber,
            column: submatch.start + 1, // ripgrep uses 0-based columns
            matchText: submatch.match.text,
            lineContent,
          };

          if (contextBefore.length > 0) {
            match.contextBefore = contextBefore;
          }

          if (contextAfter.length > 0) {
            match.contextAfter = contextAfter;
          }

          matches.push(match);
          totalMatches++;
        }
      } else if (record.type === 'summary') {
        // Check if results were truncated by max-count
        if (options.maxCount && totalMatches >= options.maxCount) {
          truncated = true;
        }
      }
    }

    return {
      matches,
      fileCount: files.size,
      matchCount: totalMatches,
      truncated,
    };
  }

  /**
   * Parse file list from ripgrep --files output.
   */
  private parseFileList(output: string): string[] {
    return output.trim().split('\n').filter(Boolean);
  }

  /**
   * Parse files with matches from ripgrep -l output.
   */
  private parseFilesWithMatches(output: string): string[] {
    const files: string[] = [];
    const lines = output.trim().split('\n').filter(line => line.length > 0);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'match' && json.data?.path?.text) {
          files.push(json.data.path.text);
        }
      } catch (error) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return Array.from(new Set(files)); // Deduplicate
  }
}
