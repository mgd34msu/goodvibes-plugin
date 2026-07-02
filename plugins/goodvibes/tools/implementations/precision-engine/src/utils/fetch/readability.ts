/**
 * Article content extraction using Mozilla Readability.
 * Wraps @mozilla/readability + linkedom for DOM-based article parsing.
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { htmlToMarkdown } from './turndown.js';

/**
 * Result of article content extraction with Readability.
 */
export interface ReadabilityResult {
  /** Article title */
  title?: string | null;
  /** Article author (extracted from byline) */
  byline?: string | null;
  /** Brief excerpt or description */
  excerpt?: string | null;
  /** Site name (e.g., "New York Times") */
  siteName?: string | null;
  /** Clean article content in Markdown format */
  content: string;
  /** Content length in characters */
  length?: number | null;
}

/**
 * Extract readable article content from HTML using Mozilla Readability.
 *
 * This function:
 * - Parses HTML into a DOM using linkedom
 * - Uses Readability algorithm to identify and extract article content
 * - Converts the clean HTML to Markdown using Turndown
 * - Returns structured article metadata + content
 *
 * Returns null if:
 * - The page is not an article (Readability can't identify main content)
 * - HTML parsing fails
 * - Any other error occurs
 *
 * @param html - Raw HTML string to extract content from
 * @param url - Optional URL of the page (used by Readability for relative links)
 * @returns ReadabilityResult object, or null if extraction fails
 *
 * @example
 * ```typescript
 * const html = await fetch('https://example.com/article').then(r => r.text());
 * const article = extractReadableContent(html, 'https://example.com/article');
 *
 * if (article) {
 *   console.log(article.title);
 *   console.log(article.byline);
 *   console.log(article.content); // Markdown format
 * } else {
 *   // Not an article or extraction failed - fall back to raw HTML conversion
 * }
 * ```
 */
export function extractReadableContent(
  html: string,
  url?: string
): ReadabilityResult | null {
  try {
    // Parse HTML into DOM
    const { document } = parseHTML(html);

    // Create Readability instance
    // Readability typings do not declare url; keep passing it through unchanged
    // to preserve existing runtime behavior (unknown options are ignored).
    const readabilityOptions: { debug?: boolean; url?: string } = { url };
    const reader = new Readability(document, readabilityOptions);

    // Extract article content
    const article = reader.parse();

    // Return null if Readability couldn't identify article content
    if (!article) {
      return null;
    }

    // Readability may return null/undefined content; previously that threw
    // inside htmlToMarkdown and the catch below returned null. Return null
    // directly for the same observable result.
    if (article.content == null) {
      return null;
    }

    // Convert clean HTML content to Markdown
    const markdownContent = htmlToMarkdown(article.content);

    return {
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      siteName: article.siteName,
      content: markdownContent,
      length: article.length,
    };
  } catch (error) {
    // Return null on any error - caller can fall back to raw conversion
    return null;
  }
}
