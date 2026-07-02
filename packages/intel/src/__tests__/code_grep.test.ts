/**
 * Tests for code_grep. Named regression class: F2 cap honesty in every
 * output format (plan §5.3 — the fix lives in `transformRipgrepResult`).
 * Also covers negate, ranked, preview_replace, stats, expand_to, base_path,
 * and the ported v1 Bug 3 / Bug 11 regressions (bug-fixes.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { handler } from '../tools/code_grep.js';
import { makeTempDir, cleanupTempDir, writeFile, writeFiles, expectSuccess, expectError } from './test-utils.js';

interface GrepFile {
  file: string;
  resolved_path: string;
  matches?: Array<{ line: number; content?: string; before?: string[]; after?: string[] }>;
  match_count?: number;
  relevance?: number;
}
interface QueryResult {
  files?: GrepFile[];
  file_count?: number;
  match_count?: number;
  truncated?: boolean;
  effective_caps?: Record<string, number>;
  stats?: { total_matches: number; total_files: number };
  replace_preview?: { matches: unknown[]; safe: boolean; total_replacements: number };
  negation?: { total_files_without_match: number };
}
interface GrepData {
  queries: Record<string, QueryResult>;
  summary: { total_files: number; total_matches: number; truncated: boolean };
}

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir('code-grep-');
});
afterEach(async () => {
  await cleanupTempDir(dir);
});

describe('code_grep — input validation', () => {
  it('errors when queries array is missing', async () => {
    const result = await handler({ base_path: dir });
    const parsed = expectError(result);
    expect(parsed.error).toContain("Missing required parameter 'queries'");
  });

  it('errors when a query is missing id', async () => {
    const result = await handler({ queries: [{ pattern: 'x' }], base_path: dir });
    const parsed = expectError(result);
    expect(parsed.error).toContain("queries[].id");
  });

  it('errors when a query is missing pattern', async () => {
    const result = await handler({ queries: [{ id: 'q1' }], base_path: dir });
    const parsed = expectError(result);
    expect(parsed.error).toContain("queries[].pattern");
  });
});

describe('code_grep — basic search', () => {
  beforeEach(async () => {
    await writeFiles(dir, {
      'file1.ts': 'const foo = 1;\nconst bar = 2;',
      'file2.ts': 'function foo() { return 42; }',
    });
  });

  it('finds matches with a simple pattern', async () => {
    const result = await handler({ queries: [{ id: 'q1', pattern: 'foo' }], base_path: dir });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.q1.file_count).toBe(2);
  });

  it('echoes an absolute resolved_path per file (F1)', async () => {
    const result = await handler({ queries: [{ id: 'q1', pattern: 'foo' }], base_path: dir });
    const data = expectSuccess<GrepData>(result).data!;
    for (const f of data.queries.q1.files!) {
      expect(path.isAbsolute(f.resolved_path)).toBe(true);
      expect(f.resolved_path.endsWith(f.file)).toBe(true);
    }
  });
});

describe('code_grep — F2 cap honesty in every output format', () => {
  it('count_only returns the true count above the per-file default cap', async () => {
    await writeFile(dir, 'big.ts', Array(50).fill('needle').join('\n'));
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, output: { mode: 'count_only' } });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.q1.match_count).toBe(50);
    expect(data.queries.q1.file_count).toBe(1);
    expect(data.queries.q1.truncated).toBe(false);
    expect(data.queries.q1.effective_caps).toBeUndefined();
  });

  it('count_only counts true totals above max_total_matches too', async () => {
    const content = Array(50).fill('needle').join('\n');
    await writeFiles(dir, { 'a.ts': content, 'b.ts': content, 'c.ts': content });
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, output: { mode: 'count_only' } });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.q1.match_count).toBe(150);
    expect(data.queries.q1.truncated).toBe(false);
  });

  it('files_only file list is not ceilinged by max_total_matches', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 15; i++) files[`f${String(i).padStart(2, '0')}.ts`] = Array(20).fill('needle').join('\n');
    await writeFiles(dir, files);
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, output: { mode: 'files_only' } });
    const data = expectSuccess<GrepData>(result).data!;
    const q = data.queries.q1;
    expect(q.files!.length).toBe(15);
    expect(q.file_count).toBe(15);
    expect(q.match_count).toBe(300);
    expect(q.truncated).toBe(false);
    expect(q.files![0].match_count).toBe(20);
  });

  it('files_only reports effective_caps only when max_results actually trims', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 15; i++) files[`f${String(i).padStart(2, '0')}.ts`] = Array(20).fill('needle').join('\n');
    await writeFiles(dir, files);
    const result = await handler({
      queries: [{ id: 'q1', pattern: 'needle' }],
      base_path: dir,
      output: { mode: 'files_only', max_results: 12 },
    });
    const data = expectSuccess<GrepData>(result).data!;
    const q = data.queries.q1;
    expect(q.files!.length).toBe(12);
    expect(q.file_count).toBe(15);
    expect(q.truncated).toBe(true);
    expect(q.effective_caps).toEqual({ max_results: 12 });
  });

  it('max_per_item trims per-file matches and reports effective_caps', async () => {
    await writeFile(dir, 'big.ts', Array(50).fill('needle').join('\n'));
    const result = await handler({
      queries: [{ id: 'q1', pattern: 'needle' }],
      base_path: dir,
      output: { mode: 'locations', max_per_item: 5 },
    });
    const data = expectSuccess<GrepData>(result).data!;
    const q = data.queries.q1;
    expect(q.files![0].matches!.length).toBe(5);
    expect(q.files![0].match_count).toBe(50);
    expect(q.match_count).toBe(50);
    expect(q.truncated).toBe(true);
    expect(q.effective_caps!.max_per_item).toBe(5);
  });

  it('truncated stays false when results are complete', async () => {
    await writeFile(dir, 'one.ts', 'needle here\nplain line');
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, output: { mode: 'matches' } });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.q1.truncated).toBe(false);
    expect(data.queries.q1.effective_caps).toBeUndefined();
    expect(data.summary.truncated).toBe(false);
  });

  it('deterministic file list membership across identical runs', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) files[`f${String(i).padStart(2, '0')}.ts`] = Array(15).fill('needle').join('\n');
    await writeFiles(dir, files);
    const run = async () => {
      const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, output: { mode: 'files_only', max_results: 6 } });
      const data = expectSuccess<GrepData>(result).data!;
      return data.queries.q1.files!.map((f) => f.file).sort();
    };
    const first = await run();
    expect(await run()).toEqual(first);
    expect(await run()).toEqual(first);
  });
});

describe('code_grep — negate', () => {
  it('reports honest truncation with effective_caps', async () => {
    await writeFiles(dir, { 'hit.ts': 'needle', 'a.ts': 'plain', 'b.ts': 'plain', 'c.ts': 'plain', 'd.ts': 'plain', 'e.ts': 'plain' });
    const result = await handler({
      queries: [{ id: 'q1', pattern: 'needle', negate: true }],
      base_path: dir,
      output: { mode: 'files_only', max_results: 2 },
    });
    const data = expectSuccess<GrepData>(result).data!;
    const q = data.queries.q1;
    expect(q.files!.length).toBe(2);
    expect(q.file_count).toBe(5);
    expect(q.truncated).toBe(true);
    expect(q.effective_caps).toEqual({ max_results: 2 });
  });

  it('reports truncated false when the list is complete', async () => {
    await writeFiles(dir, { 'hit.ts': 'needle', 'a.ts': 'plain', 'b.ts': 'plain' });
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle', negate: true }], base_path: dir, output: { mode: 'files_only' } });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.q1.files!.length).toBe(2);
    expect(data.queries.q1.truncated).toBe(false);
    expect(data.queries.q1.effective_caps).toBeUndefined();
  });
});

describe('code_grep — base_path (F1)', () => {
  it('resolves relative query paths against base_path', async () => {
    await writeFiles(dir, { 'decoy.ts': 'needle here', 'sub/inner/hit.ts': 'needle here' });
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: path.join(dir, 'sub'), output: { mode: 'files_only' } });
    const data = expectSuccess<GrepData>(result).data!;
    const files = data.queries.q1.files!.map((f) => f.file);
    expect(files).toContain('inner/hit.ts');
    expect(files.some((f) => f.includes('decoy'))).toBe(false);
  });

  it('errors on an invalid base_path', async () => {
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: path.join(dir, 'nope') });
    expectError(result);
  });

  it('warns when base_path is omitted', async () => {
    const result = await handler({ queries: [{ id: 'q1', pattern: 'zzz-nomatch-zzz' }] });
    const raw = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(raw.warning).toContain('base_path');
  });
});

describe('code_grep — ranked', () => {
  it('sorts files in place by a single relevance scalar, no duplicated content', async () => {
    await writeFiles(dir, {
      'deep/nested/dir/exported.ts': 'export const needle = 1;',
      'shallow.ts': 'const needle = 1; // not exported',
    });
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, ranked: true, output: { mode: 'matches' } });
    const data = expectSuccess<GrepData>(result).data!;
    const q = data.queries.q1 as unknown as { files: GrepFile[]; ranked_files?: unknown };
    expect(q.ranked_files).toBeUndefined();
    for (const f of q.files) expect(typeof f.relevance).toBe('number');
  });
});

describe('code_grep — preview_replace', () => {
  it('generates a unified-diff-shaped preview without writing', async () => {
    await writeFile(dir, 'target.ts', 'const OLD_NAME = 1;\nconsole.log(OLD_NAME);');
    const result = await handler({
      queries: [{ id: 'q1', pattern: 'OLD_NAME' }],
      base_path: dir,
      preview_replace: 'NEW_NAME',
      output: { mode: 'matches' },
    });
    const data = expectSuccess<GrepData>(result).data!;
    const preview = data.queries.q1.replace_preview!;
    expect(preview.total_replacements).toBe(2);
    expect(preview.safe).toBe(true);
    const first = preview.matches[0] as { diff: string };
    expect(first.diff).toContain('@@');
    expect(first.diff).toContain('-const OLD_NAME = 1;');
    expect(first.diff).toContain('+const NEW_NAME = 1;');
  });
});

describe('code_grep — stats mode', () => {
  it('computes per-directory and per-file-type breakdowns', async () => {
    await writeFiles(dir, { 'a.ts': 'needle', 'b.ts': 'needle\nneedle', 'sub/c.ts': 'needle' });
    const result = await handler({ queries: [{ id: 'q1', pattern: 'needle' }], base_path: dir, output: { mode: 'stats' } });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.q1.stats!.total_matches).toBe(4);
    expect(data.queries.q1.stats!.total_files).toBe(3);
  });
});

describe('code_grep — expand_to context', () => {
  it('expands to the enclosing function body', async () => {
    await writeFile(
      dir,
      'fn.ts',
      'function outer() {\n  const needle = 1;\n  return needle;\n}\n',
    );
    const result = await handler({
      queries: [{ id: 'q1', pattern: 'needle = 1' }],
      base_path: dir,
      output: { mode: 'context', expand_to: 'function' },
    });
    const data = expectSuccess<GrepData>(result).data!;
    const match = data.queries.q1.files![0].matches![0];
    expect(match.before?.some((l) => l.includes('function outer'))).toBe(true);
    expect(match.after?.some((l) => l.includes('return needle'))).toBe(true);
  });
});

describe('code_grep — ported v1 regressions (Bug 3 / Bug 11)', () => {
  beforeEach(async () => {
    await writeFile(dir, 'subdir/sample.ts', 'export function testFunction() { return "hello"; }\n');
    await writeFile(dir, 'single-file.ts', 'export const CONSTANT = 42;\n');
  });

  it('Bug 3: glob with a subdirectory prefix resolves correctly', async () => {
    const result = await handler({
      queries: [{ id: 'bug3', pattern: 'export', glob: 'subdir/**/*.ts' }],
      base_path: dir,
      output: { mode: 'files_only' },
    });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.bug3.file_count).toBeGreaterThan(0);
    expect(data.queries.bug3.files![0].file).toContain('sample.ts');
  });

  it('Bug 11: path parameter accepts a file path, not just a directory', async () => {
    const result = await handler({
      queries: [{ id: 'bug11', pattern: 'CONSTANT', path: 'single-file.ts' }],
      base_path: dir,
      output: { mode: 'files_only' },
    });
    const data = expectSuccess<GrepData>(result).data!;
    expect(data.queries.bug11.file_count).toBe(1);
    expect(data.queries.bug11.files![0].file).toContain('single-file.ts');
  });
});

describe('code_grep — hidden files (include_hidden)', () => {
  beforeEach(async () => {
    await writeFiles(dir, {
      'visible.ts': 'export const searchme = 1;',
      '.hidden.ts': 'export const searchme = 2;',
      '.hidden-dir/inside.ts': 'export const searchme = 3;',
    });
  });

  it('includes hidden files by default', async () => {
    const result = await handler({ queries: [{ id: 'q1', pattern: 'searchme' }], base_path: dir, output: { mode: 'files_only' } });
    const data = expectSuccess<GrepData>(result).data!;
    const files = data.queries.q1.files!.map((f) => f.file);
    expect(files.some((f) => f.includes('.hidden.ts'))).toBe(true);
    expect(files.some((f) => f.includes('.hidden-dir'))).toBe(true);
  });

  it('excludes hidden files when include_hidden is explicitly false', async () => {
    const result = await handler({
      queries: [{ id: 'q1', pattern: 'searchme', include_hidden: false }],
      base_path: dir,
      output: { mode: 'files_only' },
    });
    const data = expectSuccess<GrepData>(result).data!;
    const files = data.queries.q1.files!.map((f) => f.file);
    expect(files.some((f) => f.includes('visible.ts'))).toBe(true);
    expect(files.some((f) => f.includes('.hidden'))).toBe(false);
  });
});
