/**
 * `api_spec` fixture tests: a spec snapshot per fixture app (§4.1 port row).
 * Read-only — asserts nothing is written to disk and the spec comes back in
 * the response payload only.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs/promises';

import { handler } from '../tools/api_spec.js';
import { expectSuccess } from './test-utils.js';
import type { EndpointSummary, MissingType, OpenAPISpec } from '../lib/api/types.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

interface ApiSpecData {
  framework: string;
  spec: OpenAPISpec;
  spec_version: string;
  yaml?: string;
  routes_documented: number;
  endpoints: EndpointSummary[];
  missing_types: MissingType[];
  warnings: string[];
}

describe('api_spec', () => {
  it('generates an OpenAPI 3.0.3 spec from Express routes, read-only', async () => {
    const base = `${fixturesDir}/api-express-app`;
    const env = expectSuccess<ApiSpecData>(await handler({ base_path: base, framework: 'express' }));
    const data = env.data!;

    expect(data.spec.openapi).toBe('3.0.3');
    expect(data.spec.info.title).toBe('api-express-fixture');
    expect(data.spec.info.version).toBe('1.0.0');
    expect(data.spec.paths['/api/users/{id}']).toBeTruthy();
    expect(data.spec.paths['/api/users/{id}']!.get).toBeTruthy();
    expect(data.routes_documented).toBe(data.endpoints.length);
    expect(data.endpoints.length).toBeGreaterThan(0);

    // Path params converted to OpenAPI {param} syntax and surfaced as operation parameters.
    const getUserOp = data.spec.paths['/api/users/{id}']!.get!;
    expect(getUserOp.parameters?.some((p) => p.name === 'id')).toBe(true);

    // Nothing was written to disk.
    await expect(fs.access(`${base}/openapi.json`)).rejects.toThrow();
  });

  it('includes examples by default and omits them when include_examples: false', async () => {
    const base = `${fixturesDir}/api-fastify-app`;
    const withExamples = expectSuccess<ApiSpecData>(await handler({ base_path: base, framework: 'fastify' }));
    const anyOpWith = Object.values(withExamples.data!.spec.paths)[0]!.get ?? Object.values(withExamples.data!.spec.paths)[0]!.post;
    expect(anyOpWith?.responses['200'].content?.['application/json'].example).toBeDefined();

    const withoutExamples = expectSuccess<ApiSpecData>(
      await handler({ base_path: base, framework: 'fastify', include_examples: false }),
    );
    const anyOpWithout =
      Object.values(withoutExamples.data!.spec.paths)[0]!.get ?? Object.values(withoutExamples.data!.spec.paths)[0]!.post;
    expect(anyOpWithout?.responses['200'].content?.['application/json'].example).toBeUndefined();
  });

  it('emits YAML text alongside the JSON spec when format: "yaml"', async () => {
    const base = `${fixturesDir}/api-hono-app`;
    const env = expectSuccess<ApiSpecData>(await handler({ base_path: base, framework: 'hono', format: 'yaml' }));
    expect(env.data!.yaml).toBeTruthy();
    expect(env.data!.yaml).toContain('openapi:');
  });

  it('flags missing request/response types for undetected schemas', async () => {
    const base = `${fixturesDir}/api-hono-app`;
    const env = expectSuccess<ApiSpecData>(await handler({ base_path: base, framework: 'hono' }));
    // The fixture handlers have no Zod/interface schemas, so POST /api/widgets should be flagged.
    expect(env.data!.missing_types.some((m) => m.route.includes('/api/widgets'))).toBe(true);
  });
});
