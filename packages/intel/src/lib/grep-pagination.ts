/**
 * Offset-based pagination for code_grep file results.
 * Ported verbatim from v1 `precision-engine/src/utils/grep-pagination.ts`.
 */

export interface PaginationParams {
  /** Skip first N file results (default: 0). */
  offset?: number;
  /** Return at most N results after offset. */
  max_results?: number;
}

export interface PaginationMetadata {
  offset: number;
  returned: number;
  /** Total number of matches across ALL files (before pagination). */
  total_matches: number;
  has_more: boolean;
  next_offset: number | null;
}

/**
 * Apply offset-based pagination to grep file results.
 * @param files - file results from a grep query
 * @param totalMatches - sum of match_count across ALL files (before slicing)
 * @param params - offset/max_results
 */
export function applyPagination<T>(
  files: T[],
  totalMatches: number,
  params: PaginationParams,
): { files: T[]; pagination: PaginationMetadata } {
  const offset = Math.max(0, params.offset ?? 0);
  const maxResults = params.max_results !== undefined ? Math.max(0, params.max_results) : undefined;

  if (maxResults === 0 || offset >= files.length) {
    return {
      files: [],
      pagination: { offset, returned: 0, total_matches: totalMatches, has_more: false, next_offset: null },
    };
  }

  const endIndex = maxResults !== undefined ? offset + maxResults : files.length;
  const paginatedFiles = files.slice(offset, endIndex);
  const returned = paginatedFiles.length;
  const hasMore = endIndex < files.length;
  const nextOffset = hasMore ? offset + returned : null;

  return {
    files: paginatedFiles,
    pagination: { offset, returned, total_matches: totalMatches, has_more: hasMore, next_offset: nextOffset },
  };
}
