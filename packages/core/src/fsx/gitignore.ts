/**
 * Root-level `.gitignore` parsing for the glob exclude pipeline.
 *
 * Ported verbatim from the v1 Phase-0.5-fixed `utils/gitignore.ts`, which
 * actually reads `.gitignore` (fast-glob never does). Only the `.gitignore` at
 * the ROOT of the provided base directory is parsed; the ripgrep backend still
 * honours nested `.gitignore` files natively.
 *
 * Unsupported features are skipped, never guessed:
 * - Negation (`!pattern`): a fast-glob ignore list cannot re-include a path.
 * - Trailing-whitespace escapes (`foo\ `): trailing whitespace is trimmed.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Convert a single (trimmed, non-comment, non-negated) `.gitignore` pattern into
 * glob exclude patterns usable by fast-glob `ignore` lists and ripgrep `--glob !`.
 */
export function gitignoreLineToGlobs(pattern: string): string[] {
  let p = pattern;

  const dirOnly = p.endsWith('/');
  if (dirOnly) {p = p.slice(0, -1);}

  const anchored = p.startsWith('/') || p.includes('/');
  if (p.startsWith('/')) {p = p.slice(1);}

  if (!p) {return [];}

  if (anchored) {
    return dirOnly ? [`${p}/**`] : [p, `${p}/**`];
  }
  return dirOnly ? [`**/${p}/**`] : [`**/${p}`, `**/${p}/**`];
}

/** Parse `.gitignore` file content into glob exclude patterns. */
export function parseGitignore(content: string): string[] {
  const globs: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {continue;}
    if (line.startsWith('!')) {continue;}
    const unescaped =
      line.startsWith('\\#') || line.startsWith('\\!') ? line.slice(1) : line;
    globs.push(...gitignoreLineToGlobs(unescaped));
  }
  return globs;
}

/**
 * Load exclude glob patterns from the root-level `.gitignore` of `baseDir`.
 * Returns an empty array when no `.gitignore` exists or it cannot be read.
 */
export async function loadGitignorePatterns(baseDir: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(baseDir, '.gitignore'), 'utf-8');
    return parseGitignore(content);
  } catch {
    return [];
  }
}
