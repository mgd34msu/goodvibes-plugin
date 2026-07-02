/**
 * Tests for precision_grep handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { handlePrecisionGrep } from '../../handlers/precision-grep.js';
import { createTestFile, createTestFiles, expectSuccess, expectError } from '../test-utils.js';

describe('precision_grep handler', () => {
  describe('input validation', () => {
    it('should return error when queries array is missing', async () => {
      const result = await handlePrecisionGrep({
        output: { mode: 'count_only' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'queries'");
    });

    // Output parameter now has defaults, no longer required

    it('should return error when query missing id or pattern', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ pattern: 'test' }],
        output: { mode: 'count_only' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'queries[].id'");
    });
  });

  describe('basic grep functionality', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const foo = 1;\nconst bar = 2;\nconst baz = foo + bar;',
        'file2.ts': 'function foo() { return 42; }\nfunction bar() { return foo(); }',
        'file3.js': 'var foo = "hello";\nconsole.log(foo);',
      });
    });

    it('should find matches with simple pattern', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'find-foo', pattern: 'foo' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['find-foo'].match_count).toBeGreaterThan(0);
    });

    it('should search across multiple files', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'find-foo', pattern: 'foo' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['find-foo'].file_count).toBe(3);
    });

    it('should respect glob filter', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'find-foo', pattern: 'foo', glob: '*.ts' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['find-foo'].file_count).toBe(2);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('code.ts', 'line 1 with foo\nline 2\nline 3 with foo\nline 4');
    });

    it('should return count_only output', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].file_count).toBe(1);
      expect(parsed.data.queries['q1'].match_count).toBe(2);
      expect(parsed.data.queries['q1'].files).toBeUndefined();
    });

    it('should return files_only output', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].files).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].file).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].match_count).toBeDefined();
    });

    it('should return locations output', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'locations' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].files[0].matches).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].matches[0].line).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].matches[0].column).toBeDefined();
    });

    it('should return matches output with content', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'matches' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].files[0].matches[0].content).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].matches[0].highlight).toBeDefined();
    });

    it('should return context output with before/after', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: {
          mode: 'context',
          context_before: 1,
          context_after: 1,
        },
      });

      const parsed = expectSuccess<any>(result);
      const match = parsed.data.queries['q1'].files[0].matches[0];
      // Line 1 with foo has no before context (at file start)
      // Line 3 with foo should have before/after
    });
  });

  describe('context expansion', () => {
    beforeEach(async () => {
      await createTestFile('code.ts', `
function myFunction() {
  const a = 1;
  const MATCH = 2;
  const b = 3;
}

class MyClass {
  method() {
    const MATCH = 1;
  }
}
      `.trim());
    });

    it('should expand to block context', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'MATCH' }],
        output: {
          mode: 'context',
          expand_to: 'block',
        },
      });

      const parsed = expectSuccess<any>(result);
      const match = parsed.data.queries['q1'].files[0].matches[0];
      expect(match.before || match.after).toBeDefined();
    });

    it('should expand to function context', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'MATCH' }],
        output: {
          mode: 'context',
          expand_to: 'function',
        },
      });

      const parsed = expectSuccess<any>(result);
      const match = parsed.data.queries['q1'].files[0].matches[0];
      // Should include function signature in context
    });
  });

  describe('multiple queries', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file.ts': 'const foo = 1;\nconst bar = 2;',
      });
    });

    it('should execute multiple queries', async () => {
      const result = await handlePrecisionGrep({
        queries: [
          { id: 'q1', pattern: 'foo' },
          { id: 'q2', pattern: 'bar' },
        ],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(1);
      expect(parsed.data.queries['q2'].match_count).toBe(1);
    });

    it('should execute queries in parallel', async () => {
      const result = await handlePrecisionGrep({
        queries: [
          { id: 'q1', pattern: 'foo' },
          { id: 'q2', pattern: 'bar' },
        ],
        parallel: true,
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.summary.total_matches).toBe(2);
    });
  });

  describe('limits', () => {
    beforeEach(async () => {
      // Create files with many matches
      const content = Array(50).fill('match').join('\n');
      await createTestFiles({
        'file1.ts': content,
        'file2.ts': content,
        'file3.ts': content,
      });
    });

    it('should respect max_files limit', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'files_only', max_files: 2 },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].files.length).toBeLessThanOrEqual(2);
      expect(parsed.data.queries['q1'].truncated).toBe(true);
      expect(parsed.data.queries['q1'].effective_caps.max_results).toBe(2);
      // file_count reports the TRUE number of matching files
      expect(parsed.data.queries['q1'].file_count).toBe(3);
    });

    it('should respect max_matches_per_file limit', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'locations', max_matches_per_file: 5 },
      });

      const parsed = expectSuccess<any>(result);
      const firstFile = parsed.data.queries['q1'].files[0];
      expect(firstFile.matches.length).toBeLessThanOrEqual(5);
      // per-file match_count reports the TRUE matched-line count
      expect(firstFile.match_count).toBe(50);
    });

    it('should respect max_total_matches limit on returned matches', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'locations', max_total_matches: 10, max_per_item: 50 },
      });

      const parsed = expectSuccess<any>(result);
      const query = parsed.data.queries['q1'];
      const includedMatches = query.files.reduce(
        (sum: number, f: { matches?: unknown[] }) => sum + (f.matches?.length ?? 0),
        0
      );
      expect(includedMatches).toBeLessThanOrEqual(10);
      // Counts stay TRUE totals; only the returned matches are capped
      expect(query.match_count).toBe(150);
      expect(query.truncated).toBe(true);
      expect(query.effective_caps.max_total_matches).toBe(10);
    });
  });

  describe('match options', () => {
    beforeEach(async () => {
      // One candidate per line: match_count counts matched LINES
      await createTestFile('code.ts', 'FOO\nfoo\nFoo\nfoobar');
    });

    it('should support case insensitive search', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', case_sensitive: false }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(4);
    });

    it('should support case sensitive search', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', case_sensitive: true }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(2); // foo, foobar
    });

    it('should support whole word matching', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', whole_word: true }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(1); // only the bare 'foo' line
    });

    it('should count matched lines, not submatches', async () => {
      // Three occurrences on a single line still count as ONE matched line,
      // consistent with how the caps count.
      await createTestFile('multi.ts', 'foo foo foo\nplain line');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', path: 'multi.ts' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle no matches', async () => {
      await createTestFile('file.ts', 'nothing here');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'nonexistent' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(0);
    });

    it('should handle empty file', async () => {
      await createTestFile('empty.ts', '');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'test' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(0);
    });

    it('should handle binary files', async () => {
      // Binary check is done via null byte detection
      await createTestFile('binary.bin', '\x00\x01\x02\x03');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'test', glob: '*.*' }],
        output: { mode: 'count_only' },
      });

      // Binary files should be skipped by default
      const parsed = expectSuccess<any>(result);
    });

    it('should include binary files when requested', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'test', include_binary: true }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
    });
  });

  describe('summary', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'foo bar',
        'file2.ts': 'foo baz',
      });
    });

    it('should include total_files in summary', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.summary.total_files).toBe(2);
    });

    it('should include total_matches in summary', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.summary.total_matches).toBe(2);
    });

    it('should include truncated flag in summary', async () => {
      const content = Array(100).fill('match').join('\n');
      await createTestFile('many.ts', content);

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'locations', max_total_matches: 5 },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.summary.truncated).toBe(true);
    });
  });

  describe('cap separation and truthful truncation', () => {
    it('count_only returns the true count above the per-file cap default', async () => {
      // 50 matched lines in one file — far above the old per-file cap of 10
      // that used to leak into count_only totals.
      const content = Array(50).fill('needle').join('\n');
      await createTestFile('big.ts', content);

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(50);
      expect(parsed.data.queries['q1'].file_count).toBe(1);
      expect(parsed.data.queries['q1'].truncated).toBe(false);
      expect(parsed.data.queries['q1'].effective_caps).toBeUndefined();
    });

    it('count_only counts above max_total_matches too', async () => {
      // 3 files x 50 lines = 150 true matches (> default max_total_matches 100)
      const content = Array(50).fill('needle').join('\n');
      await createTestFiles({ 'a.ts': content, 'b.ts': content, 'c.ts': content });

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].match_count).toBe(150);
      expect(parsed.data.queries['q1'].truncated).toBe(false);
    });

    it('files_only file list is not ceilinged by max_total_matches', async () => {
      // 15 files x 20 matches = 300 true matches. The old implementation
      // stopped the file list at ~10 files when total matches hit 100.
      const files: Record<string, string> = {};
      for (let i = 0; i < 15; i++) {
        files[`f${String(i).padStart(2, '0')}.ts`] = Array(20).fill('needle').join('\n');
      }
      await createTestFiles(files);

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      const query = parsed.data.queries['q1'];
      expect(query.files.length).toBe(15);
      expect(query.file_count).toBe(15);
      expect(query.match_count).toBe(300);
      expect(query.truncated).toBe(false);
      expect(query.effective_caps).toBeUndefined();
      // per-file counts are true counts, not capped at the old default of 10
      expect(query.files[0].match_count).toBe(20);
    });

    it('files_only reaches max_results and reports effective_caps when trimmed', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 15; i++) {
        files[`f${String(i).padStart(2, '0')}.ts`] = Array(20).fill('needle').join('\n');
      }
      await createTestFiles(files);

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        output: { mode: 'files_only', max_results: 12 },
      });

      const parsed = expectSuccess<any>(result);
      const query = parsed.data.queries['q1'];
      expect(query.files.length).toBe(12);
      expect(query.file_count).toBe(15);
      expect(query.truncated).toBe(true);
      expect(query.effective_caps).toEqual({ max_results: 12 });
    });

    it('deterministic file list membership across identical runs', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 12; i++) {
        files[`f${String(i).padStart(2, '0')}.ts`] = Array(15).fill('needle').join('\n');
      }
      await createTestFiles(files);

      const run = async () => {
        const result = await handlePrecisionGrep({
          queries: [{ id: 'q1', pattern: 'needle' }],
          output: { mode: 'files_only', max_results: 6 },
        });
        const parsed = expectSuccess<any>(result);
        return parsed.data.queries['q1'].files
          .map((f: { file: string }) => f.file)
          .sort();
      };

      const first = await run();
      const second = await run();
      const third = await run();
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it('truncated stays false when results are complete', async () => {
      await createTestFile('one.ts', 'needle here\nplain line');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        output: { mode: 'matches' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.queries['q1'].truncated).toBe(false);
      expect(parsed.data.queries['q1'].effective_caps).toBeUndefined();
      expect(parsed.data.summary.truncated).toBe(false);
    });

    it('max_per_item trims per-file matches and reports effective_caps', async () => {
      const content = Array(50).fill('needle').join('\n');
      await createTestFile('big.ts', content);

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        output: { mode: 'locations', max_per_item: 5 },
      });

      const parsed = expectSuccess<any>(result);
      const query = parsed.data.queries['q1'];
      expect(query.files[0].matches.length).toBe(5);
      expect(query.files[0].match_count).toBe(50);
      expect(query.match_count).toBe(50);
      expect(query.truncated).toBe(true);
      expect(query.effective_caps.max_per_item).toBe(5);
    });

    it('negate reports honest truncation with effective_caps', async () => {
      await createTestFiles({
        'hit.ts': 'needle',
        'a.ts': 'plain',
        'b.ts': 'plain',
        'c.ts': 'plain',
        'd.ts': 'plain',
        'e.ts': 'plain',
      });

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle', negate: true }],
        output: { mode: 'files_only', max_results: 2 },
      });

      const parsed = expectSuccess<any>(result);
      const query = parsed.data.queries['q1'];
      expect(query.files.length).toBe(2);
      expect(query.file_count).toBe(5);
      expect(query.truncated).toBe(true);
      expect(query.effective_caps).toEqual({ max_results: 2 });
    });

    it('negate reports truncated false when the list is complete', async () => {
      await createTestFiles({
        'hit.ts': 'needle',
        'a.ts': 'plain',
        'b.ts': 'plain',
      });

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle', negate: true }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      const query = parsed.data.queries['q1'];
      expect(query.files.length).toBe(2);
      expect(query.file_count).toBe(2);
      expect(query.truncated).toBe(false);
      expect(query.effective_caps).toBeUndefined();
    });
  });

  describe('base_path', () => {
    it('resolves relative query paths against base_path', async () => {
      await createTestFiles({
        'decoy.ts': 'needle here',
        'sub/inner/hit.ts': 'needle here',
      });

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        base_path: path.join(process.cwd(), 'sub'),
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      const files = parsed.data.queries['q1'].files.map((f: { file: string }) => f.file);
      expect(files).toContain('inner/hit.ts');
      expect(files.some((f: string) => f.includes('decoy'))).toBe(false);
    });

    it('resolves a relative query path against base_path', async () => {
      await createTestFiles({
        'inner/decoy.ts': 'needle here',
        'sub/inner/hit.ts': 'needle here',
      });

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle', path: 'inner' }],
        base_path: path.join(process.cwd(), 'sub'),
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess<any>(result);
      const files = parsed.data.queries['q1'].files.map((f: { file: string }) => f.file);
      expect(files).toContain('inner/hit.ts');
      expect(files.some((f: string) => f.includes('decoy'))).toBe(false);
    });

    it('errors on an invalid base_path', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'needle' }],
        base_path: path.join(process.cwd(), 'does-not-exist'),
        output: { mode: 'files_only' },
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('does not exist');
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include tokens_used', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'content' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'content' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess<any>(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
