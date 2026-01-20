/**
 * HTTP client for API contract validation
 *
 * Provides HTTP request functionality with timeout support
 * for testing API endpoints against their OpenAPI contracts.
 *
 * @module handlers/edit/validate-api-contract/http-client
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import type { HttpResponse } from './types.js';

/**
 * Make an HTTP request and return the response
 *
 * Supports both HTTP and HTTPS, handles request body serialization,
 * and includes timeout handling.
 *
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param url - Full URL to request
 * @param body - Request body (will be JSON serialized if object)
 * @param headers - Additional headers to include
 * @param timeout - Request timeout in milliseconds
 * @returns HTTP response with status, body, and optional error
 */
export async function makeRequest(
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeout: number
): Promise<HttpResponse> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      // Prepare request body
      let bodyData: string | undefined;
      const requestHeaders: Record<string, string> = { ...headers };

      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        bodyData = typeof body === 'string' ? body : JSON.stringify(body);
        // Always set Content-Type for JSON body since headers are built internally
        // and never include a pre-existing Content-Type
        requestHeaders['Content-Type'] = 'application/json';
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
          const rawBody = Buffer.concat(chunks).toString('utf-8');

          // Parse body as JSON if possible
          let parsedBody: unknown = rawBody;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            // Keep as string if not valid JSON
          }

          resolve({
            status: res.statusCode || 0,
            body: parsedBody,
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          status: 0,
          body: null,
          error: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 0,
          body: null,
          error: 'Request timed out',
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
        body: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });
}
