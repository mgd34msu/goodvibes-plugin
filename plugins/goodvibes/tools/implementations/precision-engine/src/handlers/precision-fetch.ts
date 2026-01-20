/**
 * precision_fetch handler - Fetch URLs with extraction modes
 * Supports batch fetching, timeout, and multiple extraction modes
 */

import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode } from '../utils/index.js';

interface UrlRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  extract?: 'raw' | 'text' | 'json';
}

interface PrecisionFetchInput {
  urls: UrlRequest[];
  parallel?: boolean;
  output_mode?: OutputMode;
}

interface FetchResult {
  url: string;
  success: boolean;
  status?: number;
  statusText?: string;
  content?: unknown;
  contentType?: string;
  size?: number;
  redirected?: boolean;
  finalUrl?: string;
  error?: string;
  duration_ms?: number;
}

const DEFAULT_TIMEOUT = 30000;

async function fetchSingleUrl(request: UrlRequest): Promise<FetchResult> {
  const startTime = Date.now();
  const timeout = request.timeout ?? DEFAULT_TIMEOUT;
  const method = request.method ?? 'GET';
  const extract = request.extract ?? 'text';

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

    const response = await fetch(request.url, fetchOptions);
    clearTimeout(timeoutId);

    const duration_ms = Date.now() - startTime;
    const contentType = response.headers.get('content-type') ?? undefined;

    let content: unknown;
    let size = 0;

    try {
      if (extract === 'raw') {
        const buffer = await response.arrayBuffer();
        size = buffer.byteLength;
        content = Buffer.from(buffer).toString('base64');
      } else {
        const textContent = await response.text();
        size = textContent.length;

        if (extract === 'json') {
          try {
            content = JSON.parse(textContent);
          } catch {
            content = textContent;
          }
        } else {
          content = textContent;
        }
      }
    } catch {
      content = null;
    }

    const result: FetchResult = {
      url: request.url,
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      content,
      contentType,
      size,
      duration_ms,
    };

    if (response.redirected) {
      result.redirected = true;
      result.finalUrl = response.url;
    }

    if (!response.ok) {
      result.error = `HTTP ${response.status}: ${response.statusText}`;
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const duration_ms = Date.now() - startTime;

    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.name === 'AbortError' ? `Request timed out after ${timeout}ms` : error.message;
    } else {
      errorMessage = String(error);
    }

    return {
      url: request.url,
      success: false,
      error: errorMessage,
      duration_ms,
    };
  }
}

export const handlePrecisionFetch: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionFetchInput;
  const outputMode = parseOutputMode(args);
  const parallel = input.parallel ?? true;

  try {
    if (!input.urls || !Array.isArray(input.urls) || input.urls.length === 0) {
      return toCallToolResult(errorResult('urls array is required', outputMode, getElapsed()));
    }

    // Validate URLs
    for (const req of input.urls) {
      if (!req.url) {
        return toCallToolResult(errorResult('Each request must have a url', outputMode, getElapsed()));
      }
      try {
        new URL(req.url);
      } catch {
        return toCallToolResult(errorResult(`Invalid URL: ${req.url}`, outputMode, getElapsed()));
      }
    }

    let results: FetchResult[];
    if (parallel) {
      results = await Promise.all(input.urls.map(fetchSingleUrl));
    } else {
      results = [];
      for (const req of input.urls) {
        results.push(await fetchSingleUrl(req));
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalSize = results.reduce((sum, r) => sum + (r.size ?? 0), 0);

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { urls_fetched: results.length, succeeded, failed, total_size: totalSize };
        break;
      case 'minimal':
        data = { urls_fetched: results.length, succeeded, failed, results: results.map(r => ({ url: r.url, success: r.success, status: r.status })) };
        break;
      case 'verbose':
        data = { urls_fetched: results.length, succeeded, failed, total_size: totalSize, results };
        break;
      default:
        data = {
          urls_fetched: results.length,
          succeeded,
          failed,
          total_size: totalSize,
          results: results.map(r => ({
            url: r.url,
            success: r.success,
            status: r.status,
            contentType: r.contentType,
            size: r.size,
            content: typeof r.content === 'string' && r.content.length > 500 ? r.content.slice(0, 500) + '...' : r.content,
            error: r.error,
            duration_ms: r.duration_ms,
          })),
        };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
