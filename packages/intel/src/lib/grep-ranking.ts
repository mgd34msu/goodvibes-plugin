/**
 * Cheap relevance ranking for code_grep `ranked: true`.
 *
 * REBUILT per plan §4.1 code_grep row ("grep-ranking.ts REBUILT cheap:
 * in-place sort + one relevance scalar, no content duplication"). v1's
 * `rankResults()` (a) returned a separate `ranked_files` array that carried a
 * full COPY of each file's `matches` array alongside the original `files`
 * array — the exact content-duplication issue 6 also flagged, just on the
 * ranking path instead of the pagination path; (b) shelled out to `git log`
 * synchronously per file via `execFileSync` — a blocking sync call per
 * ranked file, exactly what `core/proc`'s "no blocking sync loops" rule
 * forbids; (c) coupled ranking to the `FileStateCache` singleton for no
 * strong signal value.
 *
 * v2: `rankFiles` computes ONE `relevance` scalar per file from data already
 * in hand (no shell-outs, no cache lookups) and sorts the SAME file objects
 * in place — no parallel array, no duplicated match content.
 */

export interface RankableMatch {
  content?: string;
  highlight?: [number, number];
}

export interface RankableFile {
  file: string;
  matches?: RankableMatch[];
  match_count?: number;
  relevance?: number;
}

/** Score exact matches: pattern text appears verbatim in a match. */
function scoreExactMatch(matches: RankableMatch[] | undefined, pattern: string): number {
  if (!matches || matches.length === 0) {return 0;}
  for (const match of matches) {
    if (!match.content) {continue;}
    if (match.highlight) {
      const [start, end] = match.highlight;
      if (match.content.substring(start, end) === pattern) {return 1;}
    }
    if (match.content.trim() === pattern.trim()) {return 1;}
  }
  return 0;
}

/** Score exported symbols: any matched line starts with/contains `export`. */
function scoreExported(matches: RankableMatch[] | undefined): number {
  if (!matches || matches.length === 0) {return 0;}
  for (const match of matches) {
    if (!match.content) {continue;}
    const trimmed = match.content.trim();
    if (trimmed.startsWith('export ') || trimmed.includes(' export ')) {return 1;}
  }
  return 0;
}

/** Score path depth: shallower paths score higher (1.0 at depth 1, 0.0 at depth 5+). */
function scorePathDepth(filePath: string): number {
  const depth = filePath.split('/').length;
  if (depth <= 1) {return 1;}
  if (depth >= 5) {return 0;}
  return 1 - (depth - 1) / 4;
}

const WEIGHTS = { EXACT_MATCH: 0.45, EXPORTED: 0.25, PATH_DEPTH: 0.3 };

/**
 * Score and sort `files` IN PLACE by relevance (descending). Attaches a single
 * `relevance` scalar (0.0–1.0) to each existing file object — the `matches`
 * array already on each entry is reused, never copied into a parallel result.
 * @param files - file results to rank (mutated: reordered, `relevance` set)
 * @param pattern - the search pattern used, for exact-match scoring
 */
export function rankFiles<T extends RankableFile>(files: T[], pattern: string): void {
  for (const f of files) {
    const score =
      scoreExactMatch(f.matches, pattern) * WEIGHTS.EXACT_MATCH +
      scoreExported(f.matches) * WEIGHTS.EXPORTED +
      scorePathDepth(f.file) * WEIGHTS.PATH_DEPTH;
    f.relevance = Math.min(1, Math.max(0, score));
  }
  files.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
