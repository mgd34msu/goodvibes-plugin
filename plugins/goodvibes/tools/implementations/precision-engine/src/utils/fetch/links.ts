/**
 * Link extraction utility for web content
 * Parses HTML to extract, resolve, and classify links with context
 */

/**
 * Information about a link extracted from HTML
 */
export interface LinkInfo {
  /** Resolved absolute URL */
  href: string;
  /** Link text content (HTML stripped) */
  text: string;
  /** rel attribute value if present */
  rel?: string;
  /** Different domain from baseUrl */
  isExternal: boolean;
  /** Starts with # (same-page anchor) */
  isAnchor: boolean;
  /** Nearest heading or parent section name */
  context?: string;
}

/**
 * Extract and classify links from HTML content
 *
 * @param html - HTML content to parse
 * @param baseUrl - Base URL for resolving relative links
 * @param filter - Optional filter string (case-insensitive substring or regex pattern)
 * @returns Array of deduplicated link information objects
 *
 * @example
 * ```typescript
 * const links = extractLinks(
 *   '<a href="/docs">Documentation</a>',
 *   'https://example.com',
 *   'docs'
 * );
 * // [{ href: 'https://example.com/docs', text: 'Documentation', ... }]
 * ```
 */
export function extractLinks(
  html: string,
  baseUrl: string,
  filter?: string
): LinkInfo[] {
  const links: LinkInfo[] = [];
  const seen = new Set<string>();

  // Parse base URL for origin and domain comparison
  let baseUrlObj: URL;
  try {
    baseUrlObj = new URL(baseUrl);
  } catch {
    // Invalid base URL - return empty array
    return [];
  }

  // Extract headings for context (h1-h6)
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: Array<{ position: number; text: string }> = [];
  let headingMatch: RegExpExecArray | null;
  
  while ((headingMatch = headingRegex.exec(html)) !== null) {
    const headingText = stripHtmlTags(headingMatch[2]);
    headings.push({
      position: headingMatch.index,
      text: decodeHtmlEntities(headingText),
    });
  }

  // Extract all anchor tags
  const linkRegex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const attributes = linkMatch[1];
    const innerContent = linkMatch[2];
    const linkPosition = linkMatch.index;

    // Extract href attribute
    const hrefMatch = /href=["']([^"']*)["']|href=([^\s>]+)/i.exec(attributes);
    if (!hrefMatch) continue;

    let href = hrefMatch[1] || hrefMatch[2];
    if (!href) continue;

    href = decodeHtmlEntities(href.trim());

    // Skip unwanted protocols
    if (
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('data:')
    ) {
      continue;
    }

    // Extract text content
    let text = stripHtmlTags(innerContent);
    
    // If no text, try to get alt text from images
    if (!text.trim()) {
      const imgAltMatch = /alt=["']([^"']*)["']|alt=([^\s>]+)/i.exec(innerContent);
      if (imgAltMatch) {
        text = imgAltMatch[1] || imgAltMatch[2];
      }
    }

    text = decodeHtmlEntities(text).trim();

    // Extract rel attribute
    const relMatch = /rel=["']([^"']*)["']|rel=([^\s>]+)/i.exec(attributes);
    const rel = relMatch ? (relMatch[1] || relMatch[2]) : undefined;

    // Resolve URL
    let resolvedHref: string;
    let isExternal = false;
    let isAnchor = false;

    if (href.startsWith('#')) {
      // Same-page anchor
      isAnchor = true;
      resolvedHref = href;
    } else {
      // Try to resolve relative/absolute URLs
      try {
        const resolvedUrl = new URL(href, baseUrl);
        resolvedHref = resolvedUrl.href;
        isExternal = resolvedUrl.hostname !== baseUrlObj.hostname;
      } catch {
        // Malformed URL - keep as-is
        resolvedHref = href;
      }
    }

    // Skip empty href
    if (!resolvedHref || (resolvedHref === '#' && !text)) continue;

    // Find nearest preceding heading for context
    let context: string | undefined;
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].position < linkPosition) {
        context = headings[i].text;
        break;
      }
    }

    const linkInfo: LinkInfo = {
      href: resolvedHref,
      text,
      rel,
      isExternal,
      isAnchor,
      context,
    };

    // Apply filter if provided
    if (filter) {
      const filterLower = filter.toLowerCase();
      const hrefLower = resolvedHref.toLowerCase();
      const textLower = text.toLowerCase();

      // Try as substring match first
      if (!hrefLower.includes(filterLower) && !textLower.includes(filterLower)) {
        // Try as regex pattern
        try {
          const filterRegex = new RegExp(filter, 'i');
          if (!filterRegex.test(resolvedHref) && !filterRegex.test(text)) {
            continue;
          }
        } catch {
          // Invalid regex - already failed substring match
          continue;
        }
      }
    }

    // Deduplicate by href
    if (!seen.has(resolvedHref)) {
      seen.add(resolvedHref);
      links.push(linkInfo);
    }
  }

  return links;
}

/**
 * Strip HTML tags from content, preserving text
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ') // Replace tags with space
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Decode numeric entities (&#123; or &#x7B;)
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => 
    String.fromCharCode(parseInt(code, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => 
    String.fromCharCode(parseInt(code, 16))
  );

  return decoded;
}
