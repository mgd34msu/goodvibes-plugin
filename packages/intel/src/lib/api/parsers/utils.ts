/**
 * Shared helpers for the API route parsers.
 *
 * File discovery is NOT ported from v1 here — the parsers ride the shared
 * intel compiler host's `findSourceFiles` (§3.3) for directory walking
 * instead of the v1 bespoke recursive walker, so route scanning shares one
 * skip-directory policy with every other analyzer.
 *
 * @module lib/api/parsers/utils
 */

/**
 * Convert a character index to a 1-based line number in source content.
 * @param content - full source file content
 * @param index - character index position
 */
export function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}
