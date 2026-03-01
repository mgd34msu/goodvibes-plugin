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
 * Shared helper: list changed TS/JS files between two git refs and fetch their diffs.
 *
 * @param baseRef - The base git ref (e.g., HEAD~1)
 * @param headRef - The head git ref (e.g., HEAD)
 * @param paths - Optional path filter to limit analysis
 * @param projectRoot - The project root directory
 * @param includeTests - Whether to include test files (default: false)
 * @returns Array of objects with file path, status, and diff text
 */
function listChangedFilesWithDiff(
  baseRef: string,
  headRef: string,
  paths: string | undefined,
  projectRoot: string,
  includeTests: boolean
): Array<{ file: string; status: string; diff: string }> {
  const diffArgs = ['diff', '--name-status', `${baseRef}..${headRef}`];
  if (paths) {
    diffArgs.push('--', paths);
  }

  const filesOutput = execFileSync('git', diffArgs, {
    cwd: projectRoot,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const result: Array<{ file: string; status: string; diff: string }> = [];
  const lines = filesOutput.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const [status, ...fileParts] = line.split('\t');

    // Git rename/copy format: "R100\told-path\tnew-path" — use the new (last) path
    const normalizedStatus = status.startsWith('R') ? 'R' : status.startsWith('C') ? 'C' : status;
    const file = (normalizedStatus === 'R' || normalizedStatus === 'C')
      ? fileParts[fileParts.length - 1]
      : fileParts.join('\t');

    if (!file.match(/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/)) continue;
    if (file.endsWith('.d.ts')) continue;
    if (!includeTests && (file.includes('.test.') || file.includes('.spec.'))) continue;

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

    result.push({ file, status: normalizedStatus, diff });
  }

  return result;
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
    return listChangedFilesWithDiff(baseRef, headRef, paths, projectRoot, false).map(
      ({ file, status, diff }) => ({
        file,
        status: status as 'M' | 'A' | 'D' | 'R',
        diff,
      })
    );
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
    return listChangedFilesWithDiff(baseRef, headRef, paths, projectRoot, true).map(
      ({ file, status, diff }) => ({
        file,
        status: status as 'M' | 'A' | 'D' | 'R',
        diff,
        beforeContent: status !== 'A' ? getFileAtRef(file, baseRef, projectRoot) : null,
        afterContent: status !== 'D' ? getFileAtRef(file, headRef, projectRoot) : null,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get changed files: ${message}`);
  }
}
