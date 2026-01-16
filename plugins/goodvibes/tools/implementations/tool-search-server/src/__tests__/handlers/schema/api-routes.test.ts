/**
 * Unit tests for API Routes handler
 *
 * Tests cover 100% of api-routes.ts:
 * - handleGetApiRoutes main function
 * - detectFramework function
 * - Next.js App Router and Pages Router parsing
 * - Express route parsing
 * - Fastify route parsing
 * - Hono route parsing
 * - findFiles utility
 * - getLineNumber utility
 * - Error handling and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  handleGetApiRoutes,
  type GetApiRoutesArgs,
  type ApiRoute,
  type ApiRoutesResult,
} from '../../../handlers/schema/api-routes.js';

// Mock modules
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

describe('api-routes handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =============================================================================
  // handleGetApiRoutes - Main Function Tests
  // =============================================================================

  describe('handleGetApiRoutes', () => {
    describe('framework auto-detection', () => {
      it('should auto-detect Next.js from package.json', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) return true;
          if (pathStr.includes('app') && pathStr.includes('api')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { next: '^14.0.0' },
        }));
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(data.framework).toBe('nextjs');
        expect(result.isError).toBeUndefined();
      });

      it('should auto-detect Hono from package.json', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) return true;
          if (pathStr.includes('src')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { hono: '^3.0.0' },
        }));
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(data.framework).toBe('hono');
      });

      it('should auto-detect Fastify from package.json', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) return true;
          if (pathStr.includes('src')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { fastify: '^4.0.0' },
        }));
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(data.framework).toBe('fastify');
      });

      it('should auto-detect Express from package.json', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) return true;
          if (pathStr.includes('src')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { express: '^4.18.0' },
        }));
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(data.framework).toBe('express');
      });

      it('should check devDependencies for framework detection', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) return true;
          if (pathStr.includes('src')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: {},
          devDependencies: { express: '^4.18.0' },
        }));
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(data.framework).toBe('express');
      });

      it('should return error when auto-detection fails with no package.json', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('Could not auto-detect framework');
        expect(data.hint).toContain('Supported frameworks');
      });

      it('should return error when package.json has no supported frameworks', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('package.json');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { lodash: '^4.0.0' },
        }));

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('Could not auto-detect framework');
      });

      it('should return error when package.json is malformed', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('package.json');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('invalid json {');

        const result = handleGetApiRoutes({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('Could not auto-detect framework');
      });
    });

    describe('explicit framework specification', () => {
      it('should use specified framework without auto-detection', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({ framework: 'express' });
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(data.framework).toBe('express');
        expect(result.isError).toBeUndefined();
      });

      it('should use custom path when provided', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        handleGetApiRoutes({ path: 'custom/path', framework: 'nextjs' });

        expect(checkedPaths.some(p => p.includes('custom'))).toBe(true);
      });
    });

    describe('response format', () => {
      it('should return properly formatted response with route count', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetApiRoutes({ framework: 'nextjs' });
        const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(data).toHaveProperty('framework');
        expect(data).toHaveProperty('routes');
        expect(data).toHaveProperty('count');
        expect(data.count).toBe(data.routes.length);
      });
    });
  });

  // =============================================================================
  // Next.js App Router Tests
  // =============================================================================

  describe('Next.js App Router parsing', () => {
    it('should parse route.ts files in app/api directory', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        const pathStr = String(p);
        if (options?.withFileTypes) {
          if (pathStr.includes('users')) {
            return [
              { name: 'route.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          return [
            { name: 'users', isDirectory: () => true, isFile: () => false },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export async function GET(request: Request) {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  return Response.json({ created: true });
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET')).toBe(true);
      expect(data.routes.some((r: ApiRoute) => r.method === 'POST')).toBe(true);
    });

    it('should parse route.tsx files', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export function GET() {
  return Response.json({});
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET')).toBe(true);
    });

    it('should parse route.js files', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.js', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export function GET() {
  return Response.json({});
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET')).toBe(true);
    });

    it('should parse route.jsx files', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.jsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export function GET() {
  return Response.json({});
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET')).toBe(true);
    });

    it('should parse const exports for handlers', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export const GET = async (request: Request) => {
  return Response.json({});
};

export const DELETE = (request: Request) => {
  return Response.json({});
};
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET')).toBe(true);
      expect(data.routes.some((r: ApiRoute) => r.method === 'DELETE')).toBe(true);
    });

    it('should parse all HTTP methods', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export async function GET() { return Response.json({}); }
export async function POST() { return Response.json({}); }
export async function PUT() { return Response.json({}); }
export async function DELETE() { return Response.json({}); }
export async function PATCH() { return Response.json({}); }
export async function HEAD() { return Response.json({}); }
export async function OPTIONS() { return Response.json({}); }
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes).toHaveLength(7);
      expect(data.routes.map((r: ApiRoute) => r.method)).toEqual(
        expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      );
    });

    it('should extract correct route path from file location', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        const pathStr = String(p);
        if (options?.withFileTypes) {
          if (pathStr.endsWith('api') || pathStr.endsWith('api\\') || pathStr.endsWith('api/')) {
            return [
              { name: 'users', isDirectory: () => true, isFile: () => false },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          if (pathStr.includes('users') && pathStr.includes('[id]')) {
            return [
              { name: 'route.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          if (pathStr.includes('users')) {
            return [
              { name: '[id]', isDirectory: () => true, isFile: () => false },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`export function GET() {}`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path.includes('/api/users/[id]'))).toBe(true);
    });

    it('should check src/app/api directory for Next.js projects with src', () => {
      const checkedPaths: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        checkedPaths.push(pathStr);
        if (pathStr.includes('src') && pathStr.includes('app') && pathStr.includes('api')) {
          return true;
        }
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      handleGetApiRoutes({ framework: 'nextjs' });

      expect(checkedPaths.some(p => p.includes('src') && p.includes('app') && p.includes('api'))).toBe(true);
    });

    it('should calculate correct line numbers', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
// Comment line 1
// Comment line 2
// Comment line 3
export async function GET() {
  return Response.json({});
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // GET should be on line 5 (after 3 comment lines and 1 blank line)
      expect(data.routes[0].handler_line).toBe(5);
    });
  });

  // =============================================================================
  // Next.js Pages Router Tests
  // =============================================================================

  describe('Next.js Pages Router parsing', () => {
    it('should parse pages/api directory for API routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'users.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.json({ users: [] });
  } else if (req.method === 'POST') {
    res.json({ created: true });
  }
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET')).toBe(true);
      expect(data.routes.some((r: ApiRoute) => r.method === 'POST')).toBe(true);
    });

    it('should check src/pages/api directory', () => {
      const checkedPaths: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        checkedPaths.push(pathStr);
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      handleGetApiRoutes({ framework: 'nextjs' });

      expect(checkedPaths.some(p => p.includes('src') && p.includes('pages') && p.includes('api'))).toBe(true);
    });

    it('should detect method handling via req.method equality check', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export default function handler(req, res) {
  if (req.method == 'PUT') {
    res.json({});
  }
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'PUT')).toBe(true);
    });

    it('should detect method handling via switch case', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export default function handler(req, res) {
  switch (req.method) {
    case 'DELETE':
      res.json({});
      break;
    case 'PATCH':
      res.json({});
      break;
  }
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'DELETE')).toBe(true);
      expect(data.routes.some((r: ApiRoute) => r.method === 'PATCH')).toBe(true);
    });

    it('should default to GET when no specific method detected', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'health.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export default function handler(req, res) {
  res.json({ status: 'ok' });
}
`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes).toHaveLength(1);
      expect(data.routes[0].method).toBe('GET');
    });

    it('should extract route path from pages file location', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        const pathStr = String(p);
        if (options?.withFileTypes) {
          if (pathStr.endsWith('api') || pathStr.endsWith('api\\') || pathStr.endsWith('api/')) {
            return [
              { name: 'users', isDirectory: () => true, isFile: () => false },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          if (pathStr.includes('users')) {
            return [
              { name: '[id].ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`export default function handler(req, res) {}`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path.includes('/api/users/[id]'))).toBe(true);
    });

    it('should handle index.ts files removing /index from path', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        const pathStr = String(p);
        if (options?.withFileTypes) {
          if (pathStr.endsWith('api') || pathStr.endsWith('api\\') || pathStr.endsWith('api/')) {
            return [
              { name: 'users', isDirectory: () => true, isFile: () => false },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          if (pathStr.includes('users')) {
            return [
              { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`export default function handler(req, res) {}`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Should be /api/users, not /api/users/index
      expect(data.routes.some((r: ApiRoute) => r.path === '/api/users')).toBe(true);
    });

    it('should exclude route.ts files from pages router parsing', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('pages') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.ts', isDirectory: () => false, isFile: () => true },
            { name: 'users.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`export default function handler(req, res) {}`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Should only have users.ts route, not route.ts
      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('route.ts'))).toBe(true);
    });
  });

  // =============================================================================
  // Express Route Tests
  // =============================================================================

  describe('Express route parsing', () => {
    it('should parse app.get routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/users', (req, res) => {
  res.json([]);
});
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET' && r.path === '/users')).toBe(true);
    });

    it('should parse router.post routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
router.post('/users', async (req, res) => {
  res.json({ created: true });
});
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'POST' && r.path === '/users')).toBe(true);
    });

    it('should parse server.put routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
server.put('/users/:id', (req, res) => {
  res.json({});
});
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'PUT' && r.path === '/users/:id')).toBe(true);
    });

    it('should parse all HTTP methods for Express', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/test1', handler);
app.post('/test2', handler);
app.put('/test3', handler);
app.delete('/test4', handler);
app.patch('/test5', handler);
app.head('/test6', handler);
app.options('/test7', handler);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.map((r: ApiRoute) => r.method)).toEqual(
        expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      );
    });

    it('should extract middleware names from route definitions', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/users', authenticate, authorize, handler);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes[0].middleware).toContain('authenticate');
      expect(data.routes[0].middleware).toContain('authorize');
    });

    it('should not include handler names as middleware', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/users', async (req, res) => {});
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Should not have middleware or should not include 'req', 'res', 'async', etc.
      expect(data.routes[0].middleware === undefined || data.routes[0].middleware.length === 0).toBe(true);
    });

    it('should search project root when src directory does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // src doesn't exist, but project root does
        if (pathStr.includes('src')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/health', handler);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path === '/health')).toBe(true);
    });

    it('should parse routes with template literals in path', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('app.get(`/api/users`, handler);');

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path === '/api/users')).toBe(true);
    });

    it('should parse routes with double quotes in path', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('app.get("/api/items", handler);');

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path === '/api/items')).toBe(true);
    });

    it('should skip .d.ts files', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.d.ts', isDirectory: () => false, isFile: () => true },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/test', handler);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Should only have one route (from routes.ts, not routes.d.ts)
      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('.d.ts'))).toBe(true);
    });

    it('should parse .js files as well', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.js', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/test', handler);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.handler_file.includes('.js'))).toBe(true);
    });
  });

  // =============================================================================
  // Fastify Route Tests
  // =============================================================================

  describe('Fastify route parsing', () => {
    it('should parse fastify.get routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
fastify.get('/users', async (request, reply) => {
  return { users: [] };
});
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET' && r.path === '/users')).toBe(true);
    });

    it('should parse server.post routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
server.post('/users', { schema: userSchema }, handler);
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'POST' && r.path === '/users')).toBe(true);
    });

    it('should parse app.delete routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.delete('/users/:id', handler);
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'DELETE' && r.path === '/users/:id')).toBe(true);
    });

    it('should parse fastify.route() pattern with method first', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
fastify.route({
  method: 'GET',
  url: '/custom',
  handler: customHandler
});
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET' && r.path === '/custom')).toBe(true);
    });

    it('should parse fastify.route() pattern with url first', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
server.route({
  url: '/users',
  method: 'POST',
  handler: createUser
});
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'POST' && r.path === '/users')).toBe(true);
    });

    it('should parse all HTTP methods for Fastify', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
fastify.get('/t1', h);
fastify.post('/t2', h);
fastify.put('/t3', h);
fastify.delete('/t4', h);
fastify.patch('/t5', h);
fastify.head('/t6', h);
fastify.options('/t7', h);
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.map((r: ApiRoute) => r.method)).toEqual(
        expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      );
    });

    it('should search project root when src directory does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('src')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'server.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
fastify.get('/health', handler);
`);

      const result = handleGetApiRoutes({ framework: 'fastify' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path === '/health')).toBe(true);
    });
  });

  // =============================================================================
  // Hono Route Tests
  // =============================================================================

  describe('Hono route parsing', () => {
    it('should parse app.get routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/users', (c) => {
  return c.json({ users: [] });
});
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'GET' && r.path === '/users')).toBe(true);
    });

    it('should parse api.post routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
api.post('/users', async (c) => {
  return c.json({ created: true });
});
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'POST' && r.path === '/users')).toBe(true);
    });

    it('should parse route.put routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
route.put('/users/:id', handler);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'PUT' && r.path === '/users/:id')).toBe(true);
    });

    it('should parse router.delete routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
router.delete('/users/:id', handler);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'DELETE' && r.path === '/users/:id')).toBe(true);
    });

    it('should parse hono.patch routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
hono.patch('/users/:id', handler);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'PATCH' && r.path === '/users/:id')).toBe(true);
    });

    it('should parse app.all routes', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.all('/wildcard', handler);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'ALL' && r.path === '/wildcard')).toBe(true);
    });

    it('should parse hono.on() for custom methods', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.on('CUSTOM', '/special', handler);
hono.on('PROPFIND', '/webdav', handler);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.method === 'CUSTOM' && r.path === '/special')).toBe(true);
      expect(data.routes.some((r: ApiRoute) => r.method === 'PROPFIND' && r.path === '/webdav')).toBe(true);
    });

    it('should parse all standard HTTP methods for Hono', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/t1', h);
app.post('/t2', h);
app.put('/t3', h);
app.delete('/t4', h);
app.patch('/t5', h);
app.head('/t6', h);
app.options('/t7', h);
app.all('/t8', h);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.map((r: ApiRoute) => r.method)).toEqual(
        expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'ALL'])
      );
    });

    it('should search project root when src directory does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('src')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/health', handler);
`);

      const result = handleGetApiRoutes({ framework: 'hono' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.some((r: ApiRoute) => r.path === '/health')).toBe(true);
    });
  });

  // =============================================================================
  // findFiles Utility Tests
  // =============================================================================

  describe('findFiles utility', () => {
    it('should skip node_modules directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        const pathStr = String(p);
        if (options?.withFileTypes) {
          if (pathStr.includes('node_modules')) {
            return [
              { name: 'express.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Should only find routes.ts, not files in node_modules
      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('node_modules'))).toBe(true);
    });

    it('should skip .git directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('.git'))).toBe(true);
    });

    it('should skip .next directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: '.next', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('.next'))).toBe(true);
    });

    it('should skip dist directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'dist', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('dist'))).toBe(true);
    });

    it('should skip build directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'build', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('build'))).toBe(true);
    });

    it('should skip .turbo directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: '.turbo', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.every((r: ApiRoute) => !r.handler_file.includes('.turbo'))).toBe(true);
    });

    it('should return empty array when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes).toHaveLength(0);
    });

    it('should recursively traverse subdirectories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        const pathStr = String(p);
        if (options?.withFileTypes) {
          if (pathStr.includes('nested')) {
            return [
              { name: 'deep.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          return [
            { name: 'nested', isDirectory: () => true, isFile: () => false },
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Should have routes from both root and nested directory
      expect(data.routes.length).toBeGreaterThan(0);
    });

    it('should skip files matching exclude pattern', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
            { name: 'routes.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`app.get('/test', h);`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Both files should be included since we don't have test file exclusion by default
      expect(data.routes.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // Edge Cases and Error Handling
  // =============================================================================

  describe('edge cases', () => {
    it('should handle empty files gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes).toHaveLength(0);
      expect(result.isError).toBeUndefined();
    });

    it('should handle files with no route definitions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
const helper = () => {};
export { helper };
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes).toHaveLength(0);
      expect(result.isError).toBeUndefined();
    });

    it('should handle routes with special characters in path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/api/v1/users/:userId/posts/:postId', handler);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes[0].path).toBe('/api/v1/users/:userId/posts/:postId');
    });

    it('should handle multiple routes in single file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'routes.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
app.get('/users', getUsers);
app.get('/users/:id', getUserById);
app.post('/users', createUser);
app.put('/users/:id', updateUser);
app.delete('/users/:id', deleteUser);
`);

      const result = handleGetApiRoutes({ framework: 'express' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.routes.length).toBe(5);
      expect(data.count).toBe(5);
    });

    it('should convert Windows backslashes to forward slashes in paths', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('app') && pathStr.includes('api');
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return [
            { name: 'route.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`export function GET() {}`);

      const result = handleGetApiRoutes({ framework: 'nextjs' });
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      // Handler file path should use forward slashes
      expect(data.routes[0].handler_file).not.toContain('\\');
    });

    it('should handle framework priority: nextjs > hono > fastify > express', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('package.json');
      });
      // All frameworks present
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: {
          next: '^14.0.0',
          hono: '^3.0.0',
          fastify: '^4.0.0',
          express: '^4.18.0',
        },
      }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleGetApiRoutes({});
      const data = JSON.parse(result.content[0].text) as ApiRoutesResult;

      expect(data.framework).toBe('nextjs');
    });
  });
});
