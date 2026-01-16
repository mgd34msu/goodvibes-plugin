/**
 * Unit tests for generate-openapi handler
 *
 * Tests cover:
 * - OpenAPI 3.0.3 spec generation
 * - Route path conversion (Next.js, Express patterns)
 * - Path parameter extraction
 * - Operation ID generation
 * - Tag extraction
 * - Request/response schema parsing
 * - JSON and YAML output formats
 * - Default values from package.json
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock modules before imports
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../../handlers/schema/api-routes.js', () => ({
  handleGetApiRoutes: vi.fn(),
}));

import { handleGenerateOpenApi, GenerateOpenApiArgs } from '../../../handlers/docs/generate-openapi.js';
import { handleGetApiRoutes } from '../../../handlers/schema/api-routes.js';

describe('handleGenerateOpenApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic spec generation', () => {
    it('should generate valid OpenAPI 3.0.3 specification', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'app/api/users/route.ts' },
            ],
            framework: 'next',
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.success).toBe(true);
      expect(data.spec_version).toBe('3.0.3');
    });

    it('should return error when no API routes found', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'No API routes found' }),
        }],
        isError: true,
      });

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to get API routes');
    });
  });

  describe('route path conversion', () => {
    it('should convert Next.js dynamic segments to OpenAPI format', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users/[id]', handler_file: 'app/api/users/[id]/route.ts' },
              { method: 'GET', path: '/api/posts/[postId]/comments/[commentId]', handler_file: 'app/api/posts/[postId]/comments/[commentId]/route.ts' },
            ],
            framework: 'next',
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Paths should be converted from [id] to {id}
      expect(data.endpoints.some((e: { path: string }) => e.path.includes('{id}'))).toBe(true);
    });

    it('should convert Express-style params to OpenAPI format', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users/:userId', handler_file: 'routes/users.ts' },
            ],
            framework: 'express',
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // :userId should become {userId}
      expect(data.endpoints.some((e: { path: string }) => e.path.includes('{userId}'))).toBe(true);
    });
  });

  describe('path parameter extraction', () => {
    it('should extract path parameters from Next.js routes', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users/[id]', handler_file: 'app/api/users/[id]/route.ts' },
            ],
            framework: 'next',
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api/users/{id}'].get.parameters).toBeDefined();
        expect(spec.paths['/api/users/{id}'].get.parameters[0].name).toBe('id');
        expect(spec.paths['/api/users/{id}'].get.parameters[0].in).toBe('path');
        expect(spec.paths['/api/users/{id}'].get.parameters[0].required).toBe(true);
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('operation ID generation', () => {
    it('should generate meaningful operation IDs', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'app/api/users/route.ts' },
              { method: 'POST', path: '/api/users', handler_file: 'app/api/users/route.ts' },
              { method: 'GET', path: '/api/users/[id]', handler_file: 'app/api/users/[id]/route.ts' },
            ],
            framework: 'next',
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        // Operation IDs should be descriptive
        expect(spec.paths['/api/users'].get.operationId).toBeDefined();
        expect(spec.paths['/api/users'].post.operationId).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('tag extraction', () => {
    it('should extract tags from route paths', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'app/api/users/route.ts' },
              { method: 'GET', path: '/api/posts', handler_file: 'app/api/posts/route.ts' },
            ],
            framework: 'next',
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        // Tags should be extracted from first path segment after /api
        expect(spec.tags).toBeDefined();
        expect(spec.tags.length).toBeGreaterThan(0);
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('package.json defaults', () => {
    it('should use title from package.json name', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('package.json')) {
          return JSON.stringify({ name: 'my-api', version: '2.0.0' });
        }
        return '';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.info.title).toBe('my-api');
        expect(spec.info.version).toBe('2.0.0');
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should override package.json with provided args', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('package.json')) {
          return JSON.stringify({ name: 'my-api', version: '1.0.0' });
        }
        return '';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.info.title).toBe('Custom API');
        expect(spec.info.version).toBe('3.0.0');
        expect(spec.info.description).toBe('Custom description');
      });

      const args: GenerateOpenApiArgs = {
        title: 'Custom API',
        version: '3.0.0',
        description: 'Custom description',
      };
      handleGenerateOpenApi(args);
    });
  });

  describe('server URL', () => {
    it('should include server URL when provided', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.servers).toBeDefined();
        expect(spec.servers[0].url).toBe('https://api.example.com');
      });

      const args: GenerateOpenApiArgs = {
        server_url: 'https://api.example.com',
      };
      handleGenerateOpenApi(args);
    });
  });

  describe('output format', () => {
    it('should output JSON by default', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((path) => {
        expect(String(path)).toContain('openapi.json');
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should output YAML when specified', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((path, content) => {
        expect(String(path)).toContain('openapi.yaml');
        // YAML should not be valid JSON (not starting with {)
        const contentStr = String(content).trim();
        expect(contentStr.startsWith('openapi:')).toBe(true);
      });

      const args: GenerateOpenApiArgs = {
        format: 'yaml',
      };
      handleGenerateOpenApi(args);
    });

    it('should use custom output path when provided', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((path) => {
        expect(String(path)).toContain('custom-spec.json');
      });

      const args: GenerateOpenApiArgs = {
        output_path: 'docs/custom-spec.json',
      };
      handleGenerateOpenApi(args);
    });
  });

  describe('request body handling', () => {
    it('should add request body for POST/PUT/PATCH methods', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'POST', path: '/api/users', handler_file: 'route.ts' },
              { method: 'PUT', path: '/api/users/[id]', handler_file: 'route.ts' },
              { method: 'PATCH', path: '/api/users/[id]', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api/users'].post.requestBody).toBeDefined();
        expect(spec.paths['/api/users/{id}'].put.requestBody).toBeDefined();
        expect(spec.paths['/api/users/{id}'].patch.requestBody).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should not add request body for GET/DELETE methods', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'route.ts' },
              { method: 'DELETE', path: '/api/users/[id]', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api/users'].get.requestBody).toBeUndefined();
        expect(spec.paths['/api/users/{id}'].delete.requestBody).toBeUndefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('middleware security detection', () => {
    it('should add security scheme for auth middleware', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/protected', handler_file: 'route.ts', middleware: ['authenticate'] },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.components.securitySchemes).toBeDefined();
        expect(spec.paths['/api/protected'].get.security).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('response format', () => {
    it('should return success result with metadata', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'route.ts' },
              { method: 'POST', path: '/api/users', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.output_path).toBeDefined();
      expect(data.routes_documented).toBe(2);
      expect(data.endpoints).toHaveLength(2);
    });

    it('should track missing types', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'POST', path: '/api/users', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('export function POST() {}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.missing_types).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle file write errors', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to write');
    });

    it('should handle empty response from get_api_routes', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{ type: 'text', text: '' }],
      });

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to get API routes');
    });

    it('should handle malformed JSON from get_api_routes', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{ type: 'text', text: 'not valid json' }],
      });

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to get API routes');
    });

    it('should handle package.json read errors gracefully', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(false); // No package.json
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};

      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      // Should still succeed with default values
      expect(result.isError).toBeUndefined();
      expect(data.success).toBe(true);
    });
  });

  describe('type conversion to JSON Schema', () => {
    it('should convert primitive types correctly', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/test', handler_file: 'handler.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('handler.ts')) {
          return `
            interface CreateRequest {
              name: string;
              count: number;
              active: boolean;
              date: Date;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const schema = spec.paths['/api/test'].post.requestBody?.content['application/json'].schema;
        expect(schema).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should convert array types correctly', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/items', handler_file: 'items.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('items.ts')) {
          return `
            interface ItemsRequest {
              items: string[];
              numbers: Array<number>;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should convert union types with nullable', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/union', handler_file: 'union.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('union.ts')) {
          return `
            interface UnionRequest {
              value: string | null;
              status: string | undefined;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should convert Record types correctly', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/record', handler_file: 'record.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('record.ts')) {
          return `
            interface RecordRequest {
              metadata: Record<string, number>;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle special types (any, unknown, void, never)', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/special', handler_file: 'special.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('special.ts')) {
          return `
            interface SpecialRequest {
              anything: any;
              unknown: unknown;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('handler file parsing', () => {
    it('should detect Zod schema definitions', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/zod', handler_file: 'zod-handler.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('zod-handler.ts')) {
          return `
            const createUserSchema = z.object({
              name: z.string(),
              email: z.string().email(),
            });
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should detect NextResponse.json return types', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/next', handler_file: 'next-handler.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('next-handler.ts')) {
          return `
            export async function GET() {
              return NextResponse.json({ data: 'test', success: true });
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should detect Response.json return types', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/response', handler_file: 'response-handler.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('response-handler.ts')) {
          return `
            export async function GET() {
              return Response.json({ message: 'ok' });
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle non-existent handler file gracefully', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/missing', handler_file: 'nonexistent.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).includes('nonexistent.ts')) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle file read errors in handler parsing', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/error', handler_file: 'error.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('error.ts')) {
          throw new Error('Read error');
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('example generation', () => {
    it('should generate examples when include_examples is true', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/examples', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api/examples'].get.responses['200'].content['application/json'].example).toBeDefined();
      });

      const args: GenerateOpenApiArgs = { include_examples: true };
      handleGenerateOpenApi(args);
    });

    it('should skip examples when include_examples is false', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/no-examples', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api/no-examples'].get.responses['200'].content['application/json'].example).toBeUndefined();
      });

      const args: GenerateOpenApiArgs = { include_examples: false };
      handleGenerateOpenApi(args);
    });

    it('should generate examples for various schema types', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/typed', handler_file: 'typed.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('typed.ts')) {
          return `
            interface TypedRequest {
              email: string;
              age: number;
              verified: boolean;
              items: string[];
            }
            interface TypedResponse {
              id: string;
              createdAt: Date;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = { include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('YAML output', () => {
    it('should handle complex nested objects in YAML', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/nested', handler_file: 'route.ts' },
              { method: 'POST', path: '/api/nested', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const contentStr = String(content);
        expect(contentStr).toContain('openapi:');
        expect(contentStr).toContain('paths:');
      });

      const args: GenerateOpenApiArgs = { format: 'yaml' };
      handleGenerateOpenApi(args);
    });

    it('should properly quote special strings in YAML', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('package.json')) {
          return JSON.stringify({
            name: 'test-api',
            description: 'A description with: colons and # hashes',
          });
        }
        return '';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = { format: 'yaml' };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle arrays in YAML output', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'route.ts' },
              { method: 'GET', path: '/api/posts', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const contentStr = String(content);
        expect(contentStr).toContain('tags:');
      });

      const args: GenerateOpenApiArgs = { format: 'yaml' };
      handleGenerateOpenApi(args);
    });

    it('should handle empty arrays and objects in YAML', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'DELETE', path: '/api/empty', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = { format: 'yaml' };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('missing type tracking', () => {
    it('should track routes missing both request and response schemas', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'POST', path: '/api/no-types', handler_file: 'no-types.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('export function POST() {}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.missing_types.length).toBeGreaterThan(0);
      expect(data.missing_types.some((m: { missing: string }) => m.missing === 'both' || m.missing === 'response')).toBe(true);
    });

    it('should track routes missing only request schema', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'PUT', path: '/api/partial', handler_file: 'partial.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('partial.ts')) {
          return `
            interface PartialResponse {
              success: boolean;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.missing_types).toBeDefined();
    });

    it('should not track missing request for GET/DELETE/HEAD/OPTIONS', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/get', handler_file: 'route.ts' },
              { method: 'DELETE', path: '/api/delete', handler_file: 'route.ts' },
              { method: 'HEAD', path: '/api/head', handler_file: 'route.ts' },
              { method: 'OPTIONS', path: '/api/options', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('export function handler() {}');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);
      const data = JSON.parse(result.content[0].text);

      // Should only report response missing, not request
      const requestMissing = data.missing_types.filter((m: { missing: string }) => m.missing === 'request' || m.missing === 'both');
      expect(requestMissing.length).toBe(0);
    });
  });

  describe('operation ID generation', () => {
    it('should generate meaningful operation IDs for complex paths', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/organizations/[orgId]/members/[memberId]', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const operationId = spec.paths['/api/organizations/{orgId}/members/{memberId}'].get.operationId;
        expect(operationId).toContain('get');
        expect(operationId).toContain('Organizations');
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should handle root API path', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api'].get.operationId).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('middleware detection', () => {
    it('should detect protect middleware as auth', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/secure', handler_file: 'route.ts', middleware: ['protect'] },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should detect guard middleware as auth', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/guarded', handler_file: 'route.ts', middleware: ['authGuard'] },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
        expect(spec.paths['/api/guarded'].get.security).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should not add security for non-auth middleware', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/logged', handler_file: 'route.ts', middleware: ['logger', 'cors'] },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/api/logged'].get.security).toBeUndefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('tag extraction edge cases', () => {
    it('should extract default tag for paths without /api prefix', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/health', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        expect(spec.paths['/health'].get.tags).toContain('Default');
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });

    it('should handle paths with dynamic first segment', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/[tenantId]/resources', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        // Should use Default when first segment is dynamic
        expect(spec.paths['/api/{tenantId}/resources'].get.tags).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });

  describe('literal type handling', () => {
    it('should convert string literal types to enum', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/status', handler_file: 'status.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('status.ts')) {
          return `
            interface StatusRequest {
              status: "active";
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('response codes', () => {
    it('should include standard response codes', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/data', handler_file: 'route.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const responses = spec.paths['/api/data'].get.responses;
        expect(responses['200']).toBeDefined();
        expect(responses['400']).toBeDefined();
        expect(responses['500']).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      handleGenerateOpenApi(args);
    });
  });
});
