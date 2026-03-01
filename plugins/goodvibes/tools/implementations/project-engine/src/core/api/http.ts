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

/**
 * Make an HTTP or HTTPS request.
 *
 * Automatically selects http or https based on the URL protocol.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - Full URL to request
 * @param body - Optional request body string (for POST/PUT/PATCH)
 * @param headers - Additional request headers
 * @param timeout - Request timeout in milliseconds (default: 10000)
 * @returns Promise resolving to the response status, body, and headers
 *
 * @example
 * ```typescript
 * const response = await makeRequest('GET', 'http://localhost:3000/api/users');
 * console.log(response.statusCode, response.body);
 * ```
 */
export function makeRequest(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {},
  timeout: number = 10000
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
