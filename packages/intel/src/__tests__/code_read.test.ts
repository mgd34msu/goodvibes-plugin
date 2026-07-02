/**
 * Tests for code_read (outline + lines/range only — content/symbols/ast retire).
 * Named regression classes live where their fix lives (plan §5.3):
 *  - F1 base_path / resolved_path echo
 *  - F3 same-path batch entries
 *  - F4 integration — cache serves content, never a stub (unit home: core/cache)
 *  - F6 one-representation token_budget pagination
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { handler } from '../tools/code_read.js';
import { FileStateCache } from '@goodvibes/core/cache';
import {
  makeTempDir,
  cleanupTempDir,
  writeFile,
  writeFiles,
  expectSuccess,
  expectError,
  SAMPLE_TS_CODE,
  treeSitterOutlineAvailable,
  type Envelope,
} from './test-utils.js';

let outlineAvailable = true;
beforeAll(async () => {
  outlineAvailable = await treeSitterOutlineAvailable();
  if (!outlineAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      '[code_read.test] tree-sitter grammar wasm is ABI-incompatible with this web-tree-sitter version ' +
        '(see test-utils.ts treeSitterOutlineAvailable doc) — outline-mode assertions are skipped.',
    );
  }
});

interface ReadEntry {
  exists: boolean;
  lines?: string[];
  outline?: Array<{ name: string; kind: string; exported?: boolean; children?: unknown[] }>;
  line_count?: number;
  truncated?: boolean;
  probe?: boolean;
  cache_hit?: boolean;
  resolved_path?: string;
  error?: string;
  cache?: { status: string; unchanged_since_last_read?: boolean; hash?: string; read_count?: number };
}
interface ReadData {
  files: Record<string, ReadEntry>;
  summary: Record<string, unknown>;
}

let dir: string;

beforeEach(async () => {
  dir = await makeTempDir('code-read-');
  FileStateCache.resetInstance();
});

afterEach(async () => {
  await cleanupTempDir(dir);
});

describe('code_read — input validation', () => {
  it('errors when files array is missing', async () => {
    const result = await handler({ base_path: dir });
    const parsed = expectError(result);
    expect(parsed.error).toContain("Missing required parameter 'files'");
  });
});

describe('code_read — extract: lines (default)', () => {
  it('returns lines as an array', async () => {
    await writeFile(dir, 'file.ts', 'line 1\nline 2\nline 3');
    const result = await handler({ files: ['file.ts'], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['file.ts'].lines).toEqual(['line 1', 'line 2', 'line 3']);
  });

  it('supports a line range', async () => {
    await writeFile(dir, 'file.ts', 'line 1\nline 2\nline 3\nline 4\nline 5');
    const result = await handler({ files: [{ path: 'file.ts', range: { start: 2, end: 4 } }], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['file.ts'].lines).toEqual(['line 2', 'line 3', 'line 4']);
  });

  it('supports default_range for all files', async () => {
    await writeFile(dir, 'file.ts', 'line 1\nline 2\nline 3');
    const result = await handler({ files: ['file.ts'], base_path: dir, default_range: { start: 1, end: 2 } });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['file.ts'].lines).toEqual(['line 1', 'line 2']);
  });

  describe('include_line_numbers', () => {
    beforeEach(async () => {
      await writeFile(dir, 'numbered.ts', 'alpha\nbeta\ngamma');
    });

    it('numbers lines from the range start line when enabled', async () => {
      const result = await handler({
        files: [{ path: 'numbered.ts', range: { start: 2, end: 3 } }],
        base_path: dir,
        output: { include_line_numbers: true },
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['numbered.ts'].lines).toEqual(['    2 | beta', '    3 | gamma']);
    });

    it('returns raw lines when disabled (default)', async () => {
      const result = await handler({ files: ['numbered.ts'], base_path: dir });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['numbered.ts'].lines).toEqual(['alpha', 'beta', 'gamma']);
    });
  });
});

describe('code_read — extract: outline', () => {
  it('extracts a document outline with honest exported flags', async (ctx) => {
    if (!outlineAvailable) ctx.skip();
    await writeFile(dir, 'sample.ts', SAMPLE_TS_CODE);
    const result = await handler({ files: ['sample.ts'], extract: 'outline', base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    const outline = data.files['sample.ts'].outline!;
    expect(outline.length).toBeGreaterThan(0);

    const cls = outline.find((o) => o.name === 'SampleClass')!;
    expect(cls.exported).toBe(true);
    expect(cls.children).toBeDefined();

    // Honest exported flags (plan §4.1 code_read row): a class member never
    // inherits the class's own export status — the bug this fixes marked
    // every method of an exported class as itself "exported".
    const method = (cls.children as Array<{ name: string; exported?: boolean }>).find((c) => c.name === 'getValue');
    expect(method?.exported).toBeUndefined();

    const fn = outline.find((o) => o.name === 'sampleFunction')!;
    expect(fn.exported).toBe(true);
    const helper = outline.find((o) => o.name === 'privateHelper')!;
    expect(helper.exported).toBe(false);
  });

  it('errors for a file type with no outline support', async () => {
    await writeFile(dir, 'notes.txt', 'plain text');
    const result = await handler({ files: ['notes.txt'], extract: 'outline', base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['notes.txt'].error).toContain('not supported');
  });
});

describe('code_read — F1 base_path / resolved_path echo', () => {
  it('resolves relative paths against base_path and echoes an absolute resolved_path', async () => {
    await writeFile(dir, 'sub/target.ts', 'in sub');
    const result = await handler({ files: ['target.ts'], base_path: path.join(dir, 'sub') });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['target.ts'].exists).toBe(true);
    expect(data.files['target.ts'].resolved_path).toBe(path.join(dir, 'sub', 'target.ts'));
  });

  it('errors for a nonexistent base_path', async () => {
    const result = await handler({ files: ['whatever.ts'], base_path: path.join(dir, 'does-not-exist') });
    expectError(result);
  });

  it('warns and falls back to the server cwd when base_path is omitted', async () => {
    const result = await handler({ files: [path.join(dir, 'ghost.ts')] });
    const env = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as Envelope;
    expect(env.warning).toBeDefined();
    expect(env.warning).toContain('base_path');
  });
});

describe('code_read — F3 same-path batch entries', () => {
  beforeEach(async () => {
    await writeFile(dir, 'dup.ts', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6');
  });

  it('returns both ranges when one file is requested twice with different ranges', async () => {
    const result = await handler({
      files: [
        { path: 'dup.ts', range: { start: 1, end: 2 } },
        { path: 'dup.ts', range: { start: 4, end: 5 } },
      ],
      base_path: dir,
    });
    const data = expectSuccess<ReadData>(result).data!;
    const keys = Object.keys(data.files);
    expect(keys).toHaveLength(2);
    const allLines = keys.map((k) => data.files[k].lines);
    expect(allLines).toContainEqual(['line 1', 'line 2']);
    expect(allLines).toContainEqual(['line 4', 'line 5']);
    expect(data.summary.files_read).toBe(2);
  });

  it('keeps the plain path key for a unique entry', async () => {
    const result = await handler({ files: [{ path: 'dup.ts', range: { start: 1, end: 2 } }], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(Object.keys(data.files)).toEqual(['dup.ts']);
  });
});

describe('code_read — F4 integration: cache serves content, never a stub', () => {
  it('returns full content for a read of a file another tool registered in the cache', async () => {
    const fullPath = await writeFile(dir, 'written.ts', 'written by another process');
    const realPath = await fs.realpath(fullPath);
    FileStateCache.getInstance().update(realPath, 'written by another process', 'code_write');

    const result = await handler({ files: ['written.ts'], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['written.ts'].lines).toEqual(['written by another process']);
  });

  it('serves a ranged read of a previously-read file as a cache hit with full content (no stub)', async () => {
    await writeFile(dir, 'cached.ts', 'line 1\nline 2\nline 3\nline 4');
    await handler({ files: ['cached.ts'], base_path: dir });

    const result = await handler({ files: [{ path: 'cached.ts', range: { start: 2, end: 3 } }], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    const entry = data.files['cached.ts'];
    expect(entry.lines).toEqual(['line 2', 'line 3']);
    expect(entry.cache_hit).toBe(true);
    expect(entry.cache?.status).toBe('unchanged');
    expect(entry.cache?.hash).toBeDefined();
  });

  it('probe returns freshness metadata with no content', async () => {
    await writeFile(dir, 'probe.ts', 'alpha\nbeta');
    await handler({ files: ['probe.ts'], base_path: dir });

    const result = await handler({ files: [{ path: 'probe.ts', probe: true }], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    const entry = data.files['probe.ts'];
    expect(entry.lines).toBeUndefined();
    expect(entry.probe).toBe(true);
    expect(entry.cache?.status).toBe('unchanged');
  });

  it('never reports tokens_saved anywhere in the payload', async () => {
    await writeFile(dir, 'no-credit.ts', 'no self crediting');
    await handler({ files: ['no-credit.ts'], base_path: dir });
    const result = await handler({ files: ['no-credit.ts'], base_path: dir });
    const raw = (result.content[0] as { type: 'text'; text: string }).text;
    expect(raw).not.toContain('tokens_saved');
  });

  it('force bypasses cache metadata but still returns content', async () => {
    await writeFile(dir, 'force.ts', 'force content');
    await handler({ files: ['force.ts'], base_path: dir });
    const result = await handler({ files: [{ path: 'force.ts', force: true }], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['force.ts'].lines).toEqual(['force content']);
    expect(data.files['force.ts'].cache).toBeUndefined();
  });
});

describe('code_read — F6 one-representation token_budget pagination', () => {
  it('paginates across many small files without ever adding a field the extract mode did not produce', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 8; i++) files[`f${i}.ts`] = `content of file ${i}`;
    await writeFiles(dir, files);

    const result = await handler({
      files: Object.keys(files),
      base_path: dir,
      token_budget: 40,
    });
    const raw = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as Envelope<ReadData>;
    expect(raw.success).toBe(true);
    const data = raw.data!;
    expect(data.summary.pagination).toBeDefined();
    for (const entry of Object.values(data.files)) {
      expect(entry).not.toHaveProperty('content');
      if (entry.lines !== undefined) expect(Array.isArray(entry.lines)).toBe(true);
    }
  });

  it('splits ONE oversized lines-mode file into pages touching only the lines array', async () => {
    const bigContent = Array.from({ length: 200 }, (_, i) => `line number ${i} of the file with some padding text`).join('\n');
    await writeFile(dir, 'big.ts', bigContent);

    const result = await handler({ files: ['big.ts'], base_path: dir, token_budget: 200 });
    const data = expectSuccess<ReadData>(result).data!;
    const entry = Object.values(data.files)[0];
    expect(entry).not.toHaveProperty('content');
    expect(entry.lines).toBeDefined();
    expect(entry.lines!.length).toBeGreaterThan(0);
    expect(entry.lines!.length).toBeLessThan(200);
    expect(data.summary.pagination).toBeDefined();
  });
});

describe('code_read — output.max_tokens enforcement', () => {
  // Generalized trim loop (§4.1 code_read row) — exercised here via `lines`
  // mode, which needs no tree-sitter grammar, so this case runs regardless of
  // the wasm-asset gap (see treeSitterOutlineAvailable doc). The `outline`
  // variant below exercises the identical code path for the other array field.
  it('trims oversized lines output and flags truncation instead of returning an oversized payload', async () => {
    const bigLines = Array.from({ length: 2000 }, (_, i) => `line number ${i} with some padding text to grow the payload`).join('\n');
    await writeFile(dir, 'big-lines.ts', bigLines);

    const result = await handler({
      files: [{ path: 'big-lines.ts', force: true }],
      extract: 'lines',
      base_path: dir,
      output: { max_tokens: 4000 },
    });
    const raw = (result.content[0] as { type: 'text'; text: string }).text;
    expect(Math.ceil(raw.length / 3.5)).toBeLessThanOrEqual(4000);
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['big-lines.ts'].truncated).toBe(true);
    expect(data.summary.truncated).toBe(true);
  });

  it('trims an oversized outline and flags truncation instead of returning an oversized payload', async (ctx) => {
    if (!outlineAvailable) ctx.skip();
    const bigSource = Array.from(
      { length: 400 },
      (_, i) => `export function generatedFunction_${String(i).padStart(4, '0')}(a: string): string {\n  return a;\n}`,
    ).join('\n\n');
    await writeFile(dir, 'big-outline.ts', bigSource);

    const result = await handler({
      files: [{ path: 'big-outline.ts', force: true }],
      extract: 'outline',
      base_path: dir,
      output: { max_tokens: 4000 },
    });
    const raw = (result.content[0] as { type: 'text'; text: string }).text;
    expect(Math.ceil(raw.length / 3.5)).toBeLessThanOrEqual(4000);
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['big-outline.ts'].truncated).toBe(true);
    expect(data.summary.truncated).toBe(true);
  });

  it('does not flag truncation when output already fits', async (ctx) => {
    if (!outlineAvailable) ctx.skip();
    await writeFile(dir, 'small.ts', SAMPLE_TS_CODE);
    const result = await handler({ files: ['small.ts'], extract: 'outline', base_path: dir, output: { max_tokens: 8000 } });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['small.ts'].truncated).toBeUndefined();
    expect(data.summary.truncated).toBe(false);
  });
});

describe('code_read — size gate UTF-8 safety', () => {
  it('does not split multi-byte characters or return a partial final line', async () => {
    const line = 'é'.repeat(1000);
    const content = Array.from({ length: 300 }, () => line).join('\n');
    await writeFile(dir, 'big-utf8.txt', content);

    const result = await handler({ files: ['big-utf8.txt'], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    const entry = data.files['big-utf8.txt'];
    expect(entry.truncated).toBe(true);
    expect(entry.lines!.length).toBeGreaterThan(0);
    for (const l of entry.lines!) {
      expect(l).toBe(line);
    }
    const raw = (result.content[0] as { type: 'text'; text: string }).text;
    expect(raw).not.toContain('�');
  });
});

describe('code_read — binary files', () => {
  it('reports a clear error instead of returning binary content', async () => {
    const binPath = path.join(dir, 'image.bin');
    await fs.writeFile(binPath, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0x05]));
    const result = await handler({ files: ['image.bin'], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['image.bin'].error).toContain('Binary file');
  });
});

describe('code_read — edge cases', () => {
  it('handles a non-existent file', async () => {
    const result = await handler({ files: ['missing.ts'], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['missing.ts'].exists).toBe(false);
    expect(data.files['missing.ts'].error).toContain('not found');
  });

  it('handles an empty file', async () => {
    await writeFile(dir, 'empty.ts', '');
    const result = await handler({ files: ['empty.ts'], base_path: dir });
    const data = expectSuccess<ReadData>(result).data!;
    expect(data.files['empty.ts'].exists).toBe(true);
  });
});
