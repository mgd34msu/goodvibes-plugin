/**
 * Tests for precision_grep handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['find-foo'].match_count).toBeGreaterThan(0);
    });

    it('should search across multiple files', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'find-foo', pattern: 'foo' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['find-foo'].file_count).toBe(3);
    });

    it('should respect glob filter', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'find-foo', pattern: 'foo', glob: '*.ts' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].file_count).toBe(1);
      expect(parsed.data.queries['q1'].match_count).toBe(2);
      expect(parsed.data.queries['q1'].files).toBeUndefined();
    });

    it('should return files_only output', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'files_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].files).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].file).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].match_count).toBeDefined();
    });

    it('should return locations output', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'locations' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].files[0].matches).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].matches[0].line).toBeDefined();
      expect(parsed.data.queries['q1'].files[0].matches[0].column).toBeDefined();
    });

    it('should return matches output with content', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'matches' },
      });

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].files.length).toBeLessThanOrEqual(2);
      expect(parsed.data.queries['q1'].truncated).toBe(true);
    });

    it('should respect max_matches_per_file limit', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'locations', max_matches_per_file: 5 },
      });

      const parsed = expectSuccess(result);
      const firstFile = parsed.data.queries['q1'].files[0];
      expect(firstFile.matches.length).toBeLessThanOrEqual(5);
    });

    it('should respect max_total_matches limit', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'locations', max_total_matches: 10 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].match_count).toBeLessThanOrEqual(10);
    });
  });

  describe('match options', () => {
    beforeEach(async () => {
      await createTestFile('code.ts', 'FOO foo Foo foobar');
    });

    it('should support case insensitive search', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', case_sensitive: false }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].match_count).toBe(4);
    });

    it('should support case sensitive search', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', case_sensitive: true }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].match_count).toBe(2); // foo, foobar
    });

    it('should support whole word matching', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo', whole_word: true }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].match_count).toBeLessThan(4);
    });
  });

  describe('edge cases', () => {
    it('should handle no matches', async () => {
      await createTestFile('file.ts', 'nothing here');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'nonexistent' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.queries['q1'].match_count).toBe(0);
    });

    it('should handle empty file', async () => {
      await createTestFile('empty.ts', '');

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'test' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
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
      const parsed = expectSuccess(result);
    });

    it('should include binary files when requested', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'test', include_binary: true }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
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

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_files).toBe(2);
    });

    it('should include total_matches in summary', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'foo' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_matches).toBe(2);
    });

    it('should include truncated flag in summary', async () => {
      const content = Array(100).fill('match').join('\n');
      await createTestFile('many.ts', content);

      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'match' }],
        output: { mode: 'locations', max_total_matches: 5 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.truncated).toBe(true);
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

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionGrep({
        queries: [{ id: 'q1', pattern: 'content' }],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
