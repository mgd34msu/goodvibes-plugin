/**
 * `db_schema` fixture tests: one fixture per schema source (prisma, drizzle,
 * sql), plus the tribunal-required usage-mode accuracy spot-check, a planted
 * query-in-loop must be flagged `in_loop: true` and a clean call must NOT be
 * (§4.1 db_schema port row; §4.4.3 tribunal condition).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/db_schema.js';
import { disposeCompilerHost } from '../host/index.js';
import { expectSuccess, expectError } from './test-utils.js';
import type { DbSchemaData } from '../lib/db/types.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

afterAll(() => disposeCompilerHost());

describe('db_schema: schema extraction', () => {
  it('parses a Prisma schema into models[].relations (tribunal shape)', async () => {
    const base = `${fixturesDir}/db-prisma-project`;
    const env = expectSuccess<DbSchemaData>(await handler({ base_path: base }));
    const data = env.data!;

    expect(data.source).toBe('prisma');
    expect(data.resolved_path.endsWith('schema.prisma')).toBe(true);

    const user = data.models.find((m) => m.name === 'User')!;
    // 'posts Post[]' is a relation field, not a scalar column (matches v1 behavior).
    expect(user.fields.map((f) => f.name).sort()).toEqual(['email', 'id', 'name']);
    const emailField = user.fields.find((f) => f.name === 'email')!;
    expect(emailField.type).toBe('String');
    expect(user.relations).toEqual([{ from_column: 'id', to_model: 'Post', to_column: 'userId', type: 'one-to-many' }]);

    const post = data.models.find((m) => m.name === 'Post')!;
    expect(post.relations).toEqual([{ from_column: 'authorId', to_model: 'User', to_column: 'id', type: 'one-to-one' }]);
    expect(post.indexes.some((i) => i.columns.includes('authorId'))).toBe(true);

    // No global flat arrays in the tribunal shape.
    expect((data as unknown as { tables?: unknown }).tables).toBeUndefined();
    expect((data as unknown as { relations?: unknown }).relations).toBeUndefined();
  });

  it('parses a Drizzle schema (pgTable + relations())', async () => {
    const base = `${fixturesDir}/db-drizzle-project`;
    const env = expectSuccess<DbSchemaData>(await handler({ base_path: base, source: 'drizzle' }));
    const data = env.data!;

    expect(data.source).toBe('drizzle');
    const users = data.models.find((m) => m.name === 'users')!;
    expect(users.fields.some((f) => f.name === 'email' && f.type === 'varchar')).toBe(true);
    expect(users.indexes.some((i) => i.name === 'users_email_idx' && i.unique)).toBe(true);

    const posts = data.models.find((m) => m.name === 'posts')!;
    expect(posts.relations.some((r) => r.to_model === 'users' && r.from_column === 'authorId')).toBe(true);
  });

  it('parses a raw SQL schema (CREATE TABLE + FOREIGN KEY + CREATE INDEX)', async () => {
    const base = `${fixturesDir}/db-sql-project`;
    const env = expectSuccess<DbSchemaData>(await handler({ base_path: base, source: 'sql' }));
    const data = env.data!;

    expect(data.source).toBe('sql');
    const posts = data.models.find((m) => m.name === 'posts')!;
    expect(posts.relations.some((r) => r.to_model === 'users' && r.from_column === 'author_id')).toBe(true);
    expect(posts.indexes.some((i) => i.name === 'idx_posts_author')).toBe(true);
  });

  it('errors cleanly when no schema is found', async () => {
    const env = expectError(await handler({ base_path: fixturesDir, source: 'sql' }));
    expect(env.error).toContain('No database schema found');
  });
});

describe('db_schema: usage mode (accuracy spot-check, tribunal condition)', () => {
  it('flags planted query-in-loop call sites as in_loop: true and leaves clean calls in_loop: false', async () => {
    const base = `${fixturesDir}/db-prisma-usage-project`;
    const env = expectSuccess<DbSchemaData>(await handler({ base_path: base, usage: true }));
    const usage = env.data!.usage!;

    expect(usage).toBeTruthy();
    const byOp = (model: string, op: string) => usage.call_sites.filter((c) => c.model === model && c.operation === op);

    // Planted: prisma.post.findMany inside a for...of loop.
    const findManyInLoop = byOp('post', 'findMany');
    expect(findManyInLoop).toHaveLength(1);
    expect(findManyInLoop[0].in_loop).toBe(true);
    expect(findManyInLoop[0].resolved_path.endsWith('src/service.ts')).toBe(true);
    expect(findManyInLoop[0].file).toBe('src/service.ts');

    // Planted: prisma.post.findUnique inside a forEach callback.
    const findUniqueInLoop = byOp('post', 'findUnique');
    expect(findUniqueInLoop).toHaveLength(1);
    expect(findUniqueInLoop[0].in_loop).toBe(true);

    // Clean: prisma.user.findMany is top-level, NOT in a loop, must not be a false positive.
    const findManyClean = byOp('user', 'findMany');
    expect(findManyClean).toHaveLength(1);
    expect(findManyClean[0].in_loop).toBe(false);

    // Clean: prisma.user.create is top-level, NOT in a loop.
    const createClean = byOp('user', 'create');
    expect(createClean).toHaveLength(1);
    expect(createClean[0].in_loop).toBe(false);

    // Frequency: user has 2 call sites (findMany + create), post has 2 (findMany + findUnique).
    const freqByModel = Object.fromEntries(usage.frequency.map((f) => [f.model, f.count]));
    expect(freqByModel.user).toBe(2);
    expect(freqByModel.post).toBe(2);
  });

  it('omits usage entirely when usage: false (default)', async () => {
    const base = `${fixturesDir}/db-prisma-usage-project`;
    const env = expectSuccess<DbSchemaData>(await handler({ base_path: base }));
    expect(env.data!.usage).toBeUndefined();
  });
});
