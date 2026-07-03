/**
 * Find-and-replace dry-run preview for code_grep `preview_replace`. Shows what
 * a replacement would look like across matched files without writing.
 *
 * Ported from v1 `precision-engine/src/utils/grep-replace-preview.ts`, with
 * the plan §4.1 code_grep row's "absorb the unique diff-preview bits of
 * project-engine preview-edits" fold-in:
 *  - RULING (ambiguity resolution, see lane report): project-engine's
 *    `preview-edits.ts` validates edits by running them through the shared
 *    TypeScript compiler host (baseline vs. post-edit diagnostics) — that
 *    host is lane 2's concurrent build and `preview_replace` here is a
 *    static text-level dry run, not a type-check, so the compiler-diagnostic
 *    half does not port. What DOES port: (a) a real unified-diff hunk per
 *    match (`--- file` / `+++ file` / `@@ -line,1 +line,1 @@` / `-old` /
 *    `+new`) replacing v1's bare `-old\n+new` two-liner; (b) a top-level
 *    `safe`/`summary` pair mirroring preview-edits' shape — `safe` is false
 *    when any match required a regex-fallback strategy (an ambiguous
 *    replacement), true otherwise.
 */

export interface ReplacePreviewMatch {
  file: string;
  resolved_path: string;
  line: number;
  original: string;
  replaced: string;
  /** Real unified-diff hunk (not a bare two-line concatenation). */
  diff: string;
  /** Set when a fallback replacement strategy was used (ambiguous pattern/highlight). */
  warning?: string;
}

export interface ReplacePreviewResult {
  matches: ReplacePreviewMatch[];
  total_replacements: number;
  files_affected: number;
  /** False when any match needed a fallback strategy — review before applying. */
  safe: boolean;
  summary: string;
  hint: string;
}

interface MinimalMatch {
  line: number;
  content?: string;
  highlight?: [number, number];
}

interface MinimalFileResult {
  file: string;
  resolved_path: string;
  matches?: MinimalMatch[];
  match_count?: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Real unified-diff hunk for a single-line change (no full-file context needed). */
function generateUnifiedDiffHunk(file: string, line: number, before: string, after: string): string {
  return [`--- ${file}`, `+++ ${file}`, `@@ -${line},1 +${line},1 @@`, `-${before}`, `+${after}`].join('\n');
}

function applyReplacement(
  content: string,
  searchPattern: string,
  replaceString: string,
  highlight?: [number, number],
): [string, string | undefined] {
  if (highlight && highlight.length === 2) {
    const [start, end] = highlight;
    if (start < 0 || end > content.length || start >= end) {
      try {
        const regex = new RegExp(searchPattern, 'g');
        return [content.replace(regex, replaceString), 'Invalid highlight range, used regex fallback'];
      } catch {
        return [content.replace(searchPattern, replaceString), 'Invalid highlight range, used literal replacement fallback'];
      }
    }
    const before = content.substring(0, start);
    const matched = content.substring(start, end);
    const after = content.substring(end);
    try {
      const regex = new RegExp(searchPattern);
      return [before + matched.replace(regex, replaceString) + after, undefined];
    } catch {
      return [before + replaceString + after, 'Regex compilation failed, used literal replacement fallback'];
    }
  }
  try {
    const regex = new RegExp(searchPattern, 'g');
    return [content.replace(regex, replaceString), undefined];
  } catch {
    try {
      const regex = new RegExp(escapeRegex(searchPattern), 'g');
      return [content.replace(regex, replaceString), 'Regex compilation failed, used escaped pattern fallback'];
    } catch {
      return [content.split(searchPattern).join(replaceString), 'Regex compilation failed, used simple string replacement fallback'];
    }
  }
}

/**
 * Generate a find-and-replace preview across matched files.
 * @param files - file results carrying `matches[].content` from code_grep
 * @param searchPattern - regex or literal pattern to search for
 * @param replaceString - replacement text (supports regex capture groups)
 */
export function generateReplacePreview(
  files: MinimalFileResult[],
  searchPattern: string,
  replaceString: string,
): ReplacePreviewResult {
  const matches: ReplacePreviewMatch[] = [];
  const affectedFiles = new Set<string>();
  let anyFallback = false;

  for (const fileResult of files) {
    const { file, resolved_path, matches: fileMatches } = fileResult;
    if (!fileMatches || fileMatches.length === 0) {continue;}

    for (const match of fileMatches) {
      const { line, content, highlight } = match;
      if (!content) {continue;}

      const [modifiedContent, warning] = applyReplacement(content, searchPattern, replaceString, highlight);
      if (modifiedContent === content) {continue;}

      if (warning) {anyFallback = true;}
      matches.push({
        file,
        resolved_path,
        line,
        original: content,
        replaced: modifiedContent,
        diff: generateUnifiedDiffHunk(file, line, content, modifiedContent),
        ...(warning && { warning }),
      });
      affectedFiles.add(file);
    }
  }

  const safe = matches.length > 0 && !anyFallback;
  const summary =
    matches.length === 0
      ? 'No replacements would be made (pattern not found or no content available).'
      : safe
        ? `All ${matches.length} replacement(s) are safe (no fallback strategy needed).`
        : `${matches.length} replacement(s) found; some used a fallback strategy — review before applying.`;
  const hint =
    matches.length > 0
      ? `To apply: use a file-write tool with find: ${JSON.stringify(searchPattern)}, replace: ${JSON.stringify(replaceString)}`
      : 'No replacements would be made (pattern not found or no content available).';

  return { matches, total_replacements: matches.length, files_affected: affectedFiles.size, safe, summary, hint };
}
