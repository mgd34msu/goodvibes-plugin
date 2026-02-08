/**
 * CSS selector extraction utilities using linkedom for proper DOM-based querying.
 * Replaces fragile regex-based extraction with real CSS selector support.
 */

import { parseHTML } from 'linkedom';

/**
 * Result of CSS selector extraction for structured output.
 */
export interface SelectorResult {
  /** The CSS selector that was queried */
  selector: string;
  /** Array of text content from matched elements */
  matches: string[];
}

/**
 * Extract text content from HTML using CSS selectors.
 *
 * This function:
 * - Parses HTML into a DOM using linkedom
 * - Queries each selector using real CSS selection (querySelectorAll)
 * - Extracts text content from matched elements
 * - Filters out empty/whitespace-only matches
 * - Handles invalid selectors gracefully (returns empty array)
 *
 * @param html - Raw HTML string to extract from
 * @param selectors - Array of CSS selector strings
 * @returns Record mapping each selector to array of text matches
 *
 * @example
 * ```typescript
 * const html = '<div class="title">Article 1</div><div class="title">Article 2</div>';
 * const results = extractWithCssSelectors(html, ['.title', '.author']);
 * // { '.title': ['Article 1', 'Article 2'], '.author': [] }
 * ```
 *
 * @example
 * ```typescript
 * // Handles invalid selectors gracefully
 * const results = extractWithCssSelectors(html, ['invalid[[[selector']);
 * // { 'invalid[[[selector': [] }
 * ```
 */
export function extractWithCssSelectors(
  html: string,
  selectors: string[]
): Record<string, string[]> {
  // Early return for empty inputs
  if (!html) {
    return selectors.reduce((acc, sel) => ({ ...acc, [sel]: [] }), {} as Record<string, string[]>);
  }
  if (selectors.length === 0) {
    return {};
  }

  const results: Record<string, string[]> = {};

  // Initialize all selectors with empty arrays
  for (const selector of selectors) {
    results[selector] = [];
  }

  try {
    // Parse HTML into DOM
    const { document } = parseHTML(html);

    // Query each selector
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);

        // Extract text content from each matched element
        for (const element of elements) {
          const text = element.textContent?.trim();

          // Skip empty or whitespace-only matches
          if (text) {
            results[selector].push(text);
          }
        }
      } catch (error) {
        // Invalid selector - leave as empty array
        // No logging needed, graceful degradation
      }
    }
  } catch (error) {
    // HTML parsing failed - return empty results
    // All selectors already initialized with empty arrays
  }

  return results;
}

/**
 * Extract text content from HTML using CSS selectors with structured output.
 *
 * Same as `extractWithCssSelectors` but returns an array of SelectorResult objects
 * instead of a Record. Useful when you need structured output or want to preserve
 * selector order.
 *
 * @param html - Raw HTML string to extract from
 * @param selectors - Array of CSS selector strings
 * @returns Array of SelectorResult objects with selector and matches
 *
 * @example
 * ```typescript
 * const html = '<div class="title">Article 1</div><div class="title">Article 2</div>';
 * const results = extractWithCssSelectorsDetailed(html, ['.title', '.author']);
 * // [
 * //   { selector: '.title', matches: ['Article 1', 'Article 2'] },
 * //   { selector: '.author', matches: [] }
 * // ]
 * ```
 *
 * @example
 * ```typescript
 * // Useful for logging or reporting
 * const results = extractWithCssSelectorsDetailed(html, ['.price', '.reviews']);
 * for (const { selector, matches } of results) {
 * console.log(`${selector}: ${matches.length} matches`);
 * }
 * ```
 */
export function extractWithCssSelectorsDetailed(
  html: string,
  selectors: string[]
): SelectorResult[] {
  // Early return for empty inputs
  if (!html || selectors.length === 0) {
    return [];
  }

  const recordResults = extractWithCssSelectors(html, selectors);

  // Convert Record to array of SelectorResult objects
  return selectors.map((selector) => ({
    selector,
    matches: recordResults[selector],
  }));
}
