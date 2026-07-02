/**
 * Root-level .gitignore parsing for the glob backend exclude pipeline.
 *
 * DEPTH: only the .gitignore at the ROOT of the provided base directory is
 * parsed. Nested .gitignore files are NOT read by this helper — the ripgrep
 * backend still honors nested .gitignore files natively when searching inside
 * a git repository, but the fast-glob backend relies solely on the patterns
 * produced here.
 *
 * Unsupported gitignore features (such lines are skipped, never guessed):
 * - Negation patterns (`!pattern`): fast-glob ignore lists cannot re-include
 *   a previously excluded path, so negations are dropped.
 * - Trailing-whitespace escapes (`foo\ `): trailing whitespace is trimmed.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Convert a single (pre-trimmed, non-comment, non-negated) .gitignore pattern
 * into glob exclude patterns usable by both fast-glob `ignore` lists and
 * ripgrep `--glob !` arguments.
 *
 * Semantics follow gitignore rules:
 * - A trailing `/` means the pattern only matches directories.
 * - A pattern containing a slash (other than a trailing one) is anchored to
 *   the .gitignore's directory; otherwise it matches at any depth.
 */
export function gitignoreLineToGlobs(pattern: string): string[] {
  let p = pattern;

  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);

  // A slash anywhere (other than trailing) anchors the pattern to the root.
  const anchored = p.startsWith('/') || p.includes('/');
  if (p.startsWith('/')) p = p.slice(1);

  if (!p) return [];

  if (anchored) {
    // Anchored: match relative to the base directory only.
    return dirOnly ? [`${p}/**`] : [p, `${p}/**`];
  }

  // Un-anchored: match at any depth. Emit both the bare-name form (files) and
  // the directory-contents form (directories), unless the pattern is dir-only.
  return dirOnly ? [`**/${p}/**`] : [`**/${p}`, `**/${p}/**`];
}

/**
 * Parse .gitignore file content into glob exclude patterns.
 */
export function parseGitignore(content: string): string[] {
  const globs: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    // Blank lines and comments carry no pattern.
    if (!line || line.startsWith('#')) continue;

    // Negation (re-include) is not expressible as an exclude glob — skip.
    if (line.startsWith('!')) continue;

    // `\#` and `\!` escape a literal leading character.
    const unescaped = line.startsWith('\\#') || line.startsWith('\\!')
      ? line.slice(1)
      : line;

    globs.push(...gitignoreLineToGlobs(unescaped));
  }

  return globs;
}

/**
 * Load exclude glob patterns from the root-level .gitignore of `baseDir`.
 * Returns an empty array when no .gitignore exists or it cannot be read.
 */
export async function loadGitignorePatterns(baseDir: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(baseDir, '.gitignore'), 'utf-8');
    return parseGitignore(content);
  } catch {
    return [];
  }
}
