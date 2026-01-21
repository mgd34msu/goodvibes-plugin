/**
 * precision_fetch handler - Fetch URLs with extraction modes
 * SPEC-v2 Section 13.1.8 compliant
 *
 * Features:
 * - Caching with configurable TTL (cache_ttl_seconds)
 * - from_cache tracking in results
 * - extract: 'markdown' mode
 * - extract: 'structured' with CSS selectors
 * - extract: 'summary' with summary_prompt
 * - tokens_used tracking
 */

import { startTimer, estimateTokens } from '../logging.js';
import type { OutputMode } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode } from '../utils/index.js';

// Simple in-memory cache
interface CacheEntry {
  content: string;
  contentType?: string;
  status: number;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 900; // 15 minutes in seconds
const DEFAULT_TIMEOUT = 30000;

/**
 * Clear the fetch cache. Useful for testing.
 */
export function clearFetchCache(): void {
  cache.clear();
}

function getCacheKey(url: string, method: string = 'GET'): string {
  return `${method}:${url}`;
}

function getFromCache(url: string, method: string, ttlSeconds: number): CacheEntry | null {
  const key = getCacheKey(url, method);
  const entry = cache.get(key);

  if (!entry) return null;

  const now = Date.now();
  const age = (now - entry.timestamp) / 1000;

  if (age > ttlSeconds) {
    cache.delete(key);
    return null;
  }

  return entry;
}

function setCache(url: string, method: string, entry: Omit<CacheEntry, 'timestamp'>): void {
  const key = getCacheKey(url, method);
  cache.set(key, { ...entry, timestamp: Date.now() });
}

// Simple HTML to Markdown converter
function htmlToMarkdown(html: string): string {
  let md = html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert headers
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
    // Convert paragraphs
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Convert bold
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    // Convert italic
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    // Convert code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // Convert links
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Convert images
    .replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)')
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![$1]($2)')
    .replace(/<img[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![]($1)')
    // Convert lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '\n$1\n')
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '\n$1\n')
    // Convert blockquotes
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return md;
}

// Simple CSS selector extractor
function extractWithSelectors(html: string, selectors: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const selector of selectors) {
    const matches: string[] = [];

    // Handle simple selectors: tag, .class, #id, tag.class
    if (selector.startsWith('.')) {
      // Class selector
      const className = selector.slice(1);
      const regex = new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'gi');
      let match;
      while ((match = regex.exec(html)) !== null) {
        matches.push(match[1].replace(/<[^>]+>/g, '').trim());
      }
    } else if (selector.startsWith('#')) {
      // ID selector
      const id = selector.slice(1);
      const regex = new RegExp(`<[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/`, 'gi');
      let match;
      while ((match = regex.exec(html)) !== null) {
        matches.push(match[1].replace(/<[^>]+>/g, '').trim());
      }
    } else if (selector.includes('.')) {
      // tag.class selector
      const [tag, className] = selector.split('.');
      const regex = new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
      let match;
      while ((match = regex.exec(html)) !== null) {
        matches.push(match[1].replace(/<[^>]+>/g, '').trim());
      }
    } else {
      // Tag selector
      const regex = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, 'gi');
      let match;
      while ((match = regex.exec(html)) !== null) {
        matches.push(match[1].replace(/<[^>]+>/g, '').trim());
      }
    }

    result[selector] = matches;
  }

  return result;
}

// Simple summarizer (extracts key content)
function summarizeContent(text: string, prompt?: string): string {
  // Remove extra whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Extract first N characters as summary
  const maxLength = 1000;
  let summary = cleaned.slice(0, maxLength);

  if (cleaned.length > maxLength) {
    // Try to end at a sentence boundary
    const lastPeriod = summary.lastIndexOf('.');
    const lastQuestion = summary.lastIndexOf('?');
    const lastExclaim = summary.lastIndexOf('!');
    const boundary = Math.max(lastPeriod, lastQuestion, lastExclaim);

    if (boundary > maxLength * 0.5) {
      summary = summary.slice(0, boundary + 1);
    } else {
      summary += '...';
    }
  }

  if (prompt) {
    // If a prompt is provided, prepend context
    summary = `[Summary for: ${prompt}]\n${summary}`;
  }

  return summary;
}

type ExtractMode = 'raw' | 'text' | 'json' | 'markdown' | 'structured' | 'summary';

interface FetchSpec {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  extract?: ExtractMode;
  selectors?: string[];  // For structured extraction
}

interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
  max_content_length?: number;
  max_tokens?: number;
}

interface PrecisionFetchInput {
  urls: (string | FetchSpec)[];
  parallel?: boolean;
  extract?: ExtractMode;
  selectors?: string[];
  summary_prompt?: string;
  cache_ttl_seconds?: number;
  output?: OutputConfig;
  output_mode?: OutputMode;  // Legacy support
}

interface FetchResult {
  url: string;
  status: 'success' | 'cached' | 'failed' | 'timeout';
  http_status?: number;
  content?: string;
  structured?: Record<string, string[]>;
  summary?: string;
  contentType?: string;
  size?: number;
  error?: string;
  duration_ms?: number;
  from_cache?: boolean;
}

async function fetchSingleUrl(
  request: FetchSpec,
  cacheTtl: number,
  globalExtract?: ExtractMode,
  globalSelectors?: string[],
  summaryPrompt?: string,
  maxContentLength?: number
): Promise<FetchResult> {
  const startTime = Date.now();
  const url = request.url;
  const method = request.method ?? 'GET';
  const timeout = request.timeout ?? DEFAULT_TIMEOUT;
  const extract = request.extract ?? globalExtract ?? 'text';
  const selectors = request.selectors ?? globalSelectors;

  // Check cache first (only for GET requests)
  if (method === 'GET' && cacheTtl > 0) {
    const cached = getFromCache(url, method, cacheTtl);
    if (cached) {
      const result: FetchResult = {
        url,
        status: 'cached',
        http_status: cached.status,
        contentType: cached.contentType,
        size: cached.content.length,
        duration_ms: Date.now() - startTime,
        from_cache: true,
      };

      // Process cached content based on extract mode
      await processContent(result, cached.content, extract, selectors, summaryPrompt, maxContentLength);

      return result;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: request.headers,
      signal: controller.signal,
    };

    if (request.body && method !== 'GET') {
      fetchOptions.body = request.body;
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') ?? undefined;
    let rawContent: string;

    if (extract === 'raw') {
      const buffer = await response.arrayBuffer();
      rawContent = Buffer.from(buffer).toString('base64');
    } else {
      rawContent = await response.text();
    }

    // Cache successful GET responses
    if (method === 'GET' && response.ok && cacheTtl > 0) {
      setCache(url, method, {
        content: rawContent,
        contentType,
        status: response.status,
      });
    }

    const result: FetchResult = {
      url,
      status: response.ok ? 'success' : 'failed',
      http_status: response.status,
      contentType,
      size: rawContent.length,
      duration_ms: Date.now() - startTime,
      from_cache: false,
    };

    if (!response.ok) {
      result.error = `HTTP ${response.status}: ${response.statusText}`;
    }

    // Process content based on extract mode
    await processContent(result, rawContent, extract, selectors, summaryPrompt, maxContentLength);

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const duration_ms = Date.now() - startTime;

    let status: 'failed' | 'timeout' = 'failed';
    let errorMessage: string;

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        status = 'timeout';
        errorMessage = `Request timed out after ${timeout}ms`;
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = String(error);
    }

    return {
      url,
      status,
      error: errorMessage,
      duration_ms,
      from_cache: false,
    };
  }
}

async function processContent(
  result: FetchResult,
  rawContent: string,
  extract: ExtractMode,
  selectors?: string[],
  summaryPrompt?: string,
  maxContentLength?: number
): Promise<void> {
  const maxLen = maxContentLength ?? 50000;

  switch (extract) {
    case 'raw':
      result.content = rawContent.slice(0, maxLen);
      break;

    case 'text':
      // Strip HTML tags for plain text
      const text = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      result.content = text.slice(0, maxLen);
      break;

    case 'json':
      try {
        const parsed = JSON.parse(rawContent);
        const jsonStr = JSON.stringify(parsed, null, 2);
        result.content = jsonStr.slice(0, maxLen);
      } catch {
        result.content = rawContent.slice(0, maxLen);
      }
      break;

    case 'markdown':
      const markdown = htmlToMarkdown(rawContent);
      result.content = markdown.slice(0, maxLen);
      break;

    case 'structured':
      if (selectors && selectors.length > 0) {
        result.structured = extractWithSelectors(rawContent, selectors);
      } else {
        // Default: extract common elements
        result.structured = extractWithSelectors(rawContent, ['h1', 'h2', 'h3', 'p', 'a']);
      }
      break;

    case 'summary':
      const plainText = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      result.summary = summarizeContent(plainText, summaryPrompt);
      break;

    default:
      result.content = rawContent.slice(0, maxLen);
  }
}

function normalizeUrlRequest(input: string | FetchSpec): FetchSpec {
  if (typeof input === 'string') {
    return { url: input };
  }
  return input;
}

export const handlePrecisionFetch: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionFetchInput;
  const outputMode = parseOutputMode(args);

  // Parse options with defaults
  const parallel = input.parallel ?? true;
  const cacheTtl = input.cache_ttl_seconds ?? DEFAULT_CACHE_TTL;
  const globalExtract = input.extract ?? 'text';
  const globalSelectors = input.selectors;
  const summaryPrompt = input.summary_prompt;
  const maxContentLength = input.output?.max_content_length;

  try {
    if (!input.urls || !Array.isArray(input.urls) || input.urls.length === 0) {
      return toCallToolResult(errorResult('urls array is required', outputMode, getElapsed()));
    }

    // Normalize and validate URLs
    const requests: FetchSpec[] = [];
    for (const req of input.urls) {
      const normalized = normalizeUrlRequest(req);
      if (!normalized.url) {
        return toCallToolResult(errorResult('Each request must have a url', outputMode, getElapsed()));
      }
      try {
        new URL(normalized.url);
      } catch {
        return toCallToolResult(errorResult(`Invalid URL: ${normalized.url}`, outputMode, getElapsed()));
      }
      requests.push(normalized);
    }

    let results: FetchResult[];
    if (parallel) {
      results = await Promise.all(
        requests.map(req =>
          fetchSingleUrl(req, cacheTtl, globalExtract, globalSelectors, summaryPrompt, maxContentLength)
        )
      );
    } else {
      results = [];
      for (const req of requests) {
        results.push(
          await fetchSingleUrl(req, cacheTtl, globalExtract, globalSelectors, summaryPrompt, maxContentLength)
        );
      }
    }

    // Calculate summary
    const fetched = results.filter(r => r.status === 'success').length;
    const fromCache = results.filter(r => r.status === 'cached').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'timeout').length;
    const totalSize = results.reduce((sum, r) => sum + (r.size ?? 0), 0);

    // Build response based on output mode
    let data: Record<string, unknown>;

    switch (outputMode) {
      case 'count_only':
        data = {
          summary: {
            fetched,
            from_cache: fromCache,
            failed,
            total_size: totalSize,
          },
        };
        break;

      case 'minimal':
        data = {
          urls: results.map(r => ({
            url: r.url,
            status: r.status,
            http_status: r.http_status,
            from_cache: r.from_cache,
          })),
          summary: {
            fetched,
            from_cache: fromCache,
            failed,
          },
        };
        break;

      case 'standard':
        data = {
          urls: results.map(r => ({
            url: r.url,
            status: r.status,
            http_status: r.http_status,
            contentType: r.contentType,
            size: r.size,
            from_cache: r.from_cache,
            duration_ms: r.duration_ms,
            // Truncate content for standard mode
            ...(r.content && { content: r.content.length > 2000 ? r.content.slice(0, 2000) + '...' : r.content }),
            ...(r.structured && { structured: r.structured }),
            ...(r.summary && { summary: r.summary }),
            ...(r.error && { error: r.error }),
          })),
          summary: {
            fetched,
            from_cache: fromCache,
            failed,
            total_size: totalSize,
          },
        };
        break;

      case 'verbose':
      default:
        data = {
          urls: results.map(r => ({
            url: r.url,
            status: r.status,
            http_status: r.http_status,
            contentType: r.contentType,
            size: r.size,
            from_cache: r.from_cache,
            duration_ms: r.duration_ms,
            ...(r.content !== undefined && { content: r.content }),
            ...(r.structured && { structured: r.structured }),
            ...(r.summary && { summary: r.summary }),
            ...(r.error && { error: r.error }),
          })),
          summary: {
            fetched,
            from_cache: fromCache,
            failed,
            total_size: totalSize,
          },
        };
        break;
    }

    // Calculate tokens_used
    const responseJson = JSON.stringify(data);
    data.tokens_used = estimateTokens(responseJson);

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
