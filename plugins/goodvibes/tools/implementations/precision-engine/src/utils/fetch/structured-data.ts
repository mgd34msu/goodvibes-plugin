/**
 * Structured data extraction from HTML.
 * Harvests JSON-LD, OpenGraph, Twitter Card, and standard meta tags.
 */

/**
 * Structured data extracted from HTML.
 */
export interface StructuredData {
  /** Parsed JSON-LD objects from <script type="application/ld+json"> blocks */
  jsonLd: unknown[];
  /** OpenGraph meta tags (og:*) */
  openGraph: Record<string, string>;
  /** Twitter Card meta tags (twitter:*) */
  twitterCard: Record<string, string>;
  /** Standard meta tags (description, author, keywords, etc.) */
  meta: Record<string, string>;
}

/**
 * Extract structured data from HTML.
 * Uses pure regex/string parsing — no DOM dependency.
 *
 * @param html - HTML content to parse
 * @returns Structured data objects extracted from the HTML
 *
 * @example
 * ```typescript
 * const html = `
 *   <html>
 *     <head>
 *       <meta property="og:title" content="Example" />
 *       <script type="application/ld+json">{"@type": "Article"}</script>
 *     </head>
 *   </html>
 * `;
 * const data = extractStructuredData(html);
 * console.log(data.openGraph.title); // "Example"
 * console.log(data.jsonLd[0]); // { "@type": "Article" }
 * ```
 */
export function extractStructuredData(html: string): StructuredData {
  return {
    jsonLd: extractJsonLd(html),
    openGraph: extractOpenGraph(html),
    twitterCard: extractTwitterCard(html),
    meta: extractStandardMeta(html),
  };
}

/**
 * Extract JSON-LD structured data blocks.
 * Finds all <script type="application/ld+json"> blocks and parses their JSON content.
 * Malformed JSON blocks are skipped silently.
 *
 * @param html - HTML content to parse
 * @returns Array of parsed JSON-LD objects
 */
function extractJsonLd(html: string): unknown[] {
  const jsonLdBlocks: unknown[] = [];

  // Match <script type="application/ld+json">...</script>
  // Handle both single/double quotes and multiline content
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const jsonContent = match[1].trim();

    if (!jsonContent) continue;

    try {
      const parsed = JSON.parse(jsonContent);
      jsonLdBlocks.push(parsed);
    } catch {
      // Skip malformed JSON blocks silently
      continue;
    }
  }

  return jsonLdBlocks;
}

/**
 * Extract OpenGraph meta tags.
 * Finds all <meta property="og:*" content="..."> tags.
 * Normalizes property names by removing the "og:" prefix.
 *
 * @param html - HTML content to parse
 * @returns Map of OpenGraph property names to content values
 *
 * @example
 * Input: <meta property="og:title" content="Example" />
 * Output: { title: "Example" }
 */
function extractOpenGraph(html: string): Record<string, string> {
  const ogData: Record<string, string> = {};

  // Match both property="og:*" and name="og:*" variants
  // Handle both self-closing and non-self-closing tags
  // Support both single and double quotes
  const ogRegex = /<meta\s+(?:property|name)=["']og:([^"']+)["']\s+content=["']([^"']*)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = ogRegex.exec(html)) !== null) {
    const [, property, content] = match;
    if (property && content !== undefined) {
      ogData[property] = content;
    }
  }

  // Also handle reversed attribute order: content before property
  const ogReversedRegex = /<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']og:([^"']+)["'][^>]*>/gi;

  while ((match = ogReversedRegex.exec(html)) !== null) {
    const [, content, property] = match;
    if (property && content !== undefined && !ogData[property]) {
      ogData[property] = content;
    }
  }

  return ogData;
}

/**
 * Extract Twitter Card meta tags.
 * Finds all <meta name="twitter:*" content="..."> tags.
 * Normalizes names by removing the "twitter:" prefix.
 *
 * @param html - HTML content to parse
 * @returns Map of Twitter Card property names to content values
 *
 * @example
 * Input: <meta name="twitter:card" content="summary" />
 * Output: { card: "summary" }
 */
function extractTwitterCard(html: string): Record<string, string> {
  const twitterData: Record<string, string> = {};

  // Match name="twitter:*" tags
  // Handle both self-closing and non-self-closing tags
  // Support both single and double quotes
  const twitterRegex = /<meta\s+name=["']twitter:([^"']+)["']\s+content=["']([^"']*)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = twitterRegex.exec(html)) !== null) {
    const [, property, content] = match;
    if (property && content !== undefined) {
      twitterData[property] = content;
    }
  }

  // Also handle reversed attribute order: content before name
  const twitterReversedRegex = /<meta\s+content=["']([^"']*)["']\s+name=["']twitter:([^"']+)["'][^>]*>/gi;

  while ((match = twitterReversedRegex.exec(html)) !== null) {
    const [, content, property] = match;
    if (property && content !== undefined && !twitterData[property]) {
      twitterData[property] = content;
    }
  }

  return twitterData;
}

/**
 * Extract standard meta tags.
 * Finds common meta tags: description, author, keywords, robots, viewport, generator.
 *
 * @param html - HTML content to parse
 * @returns Map of meta tag names to content values
 *
 * @example
 * Input: <meta name="description" content="A sample page" />
 * Output: { description: "A sample page" }
 */
function extractStandardMeta(html: string): Record<string, string> {
  const metaData: Record<string, string> = {};

  // List of standard meta tag names to extract
  const standardTags = ['description', 'author', 'keywords', 'robots', 'viewport', 'generator'];

  for (const tagName of standardTags) {
    // Match name="tagName" content="..."
    const regex = new RegExp(`<meta\\s+name=["']${tagName}["']\\s+content=["']([^"']*)["'][^>]*>`, 'gi');

    let match: RegExpExecArray | null;
    if ((match = regex.exec(html)) !== null) {
      const content = match[1];
      if (content !== undefined) {
        metaData[tagName] = content;
        continue;
      }
    }

    // Also try reversed attribute order: content before name
    const reversedRegex = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+name=["']${tagName}["'][^>]*>`, 'gi');

    if ((match = reversedRegex.exec(html)) !== null) {
      const content = match[1];
      if (content !== undefined && !metaData[tagName]) {
        metaData[tagName] = content;
      }
    }
  }

  return metaData;
}
