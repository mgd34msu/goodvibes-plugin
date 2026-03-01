/**
 * Git Diff Utilities
 *
 * Deduplicated from breaking-changes.ts and semantic-diff.ts.
 * Provides functions to retrieve changed file lists and content from git.
 *
 * @module core/git/diff
 */

import { execFileSync } from 'node:child_process';

/**
 * A changed file entry from git diff.
 */
export interface ChangedFile {
  /** Relative file path */
  file: string;
  /** Change status: M=modified, A=added, D=deleted, R=renamed */
  status: 'M' | 'A' | 'D' | 'R';
  /** Full git diff text for this file */
  diff: string;
}

/**
 * A changed file entry with full before/after content.
 */
export interface ChangedFileDetailed extends ChangedFile {
  /** File content before the change, or null if added */
  beforeContent: string | null;
  /** File content after the change, or null if deleted */
  afterContent: string | null;
}

/**
 * Get list of changed TypeScript/JavaScript files between two git refs.
 * Filters to source files only, excluding type declaration and test files.
 *
 * @param baseRef - The base git ref (e.g., HEAD~1)
 * @param headRef - The head git ref (e.g., HEAD)
 * @param paths - Optional path filter to limit analysis
 * @param projectRoot - The project root directory
 * @returns Array of changed file entries with diffs
 */
export function getChangedFiles(
  baseRef: string,
  headRef: string,
  paths: string | undefined,
  projectRoot: string
): ChangedFile[] {
  try {
    const diffArgs = ['diff', '--name-status', `${baseRef}..${headRef}`];
    if (paths) {
      diffArgs.push('--', paths);
    }

    const filesOutput = execFileSync('git', diffArgs, {
      cwd: projectRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const changedFiles: ChangedFile[] = [];
    const lines = filesOutput.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t');

      if (!file.match(/\.(ts|tsx|js|jsx|mts|cts)$/)) continue;
      if (file.includes('.test.') || file.includes('.spec.') || file.endsWith('.d.ts')) continue;

      let diff = '';
      try {
        diff = execFileSync('git', ['diff', `${baseRef}..${headRef}`, '--', file], {
          cwd: projectRoot,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch {
        // File might not exist in one of the refs
      }

      changedFiles.push({
        file,
        status: status as 'M' | 'A' | 'D' | 'R',
        diff,
      });
    }

    return changedFiles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get changed files: ${message}`);
  }
}

/**
 * Get file content at a specific git ref.
 *
 * @param filePath - Relative file path
 * @param ref - Git ref (e.g., HEAD, HEAD~1, a commit hash)
 * @param projectRoot - The project root directory
 * @returns File content string, or null if not found at that ref
 */
export function getFileAtRef(
  filePath: string,
  ref: string,
  projectRoot: string
): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${filePath}`], {
      cwd: projectRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Get changed files with full before/after content.
 * Renamed from getChangedFilesWithContent in semantic-diff.ts.
 *
 * @param baseRef - The base git ref
 * @param headRef - The head git ref
 * @param paths - Optional path or file filter
 * @param projectRoot - The project root directory
 * @returns Array of changed file entries with before/after content
 */
export function getChangedFilesDetailed(
  baseRef: string,
  headRef: string,
  paths: string | undefined,
  projectRoot: string
): ChangedFileDetailed[] {
  try {
    const diffArgs = ['diff', '--name-status', `${baseRef}..${headRef}`];
    if (paths) {
      diffArgs.push('--', paths);
    }

    const filesOutput = execFileSync('git', diffArgs, {
      cwd: projectRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const changedFiles: ChangedFileDetailed[] = [];
    const lines = filesOutput.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t');

      if (!file.match(/\.(ts|tsx|js|jsx|mts|cts)$/)) continue;
      if (file.endsWith('.d.ts')) continue;

      let diff = '';
      try {
        diff = execFileSync('git', ['diff', `${baseRef}..${headRef}`, '--', file], {
          cwd: projectRoot,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch {
        // File might not exist in one of the refs
      }

      const beforeContent =
        status !== 'A' ? getFileAtRef(file, baseRef, projectRoot) : null;
      const afterContent =
        status !== 'D' ? getFileAtRef(file, headRef, projectRoot) : null;

      changedFiles.push({
        file,
        status: status as 'M' | 'A' | 'D' | 'R',
        diff,
        beforeContent,
        afterContent,
      });
    }

    return changedFiles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get changed files: ${message}`);
  }
}
