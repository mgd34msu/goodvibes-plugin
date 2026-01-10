/**
 * Verify Runtime Behavior Handler
 *
 * Makes HTTP requests to a running server and verifies responses match expectations.
 * Supports status code, header, body matching with JSON path evaluation.
 *
 * @module handlers/runtime/verify-behavior
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import { success, error } from '../../utils.js';

/**
 * HTTP methods supported by the tool
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * JSON path expectation for response body validation
 */
interface JsonPathExpectation {
  /** JSON path using dot notation and array access (e.g., "data.user.name", "items[0].id") */
  path: string;
  /** Expected value at the path */
  value: unknown;
}

/**
 * Expectations for a response
 */
interface ResponseExpectation {
  /** Expected HTTP status code */
  status?: number;
  /** Expected headers (partial match - only checks specified headers) */
  headers?: Record<string, string>;
  /** Expected body (exact deep equality match) */
  body?: unknown;
  /** Substring that must be present in the body */
  body_contains?: string;
  /** JSON path expectations for specific values in the body */
  json_path?: JsonPathExpectation[];
  /** Maximum acceptable latency in milliseconds */
  max_latency_ms?: number;
}

/**
 * Single request configuration
 */
interface RequestConfig {
  /** HTTP method */
  method: HttpMethod;
  /** URL (can be relative if base_url is provided) */
  url: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON serialized if object) */
  body?: unknown;
  /** Expected response characteristics */
  expect: ResponseExpectation;
}

/**
 * Arguments for the verify_runtime_behavior MCP tool
 */
export interface VerifyRuntimeBehaviorArgs {
  /** Array of requests to execute and verify */
  requests: RequestConfig[];
  /** Base URL to prepend to relative URLs */
  base_url?: string;
  /** Timeout per request in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Actual response data captured from the server
 */
interface ActualResponse {
  /** HTTP status code */
  status: number;
  /** Response headers (lowercase keys) */
  headers: Record<string, string>;
  /** Parsed response body (JSON parsed if applicable) */
  body: unknown;
  /** Request latency in milliseconds */
  latency_ms: number;
}

/**
 * Result for a single request
 */
interface RequestResult {
  /** Request identification */
  request: { method: string; url: string };
  /** Whether all expectations passed */
  passed: boolean;
  /** Actual response received */
  actual: ActualResponse;
  /** List of failed expectations */
  failures: string[];
}

/**
 * Overall verification result
 */
interface VerifyRuntimeBehaviorResult {
  /** Whether all requests passed */
  passed: boolean;
  /** Individual request results */
  results: RequestResult[];
  /** Summary statistics */
  summary: { total: number; passed: number; failed: number };
}

/**
 * Get a value from an object using dot notation and array access.
 * Supports paths like "data.user.name" and "items[0].id".
 *
 * @param obj - The object to traverse
 * @param path - The path string
 * @returns The value at the path, or undefined if not found
 */
function getByPath(obj: unknown, path: string): unknown {
  // Convert array notation to dot notation: items[0].id -> items.0.id
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Deep equality check for two values.
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if deeply equal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  // Primitive equality
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return a === b;

  // Handle different types
  if (typeof a !== typeof b) return false;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Make an HTTP request and return the response.
 *
 * @param method - HTTP method
 * @param url - Full URL to request
 * @param headers - Request headers
 * @param body - Request body
 * @param timeout - Request timeout in ms
 * @returns Promise resolving to actual response data
 */
async function makeRequest(
  method: HttpMethod,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeout: number
): Promise<ActualResponse> {
  const startTime = Date.now();

  return new Promise<ActualResponse>((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      // Prepare request body
      let bodyData: string | undefined;
      const requestHeaders: Record<string, string> = { ...headers };

      if (body !== undefined) {
        if (typeof body === 'string') {
          bodyData = body;
        } else {
          bodyData = JSON.stringify(body);
          if (!requestHeaders['content-type'] && !requestHeaders['Content-Type']) {
            requestHeaders['Content-Type'] = 'application/json';
          }
        }
        requestHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
      }

      const options: http.RequestOptions = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: requestHeaders,
        timeout,
      };

      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const latency = Date.now() - startTime;
          const rawBody = Buffer.concat(chunks).toString('utf-8');

          // Parse body as JSON if possible
          let parsedBody: unknown = rawBody;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            // Keep as string if not valid JSON
          }

          // Normalize headers to lowercase keys
          const normalizedHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) {
              normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
            }
          }

          resolve({
            status: res.statusCode || 0,
            headers: normalizedHeaders,
            body: parsedBody,
            latency_ms: latency,
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          status: 0,
          headers: {},
          body: { error: err.message },
          latency_ms: Date.now() - startTime,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 0,
          headers: {},
          body: { error: 'Request timed out' },
          latency_ms: timeout,
        });
      });

      // Write body and end request
      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    } catch (err) {
      resolve({
        status: 0,
        headers: {},
        body: { error: err instanceof Error ? err.message : 'Unknown error' },
        latency_ms: Date.now() - startTime,
      });
    }
  });
}

/**
 * Verify a response against expectations.
 *
 * @param actual - The actual response received
 * @param expect - The expected response characteristics
 * @returns Array of failure messages (empty if all passed)
 */
function verifyResponse(actual: ActualResponse, expect: ResponseExpectation): string[] {
  const failures: string[] = [];

  // Check status code
  if (expect.status !== undefined && actual.status !== expect.status) {
    failures.push(`Status: expected ${expect.status}, got ${actual.status}`);
  }

  // Check headers (partial match)
  if (expect.headers) {
    for (const [key, expectedValue] of Object.entries(expect.headers)) {
      const actualValue = actual.headers[key.toLowerCase()];
      if (actualValue === undefined) {
        failures.push(`Header "${key}": missing`);
      } else if (actualValue.toLowerCase() !== expectedValue.toLowerCase()) {
        failures.push(`Header "${key}": expected "${expectedValue}", got "${actualValue}"`);
      }
    }
  }

  // Check exact body match
  if (expect.body !== undefined) {
    if (!deepEqual(actual.body, expect.body)) {
      const actualStr = JSON.stringify(actual.body);
      const expectedStr = JSON.stringify(expect.body);
      const truncatedActual = actualStr.length > 200 ? actualStr.slice(0, 200) + '...' : actualStr;
      const truncatedExpected = expectedStr.length > 200 ? expectedStr.slice(0, 200) + '...' : expectedStr;
      failures.push(`Body: expected ${truncatedExpected}, got ${truncatedActual}`);
    }
  }

  // Check body contains substring
  if (expect.body_contains !== undefined) {
    const bodyStr = typeof actual.body === 'string' ? actual.body : JSON.stringify(actual.body);
    if (!bodyStr.includes(expect.body_contains)) {
      failures.push(`Body does not contain: "${expect.body_contains}"`);
    }
  }

  // Check JSON path expectations
  if (expect.json_path) {
    for (const { path, value } of expect.json_path) {
      const actualValue = getByPath(actual.body, path);
      if (!deepEqual(actualValue, value)) {
        const actualStr = JSON.stringify(actualValue);
        const expectedStr = JSON.stringify(value);
        failures.push(`JSON path "${path}": expected ${expectedStr}, got ${actualStr}`);
      }
    }
  }

  // Check latency
  if (expect.max_latency_ms !== undefined && actual.latency_ms > expect.max_latency_ms) {
    failures.push(`Latency: expected <= ${expect.max_latency_ms}ms, got ${actual.latency_ms}ms`);
  }

  return failures;
}

/**
 * Resolve a URL against an optional base URL.
 *
 * @param url - The URL (can be relative)
 * @param baseUrl - Optional base URL
 * @returns Resolved full URL
 */
function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) {
    return url;
  }

  // If URL is already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Ensure base URL ends without slash and path starts with slash
  const base = baseUrl.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : '/' + url;

  return base + path;
}

/**
 * Handles the verify_runtime_behavior MCP tool call.
 *
 * Makes HTTP requests to a running server and verifies responses match expectations.
 * Supports checking status codes, headers, body content, JSON paths, and latency.
 *
 * @param args - The verify_runtime_behavior tool arguments
 * @param args.requests - Array of requests to execute and verify
 * @param args.base_url - Base URL to prepend to relative URLs
 * @param args.timeout - Per-request timeout in milliseconds (default: 10000)
 * @returns MCP tool response with verification results
 *
 * @example
 * await handleVerifyRuntimeBehavior({
 *   base_url: 'http://localhost:3000',
 *   requests: [
 *     {
 *       method: 'GET',
 *       url: '/api/health',
 *       expect: { status: 200, body_contains: 'ok' }
 *     },
 *     {
 *       method: 'POST',
 *       url: '/api/users',
 *       body: { name: 'Test' },
 *       expect: {
 *         status: 201,
 *         json_path: [{ path: 'data.name', value: 'Test' }]
 *       }
 *     }
 *   ]
 * });
 */
export async function handleVerifyRuntimeBehavior(
  args: VerifyRuntimeBehaviorArgs
) {
  const { requests, base_url, timeout = 10000 } = args;

  // Validate input
  if (!requests || !Array.isArray(requests) || requests.length === 0) {
    return error('requests array is required and must not be empty');
  }

  const results: RequestResult[] = [];

  for (const request of requests) {
    // Validate request
    if (!request.method || !request.url || !request.expect) {
      results.push({
        request: { method: request.method || 'unknown', url: request.url || 'unknown' },
        passed: false,
        actual: { status: 0, headers: {}, body: null, latency_ms: 0 },
        failures: ['Invalid request: method, url, and expect are required'],
      });
      continue;
    }

    const fullUrl = resolveUrl(request.url, base_url);
    const headers = request.headers || {};

    // Make the request
    const actual = await makeRequest(
      request.method,
      fullUrl,
      headers,
      request.body,
      timeout
    );

    // Verify the response
    const failures = verifyResponse(actual, request.expect);

    results.push({
      request: { method: request.method, url: fullUrl },
      passed: failures.length === 0,
      actual,
      failures,
    });
  }

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  const result: VerifyRuntimeBehaviorResult = {
    passed: failedCount === 0,
    results,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
    },
  };

  return success(result);
}
