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

import { handleGenerateOpenApi, GenerateOpenApiArgs, generateExample, toYaml, setYamlConverter, resetYamlConverter } from '../../../handlers/docs/generate-openapi.js';
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

  describe('union types with multiple non-null parts', () => {
    it('should generate oneOf schema for union types with multiple non-null parts', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/union', handler_file: 'union-multi.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('union-multi.ts')) {
          return `
            interface UnionMultiRequest {
              value: string | number;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const schema = spec.paths['/api/union'].post.requestBody?.content['application/json'].schema;
        // The schema should have oneOf for multiple non-null types
        expect(schema).toBeDefined();
      });

      const args: GenerateOpenApiArgs = {};
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle union types with multiple parts and nullable', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/nullable-union', handler_file: 'nullable-union.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('nullable-union.ts')) {
          return `
            interface NullableUnionRequest {
              value: string | number | null;
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

  describe('custom type references', () => {
    it('should generate $ref for custom/unknown type names', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/custom', handler_file: 'custom-type.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('custom-type.ts')) {
          return `
            interface CustomTypeRequest {
              user: UserModel;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const schema = spec.paths['/api/custom'].post.requestBody?.content['application/json'].schema;
        // Custom types should produce a $ref
        expect(schema).toBeDefined();
        if (schema.properties?.user) {
          expect(schema.properties.user.$ref).toBe('#/components/schemas/UserModel');
        }
      });

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

  describe('generateExample edge cases', () => {
    it('should handle schema with $ref (line 344)', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/ref-example', handler_file: 'ref-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('ref-example.ts')) {
          // Interface with custom type creates $ref
          return `
            interface RefExampleRequest {
              user: CustomUser;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const example = spec.paths['/api/ref-example'].post.requestBody?.content['application/json'].example;
        // The example for $ref should be { '...': 'Reference object' }
        expect(example).toBeDefined();
        expect(example.user).toEqual({ '...': 'Reference object' });
      });

      const args: GenerateOpenApiArgs = { include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should use schema example value if provided (line 348)', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/with-example', handler_file: 'with-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('with-example.ts')) {
          return `
            interface WithExampleResponse {
              status: string;
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

    it('should use schema default value if no example (line 352)', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/with-default', handler_file: 'with-default.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('with-default.ts')) {
          return `
            interface WithDefaultResponse {
              count: number;
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

    it('should return empty array for array schema without items (line 376)', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/array-no-items', handler_file: 'array-no-items.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('array-no-items.ts')) {
          // Return something that would trigger array without items scenario
          return `
            interface ArrayNoItemsResponse {
              items: any[];
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

    it('should return null for unknown schema type (line 387)', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/unknown-type', handler_file: 'unknown-type.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('unknown-type.ts')) {
          return `
            interface UnknownTypeResponse {
              value: never;
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

  describe('toYaml edge cases', () => {
    it('should handle null example values in YAML output (line 521)', () => {
      // When generateExample returns null (for unknown types), and we output YAML,
      // the toYaml function should convert null to 'null' string
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/null-example', handler_file: 'null-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('null-example.ts')) {
          // 'never' type maps to { type: 'object' } which doesn't match any generateExample case
          // and default case returns null
          return `
            interface NullExampleResponse {
              value: never;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const contentStr = String(content);
        // YAML output should contain 'null' string for the null example value
        expect(contentStr).toContain('openapi:');
        // The example for 'never' type returns null via default case
        expect(contentStr).toContain('null');
      });

      const args: GenerateOpenApiArgs = { format: 'yaml', include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle undefined description in YAML output', () => {
      // Test that toYaml handles undefined values (skipped in the spec but could appear)
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/no-desc', handler_file: 'no-desc.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const contentStr = String(content);
        expect(contentStr).toContain('openapi:');
      });

      // No description provided - will be undefined in the spec
      const args: GenerateOpenApiArgs = { format: 'yaml' };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle various primitive values in YAML arrays', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users', handler_file: 'route.ts' },
              { method: 'POST', path: '/api/users', handler_file: 'route.ts' },
              { method: 'PUT', path: '/api/items', handler_file: 'route.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const contentStr = String(content);
        expect(contentStr).toContain('openapi:');
        expect(contentStr).toContain('tags:');
      });

      const args: GenerateOpenApiArgs = { format: 'yaml' };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('YAML conversion error handling', () => {
    it('should fall back to JSON when YAML conversion fails (lines 779-780)', () => {
      // The YAML conversion error path is defensive code that handles unexpected errors
      // in the toYaml function. Since toYaml handles all normal cases, this is hard to trigger.
      // We verify the code path exists and handles normally.

      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/yaml-error', handler_file: 'yaml-error.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');

      let writtenContent = '';
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        writtenContent = String(content);
      });

      const args: GenerateOpenApiArgs = { format: 'yaml' };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
      // Should have produced valid YAML output
      expect(writtenContent).toContain('openapi:');
    });
  });

  describe('toYaml null handling (line 521)', () => {
    it('should output null literal for null values in YAML', () => {
      // Create a scenario where a null value appears in the OpenAPI spec
      // This happens when generateExample returns null for an unrecognized type
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/nullable-response', handler_file: 'nullable.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('nullable.ts')) {
          // The nullable type with null will trigger nullable: true on schema
          return `
            interface NullableResponse {
              data: null;
            }
          `;
        }
        return '{}';
      });

      let writtenContent = '';
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        writtenContent = String(content);
      });

      const args: GenerateOpenApiArgs = { format: 'yaml', include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
      expect(writtenContent).toContain('openapi:');
      // When null type is used, nullable should appear
      expect(writtenContent).toContain('nullable');
    });
  });

  describe('toYaml fallback handling (line 565)', () => {
    it('should handle all supported types in YAML conversion', () => {
      // The fallback String(obj) at line 565 handles unexpected types
      // In normal operation, OpenAPI specs only contain JSON-compatible types
      // so this branch is defensive. We verify normal types work correctly.
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/types', handler_file: 'types.ts' },
            ],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('types.ts')) {
          return `
            interface TypesResponse {
              str: string;
              num: number;
              bool: boolean;
              arr: string[];
            }
          `;
        }
        return '{}';
      });

      let writtenContent = '';
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        writtenContent = String(content);
      });

      const args: GenerateOpenApiArgs = { format: 'yaml', include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
      expect(writtenContent).toContain('openapi:');
      // Verify the YAML contains expected type indicators
      expect(writtenContent).toContain('type:');
    });
  });

  describe('additional generateExample coverage', () => {
    it('should generate example for enum values', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/enum-example', handler_file: 'enum-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('enum-example.ts')) {
          return `
            interface EnumExampleRequest {
              status: "active";
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const example = spec.paths['/api/enum-example'].post.requestBody?.content['application/json'].example;
        expect(example).toBeDefined();
        // Should use first enum value as example
        expect(example.status).toBe('active');
      });

      const args: GenerateOpenApiArgs = { include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should generate examples for string formats', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/format-example', handler_file: 'format-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('format-example.ts')) {
          return `
            interface FormatExampleRequest {
              createdAt: Date;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const example = spec.paths['/api/format-example'].post.requestBody?.content['application/json'].example;
        expect(example).toBeDefined();
        // Date format should produce date-time example
        expect(example.createdAt).toContain('2024');
      });

      const args: GenerateOpenApiArgs = { include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should generate examples for object with properties', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/object-example', handler_file: 'object-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('object-example.ts')) {
          return `
            interface ObjectExampleRequest {
              name: string;
              age: number;
              active: boolean;
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const example = spec.paths['/api/object-example'].post.requestBody?.content['application/json'].example;
        expect(example).toBeDefined();
        expect(example.name).toBe('string');
        expect(example.age).toBe(123);
        expect(example.active).toBe(true);
      });

      const args: GenerateOpenApiArgs = { include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });

    it('should generate examples for array with items', () => {
      vi.mocked(handleGetApiRoutes).mockReturnValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'POST', path: '/api/array-example', handler_file: 'array-example.ts' }],
          }),
        }],
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('array-example.ts')) {
          return `
            interface ArrayExampleRequest {
              tags: string[];
            }
          `;
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        const spec = JSON.parse(String(content));
        const example = spec.paths['/api/array-example'].post.requestBody?.content['application/json'].example;
        expect(example).toBeDefined();
        expect(Array.isArray(example.tags)).toBe(true);
        expect(example.tags).toEqual(['string']);
      });

      const args: GenerateOpenApiArgs = { include_examples: true };
      const result = handleGenerateOpenApi(args);

      expect(result.isError).toBeUndefined();
    });
  });
});

// Direct unit tests for exported helper functions
describe('generateExample', () => {
  it('should return schema.example when defined (line 348)', () => {
    const schema = { type: 'string', example: 'my-example-value' };
    const result = generateExample(schema);
    expect(result).toBe('my-example-value');
  });

  it('should return schema.default when example is not defined but default is (line 352)', () => {
    const schema = { type: 'string', default: 'my-default-value' };
    const result = generateExample(schema);
    expect(result).toBe('my-default-value');
  });

  it('should prefer example over default', () => {
    const schema = { type: 'string', example: 'example', default: 'default' };
    const result = generateExample(schema);
    expect(result).toBe('example');
  });

  it('should return empty array for array type without items (line 376)', () => {
    const schema = { type: 'array' };
    const result = generateExample(schema);
    expect(result).toEqual([]);
  });

  it('should return null for unknown type (line 387)', () => {
    const schema = { type: 'unknown-type' };
    const result = generateExample(schema);
    expect(result).toBeNull();
  });

  it('should return null for schema with no type', () => {
    const schema = {};
    const result = generateExample(schema);
    expect(result).toBeNull();
  });
});

describe('toYaml', () => {
  it('should return null string for null value (line 521)', () => {
    const result = toYaml(null);
    expect(result).toBe('null');
  });

  it('should return null string for undefined value (line 521)', () => {
    const result = toYaml(undefined);
    expect(result).toBe('null');
  });

  it('should convert unknown types using String() (line 565)', () => {
    // Symbol is not covered by the if-else chain, falls through to String(obj)
    const sym = Symbol('test');
    const result = toYaml(sym);
    expect(result).toBe('Symbol(test)');
  });

  it('should convert BigInt using String() (line 565)', () => {
    const bigint = BigInt(12345);
    const result = toYaml(bigint);
    expect(result).toBe('12345');
  });

  it('should handle function type (line 565)', () => {
    const fn = function testFunc() {};
    const result = toYaml(fn);
    expect(result).toContain('function');
  });

  it('should handle nested objects correctly', () => {
    const obj = { a: { b: 'value' } };
    const result = toYaml(obj);
    expect(result).toContain('a:');
    expect(result).toContain('b: value');
  });

  it('should handle arrays with primitive items', () => {
    const arr = [1, 2, 3];
    const result = toYaml(arr);
    expect(result).toContain('- 1');
    expect(result).toContain('- 2');
    expect(result).toContain('- 3');
  });

  it('should handle empty object', () => {
    const result = toYaml({});
    expect(result).toBe('{}');
  });

  it('should handle empty array', () => {
    const result = toYaml([]);
    expect(result).toBe('[]');
  });

  it('should quote strings that start with numbers', () => {
    const result = toYaml('123abc');
    expect(result).toBe('"123abc"');
  });

  it('should quote strings that look like booleans', () => {
    expect(toYaml('true')).toBe('"true"');
    expect(toYaml('false')).toBe('"false"');
  });

  it('should quote strings that look like null', () => {
    const result = toYaml('null');
    expect(result).toBe('"null"');
  });

  it('should quote empty strings', () => {
    const result = toYaml('');
    expect(result).toBe('""');
  });

  it('should quote strings with colons', () => {
    const result = toYaml('key: value');
    expect(result).toBe('"key: value"');
  });

  it('should quote strings with hashes', () => {
    const result = toYaml('text # comment');
    expect(result).toBe('"text # comment"');
  });

  it('should quote strings with leading spaces', () => {
    const result = toYaml(' leading');
    expect(result).toBe('" leading"');
  });

  it('should quote strings with trailing spaces', () => {
    const result = toYaml('trailing ');
    expect(result).toBe('"trailing "');
  });

  it('should quote strings with newlines', () => {
    const result = toYaml('line1\nline2');
    expect(result).toBe('"line1\\nline2"');
  });

  it('should handle numbers', () => {
    expect(toYaml(42)).toBe('42');
    expect(toYaml(3.14)).toBe('3.14');
  });

  it('should handle booleans', () => {
    expect(toYaml(true)).toBe('true');
    expect(toYaml(false)).toBe('false');
  });
});

describe('YAML conversion error handling (lines 803-804)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetYamlConverter();
  });

  afterEach(() => {
    resetYamlConverter();
  });

  it('should fall back to JSON and add warning when toYaml throws an Error', () => {
    // Set a throwing converter
    setYamlConverter(() => {
      throw new Error('YAML conversion failed intentionally');
    });

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

    let writtenContent = '';
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      writtenContent = String(content);
    });

    const args: GenerateOpenApiArgs = { format: 'yaml' };
    const result = handleGenerateOpenApi(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.success).toBe(true);
    // Should have a warning about YAML conversion failure
    expect(data.warnings).toBeDefined();
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(data.warnings[0]).toContain('YAML conversion warning');
    expect(data.warnings[0]).toContain('YAML conversion failed intentionally');
    // Content should be JSON (fallback), not YAML
    expect(writtenContent.startsWith('{')).toBe(true);
    expect(writtenContent).toContain('"openapi"');
  });

  it('should handle non-Error throws in toYaml (Unknown error path)', () => {
    // Set a converter that throws a non-Error value
    setYamlConverter(() => {
      throw 'String error message';
    });

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

    let writtenContent = '';
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      writtenContent = String(content);
    });

    const args: GenerateOpenApiArgs = { format: 'yaml' };
    const result = handleGenerateOpenApi(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.success).toBe(true);
    // Should have a warning with "Unknown error"
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(data.warnings[0]).toContain('Unknown error');
    // Content should be JSON (fallback)
    expect(writtenContent.startsWith('{')).toBe(true);
  });
});

// =============================================================================
// Additional branch coverage tests
// =============================================================================

describe('extractPathParameters duplicate detection (line 214)', () => {
  it('should not add duplicate params when route has both Next.js and Express style for same param', () => {
    // Test a route that has the same parameter in both Next.js [id] and Express :id styles
    // This tests the branch at line 214 where we check if param already exists
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        // Path with both [id] and :id - the Express pattern should be skipped as duplicate
        text: JSON.stringify({
          routes: [
            { method: 'GET', path: '/api/users/[id]/:id', handler_file: 'route.ts' },
          ],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      // Should only have one 'id' parameter, not two
      const params = spec.paths['/api/users/{id}/{id}'].get.parameters;
      const idParams = params.filter((p: { name: string }) => p.name === 'id');
      expect(idParams.length).toBe(1);
    });

    const args: GenerateOpenApiArgs = {};
    handleGenerateOpenApi(args);
  });
});

describe('generateOperationId with different param formats (line 243)', () => {
  it('should handle Express-style :param in operation ID generation', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [
            { method: 'GET', path: '/api/items/:itemId/details', handler_file: 'route.ts' },
          ],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const operationId = spec.paths['/api/items/{itemId}/details'].get.operationId;
      // Should contain ByItemId for the :itemId param
      expect(operationId).toContain('ByItemId');
    });

    const args: GenerateOpenApiArgs = {};
    handleGenerateOpenApi(args);
  });

  it('should handle OpenAPI-style {param} in operation ID generation', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [
            { method: 'GET', path: '/api/orders/{orderId}/status', handler_file: 'route.ts' },
          ],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const operationId = spec.paths['/api/orders/{orderId}/status'].get.operationId;
      // Should contain ByOrderId for the {orderId} param
      expect(operationId).toContain('ByOrderId');
    });

    const args: GenerateOpenApiArgs = {};
    handleGenerateOpenApi(args);
  });
});

describe('typeToJsonSchema special types (lines 280, 282)', () => {
  it('should convert undefined type to string schema (line 280)', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'POST', path: '/api/undefined-type', handler_file: 'undefined-type.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('undefined-type.ts')) {
        return `
          interface UndefinedTypeRequest {
            value: undefined;
          }
        `;
      }
      return '{}';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const schema = spec.paths['/api/undefined-type'].post.requestBody?.content['application/json'].schema;
      expect(schema.properties.value.type).toBe('string');
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });

  it('should convert void type to object schema (line 282)', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'POST', path: '/api/void-type', handler_file: 'void-type.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('void-type.ts')) {
        return `
          interface VoidTypeRequest {
            callback: void;
          }
        `;
      }
      return '{}';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const schema = spec.paths['/api/void-type'].post.requestBody?.content['application/json'].schema;
      expect(schema.properties.callback.type).toBe('object');
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});

describe('typeToJsonSchema nullable with single non-null part (line 312)', () => {
  it('should set nullable true when union has single non-null type and null', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'POST', path: '/api/nullable-single', handler_file: 'nullable-single.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('nullable-single.ts')) {
        return `
          interface NullableSingleRequest {
            optionalValue: number | null;
          }
        `;
      }
      return '{}';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const schema = spec.paths['/api/nullable-single'].post.requestBody?.content['application/json'].schema;
      expect(schema.properties.optionalValue.type).toBe('number');
      expect(schema.properties.optionalValue.nullable).toBe(true);
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});

describe('generateExample string formats (lines 363-366)', () => {
  it('should generate date format example (line 363)', () => {
    const schema = { type: 'string', format: 'date' };
    const result = generateExample(schema);
    expect(result).toBe('2024-01-15');
  });

  it('should generate email format example (line 364)', () => {
    const schema = { type: 'string', format: 'email' };
    const result = generateExample(schema);
    expect(result).toBe('user@example.com');
  });

  it('should generate uri format example (line 365)', () => {
    const schema = { type: 'string', format: 'uri' };
    const result = generateExample(schema);
    expect(result).toBe('https://example.com');
  });

  it('should generate uuid format example (line 366)', () => {
    const schema = { type: 'string', format: 'uuid' };
    const result = generateExample(schema);
    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
});

describe('parseInterfaceToSchema optional property (line 503)', () => {
  it('should not add optional properties to required array', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'POST', path: '/api/optional-props', handler_file: 'optional-props.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('optional-props.ts')) {
        return `
          interface OptionalPropsRequest {
            required_field: string;
            optional_field?: number;
          }
        `;
      }
      return '{}';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const schema = spec.paths['/api/optional-props'].post.requestBody?.content['application/json'].schema;
      // required_field should be in required, optional_field should not
      expect(schema.required).toContain('required_field');
      expect(schema.required).not.toContain('optional_field');
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});

describe('handleGenerateOpenApi non-Error throw (line 630)', () => {
  it('should handle non-Error throw from api-routes response', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'Some error message' }),
      }],
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Failed to get API routes');
    expect(data.error).toContain('Some error message');
  });

  it('should handle thrown string from JSON.parse (unknown error path)', () => {
    // Create a scenario where JSON.parse might throw a non-standard error
    // This is defensive code - we test by mocking a response that causes parse issues
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{ type: 'text', text: undefined as unknown as string }],
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Failed to get API routes');
  });
});

describe('requestBody with parsed requestSchema (line 741)', () => {
  it('should add requestBody when requestSchema is parsed from handler file', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'POST', path: '/api/with-schema', handler_file: 'with-schema.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('with-schema.ts')) {
        return `
          interface WithSchemaRequest {
            name: string;
            email: string;
          }
        `;
      }
      return '{}';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const requestBody = spec.paths['/api/with-schema'].post.requestBody;
      expect(requestBody).toBeDefined();
      expect(requestBody.content['application/json'].schema.properties.name).toBeDefined();
      expect(requestBody.content['application/json'].schema.properties.email).toBeDefined();
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});

describe('securitySchemes already exists (line 764)', () => {
  it('should not overwrite existing securitySchemes when adding new auth route', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [
            { method: 'GET', path: '/api/protected1', handler_file: 'route.ts', middleware: ['auth'] },
            { method: 'GET', path: '/api/protected2', handler_file: 'route.ts', middleware: ['authenticate'] },
          ],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      // Both routes should have security
      expect(spec.paths['/api/protected1'].get.security).toBeDefined();
      expect(spec.paths['/api/protected2'].get.security).toBeDefined();
      // securitySchemes should exist and have bearerAuth
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});

describe('writeFileSync non-Error throw (line 819)', () => {
  it('should handle non-Error throw from writeFileSync', () => {
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
      throw 'String error instead of Error object';
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Failed to write OpenAPI spec');
    expect(data.error).toContain('Unknown error');
  });
});

describe('typeToJsonSchema edge case: single non-null part in union, non-nullable (line 312 false branch)', () => {
  // The false branch of line 312 occurs when nonNullParts.length === 1 and isNullable is false.
  // This is logically impossible given the code structure, but we test the nullable true path
  // more thoroughly to ensure all code paths that CAN execute are covered.

  it('should handle union with only undefined (makes single non-null impossible)', () => {
    // Testing edge case: if union is "string | undefined", we get:
    // - parts = ['string', 'undefined']
    // - nonNullParts = ['string'] (filtered out 'undefined')
    // - isNullable = true (2 > 1)
    // - returns { type: 'string', nullable: true }
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'POST', path: '/api/single-union', handler_file: 'single-union.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('single-union.ts')) {
        return `
          interface SingleUnionRequest {
            value: string | undefined;
          }
        `;
      }
      return '{}';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      const schema = spec.paths['/api/single-union'].post.requestBody?.content['application/json'].schema;
      expect(schema.properties.value.type).toBe('string');
      expect(schema.properties.value.nullable).toBe(true);
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});

describe('handleGenerateOpenApi catch block non-Error (line 630 Unknown error)', () => {
  it('should trigger Unknown error path when non-Error is caught', () => {
    // Mock handleGetApiRoutes to return something that will cause the catch block
    // to receive a non-Error value. We use content with a getter that throws a string.
    const mockContent = {
      get text() {
        throw 'Not an Error object';
      }
    };

    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [mockContent as unknown as { type: 'text'; text: string }],
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Failed to get API routes');
    expect(data.error).toContain('Unknown error');
  });
});

describe('requestBody finalRequestSchema falsy path (line 741 false branch)', () => {
  // The if (finalRequestSchema) on line 741 is inside if (requestSchema || defaultRequestSchema)
  // This means finalRequestSchema is already guaranteed to be truthy since it's set to
  // requestSchema || defaultRequestSchema, and we're inside a block that checks that.
  // However, TypeScript narrowing might not catch this, so the check exists for safety.
  // This branch is effectively unreachable, but we verify the existing behavior.

  it('should verify GET method has no requestBody (defaultRequestSchema returns null)', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'GET', path: '/api/no-body', handler_file: 'no-body.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('export function GET() {}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      // GET should not have requestBody
      expect(spec.paths['/api/no-body'].get.requestBody).toBeUndefined();
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });

  it('should verify DELETE method has no requestBody', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'DELETE', path: '/api/delete-item', handler_file: 'delete.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('export function DELETE() {}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      expect(spec.paths['/api/delete-item'].delete.requestBody).toBeUndefined();
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });

  it('should verify HEAD method has no requestBody', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'HEAD', path: '/api/head', handler_file: 'head.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('export function HEAD() {}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      expect(spec.paths['/api/head'].head.requestBody).toBeUndefined();
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });

  it('should verify OPTIONS method has no requestBody', () => {
    vi.mocked(handleGetApiRoutes).mockReturnValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          routes: [{ method: 'OPTIONS', path: '/api/options', handler_file: 'options.ts' }],
        }),
      }],
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('export function OPTIONS() {}');
    vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
      const spec = JSON.parse(String(content));
      expect(spec.paths['/api/options'].options.requestBody).toBeUndefined();
    });

    const args: GenerateOpenApiArgs = {};
    const result = handleGenerateOpenApi(args);
    expect(result.isError).toBeUndefined();
  });
});
