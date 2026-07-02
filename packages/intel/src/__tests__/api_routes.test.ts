/**
 * `api_routes` fixture tests — one small app per framework (§4.1 port row:
 * "one fixture app per framework").
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/api_routes.js';
import { expectSuccess, expectError } from './test-utils.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

interface ApiRoute {
  method: string;
  path: string;
  handler_file: string;
  resolved_path: string;
  handler_line: number;
  middleware?: string[];
}
interface ApiRoutesData {
  framework: string;
  routes: ApiRoute[];
  count: number;
}

describe('api_routes', () => {
  it('parses Express routes with middleware and resolved_path', async () => {
    const base = `${fixturesDir}/api-express-app`;
    const env = expectSuccess<ApiRoutesData>(await handler({ base_path: base, framework: 'express' }));
    const routes = env.data!.routes;

    expect(env.data!.framework).toBe('express');
    const byPath = (m: string, p: string) => routes.find((r) => r.method === m && r.path === p);

    expect(byPath('GET', '/api/health')).toBeTruthy();
    const getUser = byPath('GET', '/api/users/:id')!;
    expect(getUser.middleware).toContain('authenticate');
    expect(getUser.resolved_path.startsWith('/')).toBe(true);
    expect(getUser.resolved_path.endsWith('src/routes.ts')).toBe(true);
    expect(getUser.handler_file).toBe('src/routes.ts');

    const postUser = byPath('POST', '/api/users')!;
    expect(postUser.middleware).toEqual(expect.arrayContaining(['authenticate', 'validateBody']));

    expect(byPath('DELETE', '/api/users/:id')).toBeTruthy();
  });

  it('parses Fastify routes including fastify.route({...})', async () => {
    const base = `${fixturesDir}/api-fastify-app`;
    const env = expectSuccess<ApiRoutesData>(await handler({ base_path: base, framework: 'fastify' }));
    const routes = env.data!.routes;

    expect(routes.some((r) => r.method === 'GET' && r.path === '/api/status')).toBe(true);
    expect(routes.some((r) => r.method === 'POST' && r.path === '/api/items')).toBe(true);
    expect(routes.some((r) => r.method === 'GET' && r.path === '/api/items/:id')).toBe(true);
  });

  it('parses Hono routes including on() custom methods', async () => {
    const base = `${fixturesDir}/api-hono-app`;
    const env = expectSuccess<ApiRoutesData>(await handler({ base_path: base, framework: 'hono' }));
    const routes = env.data!.routes;

    expect(routes.some((r) => r.method === 'GET' && r.path === '/api/ping')).toBe(true);
    expect(routes.some((r) => r.method === 'POST' && r.path === '/api/widgets')).toBe(true);
    expect(routes.some((r) => r.method === 'PURGE' && r.path === '/api/cache')).toBe(true);
  });

  it('parses Next.js App Router routes (multiple methods per file, dynamic segments)', async () => {
    const base = `${fixturesDir}/api-nextjs-app`;
    const env = expectSuccess<ApiRoutesData>(await handler({ base_path: base, framework: 'nextjs' }));
    const routes = env.data!.routes;

    expect(routes.some((r) => r.method === 'GET' && r.path === '/api/users/[id]')).toBe(true);
    expect(routes.some((r) => r.method === 'DELETE' && r.path === '/api/users/[id]')).toBe(true);
    expect(routes.some((r) => r.method === 'GET' && r.path === '/api/posts')).toBe(true);
    expect(routes.some((r) => r.method === 'POST' && r.path === '/api/posts')).toBe(true);
  });

  it('auto-detects the framework from package.json', async () => {
    const base = `${fixturesDir}/api-hono-app`;
    const env = expectSuccess<ApiRoutesData>(await handler({ base_path: base }));
    expect(env.data!.framework).toBe('hono');
  });

  it('errors cleanly when auto-detect finds no supported framework', async () => {
    const env = expectError(await handler({ base_path: fixturesDir, path: '.' }));
    expect(env.error).toContain('auto-detect');
  });
});
