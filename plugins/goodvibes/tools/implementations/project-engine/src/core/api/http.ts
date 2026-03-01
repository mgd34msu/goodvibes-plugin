/**
 * HTTP request helper for the api domain.
 *
 * Provides a low-level HTTP/HTTPS request function used by contract validation.
 *
 * @module core/api/http
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';

/**
 * HTTP response from makeRequest.
 */
export interface HttpResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[]>;
}

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Default maximum retry attempts for transient errors (5xx, network). */
const DEFAULT_MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds. */
const DEFAULT_RETRY_BASE_DELAY_MS = 200;

/**
 * Determine if an HTTP status code is retryable.
 * @internal
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Perform a single HTTP/HTTPS request attempt (no retry).
 * @internal
 */
function makeRequestOnce(
  method: string,
  url: string,
  body: string | undefined,
  headers: Record<string, string>,
  timeout: number
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
          headers: res.headers as Record<string, string | string[]>,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Make an HTTP or HTTPS request with configurable timeout and retry.
 *
 * Automatically selects http or https based on the URL protocol.
 * Retries on network errors and retryable HTTP status codes (429, 5xx)
 * using exponential backoff.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - Full URL to request
 * @param body - Optional request body string (for POST/PUT/PATCH)
 * @param headers - Additional request headers
 * @param timeout - Request timeout in milliseconds (default: 10000)
 * @param maxRetries - Maximum retry attempts for transient failures (default: 3)
 * @returns Promise resolving to the response status, body, and headers
 *
 * @example
 * ```typescript
 * const response = await makeRequest('GET', 'http://localhost:3000/api/users');
 * console.log(response.statusCode, response.body);
 * ```
 */
export async function makeRequest(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {},
  timeout: number = DEFAULT_TIMEOUT_MS,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<HttpResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 200ms, 400ms, 800ms...
      const delay = DEFAULT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const response = await makeRequestOnce(method, url, body, headers, timeout);
      if (attempt < maxRetries && isRetryableStatus(response.statusCode)) {
        lastError = new Error(`HTTP ${response.statusCode}`);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      // Network errors are retryable; don't retry on the last attempt
      if (attempt === maxRetries) {
        throw err;
      }
    }
  }

  throw lastError;
}
