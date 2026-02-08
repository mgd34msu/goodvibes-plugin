/**
 * HTML-to-Markdown conversion utilities using Turndown library.
 * Replaces regex-based htmlToMarkdown with proper DOM-based conversion.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { parseHTML } from 'linkedom';

/**
 * Configuration options for HTML-to-Markdown conversion.
 *
 * @see https://github.com/mixmark-io/turndown
 */
export interface TurndownOptions {
  /** Heading style: 'setext' (underlined) or 'atx' (prefixed with #). Default: 'atx' */
  headingStyle?: 'setext' | 'atx';
  /** Code block style: 'fenced' (```) or 'indented' (4 spaces). Default: 'fenced' */
  codeBlockStyle?: 'fenced' | 'indented';
  /** Bullet list marker character. Default: '-' */
  bulletListMarker?: '-' | '+' | '*';
  /** Emphasis delimiter character. Default: '_' */
  emDelimiter?: '_' | '*';
  /** Strong emphasis delimiter. Default: '**' */
  strongDelimiter?: '__' | '**';
}

/**
 * Convert HTML to Markdown using Turndown library with GFM plugin.
 *
 * This function:
 * - Parses HTML into a DOM using linkedom
 * - Configures Turndown with GitHub Flavored Markdown support
 * - Converts the DOM to clean markdown
 *
 * Supports GFM features:
 * - Tables (markdown table syntax)
 * - Strikethrough (~~text~~)
 * - Task lists (- [x] / - [ ])
 *
 * @param html - Raw HTML string to convert
 * @param options - Optional Turndown configuration
 * @returns Markdown string
 *
 * @example
 * ```typescript
 * const markdown = htmlToMarkdown('<h1>Hello</h1><p>World</p>');
 * // => "# Hello\n\nWorld"
 *
 * const customMarkdown = htmlToMarkdown('<strong>Bold</strong>', {
 *   strongDelimiter: '__'
 * });
 * // => "__Bold__"
 * ```
 */
export function htmlToMarkdown(html: string, options?: TurndownOptions): string {
  // Handle edge cases
  if (!html || typeof html !== 'string') {
    return '';
  }

  const trimmed = html.trim();
  if (trimmed.length === 0) {
    return '';
  }

  try {
    // Parse HTML into DOM
    const { document } = parseHTML(trimmed);

    // Create Turndown service with options
    const turndownService = new TurndownService({
      headingStyle: options?.headingStyle ?? 'atx',
      codeBlockStyle: options?.codeBlockStyle ?? 'fenced',
      bulletListMarker: options?.bulletListMarker ?? '-',
      emDelimiter: options?.emDelimiter ?? '_',
      strongDelimiter: options?.strongDelimiter ?? '**',
    });

    // Apply GFM plugin for tables, strikethrough, task lists
    turndownService.use(gfm);

    // Convert DOM to markdown
    const markdown = turndownService.turndown(document);

    return markdown;
  } catch (error) {
    // If DOM parsing fails, try passing raw HTML directly to Turndown
    // (Turndown can handle HTML strings, though DOM is preferred)
    try {
      const turndownService = new TurndownService({
        headingStyle: options?.headingStyle ?? 'atx',
        codeBlockStyle: options?.codeBlockStyle ?? 'fenced',
        bulletListMarker: options?.bulletListMarker ?? '-',
        emDelimiter: options?.emDelimiter ?? '_',
        strongDelimiter: options?.strongDelimiter ?? '**',
      });

      turndownService.use(gfm);

      return turndownService.turndown(trimmed);
    } catch (fallbackError) {
      // Last resort: return original HTML with error comment
      console.error('htmlToMarkdown: Both DOM and direct conversion failed', {
        error,
        fallbackError,
      });
      return `<!-- HTML-to-Markdown conversion failed -->\n\n${trimmed}`;
    }
  }
}
