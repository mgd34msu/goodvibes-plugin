/**
 * Code block extraction from HTML content.
 * Parses <pre><code> blocks, detects language, and provides context.
 */

import { decodeHtmlEntities, stripHtmlTags } from './html-utils.js';

export interface CodeBlock {
  language: string;   // detected language or 'text' if unknown
  code: string;       // the code content, trimmed
  context?: string;   // surrounding heading or description if available
}

/**
 * Common CSS class names that are NOT language identifiers.
 * Used to filter out false positives in bare language detection.
 */
const NON_LANGUAGE_CLASSES = new Set([
  'prettyprint',
  'highlight',
  'code',
  'pre',
  'linenums',
  'hljs',
  'codehilite',
  'sourceCode',
]);

/**
 * Detect language from class attributes.
 * Supports common patterns: language-x, lang-x, highlight-x, brush: x, class="x"
 */
function detectLanguage(classAttr: string): string {
  if (!classAttr) return 'text';
  
  // Patterns to match language identifiers
  const patterns = [
    /language-([\w+#-]+)/i,
    /lang-([\w+#-]+)/i,
    /highlight-([\w+#-]+)/i,
    /brush:\s*([\w+#-]+)/i,
    /^([\w+#-]+)$/i, // bare language name
  ];
  
  for (const pattern of patterns) {
    const match = classAttr.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].toLowerCase();
      // Filter out common non-language class names
      if (!NON_LANGUAGE_CLASSES.has(candidate)) {
        return candidate;
      }
    }
  }
  
  return 'text';
}

/**
 * Process a code block: extract class, detect language, process content, extract context.
 * Shared logic for both <pre><code> and bare <pre> patterns.
 * 
 * @param tagAttributes - The tag attributes (from <code> or <pre>)
 * @param rawCode - Raw code content
 * @param html - Full HTML content for context extraction
 * @param blockIndex - Index of code block in HTML
 * @returns CodeBlock if valid, undefined if empty
 */
function processCodeBlock(
  tagAttributes: string,
  rawCode: string,
  html: string,
  blockIndex: number
): CodeBlock | undefined {
  // Extract class attribute
  const classMatch = tagAttributes.match(/class=["']([^"']+)["']/i);
  const classAttr = classMatch ? classMatch[1] : '';
  
  // Detect language
  const language = detectLanguage(classAttr);
  
  // Process code content
  const code = processCodeContent(rawCode);
  
  // Skip empty blocks
  if (!code || code.trim() === '') {
    return undefined;
  }
  
  // Extract context (preceding heading)
  const context = extractContext(html, blockIndex);
  
  return {
    language,
    code,
    ...(context && { context }),
  };
}

/**
 * Extract the nearest preceding heading (h1-h6) as context.
 */
function extractContext(html: string, codeBlockIndex: number): string | undefined {
  // Look backwards from the code block position
  const precedingHtml = html.substring(0, codeBlockIndex);
  
  // Find the last heading before this code block
  const headingMatch = precedingHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
  
  if (!headingMatch || headingMatch.length === 0) {
    return undefined;
  }
  
  // Get the last heading
  const lastHeading = headingMatch[headingMatch.length - 1];
  
  // Extract text content (may contain inner HTML like <a>, <code>)
  const textMatch = lastHeading.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (textMatch && textMatch[1]) {
    // Strip any HTML tags from the heading text
    return stripHtmlTags(textMatch[1]).trim();
  }
  
  return undefined;
}

/**
 * Process code content: strip tags first, then decode entities, trim lines.
 */
function processCodeContent(rawCode: string): string {
  // Strip any HTML tags first (e.g., syntax highlighting spans)
  let code = stripHtmlTags(rawCode);
  
  // Then decode HTML entities
  code = decodeHtmlEntities(code);
  
  // Split into lines, trim trailing whitespace from each line
  const lines = code.split('\n').map(line => line.replace(/\s+$/, ''));
  
  // Remove leading/trailing empty lines, but preserve internal structure
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  
  return lines.join('\n');
}

/**
 * Extract code blocks from HTML content.
 * 
 * @param html - HTML content to parse
 * @returns Array of extracted code blocks with language and context
 * 
 * @example
 * ```typescript
 * const html = '<h2>Example</h2><pre><code class="language-typescript">const x = 1;</code></pre>';
 * const blocks = extractCodeBlocks(html);
 * // [{ language: 'typescript', code: 'const x = 1;', context: 'Example' }]
 * ```
 */
export function extractCodeBlocks(html: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  
  // Pattern 1: <pre><code class="...">content</code></pre>
  // Most common pattern with nested pre/code
  const nestedPattern = /<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;
  
  let match: RegExpExecArray | null;
  
  while ((match = nestedPattern.exec(html)) !== null) {
    const codeTag = match[1] || '';
    const rawCode = match[2];
    const blockIndex = match.index;
    
    const block = processCodeBlock(codeTag, rawCode, html, blockIndex);
    if (block) {
      blocks.push(block);
    }
  }
  
  // Pattern 2: <pre class="...">content</pre> (without <code> wrapper)
  // Some sites use bare <pre> tags
  const barePrePattern = /<pre([^>]*)>([\s\S]*?)<\/pre>/gi;
  const processedIndices = new Set<number>();
  
  // Track which indices we've already processed from Pattern 1
  nestedPattern.lastIndex = 0;
  while ((match = nestedPattern.exec(html)) !== null) {
    processedIndices.add(match.index);
  }
  
  // Now find bare <pre> tags that weren't part of nested pattern
  barePrePattern.lastIndex = 0;
  while ((match = barePrePattern.exec(html)) !== null) {
    const blockIndex = match.index;
    
    // Skip if this was already processed as a nested <pre><code>
    if (processedIndices.has(blockIndex)) {
      continue;
    }
    
    const preTag = match[1] || '';
    const rawCode = match[2];
    
    // Skip if it contains <code> tag (will be caught by Pattern 1)
    if (/<code[^>]*>/i.test(rawCode)) {
      continue;
    }
    
    const block = processCodeBlock(preTag, rawCode, html, blockIndex);
    if (block) {
      blocks.push(block);
    }
  }
  
  return blocks;
}
