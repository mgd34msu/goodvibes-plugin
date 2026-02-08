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
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, parseJsonField } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import {
  htmlToMarkdown,
  extractCodeBlocks,
  extractTables,
  extractLinks,
  extractStructuredData,
  detectContentType,
  rateLimitedFetch,
  shouldRequestJson,
  getJsonHeaders,
  createNegotiationInfo,
  extractWithCssSelectors,
  extractReadableContent,
  fetchCache,
  detectPageType,
  isPdfResponse,
  parsePdfBuffer,
  type CodeBlock,
  type TableData,
  type LinkInfo,
  type StructuredData,
  type ContentTypeInfo,
  type NegotiationInfo,
  type ReadabilityResult,
} from '../utils/fetch/index.js';

const DEFAULT_CACHE_TTL = 900; // 15 minutes in seconds
const DEFAULT_TIMEOUT = 30000;

/**
 * Clear the fetch cache. Useful for testing.
 */
export function clearFetchCache(): void {
  fetchCache.clear();
}



// Readability-enhanced summarizer
function summarizeContent(html: string, url: string, prompt?: string): string {
  // Try readability extraction first for cleaner text
  const readable = extractReadableContent(html, url);
  // extractReadableContent returns simplified HTML content; strip remaining tags for plain text
  const text = readable
    ? readable.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const maxLength = 2000;
  let summary = text.slice(0, maxLength);

  if (text.length > maxLength) {
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

  // Add metadata header from readability if available
  const header = readable
    ? [
        readable.title && `Title: ${readable.title}`,
        readable.byline && `Author: ${readable.byline}`,
        readable.excerpt && `Excerpt: ${readable.excerpt}`,
      ].filter(Boolean).join('\n')
    : '';

  if (prompt) {
    return `[Summary for: ${prompt}]\n${header ? header + '\n' : ''}${summary}`;
  }

  return header ? `${header}\n\n${summary}` : summary;
}

type ExtractMode = 'raw' | 'text' | 'json' | 'markdown' | 'structured' | 'summary' | 'code_blocks' | 'tables' | 'links' | 'metadata' | 'readable' | 'pdf';

interface FetchSpec {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  body_base64?: string;
  timeout_ms?: number;
  timeout?: number;  // Legacy support
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
  content_type_info?: ContentTypeInfo;
  code_blocks?: CodeBlock[];
  tables?: TableData[];
  links?: LinkInfo[];
  metadata?: StructuredData;
  negotiation?: NegotiationInfo;
  final_url?: string;
  redirected?: boolean;
  readable?: ReadabilityResult;
  pdf?: { text: string; pages: number; page_range?: string; metadata?: Record<string, string | undefined> };
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
  const timeout = request.timeout_ms ?? request.timeout ?? DEFAULT_TIMEOUT;
  const extract = request.extract ?? globalExtract ?? 'text';
  const selectors = request.selectors ?? globalSelectors;

  // Check cache first (only for GET requests)
  if (method === 'GET' && cacheTtl > 0) {
    const cached = fetchCache.get(url, method);
    if (cached) {
      const result: FetchResult = {
        url,
        status: 'cached',
        http_status: cached.httpStatus,
        contentType: cached.contentType,
        size: cached.extractedContent.length,
        duration_ms: Date.now() - startTime,
        from_cache: true,
      };

      // Process cached content based on extract mode
      await processContent(result, cached.extractedContent, extract, selectors, summaryPrompt, maxContentLength);

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

    // Auto-negotiate JSON for API-like URLs
    let autoNegotiated = false;
    if (shouldRequestJson(url, method, request.headers)) {
      fetchOptions.headers = getJsonHeaders(request.headers);
      autoNegotiated = true;
    }

    if (method !== 'GET') {
      const requestBody = request.body_base64
        ? Buffer.from(request.body_base64, 'base64').toString('utf-8')
        : request.body;

      if (requestBody) {
        fetchOptions.body = requestBody;
      }
    }

    // Rate-limited fetch (replaces raw fetch)
    const response = await rateLimitedFetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // Track redirects if the response URL differs from request URL
    const wasRedirected = response.url !== url;
    const finalUrl = response.url;

    const contentType = response.headers.get('content-type') ?? undefined;

    // Detect PDF responses and handle binary parsing
    if (isPdfResponse(contentType) || extract === 'pdf') {
      const buffer = Buffer.from(await response.arrayBuffer());
      const pdfResult = await parsePdfBuffer(buffer);

      const pdfFetchResult: FetchResult = {
        url,
        status: response.ok ? 'success' : 'failed',
        http_status: response.status,
        contentType,
        size: buffer.length,
        duration_ms: Date.now() - startTime,
        from_cache: false,
        content_type_info: detectContentType(response.headers, url, ''),
        final_url: wasRedirected ? finalUrl : undefined,
        redirected: wasRedirected,
        pdf: {
          text: pdfResult.text,
          pages: pdfResult.pages,
          page_range: pdfResult.page_range,
          metadata: pdfResult.metadata as Record<string, string | undefined> | undefined,
        },
        content: pdfResult.text.slice(0, maxContentLength ?? 50000),
      };

      if (pdfResult.error) {
        pdfFetchResult.error = pdfResult.error;
      }

      // Cache PDF text content
      if (method === 'GET' && response.ok && cacheTtl > 0) {
        fetchCache.set(url, pdfResult.text, {
          method,
          ttl: cacheTtl,
          pageType: 'pdf_document',
          headers: Object.fromEntries(response.headers.entries()),
          httpStatus: response.status,
          contentType,
        });
      }

      return pdfFetchResult;
    }

    // Normal content extraction
    let rawContent: string;
    if (extract === 'raw') {
      const buffer = await response.arrayBuffer();
      rawContent = Buffer.from(buffer).toString('base64');
    } else {
      rawContent = await response.text();
    }

    const contentTypeInfo = detectContentType(response.headers, url, rawContent.slice(0, 512));

    // Cache successful GET responses
    if (method === 'GET' && response.ok && cacheTtl > 0) {
      fetchCache.set(url, rawContent, {
        method,
        ttl: cacheTtl,
        pageType: detectPageType(url, contentType, rawContent.slice(0, 512)),
        headers: Object.fromEntries(response.headers.entries()),
        httpStatus: response.status,
        contentType,
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
      content_type_info: contentTypeInfo,
      negotiation: autoNegotiated ? createNegotiationInfo(
        'application/json',
        response.headers.get('content-type') ?? undefined,
        autoNegotiated
      ) : undefined,
      final_url: wasRedirected ? finalUrl : undefined,
      redirected: wasRedirected,
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
        result.structured = extractWithCssSelectors(rawContent, selectors);
      } else {
        result.structured = extractWithCssSelectors(rawContent, ['h1', 'h2', 'h3', 'p', 'a']);
      }
      break;

    case 'summary':
      result.summary = summarizeContent(rawContent, result.url, summaryPrompt);
      break;

    case 'code_blocks':
      result.code_blocks = extractCodeBlocks(rawContent);
      break;

    case 'tables':
      result.tables = extractTables(rawContent);
      break;

    case 'links':
      result.links = extractLinks(rawContent, result.url);
      break;

    case 'metadata':
      result.metadata = extractStructuredData(rawContent);
      break;

    case 'readable': {
      const readable = extractReadableContent(rawContent, result.url);
      if (readable) {
        result.readable = readable;
      } else {
        // Fallback: return markdown conversion
        result.content = htmlToMarkdown(rawContent).slice(0, maxLen);
      }
      break;
    }

    case 'pdf':
      // PDF content requires binary response — handled in fetchSingleUrl
      // If we reach here with non-PDF content, return as-is
      result.content = rawContent.slice(0, maxLen);
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
  const rawInput = args as PrecisionFetchInput;
  const input = { ...rawInput, urls: parseJsonField(rawInput.urls) } as PrecisionFetchInput;
  const outputMode = parseOutputMode(args, "precision_fetch");

  // Parse options with defaults
  const parallel = input.parallel ?? true;
  const cacheTtl = input.cache_ttl_seconds ?? DEFAULT_CACHE_TTL;
  const globalExtract = input.extract ?? 'text';
  const globalSelectors = input.selectors;
  const summaryPrompt = input.summary_prompt;
  const maxContentLength = input.output?.max_content_length;

  try {
    if (!input.urls || !Array.isArray(input.urls) || input.urls.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_fetch', 'urls', 'array of URL strings or request objects'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Normalize and validate URLs
    const requests: FetchSpec[] = [];
    for (const req of input.urls) {
      const normalized = normalizeUrlRequest(req);
      if (!normalized.url) {
        return toCallToolResult(createErrorResult(formatMissingParamError('precision_fetch', 'urls[].url', 'URL string for each request'), { output_mode: outputMode, execution_ms: getElapsed() }));
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
            ...(r.final_url && { final_url: r.final_url }),
            ...(r.redirected !== undefined && { redirected: r.redirected }),
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
            ...(r.code_blocks && { code_blocks: r.code_blocks }),
            ...(r.tables && { tables: r.tables }),
            ...(r.links && { links: r.links }),
            ...(r.metadata && { metadata: r.metadata }),
            ...(r.content_type_info && { content_type_info: r.content_type_info }),
            ...(r.negotiation && { negotiation: r.negotiation }),
            ...(r.final_url && { final_url: r.final_url }),
            ...(r.redirected !== undefined && { redirected: r.redirected }),
            ...(r.readable && { readable: r.readable }),
            ...(r.pdf && { pdf: r.pdf }),
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
            ...(r.code_blocks && { code_blocks: r.code_blocks }),
            ...(r.tables && { tables: r.tables }),
            ...(r.links && { links: r.links }),
            ...(r.metadata && { metadata: r.metadata }),
            ...(r.content_type_info && { content_type_info: r.content_type_info }),
            ...(r.negotiation && { negotiation: r.negotiation }),
            ...(r.final_url && { final_url: r.final_url }),
            ...(r.redirected !== undefined && { redirected: r.redirected }),
            ...(r.readable && { readable: r.readable }),
            ...(r.pdf && { pdf: r.pdf }),
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
