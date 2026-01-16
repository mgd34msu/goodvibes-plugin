/**
 * Unit tests for handleValidateApiContract
 *
 * Tests the API contract validation handler that validates API responses
 * against OpenAPI specifications.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

// Create mock functions using vi.hoisted() to ensure they're available before vi.mock() is hoisted
const { mockSuccess, mockError, mockFileExists } = vi.hoisted(() => ({
  mockSuccess: vi.fn((data: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  })),
  mockError: vi.fn((msg: string) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
    isError: true,
  })),
  mockFileExists: vi.fn(),
}));

vi.mock('../../../utils.js', () => ({
  success: mockSuccess,
  error: mockError,
  fileExists: mockFileExists,
}));

import { handleValidateApiContract } from '../../../handlers/edit/validate-api-contract.js';

describe('handleValidateApiContract', () => {
  let tempDir: string;
  let mockServer: http.Server;
  let serverPort: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-contract-test-'));
    vi.clearAllMocks();

    mockFileExists.mockImplementation(async (filePath: string) => {
      return fs.existsSync(filePath);
    });

    mockSuccess.mockImplementation((data) => ({
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    }));

    mockError.mockImplementation((msg) => ({
      content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
      isError: true,
    }));
  });

  afterEach(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
  });

  function createMockServer(routes: Record<string, { status: number; body: unknown }>): Promise<number> {
    return new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        const route = routes[`${req.method} ${req.url}`];
        if (route) {
          res.writeHead(route.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(route.body));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      mockServer.listen(0, () => {
        const address = mockServer.address() as { port: number };
        serverPort = address.port;
        resolve(serverPort);
      });
    });
  }

  function createOpenAPISpec(paths: Record<string, unknown>): object {
    return {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths,
    };
  }

  describe('argument validation', () => {
    test('returns error when spec_path is missing', async () => {
      const result = await handleValidateApiContract({
        spec_path: '',
        base_url: 'http://localhost:3000',
      });

      expect(mockError).toHaveBeenCalledWith('spec_path is required');
    });

    test('returns error when base_url is missing', async () => {
      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(createOpenAPISpec({})));

      const result = await handleValidateApiContract({
        spec_path: specPath,
        base_url: '',
      });

      expect(mockError).toHaveBeenCalledWith('base_url is required');
    });

    test('returns error when spec file does not exist', async () => {
      const result = await handleValidateApiContract({
        spec_path: '/nonexistent/spec.json',
        base_url: 'http://localhost:3000',
      });

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('spec parsing', () => {
    test('parses JSON spec file', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { type: 'array' },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.spec_info.title).toBe('Test API');
    });

    test('returns error for invalid JSON spec', async () => {
      const specPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(specPath, 'not valid json {{{');

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: 'http://localhost:3000',
      });

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('parse'));
    });

    test('returns error for spec missing required fields', async () => {
      const specPath = path.join(tempDir, 'incomplete.json');
      fs.writeFileSync(specPath, JSON.stringify({ title: 'Incomplete' }));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: 'http://localhost:3000',
      });

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Invalid OpenAPI spec'));
    });
  });

  describe('endpoint testing', () => {
    test('tests all endpoints when none specified', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [] },
        'GET /posts': { status: 200, body: [] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
            },
          },
        },
        '/posts': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.summary.total).toBe(2);
    });

    test('filters endpoints when specified', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: { '200': { description: 'Success' } },
          },
        },
        '/posts': {
          get: {
            responses: { '200': { description: 'Success' } },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
        endpoints: ['/users'],
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results.length).toBe(1);
      expect(callArg.results[0].endpoint).toBe('/users');
    });
  });

  describe('schema validation', () => {
    test('validates response type', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: 'not an array' },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { type: 'array' },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].valid).toBe(false);
      expect(callArg.results[0].violations.length).toBeGreaterThan(0);
    });

    test('validates required properties', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { name: 'John' } }, // Missing id
      });

      const spec = createOpenAPISpec({
        '/users/{id}': {
          get: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['id', 'name'],
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].valid).toBe(false);
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'required')).toBe(true);
    });

    test('validates enum values', async () => {
      const port = await createMockServer({
        'GET /status': { status: 200, body: { status: 'invalid' } },
      });

      const spec = createOpenAPISpec({
        '/status': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'enum')).toBe(true);
    });

    test('validates string min/max length', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { name: 'X' } }, // Too short
      });

      const spec = createOpenAPISpec({
        '/users/{id}': {
          get: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', minLength: 2, maxLength: 50 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'minLength')).toBe(true);
    });

    test('validates number min/max', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { quantity: -5 } },
      });

      const spec = createOpenAPISpec({
        '/items/{id}': {
          get: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        quantity: { type: 'integer', minimum: 0, maximum: 100 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'minimum')).toBe(true);
    });
  });

  describe('$ref resolution', () => {
    test('resolves schema $ref', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { id: 1, name: 'John' } },
      });

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].valid).toBe(true);
    });
  });

  describe('status code validation', () => {
    test('reports undocumented status codes', async () => {
      const port = await createMockServer({
        'GET /users': { status: 500, body: { error: 'Server error' } },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'status_code')).toBe(true);
    });

    test('accepts documented wildcard status codes', async () => {
      const port = await createMockServer({
        'GET /users': { status: 201, body: {} },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '2XX': {
                description: 'Success',
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].violations.filter((v: any) => v.rule === 'status_code')).toHaveLength(0);
    });
  });

  describe('path parameter substitution', () => {
    test('substitutes path parameters from examples', async () => {
      const port = await createMockServer({
        'GET /users/42': { status: 200, body: { id: 42, name: 'John' } },
      });

      const spec = createOpenAPISpec({
        '/users/{userId}': {
          get: {
            parameters: [
              { name: 'userId', in: 'path', required: true, schema: { type: 'integer' }, example: 42 },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results[0].request.url).toContain('/users/42');
    });

    test('skips endpoints with unsubstitutable path params', async () => {
      const port = await createMockServer({});

      // Use a parameter name that won't be substituted:
      // - Not in the defaults list (id, userId, slug, etc.)
      // - No example value
      // - No schema type (which would trigger fallback to 'test' for string or '1' for integer)
      const spec = createOpenAPISpec({
        '/users/{veryCustomParamThatHasNoDefaultOrExample}': {
          get: {
            parameters: [
              { name: 'veryCustomParamThatHasNoDefaultOrExample', in: 'path', required: true },
            ],
            responses: {
              '200': { description: 'Success' },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      // The endpoint should be skipped because the path parameter cannot be substituted
      expect(callArg.results[0].tested).toBe(false);
      expect(callArg.results[0].skip_reason).toContain('Missing path parameter');
    });
  });

  describe('authorization', () => {
    test('includes auth header when provided', async () => {
      let receivedAuth = '';
      mockServer = http.createServer((req, res) => {
        receivedAuth = req.headers.authorization || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      });

      const port = await new Promise<number>((resolve) => {
        mockServer.listen(0, () => {
          resolve((mockServer.address() as { port: number }).port);
        });
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: { '200': { description: 'Success' } },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
        auth_header: 'Bearer test-token',
      });

      expect(receivedAuth).toBe('Bearer test-token');
    });
  });

  describe('summary', () => {
    test('calculates correct summary statistics', async () => {
      const port = await createMockServer({
        'GET /valid': { status: 200, body: [] },
        'GET /invalid': { status: 200, body: 'not array' },
      });

      const spec = createOpenAPISpec({
        '/valid': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
            },
          },
        },
        '/invalid': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.summary.total).toBe(2);
      expect(callArg.summary.tested).toBe(2);
      expect(callArg.summary.valid).toBe(1);
      expect(callArg.summary.invalid).toBe(1);
    });

    test('reports overall validity correctly', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
            },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.valid).toBe(true);
    });
  });

  describe('connection errors', () => {
    test('handles connection refused gracefully', async () => {
      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: { '200': { description: 'Success' } },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      // Use port 1 which requires admin privileges on most systems,
      // making connection failures more reliable than arbitrary high ports
      await handleValidateApiContract({
        spec_path: specPath,
        base_url: 'http://127.0.0.1:1',
        timeout: 1000, // Short timeout to fail fast
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      // When a connection error occurs, the endpoint is marked as not tested
      // with a skip_reason explaining the failure
      expect(callArg.results[0].tested).toBe(false);
      expect(callArg.results[0].skip_reason).toContain('failed');
    });
  });
});
