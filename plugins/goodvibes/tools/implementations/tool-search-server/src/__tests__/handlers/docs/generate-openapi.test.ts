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
  });
});
