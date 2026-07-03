/**
 * ripgrep binary wrapper — the search backend for code_grep and (via
 * `--files`) code_glob.
 *
 * Ported from v1 `precision-engine/src/core/ripgrep.ts` verbatim aside from
 * one change: binary resolution. `@vscode/ripgrep` is not installed in this
 * workspace yet (it is declared as a runtime dep in
 * `plugins/goodvibes/server/intel/package.json`, installed on first plugin
 * run — see build.mjs externals). `resolveRgPath()` prefers the pinned
 * `@vscode/ripgrep` binary when present, and falls back to a `rg` on PATH
 * otherwise (covers this dev sandbox, which has a system ripgrep, and any
 * environment where the plugin's first-run install has not happened yet).
 * FLAG: once `npm install` resolves `@vscode/ripgrep` for this workspace, the
 * fallback branch simply stops firing — no code change needed.
 */

import { spawn } from 'child_process';

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
  hidden?: boolean;
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
  /**
   * Best-effort per-file cap signal: true only when a maxCount was requested
   * AND at least one file emitted maxCount matched lines. Always false when no
   * maxCount was passed.
   */
  truncated: boolean;
}

export interface RipgrepListOptions {
  timeoutMs?: number;
  patterns?: string[];
  path: string;
  exclude?: string[];
  hidden?: boolean;
  /** Pass --no-ignore so ripgrep skips .gitignore/.ignore handling. */
  noIgnore?: boolean;
}

interface RipgrepJsonMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{ match: { text: string }; start: number; end: number }>;
  };
}

interface RipgrepJsonContext {
  type: 'context';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{ match: { text: string }; start: number; end: number }>;
  };
}

interface RipgrepJsonSummary {
  type: 'summary';
  data: unknown;
}

type RipgrepJsonOutput = RipgrepJsonMatch | RipgrepJsonContext | RipgrepJsonSummary;

// Plain global `require` — NOT `createRequire(import.meta.url)`. This module
// is authored as ESM but bundled to CJS by esbuild (build.mjs); esbuild's CJS
// output provides a real, working `require` global, whereas `import.meta` is
// spec'd to be EMPTY in CJS output (esbuild warns and `import.meta.url` would
// be `undefined`, crashing `createRequire`). The vitest/vite-node dev
// transform also provides a working `require` global, so this resolves the
// same way in both source-run tests and the bundled server.
declare const require: (id: string) => unknown;
let cachedRgPath: string | null = null;

/** Resolve the ripgrep binary path: pinned `@vscode/ripgrep` first, PATH `rg` fallback. */
function resolveRgPath(): string {
  if (cachedRgPath) {return cachedRgPath;}
  try {
    const mod = require('@vscode/ripgrep') as { rgPath: string };
    cachedRgPath = mod.rgPath;
  } catch {
    cachedRgPath = 'rg';
  }
  return cachedRgPath;
}

/** Core wrapper around the ripgrep binary for search and file discovery. */
export class RipgrepCore {
  async search(options: RipgrepSearchOptions): Promise<RipgrepSearchResult> {
    const args = this.buildSearchArgs(options);
    try {
      const output = await this.executeRipgrep(args, options.timeoutMs, options.path);
      return this.parseSearchResults(output, options);
    } catch (error) {
      throw new Error(`Ripgrep search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listFiles(options: RipgrepListOptions): Promise<string[]> {
    const args = ['--files'];
    if (options.patterns && options.patterns.length > 0) {
      args.push(...options.patterns.flatMap((p) => ['--glob', p]));
    }
    if (options.exclude && options.exclude.length > 0) {
      args.push(...options.exclude.flatMap((e) => ['--glob', `!${e}`]));
    }
    if (options.hidden) {args.push('--hidden');}
    if (options.noIgnore) {args.push('--no-ignore');}
    args.push(options.path);
    try {
      const output = await this.executeRipgrep(args, options.timeoutMs, options.path);
      return this.parseFileList(output);
    } catch (error) {
      throw new Error(`Ripgrep list files failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async filesWithMatches(
    pattern: string,
    searchPath: string,
    glob?: string,
    timeoutMs?: number,
    hidden?: boolean,
  ): Promise<string[]> {
    // --files-with-matches and --json are mutually exclusive in ripgrep;
    // plain mode emits one path per line, which is all this needs.
    const args = ['--files-with-matches', pattern];
    if (glob) {args.push('--glob', glob);}
    if (hidden) {args.push('--hidden');}
    args.push(searchPath);
    try {
      const output = await this.executeRipgrep(args, timeoutMs, searchPath);
      return this.parseFilesWithMatches(output);
    } catch (error) {
      throw new Error(`Ripgrep files-with-matches failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildSearchArgs(options: RipgrepSearchOptions): string[] {
    const args = ['--json'];
    args.push(options.pattern);
    if (options.glob) {args.push('--glob', options.glob);}
    if (options.exclude && options.exclude.length > 0) {
      options.exclude.forEach((pattern) => args.push('--glob', `!${pattern}`));
    }
    if (options.caseInsensitive) {args.push('--ignore-case');}
    if (options.wholeWord) {args.push('--word-regexp');}
    if (options.multiline) {args.push('--multiline');}
    if (options.includeBinary) {args.push('--text');}
    if (options.contextBefore !== undefined && options.contextBefore > 0) {
      args.push('--before-context', String(options.contextBefore));
    }
    if (options.contextAfter !== undefined && options.contextAfter > 0) {
      args.push('--after-context', String(options.contextAfter));
    }
    if (options.maxCount !== undefined && options.maxCount > 0) {
      args.push('--max-count', String(options.maxCount));
    }
    if (options.maxColumns !== undefined && options.maxColumns > 0) {
      args.push('--max-columns', String(options.maxColumns));
    }
    if (options.hidden) {args.push('--hidden');}
    args.push(options.path);
    return args;
  }

  /**
   * Run ripgrep. `cwd` is set to the search root whenever one is known: ripgrep
   * resolves relative `--glob` patterns (e.g. `dir/*.ts`, produced by
   * `splitGlobPattern`/subdirectory-anchored code_glob patterns) against the
   * PROCESS's working directory, not the positional search-path argument —
   * confirmed empirically (`rg --files --glob 'dir/*.ts' /abs/path` only
   * matches when the process cwd is `/abs/path`). Without this, subdirectory
   * glob patterns silently returned zero results whenever the server's cwd
   * differed from the search root, which it always does for base_path calls.
   */
  private executeRipgrep(args: string[], timeoutMs?: number, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const rgPath = resolveRgPath();
      const proc = spawn(rgPath, args, cwd ? { cwd } : undefined);
      const timeout = timeoutMs ?? 30000;
      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Ripgrep search timed out after ${timeout}ms`));
      }, timeout);
      timeoutId.unref?.();

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
      proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()));
      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Failed to spawn ripgrep ('${rgPath}'): ${error.message}. ` +
              `Install @vscode/ripgrep or ensure 'rg' is on PATH.`,
          ),
        );
      });
      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        // ripgrep: 0 = matches found, 1 = no matches (not an error), 2+ = error.
        if (code !== null && code > 1) {
          reject(new Error(`Ripgrep exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  private parseJsonOutput(output: string): RipgrepJsonOutput[] {
    const records: RipgrepJsonOutput[] = [];
    for (const line of output.split('\n')) {
      if (line.trim()) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // skip invalid JSON line
        }
      }
    }
    return records;
  }

  /**
   * Parse ripgrep --json output. One RipgrepMatch per matched LINE (one
   * ripgrep 'match' record), matching ripgrep's own line-based counting
   * (--max-count, -c) and the cap layer in code_grep, which also counts lines.
   */
  private parseSearchResults(output: string, options: RipgrepSearchOptions): RipgrepSearchResult {
    const matches: RipgrepMatch[] = [];
    const files = new Set<string>();
    const perFileCounts = new Map<string, number>();
    const records = this.parseJsonOutput(output);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.type !== 'match') {continue;}
      const { data } = record;
      const file = data.path.text;
      const lineNumber = data.line_number;
      const lineContent = data.lines.text.replace(/\n$/, '');

      files.add(file);
      perFileCounts.set(file, (perFileCounts.get(file) ?? 0) + 1);

      const contextBefore: string[] = [];
      if (options.contextBefore && options.contextBefore > 0) {
        for (let j = i - 1; j >= 0 && contextBefore.length < options.contextBefore; j--) {
          const prev = records[j];
          if (prev.type === 'context' && prev.data.path.text === file && prev.data.line_number < lineNumber) {
            contextBefore.unshift(prev.data.lines.text.replace(/\n$/, ''));
          } else if (prev.type === 'match') {
            break;
          }
        }
      }

      const contextAfter: string[] = [];
      if (options.contextAfter && options.contextAfter > 0) {
        for (let j = i + 1; j < records.length && contextAfter.length < options.contextAfter; j++) {
          const next = records[j];
          if (next.type === 'context' && next.data.path.text === file && next.data.line_number > lineNumber) {
            contextAfter.push(next.data.lines.text.replace(/\n$/, ''));
          } else if (next.type === 'match') {
            break;
          }
        }
      }

      const firstSubmatch = data.submatches[0];
      const match: RipgrepMatch = {
        file,
        line: lineNumber,
        column: firstSubmatch ? firstSubmatch.start + 1 : 1,
        matchText: firstSubmatch ? firstSubmatch.match.text : '',
        lineContent,
      };
      if (contextBefore.length > 0) {match.contextBefore = contextBefore;}
      if (contextAfter.length > 0) {match.contextAfter = contextAfter;}
      matches.push(match);
    }

    let truncated = false;
    if (options.maxCount !== undefined && options.maxCount > 0) {
      for (const count of perFileCounts.values()) {
        if (count >= options.maxCount) {
          truncated = true;
          break;
        }
      }
    }

    return { matches, fileCount: files.size, matchCount: matches.length, truncated };
  }

  private parseFileList(output: string): string[] {
    return output.trim().split('\n').filter(Boolean);
  }

  private parseFilesWithMatches(output: string): string[] {
    // Plain --files-with-matches output: one absolute or root-relative path per line.
    const files = output
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return Array.from(new Set(files));
  }
}
