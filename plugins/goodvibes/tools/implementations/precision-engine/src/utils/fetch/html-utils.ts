/**
 * Shared HTML utility functions for fetch modules.
 * Single source of truth for HTML entity decoding and tag stripping.
 */

/**
 * Superset of all HTML entities used across tables, links, and code-blocks.
 * Case-insensitive matching via the NAMED_ENTITY_PATTERN regex.
 * NOTE: Entries like &#39; are intentionally included in both the map AND
 * the NAMED_ENTITY_PATTERN regex for single-pass performance.
 */
export const HTML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&#x27;': "'",
  '&#x2f;': '/',
  '&#x60;': '`',
  '&nbsp;': ' ',
  '&ndash;': '\u2013',
  '&mdash;': '\u2014',
  '&hellip;': '\u2026',
  '&copy;': '\u00a9',
  '&reg;': '\u00ae',
  '&trade;': '\u2122',
};

/**
 * Pre-compiled single-pass regex for all named/numeric entities.
 * Case-insensitive to handle mixed-case HTML entities.
 * Dynamically generated from HTML_ENTITIES keys to stay in sync.
 */
const NAMED_ENTITY_PATTERN = new RegExp(
  '&(' + Object.keys(HTML_ENTITIES).map(k => k.slice(1, -1)).join('|') + ');',
  'gi'
);

/**
 * Decode HTML entities in text.
 * Uses single-pass replacement to avoid order-dependency issues
 * (e.g., &amp;lt; is decoded to &lt;, NOT to <).
 * Handles both named entities and numeric entities (decimal + hex).
 */
export function decodeHtmlEntities(text: string): string {
  let decoded = text.replace(
    NAMED_ENTITY_PATTERN,
    (match) => HTML_ENTITIES[match.toLowerCase()] ?? match
  );

  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  return decoded;
}

/**
 * Strip HTML tags from text, keeping only inner content.
 * Tags are removed with no spacing (suitable for table cells, code blocks).
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/**
 * Strip HTML tags and normalize whitespace.
 * Tags are replaced with spaces and whitespace is collapsed.
 * Suitable for extracting readable text from link/heading content.
 */
export function stripHtmlTagsWithSpacing(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
