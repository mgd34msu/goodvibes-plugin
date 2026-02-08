/**
 * Code block extraction from HTML content.
 * Parses <pre><code> blocks, detects language, and provides context.
 */

export interface CodeBlock {
  language: string;   // detected language or 'text' if unknown
  code: string;       // the code content, trimmed
  context?: string;   // surrounding heading or description if available
}

/**
 * HTML entity decoding map for common entities.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#x60;': '`',
};

/**
 * Decode HTML entities in text.
 */
function decodeHtmlEntities(text: string): string {
  let decoded = text;
  
  // Replace common named entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  
  // Replace numeric entities (decimal and hex)
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  
  return decoded;
}

/**
 * Extract text content from HTML, removing all tags.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

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
      return match[1].toLowerCase();
    }
  }
  
  return 'text';
}

/**
 * Extract the nearest preceding heading (h1-h6) as context.
 */
function extractContext(html: string, codeBlockIndex: number): string | undefined {
  // Look backwards from the code block position
  const precedingHtml = html.substring(0, codeBlockIndex);
  
  // Find the last heading before this code block
  const headingMatch = precedingHtml.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi);
  
  if (!headingMatch || headingMatch.length === 0) {
    return undefined;
  }
  
  // Get the last heading
  const lastHeading = headingMatch[headingMatch.length - 1];
  
  // Extract text content
  const textMatch = lastHeading.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
  if (textMatch && textMatch[1]) {
    return textMatch[1].trim();
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
    
    // Extract class attribute
    const classMatch = codeTag.match(/class=["']([^"']+)["']/i);
    const classAttr = classMatch ? classMatch[1] : '';
    
    // Detect language
    const language = detectLanguage(classAttr);
    
    // Process code content
    const code = processCodeContent(rawCode);
    
    // Skip empty blocks
    if (!code || code.trim() === '') {
      continue;
    }
    
    // Extract context (preceding heading)
    const context = extractContext(html, blockIndex);
    
    blocks.push({
      language,
      code,
      ...(context && { context }),
    });
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
    
    // Extract class attribute
    const classMatch = preTag.match(/class=["']([^"']+)["']/i);
    const classAttr = classMatch ? classMatch[1] : '';
    
    // Detect language
    const language = detectLanguage(classAttr);
    
    // Process code content
    const code = processCodeContent(rawCode);
    
    // Skip empty blocks
    if (!code || code.trim() === '') {
      continue;
    }
    
    // Extract context (preceding heading)
    const context = extractContext(html, blockIndex);
    
    blocks.push({
      language,
      code,
      ...(context && { context }),
    });
  }
  
  return blocks;
}
