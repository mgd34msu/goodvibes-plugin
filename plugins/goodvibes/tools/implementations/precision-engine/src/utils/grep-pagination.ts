/**
 * Offset-based pagination for precision_grep results.
 * Part of Item 12A: Skip first N file results before applying max_results.
 */

/**
 * Pagination parameters for grep results.
 */
export interface PaginationParams {
  /** Skip first N file results (default: 0) */
  offset?: number;
  /** Return at most N results after offset */
  max_results?: number;
}

/**
 * Pagination metadata returned with grep results.
 */
export interface PaginationMetadata {
  /** Number of results skipped */
  offset: number;
  /** Number of results returned in this page */
  returned: number;
  /** Total number of matches across ALL files (before pagination) */
  total_matches: number;
  /** Whether more results exist after this page */
  has_more: boolean;
  /** Offset for next page, or null if no more results */
  next_offset: number | null;
}

/**
 * Apply offset-based pagination to grep file results.
 *
 * @param files - Array of file results from grep operation
 * @param totalMatches - Sum of match_count across ALL files (before slicing)
 * @param params - Pagination parameters (offset, max_results)
 * @returns Paginated files and metadata
 *
 * @example
 * ```typescript
 * const { files, pagination } = applyPagination(
 *   allFiles,
 *   1000,
 *   { offset: 20, max_results: 10 }
 * );
 * // Returns files 20-29, pagination.next_offset = 30 if more exist
 * ```
 */
export function applyPagination<T>(
  files: T[],
  totalMatches: number,
  params: PaginationParams
): { files: T[]; pagination: PaginationMetadata } {
  // Validate and normalize inputs
  const offset = Math.max(0, params.offset ?? 0);
  const maxResults = params.max_results !== undefined
    ? Math.max(0, params.max_results)
    : undefined;

  // Edge case: max_results is 0
  if (maxResults === 0) {
    return {
      files: [],
      pagination: {
        offset,
        returned: 0,
        total_matches: totalMatches,
        has_more: false,
        next_offset: null,
      },
    };
  }

  // Edge case: offset exceeds available files
  if (offset >= files.length) {
    return {
      files: [],
      pagination: {
        offset,
        returned: 0,
        total_matches: totalMatches,
        has_more: false,
        next_offset: null,
      },
    };
  }

  // Apply pagination slice
  const endIndex = maxResults !== undefined ? offset + maxResults : files.length;
  const paginatedFiles = files.slice(offset, endIndex);
  const returned = paginatedFiles.length;

  // Calculate pagination metadata
  const hasMore = endIndex < files.length;
  const nextOffset = hasMore ? offset + returned : null;

  return {
    files: paginatedFiles,
    pagination: {
      offset,
      returned,
      total_matches: totalMatches,
      has_more: hasMore,
      next_offset: nextOffset,
    },
  };
}
