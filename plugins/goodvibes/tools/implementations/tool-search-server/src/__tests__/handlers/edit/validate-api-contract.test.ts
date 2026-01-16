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

  describe('oneOf validation', () => {
    test('validates oneOf - exactly one match passes', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { type: 'book', title: 'Test' } },
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
                      oneOf: [
                        { type: 'object', properties: { type: { const: 'book' }, title: { type: 'string' } } },
                        { type: 'object', properties: { type: { const: 'movie' }, director: { type: 'string' } } },
                      ],
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
      expect(callArg.results[0].valid).toBe(true);
    });

    test('validates oneOf - multiple matches fails', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { value: 42 } },
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
                      oneOf: [
                        { type: 'object' },
                        { type: 'object', properties: { value: { type: 'number' } } },
                      ],
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'oneOf')).toBe(true);
    });
  });

  describe('anyOf validation', () => {
    test('validates anyOf - at least one match passes', async () => {
      const port = await createMockServer({
        'GET /values/1': { status: 200, body: { value: 'hello' } },
      });

      const spec = createOpenAPISpec({
        '/values/{id}': {
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
                      anyOf: [
                        { type: 'object', properties: { value: { type: 'string' } } },
                        { type: 'object', properties: { value: { type: 'number' } } },
                      ],
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
      expect(callArg.results[0].valid).toBe(true);
    });

    test('validates anyOf - no matches fails', async () => {
      const port = await createMockServer({
        'GET /values/1': { status: 200, body: { value: true } },
      });

      const spec = createOpenAPISpec({
        '/values/{id}': {
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
                      anyOf: [
                        { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
                        { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
                      ],
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'anyOf')).toBe(true);
    });
  });

  describe('allOf validation', () => {
    test('validates allOf - all schemas must match', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { id: 1, name: 'Test', active: true } },
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
                      allOf: [
                        { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
                        { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
                      ],
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
      expect(callArg.results[0].valid).toBe(true);
    });

    test('validates allOf - missing required from one schema fails', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { id: 1 } }, // missing name
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
                      allOf: [
                        { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
                        { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
                      ],
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
  });

  describe('nullable validation', () => {
    test('allows null when nullable is true', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { value: null } },
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
                        value: { type: 'string', nullable: true },
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
      expect(callArg.results[0].valid).toBe(true);
    });

    test('rejects null when nullable is not set', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: null },
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
                        id: { type: 'integer' },
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'nullable')).toBe(true);
    });
  });

  describe('string pattern validation', () => {
    test('validates string pattern match', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { email: 'test@example.com' } },
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
                        email: { type: 'string', pattern: '^[a-z]+@[a-z]+\\.[a-z]+$' },
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
      expect(callArg.results[0].valid).toBe(true);
    });

    test('fails on pattern mismatch', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { code: 'invalid-code' } },
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
                        code: { type: 'string', pattern: '^[A-Z]{3}$' },
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'pattern')).toBe(true);
    });
  });

  describe('number maximum validation', () => {
    test('fails when number exceeds maximum', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { quantity: 150 } },
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
                        quantity: { type: 'integer', maximum: 100 },
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'maximum')).toBe(true);
    });
  });

  describe('string maxLength validation', () => {
    test('fails when string exceeds maxLength', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { name: 'ThisNameIsWayTooLongForTheSchema' } },
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
                        name: { type: 'string', maxLength: 10 },
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'maxLength')).toBe(true);
    });
  });

  describe('additionalProperties validation', () => {
    test('fails when additionalProperties is false and extra properties exist', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { id: 1, name: 'Test', extra: 'value' } },
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
                        id: { type: 'integer' },
                        name: { type: 'string' },
                      },
                      additionalProperties: false,
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
      expect(callArg.results[0].violations.some((v: any) => v.rule === 'additionalProperties')).toBe(true);
    });
  });

  describe('array items validation', () => {
    test('validates array items against schema', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [{ id: 1, name: 'Test' }] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
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
      expect(callArg.results[0].valid).toBe(true);
    });

    test('fails when array item violates schema', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [{ id: 'not-a-number', name: 'Test' }] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
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
      expect(callArg.results[0].violations.some((v: any) => v.path.includes('[0]'))).toBe(true);
    });
  });

  describe('integer type validation', () => {
    test('fails when integer expected but float received', async () => {
      const port = await createMockServer({
        'GET /items/1': { status: 200, body: { count: 3.14 } },
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
                        count: { type: 'integer' },
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
      expect(callArg.results[0].violations.some((v: any) => v.expected === 'integer')).toBe(true);
    });
  });

  describe('$ref validation edge cases', () => {
    test('reports unresolved $ref', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { id: 1 } },
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
                      schema: { $ref: '#/components/schemas/NonExistent' },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {},
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
      expect(callArg.results[0].valid).toBe(false);
      expect(callArg.results[0].violations.some((v: any) => v.rule === '$ref')).toBe(true);
    });
  });

  describe('request body examples', () => {
    test('uses request body example for POST', async () => {
      let receivedBody: any;
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          receivedBody = JSON.parse(body);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 1, ...receivedBody }));
        });
      });

      const port = await new Promise<number>((resolve) => {
        mockServer.listen(0, () => {
          resolve((mockServer.address() as { port: number }).port);
        });
      });

      const spec = createOpenAPISpec({
        '/users': {
          post: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                  example: { name: 'John Doe', email: 'john@example.com' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        email: { type: 'string' },
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

      expect(receivedBody).toEqual({ name: 'John Doe', email: 'john@example.com' });
    });

    test('uses examples object value for request body', async () => {
      let receivedBody: any;
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          receivedBody = JSON.parse(body);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 1 }));
        });
      });

      const port = await new Promise<number>((resolve) => {
        mockServer.listen(0, () => {
          resolve((mockServer.address() as { port: number }).port);
        });
      });

      const spec = createOpenAPISpec({
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                  examples: {
                    default: { value: { name: 'From Examples' } },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Created' },
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

      expect(receivedBody).toEqual({ name: 'From Examples' });
    });
  });

  describe('default response schema', () => {
    test('uses default response when status code not documented', async () => {
      const port = await createMockServer({
        'GET /users': { status: 418, body: { error: 'I am a teapot' } },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } },
              },
              'default': {
                description: 'Error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { error: { type: 'string' } },
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
      // Should not report undocumented status code because 'default' is present
      expect(callArg.results[0].violations.filter((v: any) => v.rule === 'status_code')).toHaveLength(0);
    });
  });

  describe('path parameter defaults', () => {
    test('uses default value for common param names', async () => {
      const port = await createMockServer({
        'GET /users/1': { status: 200, body: { id: 1 } },
      });

      const spec = createOpenAPISpec({
        '/users/{id}': {
          get: {
            parameters: [
              { name: 'id', in: 'path', required: true },
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
      expect(callArg.results[0].request.url).toContain('/users/1');
    });

    test('uses default for uuid param', async () => {
      const port = await createMockServer({
        'GET /items/00000000-0000-0000-0000-000000000001': { status: 200, body: {} },
      });

      const spec = createOpenAPISpec({
        '/items/{uuid}': {
          get: {
            parameters: [
              { name: 'uuid', in: 'path', required: true },
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
      expect(callArg.results[0].request.url).toContain('/items/00000000-0000-0000-0000-000000000001');
    });

    test('uses schema type hint for string params', async () => {
      const port = await createMockServer({
        'GET /items/test': { status: 200, body: {} },
      });

      const spec = createOpenAPISpec({
        '/items/{customParam}': {
          get: {
            parameters: [
              { name: 'customParam', in: 'path', required: true, schema: { type: 'string' } },
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
      expect(callArg.results[0].request.url).toContain('/items/test');
    });
  });

  describe('HTTP methods', () => {
    test('tests PUT endpoints', async () => {
      let receivedMethod = '';
      mockServer = http.createServer((req, res) => {
        receivedMethod = req.method || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ updated: true }));
      });

      const port = await new Promise<number>((resolve) => {
        mockServer.listen(0, () => {
          resolve((mockServer.address() as { port: number }).port);
        });
      });

      const spec = createOpenAPISpec({
        '/items/{id}': {
          put: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
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

      expect(receivedMethod).toBe('PUT');
    });

    test('tests PATCH endpoints', async () => {
      let receivedMethod = '';
      mockServer = http.createServer((req, res) => {
        receivedMethod = req.method || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ patched: true }));
      });

      const port = await new Promise<number>((resolve) => {
        mockServer.listen(0, () => {
          resolve((mockServer.address() as { port: number }).port);
        });
      });

      const spec = createOpenAPISpec({
        '/items/{id}': {
          patch: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
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

      expect(receivedMethod).toBe('PATCH');
    });

    test('tests DELETE endpoints', async () => {
      let receivedMethod = '';
      mockServer = http.createServer((req, res) => {
        receivedMethod = req.method || '';
        res.writeHead(204);
        res.end();
      });

      const port = await new Promise<number>((resolve) => {
        mockServer.listen(0, () => {
          resolve((mockServer.address() as { port: number }).port);
        });
      });

      const spec = createOpenAPISpec({
        '/items/{id}': {
          delete: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            ],
            responses: {
              '204': { description: 'No Content' },
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

      expect(receivedMethod).toBe('DELETE');
    });
  });

  describe('filtering by operationId', () => {
    test('filters endpoints by operationId', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: { '200': { description: 'Success' } },
          },
        },
        '/posts': {
          get: {
            operationId: 'getPosts',
            responses: { '200': { description: 'Success' } },
          },
        },
      });

      const specPath = path.join(tempDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
        endpoints: ['getUsers'],
      });

      expect(mockSuccess).toHaveBeenCalled();
      const callArg = mockSuccess.mock.calls[0][0];
      expect(callArg.results.length).toBe(1);
      expect(callArg.results[0].endpoint).toBe('/users');
    });
  });

  describe('spec without extension parsing', () => {
    test('attempts JSON then YAML for unknown extension', async () => {
      const port = await createMockServer({
        'GET /users': { status: 200, body: [] },
      });

      const spec = createOpenAPISpec({
        '/users': {
          get: {
            responses: { '200': { description: 'Success' } },
          },
        },
      });

      // Write with non-standard extension
      const specPath = path.join(tempDir, 'spec.api');
      fs.writeFileSync(specPath, JSON.stringify(spec));

      await handleValidateApiContract({
        spec_path: specPath,
        base_url: `http://localhost:${port}`,
      });

      expect(mockSuccess).toHaveBeenCalled();
    });
  });
});
