/**
 * Tests for code_glob. Covers output modes, filters, sorting, exclusions
 * (un-anchored DEFAULT_EXCLUDES + real .gitignore reading), presets, base64
 * patterns, base_path/resolved_path (F1), backend selection, and honest
 * truncation summaries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { handler } from '../tools/code_glob.js';
import { makeTempDir, cleanupTempDir, writeFile, writeFiles, expectSuccess, expectError } from './test-utils.js';

interface GlobData {
  files?: unknown[];
  summary: { total_files: number; returned: number; total_size: number; truncated: boolean; effective_caps?: Record<string, number> };
  tokens_used?: number;
}

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir('code-glob-');
});
afterEach(async () => {
  await cleanupTempDir(dir);
});

describe('code_glob — input validation', () => {
  it('errors when patterns/preset are all missing', async () => {
    const result = await handler({ base_path: dir });
    const parsed = expectError(result);
    expect(parsed.error).toContain('patterns');
  });
});

describe('code_glob — basic functionality', () => {
  beforeEach(async () => {
    await writeFiles(dir, {
      'file1.ts': 'a',
      'file2.ts': 'b',
      'file3.js': 'c',
      'README.md': '# doc',
      'src/index.ts': 'export {};',
    });
  });

  it('finds files matching a pattern', async () => {
    const result = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).every((f) => f.endsWith('.ts'))).toBe(true);
  });

  it('finds files in subdirectories with **', async () => {
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).some((f) => f.includes('src'))).toBe(true);
  });

  it('echoes an absolute resolved_path per file in with_stats mode (F1)', async () => {
    const result = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'with_stats' } });
    const data = expectSuccess<GlobData>(result).data!;
    for (const f of data.files as Array<{ path: string; resolved_path: string }>) {
      expect(path.isAbsolute(f.resolved_path)).toBe(true);
    }
  });
});

describe('code_glob — output modes', () => {
  beforeEach(async () => {
    await writeFile(dir, 'file.ts', 'content');
  });

  it('count_only returns no file list', async () => {
    const result = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'count_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.summary.total_files).toBe(1);
    expect(data.files).toBeUndefined();
  });

  it('with_preview includes preview lines', async () => {
    await writeFile(dir, 'preview.ts', 'line 1\nline 2\nline 3\nline 4\nline 5');
    const result = await handler({ patterns: ['preview.ts'], base_path: dir, output: { mode: 'with_preview', preview_lines: 3 } });
    const data = expectSuccess<GlobData>(result).data!;
    const entry = (data.files as Array<{ preview: string[] }>)[0];
    expect(entry.preview).toHaveLength(3);
  });
});

describe('code_glob — filters', () => {
  beforeEach(async () => {
    await writeFiles(dir, { 'small.ts': 'x', 'large.ts': Array(100).fill('content').join('\n'), 'empty.ts': '' });
  });

  it('filters by min_size / max_size', async () => {
    const min = await handler({ patterns: ['*.ts'], base_path: dir, filters: { min_size: 50 }, output: { mode: 'with_stats' } });
    const minData = expectSuccess<GlobData>(min).data!;
    expect((minData.files as Array<{ size: number }>).every((f) => f.size >= 50)).toBe(true);

    const max = await handler({ patterns: ['*.ts'], base_path: dir, filters: { max_size: 10 }, output: { mode: 'with_stats' } });
    const maxData = expectSuccess<GlobData>(max).data!;
    expect((maxData.files as Array<{ size: number }>).every((f) => f.size <= 10)).toBe(true);
  });

  it('filters by is_empty', async () => {
    const result = await handler({ patterns: ['*.ts'], base_path: dir, filters: { is_empty: true }, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).toContain('empty.ts');
  });

  it('filters by has_content', async () => {
    await writeFiles(dir, { 'match.ts': 'SEARCHTERM here', 'nomatch.ts': 'nothing special' });
    const result = await handler({ patterns: ['*.ts'], base_path: dir, filters: { has_content: 'SEARCHTERM' }, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).toContain('match.ts');
    expect(data.files).not.toContain('nomatch.ts');
  });
});

describe('code_glob — sorting', () => {
  beforeEach(async () => {
    await writeFiles(dir, { 'a.ts': 'x', 'b.ts': 'xxx', 'c.ts': 'xx' });
  });

  it('sorts by name ascending/descending', async () => {
    const asc = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'paths_only', sort_by: 'name', sort_order: 'asc' } });
    expect((expectSuccess<GlobData>(asc).data!.files as string[])[0]).toBe('a.ts');

    const desc = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'paths_only', sort_by: 'name', sort_order: 'desc' } });
    expect((expectSuccess<GlobData>(desc).data!.files as string[])[0]).toBe('c.ts');
  });

  it('sorts by size', async () => {
    const result = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'with_stats', sort_by: 'size', sort_order: 'asc' } });
    const data = expectSuccess<GlobData>(result).data!;
    const files = data.files as Array<{ size: number }>;
    expect(files[0].size).toBeLessThanOrEqual(files[1].size);
  });
});

describe('code_glob — exclusions and gitignore', () => {
  it('excludes nested node_modules at defaults (un-anchored DEFAULT_EXCLUDES)', async () => {
    await writeFiles(dir, { 'keep.ts': 'x', 'packages/app/node_modules/dep/index.ts': 'x' });
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).some((f) => f.includes('node_modules'))).toBe(false);
    expect(data.files).toContain('keep.ts');
  });

  it('respects the root .gitignore', async () => {
    await writeFiles(dir, { 'keep.ts': 'x', 'ignored-dir/skip.ts': 'x' });
    await writeFile(dir, '.gitignore', 'ignored-dir/\n');
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).toContain('keep.ts');
    expect((data.files as string[]).some((f) => f.includes('ignored-dir'))).toBe(false);
  });

  it('includes gitignored files when respect_gitignore is false', async () => {
    await writeFiles(dir, { 'keep.ts': 'x', 'ignored-dir/skip.ts': 'x' });
    await writeFile(dir, '.gitignore', 'ignored-dir/\n');
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, respect_gitignore: false, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).toContain('ignored-dir/skip.ts');
  });

  it('respects an explicit exclude list', async () => {
    await writeFiles(dir, { 'include.ts': 'x', 'exclude.ts': 'x' });
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, exclude: ['**/exclude.ts'], output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).not.toContain('exclude.ts');
  });
});

describe('code_glob — hidden files', () => {
  beforeEach(async () => {
    await writeFiles(dir, { 'visible.ts': 'x', '.hidden.ts': 'x', '.hidden-dir/inside.ts': 'x' });
  });

  it('includes hidden files by default', async () => {
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).some((f) => f.includes('.hidden.ts'))).toBe(true);
  });

  it('excludes hidden files when include_hidden is false', async () => {
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, include_hidden: false, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).some((f) => f.includes('.hidden'))).toBe(false);
    expect(data.files).toContain('visible.ts');
  });
});

describe('code_glob — presets and base64 patterns', () => {
  beforeEach(async () => {
    await writeFiles(dir, { 'a.ts': 'x', 'b.js': 'x', 'special[chars].ts': 'x' });
  });

  it('expands a named preset when patterns are omitted', async () => {
    const result = await handler({ preset: 'typescript', base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).toContain('a.ts');
    expect(data.files).not.toContain('b.js');
  });

  it('decodes patterns_base64 and escapes brackets for literal matching', async () => {
    const patternBase64 = Buffer.from('special[chars].ts').toString('base64');
    const result = await handler({ patterns_base64: [patternBase64], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).some((f) => f.includes('[chars]'))).toBe(true);
  });
});

describe('code_glob — base_path (F1)', () => {
  it('errors for a nonexistent base_path', async () => {
    const result = await handler({ patterns: ['*.ts'], base_path: path.join(dir, 'nope') });
    expectError(result);
  });

  it('warns when base_path is omitted', async () => {
    const result = await handler({ patterns: ['*.__no_such_ext_zzz'] });
    const raw = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(raw.warning).toContain('base_path');
  });
});

describe('code_glob — backend selection', () => {
  beforeEach(async () => {
    await writeFiles(dir, { 'keep.ts': 'x', 'dir/nested.ts': 'x' });
  });

  it('ripgrep backend resolves subdirectory-anchored glob patterns', async () => {
    const result = await handler({ patterns: ['dir/*.ts'], base_path: dir, backend: 'ripgrep', output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.files).toContain(path.join('dir', 'nested.ts').replace(/\\/g, '/'));
  });

  it('an unavailable fast-glob backend degrades to ripgrep with a warning, never a hard failure', async () => {
    const result = await handler({ patterns: ['**/*.ts'], base_path: dir, backend: 'fast-glob', output: { mode: 'paths_only' } });
    const raw = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(raw.success).toBe(true);
    expect(raw.data.files.length).toBeGreaterThan(0);
  });
});

describe('code_glob — honest truncation summary', () => {
  it('reports true total_files and effective_caps when max_results trims', async () => {
    const manyFiles: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {manyFiles[`file${String(i).padStart(2, '0')}.ts`] = 'content';}
    await writeFiles(dir, manyFiles);

    const result = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'paths_only', max_results: 10 } });
    const data = expectSuccess<GlobData>(result).data!;
    expect((data.files as string[]).length).toBe(10);
    expect(data.summary.total_files).toBe(30);
    expect(data.summary.returned).toBe(10);
    expect(data.summary.truncated).toBe(true);
    expect(data.summary.effective_caps).toEqual({ max_results: 10 });
  });

  it('does not set truncated when results are complete', async () => {
    await writeFiles(dir, { 'a.ts': 'x', 'b.ts': 'y' });
    const result = await handler({ patterns: ['*.ts'], base_path: dir, output: { mode: 'paths_only' } });
    const data = expectSuccess<GlobData>(result).data!;
    expect(data.summary.total_files).toBe(2);
    expect(data.summary.truncated).toBe(false);
    expect(data.summary.effective_caps).toBeUndefined();
  });
});
