/**
 * structural_edit (intel tool 15) — the write-path regression net.
 *
 * Every non-negotiable condition from carve-out §8 lane 10 / plan §14.B has a
 * test here: preview→apply round trip, stale-hash refusal, first-class rollback
 * reporting with success:false, byte-exact CRLF preservation, single-use tokens,
 * and 10-minute token expiry. AST mode rides the bundled TypeScript compiler (no
 * tree-sitter grammar dependency), so these run green in this environment;
 * ast_pattern asserts the honest "unavailable" degradation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStatePath } from '@goodvibes/core/config';
import { structuralEditTool } from '../tools/structural_edit.js';
import { makeTempDir, cleanupTempDir, writeFile, parseResult, expectSuccess } from './test-utils.js';

const call = (args: Record<string, unknown>) => structuralEditTool.handler(args);

let stateRoot: string;
let prevStateRoot: string | undefined;

beforeAll(async () => {
  // Keep every token file inside an isolated temp dir instead of the repo tree.
  stateRoot = await makeTempDir('intel-edit-state-');
  prevStateRoot = process.env.GOODVIBES_STATE_ROOT;
  process.env.GOODVIBES_STATE_ROOT = stateRoot;
});

afterAll(async () => {
  if (prevStateRoot === undefined) delete process.env.GOODVIBES_STATE_ROOT;
  else process.env.GOODVIBES_STATE_ROOT = prevStateRoot;
  await cleanupTempDir(stateRoot);
});

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir('intel-edit-');
});

function tokenFilePath(token: string): string {
  return getStatePath(stateRoot, 'edit-tokens', `${token}.json`);
}

describe('structural_edit — preview/apply round trip (exact mode)', () => {
  it('previews a diff + token without writing, then applies it', async () => {
    const file = await writeFile(dir, 'a.ts', 'const value = 1;\nconst other = 2;\n');

    const preview = expectSuccess<{
      preview_token: string;
      entries: Record<string, { status: string; diff?: string; match_count: number; resolved_path: string }>;
      summary: { ready: number };
    }>(await call({
      action: 'preview',
      base_path: dir,
      edits: [{ id: 'e1', path: 'a.ts', find: 'const value = 1;', replace: 'const value = 42;' }],
    }));

    expect(preview.data!.summary.ready).toBe(1);
    expect(preview.data!.entries.e1.status).toBe('ready');
    expect(preview.data!.entries.e1.match_count).toBe(1);
    expect(preview.data!.entries.e1.resolved_path).toBe(file);
    expect(preview.data!.entries.e1.diff).toContain('const value = 42;');
    // preview must NOT have written
    expect(await fs.readFile(file, 'utf-8')).toBe('const value = 1;\nconst other = 2;\n');

    const token = preview.data!.preview_token;
    const apply = expectSuccess<{
      entries: Record<string, { status: string; bytes_written?: number }>;
      files_written: string[];
      summary: { applied: number };
    }>(await call({ action: 'apply', preview_token: token }));

    expect(apply.data!.summary.applied).toBe(1);
    expect(apply.data!.entries.e1.status).toBe('applied');
    expect(apply.data!.files_written).toContain(file);
    expect(await fs.readFile(file, 'utf-8')).toBe('const value = 42;\nconst other = 2;\n');
  });

  it('keys entries by array index when no id is given, never collapsing same-file entries', async () => {
    await writeFile(dir, 'b.ts', 'a\nb\nc\n');
    const preview = expectSuccess<{ preview_token: string; entries: Record<string, { status: string }> }>(await call({
      action: 'preview',
      base_path: dir,
      edits: [
        { path: 'b.ts', find: 'a', replace: 'A' },
        { path: 'b.ts', find: 'c', replace: 'C' },
      ],
    }));
    expect(Object.keys(preview.data!.entries).sort()).toEqual(['0', '1']);
    expect(preview.data!.entries['0'].status).toBe('ready');
    expect(preview.data!.entries['1'].status).toBe('ready');

    const apply = expectSuccess<{ summary: { applied: number } }>(
      await call({ action: 'apply', preview_token: preview.data!.preview_token }),
    );
    expect(apply.data!.summary.applied).toBe(2);
    expect(await fs.readFile(path.join(dir, 'b.ts'), 'utf-8')).toBe('A\nb\nC\n');
  });

  it('a token is single-use: a second apply is refused', async () => {
    await writeFile(dir, 'c.ts', 'x\n');
    const preview = expectSuccess<{ preview_token: string }>(await call({
      action: 'preview', base_path: dir, edits: [{ path: 'c.ts', find: 'x', replace: 'y' }],
    }));
    const token = preview.data!.preview_token;
    expect(expectSuccess(await call({ action: 'apply', preview_token: token })).success).toBe(true);
    const second = parseResult(await call({ action: 'apply', preview_token: token }));
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/single-use|Invalid or already-used/i);
  });
});

describe('structural_edit — ast mode (TypeScript compiler)', () => {
  it('replaces a whole function declaration node', async () => {
    const file = await writeFile(dir, 'fn.ts', 'export function foo(): number {\n  return 1;\n}\n');
    const preview = expectSuccess<{ preview_token: string; entries: Record<string, { status: string; match_count: number }> }>(
      await call({
        action: 'preview',
        base_path: dir,
        match: { mode: 'ast' },
        edits: [{ id: 'fn', path: 'fn.ts', find: 'foo', replace: 'export function foo(): number {\n  return 2;\n}' }],
      }),
    );
    expect(preview.data!.entries.fn.status).toBe('ready');
    expect(preview.data!.entries.fn.match_count).toBe(1);

    expectSuccess(await call({ action: 'apply', preview_token: preview.data!.preview_token }));
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toContain('return 2;');
    expect(after).not.toContain('return 1;');
  });
});

describe('structural_edit — stale-hash refusal (never silently re-matches)', () => {
  it('refuses an entry whose file changed since preview', async () => {
    const file = await writeFile(dir, 's.ts', 'value = 1\n');
    const preview = expectSuccess<{ preview_token: string }>(await call({
      action: 'preview', base_path: dir, edits: [{ id: 'e', path: 's.ts', find: 'value = 1', replace: 'value = 2' }],
    }));

    // Someone else edits the file between preview and apply.
    await fs.writeFile(file, 'value = 999\n', 'utf-8');

    const apply = parseResult<{ entries: Record<string, { status: string }>; summary: { refused_stale: number } }>(
      await call({ action: 'apply', preview_token: preview.data!.preview_token }),
    );
    expect(apply.success).toBe(false);
    expect(apply.data!.entries.e.status).toBe('refused_stale');
    expect(apply.data!.summary.refused_stale).toBe(1);
    // The stale content is untouched — we did NOT re-match or overwrite it.
    expect(await fs.readFile(file, 'utf-8')).toBe('value = 999\n');
  });
});

describe('structural_edit — atomic rollback reporting (v1 issue-7, inverted)', () => {
  it('rolls the fresh entry back from its snapshot and reports rolled_back + refused_stale, success:false', async () => {
    const fileA = await writeFile(dir, 'A.ts', 'AAA one\n');
    const fileB = await writeFile(dir, 'B.ts', 'BBB one\n');
    const preview = expectSuccess<{ preview_token: string }>(await call({
      action: 'preview',
      base_path: dir,
      edits: [
        { id: 'a', path: 'A.ts', find: 'one', replace: 'two' },
        { id: 'b', path: 'B.ts', find: 'one', replace: 'two' },
      ],
    }));

    // B changes underfoot; A does not.
    await fs.writeFile(fileB, 'BBB changed\n', 'utf-8');

    const apply = parseResult<{
      entries: Record<string, { status: string }>;
      summary: { applied: number; refused_stale: number; rolled_back: number };
    }>(await call({ action: 'apply', preview_token: preview.data!.preview_token }));

    expect(apply.success).toBe(false);
    expect(apply.data!.entries.a.status).toBe('rolled_back');
    expect(apply.data!.entries.b.status).toBe('refused_stale');
    expect(apply.data!.summary.rolled_back).toBe(1);
    expect(apply.data!.summary.refused_stale).toBe(1);
    expect(apply.data!.summary.applied).toBe(0);
    // A was restored to its pre-apply snapshot (NOT left as 'AAA two').
    expect(await fs.readFile(fileA, 'utf-8')).toBe('AAA one\n');
    expect(await fs.readFile(fileB, 'utf-8')).toBe('BBB changed\n');
  });

  it('partial mode applies the fresh entry and reports the stale one, without rollback', async () => {
    const fileA = await writeFile(dir, 'A.ts', 'AAA one\n');
    const fileB = await writeFile(dir, 'B.ts', 'BBB one\n');
    const preview = expectSuccess<{ preview_token: string }>(await call({
      action: 'preview',
      base_path: dir,
      transaction: 'partial',
      edits: [
        { id: 'a', path: 'A.ts', find: 'one', replace: 'two' },
        { id: 'b', path: 'B.ts', find: 'one', replace: 'two' },
      ],
    }));
    await fs.writeFile(fileB, 'BBB changed\n', 'utf-8');

    const apply = parseResult<{ entries: Record<string, { status: string }>; summary: { applied: number; refused_stale: number } }>(
      await call({ action: 'apply', preview_token: preview.data!.preview_token }),
    );
    expect(apply.success).toBe(true);
    expect(apply.data!.entries.a.status).toBe('applied');
    expect(apply.data!.entries.b.status).toBe('refused_stale');
    expect(await fs.readFile(fileA, 'utf-8')).toBe('AAA two\n'); // fresh entry persisted
    expect(await fs.readFile(fileB, 'utf-8')).toBe('BBB changed\n');
  });
});

describe('structural_edit — CRLF preservation (v1 silent-conversion lesson)', () => {
  it('leaves CRLF bytes outside the edit span exactly, and renders the replacement in CRLF too', async () => {
    const crlf = 'const a = 1;\r\nconst b = 2;\r\nconst c = 3;\r\n';
    const file = await writeFile(dir, 'crlf.ts', crlf);

    const preview = expectSuccess<{ preview_token: string }>(await call({
      action: 'preview',
      base_path: dir,
      // Replacement adds a line, so its own newline must come out as CRLF.
      edits: [{ path: 'crlf.ts', find: 'const b = 2;', replace: 'const b = 20;\nconst bb = 22;' }],
    }));
    expectSuccess(await call({ action: 'apply', preview_token: preview.data!.preview_token }));

    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('const a = 1;\r\nconst b = 20;\r\nconst bb = 22;\r\nconst c = 3;\r\n');
    // Not a single lone LF anywhere — every newline is a full CRLF.
    for (let i = 0; i < after.length; i++) {
      if (after[i] === '\n') expect(after[i - 1]).toBe('\r');
    }
  });
});

describe('structural_edit — token expiry (10-minute TTL)', () => {
  it('rejects an expired token', async () => {
    const file = await writeFile(dir, 'exp.ts', 'k = 1\n');
    const preview = expectSuccess<{ preview_token: string }>(await call({
      action: 'preview', base_path: dir, edits: [{ path: 'exp.ts', find: 'k = 1', replace: 'k = 2' }],
    }));
    const token = preview.data!.preview_token;

    // Age the token past its TTL on disk.
    const tf = tokenFilePath(token);
    const raw = JSON.parse(await fs.readFile(tf, 'utf-8'));
    raw.expires_at = Date.now() - 1000;
    await fs.writeFile(tf, JSON.stringify(raw), 'utf-8');

    const apply = parseResult(await call({ action: 'apply', preview_token: token }));
    expect(apply.success).toBe(false);
    expect(apply.error).toMatch(/expired/i);
    expect(await fs.readFile(file, 'utf-8')).toBe('k = 1\n'); // untouched
  });
});

describe('structural_edit — ast_pattern degrades honestly when @ast-grep/napi is absent', () => {
  it('reports the entry as error with an "unavailable" message, not a crash', async () => {
    await writeFile(dir, 'g.ts', 'console.log(1);\n');
    const preview = expectSuccess<{ entries: Record<string, { status: string; error: string | null }>; summary: { error: number; ready: number } }>(
      await call({
        action: 'preview',
        base_path: dir,
        match: { mode: 'ast_pattern' },
        edits: [{ id: 'p', path: 'g.ts', find: 'console.log($$$A)', replace: 'logger.info($$$A)' }],
      }),
    );
    expect(preview.data!.summary.ready).toBe(0);
    expect(preview.data!.entries.p.status).toBe('error');
    expect(preview.data!.entries.p.error).toMatch(/unavailable|not installed/i);
  });
});

describe('structural_edit — input validation', () => {
  it('rejects an unknown action', async () => {
    const r = parseResult(await call({ action: 'destroy' }));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/action/i);
  });

  it('rejects a fuzzy/regex mode (only exact/ast/ast_pattern ship)', async () => {
    await writeFile(dir, 'm.ts', 'x\n');
    const r = parseResult(await call({ action: 'preview', base_path: dir, match: { mode: 'fuzzy' }, edits: [{ path: 'm.ts', find: 'x', replace: 'y' }] }));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/mode/i);
  });
});
