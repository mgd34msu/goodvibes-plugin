/**
 * Unit tests for verify-behavior handler
 *
 * Tests cover:
 * - handleVerifyRuntimeBehavior main function
 * - Request validation
 * - HTTP request making (GET, POST, PUT, DELETE, PATCH)
 * - Response verification (status, headers, body, JSON path, latency)
 * - URL resolution with base_url
 * - Error handling
 * - Helper functions (getByPath, deepEqual, verifyResponse, resolveUrl)
 *
 * Target: 100% coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';

// Mock http and https modules
vi.mock('http', () => ({
  request: vi.fn(),
}));

vi.mock('https', () => ({
  request: vi.fn(),
}));

// Mock utils
vi.mock('../../utils.js', () => ({
  success: vi.fn((data: unknown) => ({
    content: [{
      type: 'text',
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    }],
  })),
  error: vi.fn((message: string) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  })),
}));

// Import after mocks
import {
  handleVerifyRuntimeBehavior,
  type VerifyRuntimeBehaviorArgs,
} from '../../../handlers/runtime/verify-behavior.js';
import { success, error } from '../../../utils.js';

// =============================================================================
// Mock Response Factory
// =============================================================================

interface MockResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string | string[]>;
}

interface MockRequest extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockRequest(): MockRequest {
  const req = new EventEmitter() as MockRequest;
  req.write = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

function createMockResponse(
  statusCode: number,
  headers: Record<string, string | string[]> = {},
  body: string = ''
): { response: MockResponse; mockRequest: MockRequest } {
  const response: MockResponse = new EventEmitter() as MockResponse;
  response.statusCode = statusCode;
  response.headers = headers;

  const mockRequest = createMockRequest();

  // Setup the mock to call the callback with the response
  const requestMock = vi.fn((options: http.RequestOptions, callback: (res: MockResponse) => void) => {
    // Simulate async behavior
    setImmediate(() => {
      callback(response);
      // Emit data event with body
      setImmediate(() => {
        response.emit('data', Buffer.from(body));
        setImmediate(() => {
          response.emit('end');
        });
      });
    });
    return mockRequest;
  });

  vi.mocked(http.request).mockImplementation(requestMock as typeof http.request);
  vi.mocked(https.request).mockImplementation(requestMock as typeof https.request);

  return { response, mockRequest };
}

// =============================================================================
// Tests
// =============================================================================

describe('verify-behavior handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Input Validation Tests
  // ===========================================================================

  describe('input validation', () => {
    it('should return error when requests array is missing', async () => {
      const result = await handleVerifyRuntimeBehavior({} as VerifyRuntimeBehaviorArgs);

      expect(error).toHaveBeenCalledWith('requests array is required and must not be empty');
    });

    it('should return error when requests is empty array', async () => {
      const result = await handleVerifyRuntimeBehavior({ requests: [] });

      expect(error).toHaveBeenCalledWith('requests array is required and must not be empty');
    });

    it('should return error when requests is null', async () => {
      const result = await handleVerifyRuntimeBehavior({ requests: null } as unknown as VerifyRuntimeBehaviorArgs);

      expect(error).toHaveBeenCalledWith('requests array is required and must not be empty');
    });

    it('should return error when requests is not an array', async () => {
      const result = await handleVerifyRuntimeBehavior({ requests: 'not-array' } as unknown as VerifyRuntimeBehaviorArgs);

      expect(error).toHaveBeenCalledWith('requests array is required and must not be empty');
    });

    it('should fail request with missing method', async () => {
      createMockResponse(200, {}, '{}');

      const result = await handleVerifyRuntimeBehavior({
        requests: [
          { url: '/api/test', expect: { status: 200 } } as never,
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              passed: false,
              failures: expect.arrayContaining(['Invalid request: method, url, and expect are required']),
            }),
          ]),
        })
      );
    });

    it('should fail request with missing url', async () => {
      const result = await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', expect: { status: 200 } } as never,
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              passed: false,
              failures: expect.arrayContaining(['Invalid request: method, url, and expect are required']),
            }),
          ]),
        })
      );
    });

    it('should fail request with missing expect', async () => {
      const result = await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: '/api/test' } as never,
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              passed: false,
              failures: expect.arrayContaining(['Invalid request: method, url, and expect are required']),
            }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // HTTP Method Tests
  // ===========================================================================

  describe('HTTP methods', () => {
    it('should make GET request', async () => {
      createMockResponse(200, { 'content-type': 'application/json' }, '{"status":"ok"}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api/health', expect: { status: 200 } },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          hostname: 'localhost',
          port: '3000',
          path: '/api/health',
        }),
        expect.any(Function)
      );
    });

    it('should make POST request with body', async () => {
      createMockResponse(201, {}, '{"id": 1}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/users',
            body: { name: 'Test User' },
            expect: { status: 201 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should make PUT request', async () => {
      createMockResponse(200, {}, '{"updated": true}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'PUT',
            url: 'http://localhost:3000/api/users/1',
            body: { name: 'Updated User' },
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
        }),
        expect.any(Function)
      );
    });

    it('should make DELETE request', async () => {
      createMockResponse(204, {}, '');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'DELETE',
            url: 'http://localhost:3000/api/users/1',
            expect: { status: 204 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        }),
        expect.any(Function)
      );
    });

    it('should make PATCH request', async () => {
      createMockResponse(200, {}, '{"patched": true}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'PATCH',
            url: 'http://localhost:3000/api/users/1',
            body: { email: 'new@example.com' },
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
        }),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // URL Resolution Tests
  // ===========================================================================

  describe('URL resolution', () => {
    it('should use absolute URL as-is', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://api.example.com/health', expect: { status: 200 } },
        ],
        base_url: 'http://localhost:3000',
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'api.example.com',
        }),
        expect.any(Function)
      );
    });

    it('should prepend base_url to relative path with leading slash', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: '/api/health', expect: { status: 200 } },
        ],
        base_url: 'http://localhost:3000',
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'localhost',
          port: '3000',
          path: '/api/health',
        }),
        expect.any(Function)
      );
    });

    it('should prepend base_url to relative path without leading slash', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'api/health', expect: { status: 200 } },
        ],
        base_url: 'http://localhost:3000',
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/health',
        }),
        expect.any(Function)
      );
    });

    it('should handle base_url with trailing slash', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: '/api/health', expect: { status: 200 } },
        ],
        base_url: 'http://localhost:3000/',
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/health',
        }),
        expect.any(Function)
      );
    });

    it('should use https client for https URLs', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'https://api.example.com/health', expect: { status: 200 } },
        ],
      });

      expect(https.request).toHaveBeenCalled();
    });

    it('should use default ports for http and https', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://example.com/api', expect: { status: 200 } },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 80,
        }),
        expect.any(Function)
      );
    });

    it('should use default https port 443', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'https://example.com/api', expect: { status: 200 } },
        ],
      });

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 443,
        }),
        expect.any(Function)
      );
    });

    it('should pass through URL without base_url', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'localhost',
        }),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // Request Body Tests
  // ===========================================================================

  describe('request body handling', () => {
    it('should serialize object body as JSON', async () => {
      const { mockRequest } = createMockResponse(201, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/data',
            body: { key: 'value', nested: { a: 1 } },
            expect: { status: 201 },
          },
        ],
      });

      expect(mockRequest.write).toHaveBeenCalledWith(
        JSON.stringify({ key: 'value', nested: { a: 1 } })
      );
    });

    it('should pass string body as-is', async () => {
      const { mockRequest } = createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/data',
            body: 'raw string body',
            expect: { status: 200 },
          },
        ],
      });

      expect(mockRequest.write).toHaveBeenCalledWith('raw string body');
    });

    it('should set Content-Type header for object body', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/data',
            body: { data: 'value' },
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should not override existing content-type header (lowercase)', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/data',
            headers: { 'content-type': 'text/plain' },
            body: { data: 'value' },
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'text/plain',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should not override existing Content-Type header (mixed case)', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/data',
            headers: { 'Content-Type': 'application/xml' },
            body: { data: 'value' },
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/xml',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should set Content-Length header for body', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'POST',
            url: 'http://localhost:3000/api/data',
            body: 'test',
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Length': '4',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should handle request without body', async () => {
      const { mockRequest } = createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(mockRequest.write).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Status Code Verification Tests
  // ===========================================================================

  describe('status code verification', () => {
    it('should pass when status code matches', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          results: expect.arrayContaining([
            expect.objectContaining({
              passed: true,
              failures: [],
            }),
          ]),
        })
      );
    });

    it('should fail when status code does not match', async () => {
      createMockResponse(404, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              passed: false,
              failures: expect.arrayContaining([
                expect.stringContaining('Status: expected 200, got 404'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should not check status when not specified in expect', async () => {
      createMockResponse(500, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: {} },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          results: expect.arrayContaining([
            expect.objectContaining({
              passed: true,
              failures: [],
            }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // Header Verification Tests
  // ===========================================================================

  describe('header verification', () => {
    it('should pass when headers match (case insensitive)', async () => {
      createMockResponse(200, { 'content-type': 'application/json' }, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { headers: { 'Content-Type': 'application/json' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should fail when header is missing', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { headers: { 'X-Custom-Header': 'value' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringContaining('Header "X-Custom-Header": missing'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should fail when header value does not match', async () => {
      createMockResponse(200, { 'x-custom-header': 'different-value' }, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { headers: { 'X-Custom-Header': 'expected-value' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringContaining('Header "X-Custom-Header": expected "expected-value", got "different-value"'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle array header values', async () => {
      createMockResponse(200, { 'set-cookie': ['cookie1', 'cookie2'] }, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { headers: { 'Set-Cookie': 'cookie1, cookie2' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });
  });

  // ===========================================================================
  // Body Verification Tests
  // ===========================================================================

  describe('body verification', () => {
    it('should pass when body matches exactly', async () => {
      createMockResponse(200, {}, '{"status":"ok","code":200}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { status: 'ok', code: 200 } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should fail when body does not match', async () => {
      createMockResponse(200, {}, '{"status":"error"}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { status: 'ok' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringContaining('Body: expected'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should truncate long body in error message', async () => {
      const longBody = { data: 'x'.repeat(300) };
      createMockResponse(200, {}, JSON.stringify(longBody));

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { data: 'different' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringMatching(/\.\.\./),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle body_contains for string matching', async () => {
      createMockResponse(200, {}, '{"message":"Hello World!"}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body_contains: 'Hello' },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should fail when body_contains substring not found', async () => {
      createMockResponse(200, {}, '{"message":"Goodbye"}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body_contains: 'Hello' },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringContaining('Body does not contain: "Hello"'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle non-JSON response body', async () => {
      createMockResponse(200, {}, 'Plain text response');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body_contains: 'Plain text' },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });
  });

  // ===========================================================================
  // JSON Path Verification Tests
  // ===========================================================================

  describe('JSON path verification', () => {
    it('should pass when json_path values match', async () => {
      createMockResponse(200, {}, '{"data":{"user":{"name":"John","age":30}}}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [
                { path: 'data.user.name', value: 'John' },
                { path: 'data.user.age', value: 30 },
              ],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should fail when json_path value does not match', async () => {
      createMockResponse(200, {}, '{"data":{"user":{"name":"Jane"}}}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [{ path: 'data.user.name', value: 'John' }],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringContaining('JSON path "data.user.name": expected "John", got "Jane"'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle array access in json_path', async () => {
      createMockResponse(200, {}, '{"items":[{"id":1},{"id":2},{"id":3}]}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [
                { path: 'items[0].id', value: 1 },
                { path: 'items[2].id', value: 3 },
              ],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should handle undefined path gracefully', async () => {
      createMockResponse(200, {}, '{"data":{}}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [{ path: 'data.missing.path', value: 'expected' }],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringContaining('JSON path "data.missing.path"'),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle null values in path', async () => {
      createMockResponse(200, {}, '{"data":null}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [{ path: 'data.nested', value: 'expected' }],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
        })
      );
    });

    it('should match null value when expected', async () => {
      createMockResponse(200, {}, '{"data":null}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [{ path: 'data', value: null }],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });
  });

  // ===========================================================================
  // Latency Verification Tests
  // ===========================================================================

  describe('latency verification', () => {
    it('should pass when latency is within limit', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { max_latency_ms: 5000 },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          results: expect.arrayContaining([
            expect.objectContaining({
              actual: expect.objectContaining({
                latency_ms: expect.any(Number),
              }),
            }),
          ]),
        })
      );
    });

    it('should fail when latency exceeds limit', async () => {
      // Create a slow response
      const mockRequest = createMockRequest();
      const response: MockResponse = new EventEmitter() as MockResponse;
      response.statusCode = 200;
      response.headers = {};

      vi.mocked(http.request).mockImplementation((options, callback) => {
        // Delay response significantly
        setTimeout(() => {
          callback!(response);
          response.emit('data', Buffer.from('{}'));
          response.emit('end');
        }, 100);
        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { max_latency_ms: 1 }, // Very strict latency
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              failures: expect.arrayContaining([
                expect.stringMatching(/Latency: expected <= 1ms/),
              ]),
            }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should handle request error', async () => {
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation((options, callback) => {
        setImmediate(() => {
          mockRequest.emit('error', new Error('Connection refused'));
        });
        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              actual: expect.objectContaining({
                status: 0,
                body: expect.objectContaining({
                  error: 'Connection refused',
                }),
              }),
            }),
          ]),
        })
      );
    });

    it('should handle request timeout', async () => {
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation((options, callback) => {
        setImmediate(() => {
          mockRequest.emit('timeout');
        });
        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
        timeout: 100,
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              actual: expect.objectContaining({
                body: expect.objectContaining({
                  error: 'Request timed out',
                }),
              }),
            }),
          ]),
        })
      );
    });

    it('should handle URL parse error', async () => {
      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'not-a-valid-url', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          results: expect.arrayContaining([
            expect.objectContaining({
              actual: expect.objectContaining({
                status: 0,
                body: expect.objectContaining({
                  error: expect.any(String),
                }),
              }),
            }),
          ]),
        })
      );
    });

    it('should handle zero status code from failed request', async () => {
      const mockRequest = createMockRequest();
      const response: MockResponse = new EventEmitter() as MockResponse;
      response.statusCode = 0;
      response.headers = {};

      vi.mocked(http.request).mockImplementation((options, callback) => {
        setImmediate(() => {
          callback!(response);
          response.emit('data', Buffer.from(''));
          response.emit('end');
        });
        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
        })
      );
    });

    it('should handle undefined status code', async () => {
      const mockRequest = createMockRequest();
      const response: MockResponse = new EventEmitter() as MockResponse;
      (response as Record<string, unknown>).statusCode = undefined;
      response.headers = {};

      vi.mocked(http.request).mockImplementation((options, callback) => {
        setImmediate(() => {
          callback!(response);
          response.emit('data', Buffer.from('{}'));
          response.emit('end');
        });
        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              actual: expect.objectContaining({
                status: 0,
              }),
            }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // Multiple Requests Tests
  // ===========================================================================

  describe('multiple requests', () => {
    it('should handle multiple successful requests', async () => {
      createMockResponse(200, {}, '{"status":"ok"}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api/health', expect: { status: 200 } },
          { method: 'GET', url: 'http://localhost:3000/api/status', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          summary: {
            total: 2,
            passed: 2,
            failed: 0,
          },
        })
      );
    });

    it('should handle mixed success and failure', async () => {
      let callCount = 0;
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation((options, callback) => {
        callCount++;
        const response: MockResponse = new EventEmitter() as MockResponse;
        response.statusCode = callCount === 1 ? 200 : 404;
        response.headers = {};

        setImmediate(() => {
          callback!(response);
          response.emit('data', Buffer.from('{}'));
          response.emit('end');
        });
        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api/exists', expect: { status: 200 } },
          { method: 'GET', url: 'http://localhost:3000/api/missing', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
          summary: {
            total: 2,
            passed: 1,
            failed: 1,
          },
        })
      );
    });

    it('should include request info in results', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'POST', url: 'http://localhost:3000/api/data', expect: { status: 200 } },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              request: {
                method: 'POST',
                url: 'http://localhost:3000/api/data',
              },
            }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // Deep Equality Tests
  // ===========================================================================

  describe('deep equality comparison', () => {
    it('should compare primitive values', async () => {
      createMockResponse(200, {}, '{"value":42}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { value: 42 } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should compare arrays', async () => {
      createMockResponse(200, {}, '{"items":[1,2,3]}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { items: [1, 2, 3] } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should fail on array length mismatch', async () => {
      createMockResponse(200, {}, '{"items":[1,2]}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { items: [1, 2, 3] } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
        })
      );
    });

    it('should compare nested objects', async () => {
      createMockResponse(200, {}, '{"data":{"nested":{"value":true}}}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { data: { nested: { value: true } } } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should fail on object key count mismatch', async () => {
      createMockResponse(200, {}, '{"a":1,"b":2}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { a: 1 } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
        })
      );
    });

    it('should handle different types', async () => {
      createMockResponse(200, {}, '{"value":"42"}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { value: 42 } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
        })
      );
    });

    it('should handle null comparisons', async () => {
      createMockResponse(200, {}, '{"value":null}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { body: { value: null } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should distinguish null from undefined', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {
              json_path: [{ path: 'missing', value: null }],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: false,
        })
      );
    });
  });

  // ===========================================================================
  // Response Headers Normalization Tests
  // ===========================================================================

  describe('response headers normalization', () => {
    it('should normalize header keys to lowercase', async () => {
      createMockResponse(200, { 'Content-Type': 'application/json', 'X-Custom-HEADER': 'value' }, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { headers: { 'content-type': 'application/json' } },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should skip undefined header values', async () => {
      createMockResponse(200, { 'valid-header': 'value' }, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: {},
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          results: expect.arrayContaining([
            expect.objectContaining({
              actual: expect.objectContaining({
                headers: expect.objectContaining({
                  'valid-header': 'value',
                }),
              }),
            }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // Timeout Configuration Tests
  // ===========================================================================

  describe('timeout configuration', () => {
    it('should use default timeout of 10000ms', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        }),
        expect.any(Function)
      );
    });

    it('should use custom timeout', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          { method: 'GET', url: 'http://localhost:3000/api', expect: { status: 200 } },
        ],
        timeout: 5000,
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        }),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // Custom Headers Tests
  // ===========================================================================

  describe('custom request headers', () => {
    it('should include custom headers in request', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            headers: {
              'Authorization': 'Bearer token123',
              'X-Custom-Header': 'custom-value',
            },
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token123',
            'X-Custom-Header': 'custom-value',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should handle request without custom headers', async () => {
      createMockResponse(200, {}, '{}');

      await handleVerifyRuntimeBehavior({
        requests: [
          {
            method: 'GET',
            url: 'http://localhost:3000/api',
            expect: { status: 200 },
          },
        ],
      });

      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {},
        }),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // Complete Workflow Tests
  // ===========================================================================

  describe('complete verification workflows', () => {
    it('should verify health check endpoint', async () => {
      createMockResponse(
        200,
        { 'content-type': 'application/json' },
        '{"status":"healthy","version":"1.0.0"}'
      );

      await handleVerifyRuntimeBehavior({
        base_url: 'http://localhost:3000',
        requests: [
          {
            method: 'GET',
            url: '/api/health',
            expect: {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
              json_path: [
                { path: 'status', value: 'healthy' },
              ],
            },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
        })
      );
    });

    it('should verify CRUD workflow', async () => {
      let callCount = 0;

      vi.mocked(http.request).mockImplementation((options, callback) => {
        callCount++;
        const mockRequest = createMockRequest();
        const response: MockResponse = new EventEmitter() as MockResponse;

        switch (callCount) {
          case 1: // POST create
            response.statusCode = 201;
            response.headers = {};
            setImmediate(() => {
              callback!(response);
              response.emit('data', Buffer.from('{"id":1,"name":"Test"}'));
              response.emit('end');
            });
            break;
          case 2: // GET read
            response.statusCode = 200;
            response.headers = {};
            setImmediate(() => {
              callback!(response);
              response.emit('data', Buffer.from('{"id":1,"name":"Test"}'));
              response.emit('end');
            });
            break;
          case 3: // PUT update
            response.statusCode = 200;
            response.headers = {};
            setImmediate(() => {
              callback!(response);
              response.emit('data', Buffer.from('{"id":1,"name":"Updated"}'));
              response.emit('end');
            });
            break;
          case 4: // DELETE
            response.statusCode = 204;
            response.headers = {};
            setImmediate(() => {
              callback!(response);
              response.emit('data', Buffer.from(''));
              response.emit('end');
            });
            break;
        }

        return mockRequest;
      });

      await handleVerifyRuntimeBehavior({
        base_url: 'http://localhost:3000',
        requests: [
          {
            method: 'POST',
            url: '/api/items',
            body: { name: 'Test' },
            expect: { status: 201, json_path: [{ path: 'id', value: 1 }] },
          },
          {
            method: 'GET',
            url: '/api/items/1',
            expect: { status: 200, json_path: [{ path: 'name', value: 'Test' }] },
          },
          {
            method: 'PUT',
            url: '/api/items/1',
            body: { name: 'Updated' },
            expect: { status: 200, json_path: [{ path: 'name', value: 'Updated' }] },
          },
          {
            method: 'DELETE',
            url: '/api/items/1',
            expect: { status: 204 },
          },
        ],
      });

      expect(success).toHaveBeenCalledWith(
        expect.objectContaining({
          passed: true,
          summary: {
            total: 4,
            passed: 4,
            failed: 0,
          },
        })
      );
    });
  });
});
