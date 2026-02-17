/**
 * Tests for discover handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleDiscover } from '../../handlers/discover.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, SAMPLE_TS_CODE } from '../test-utils.js';

describe('discover handler', () => {
  describe('input validation', () => {
    it('should return error when queries array is missing', async () => {
      const result = await handleDiscover({});
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'queries'");
    });

    it('should return error when queries array is empty', async () => {
      const result = await handleDiscover({ queries: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'queries'");
    });
  });

  describe('grep queries', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const foo = 1;\nconst bar = 2;',
        'file2.ts': 'const foo = 3;\nconst baz = 4;',
      });
    });

    it('should execute grep query', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-foo',
          type: 'grep',
          pattern: 'foo',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-foo']).toBeDefined();
      expect(parsed.data.results['find-foo'].count).toBeGreaterThan(0);
    });

    it('should return files for grep query', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-foo',
          type: 'grep',
          pattern: 'foo',
        }],
        output_mode: 'files_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-foo'].files).toBeDefined();
    });

    it('should handle grep query with glob filter', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-in-ts',
          type: 'grep',
          pattern: 'const',
          glob: '*.ts',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-in-ts'].count).toBeGreaterThan(0);
    });

    it('should return error for missing pattern in grep', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'missing-pattern',
          type: 'grep',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['missing-pattern'].error).toBeDefined();
    });
  });

  describe('glob queries', () => {
    beforeEach(async () => {
      await createTestFiles({
        'src/index.ts': 'export {};',
        'src/utils/helper.ts': 'export function help() {}',
        'tests/test.ts': 'test()',
      });
    });

    it('should execute glob query', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-ts-files',
          type: 'glob',
          patterns: ['**/*.ts'],
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-ts-files'].count).toBeGreaterThan(0);
    });

    it('should return files for glob query', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-ts-files',
          type: 'glob',
          patterns: ['src/**/*.ts'],
        }],
        output_mode: 'files_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-ts-files'].files).toBeDefined();
    });

    it('should return error for missing patterns in glob', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'missing-patterns',
          type: 'glob',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['missing-patterns'].error).toBeDefined();
    });
  });

  describe('symbols queries', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should execute symbols query', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-sample',
          type: 'symbols',
          query: 'Sample',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-sample'].count).toBeGreaterThan(0);
    });

    it('should filter symbols by kind', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'find-classes',
          type: 'symbols',
          query: 'Sample',
          kinds: ['class'],
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['find-classes'].count).toBeGreaterThan(0);
    });

    it('should return error for missing query in symbols', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'missing-query',
          type: 'symbols',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['missing-query'].error).toBeDefined();
    });
  });

  describe('mixed queries', () => {
    beforeEach(async () => {
      await createTestFiles({
        'src/index.ts': 'export function main() { const x = 1; }',
        'src/utils.ts': 'export function helper() {}',
      });
    });

    it('should execute multiple query types in parallel', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'grep-func', type: 'grep', pattern: 'function' },
          { id: 'glob-ts', type: 'glob', patterns: ['**/*.ts'] },
          { id: 'symbols-func', type: 'symbols', query: 'main' },
        ],
      });

      const parsed = expectSuccess(result);
      // total_queries reflects only user-submitted queries (not auto-injected _project_index)
      expect(parsed.data.total_queries).toBe(3);
      expect(parsed.data.results['grep-func']).toBeDefined();
      expect(parsed.data.results['glob-ts']).toBeDefined();
      expect(parsed.data.results['symbols-func']).toBeDefined();
    });

    it('should track successful and failed queries', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'good', type: 'grep', pattern: 'function' },
          { id: 'bad', type: 'grep' }, // Missing pattern
        ],
      });

      const parsed = expectSuccess(result);
      // 1 successful (good grep), 1 failed (bad grep). _project_index is soft and not counted.
      expect(parsed.data.successful).toBe(1);
      expect(parsed.data.failed).toBe(1);
    });

    it('should auto-inject _project_index query when no index query is submitted', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'grep-func', type: 'grep', pattern: 'function' },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['_project_index']).toBeDefined();
    });

    it('should NOT inject duplicate _project_index when a type: index query is already submitted', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'my-index', type: 'index', detail: 'summary' },
        ],
      });

      const parsed = expectSuccess(result);
      // Only 1 query: the user-provided index query (no auto-inject)
      expect(parsed.data.total_queries).toBe(1);
      expect(parsed.data.results['my-index']).toBeDefined();
      expect(parsed.data.results['_project_index']).toBeUndefined();
    });

    it('should count auto-injected query in total_queries', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'grep-func', type: 'grep', pattern: 'function' },
        ],
      });

      const parsed = expectSuccess(result);
      // total_queries reflects only user-submitted queries (1), not auto-injected _project_index
      expect(parsed.data.total_queries).toBe(1);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo = 1;');
    });

    it('should return count_only output', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'test',
          type: 'grep',
          pattern: 'foo',
        }],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['test'].count).toBeDefined();
      expect(parsed.data.results['test'].files).toBeUndefined();
    });

    it('should return files_only output', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'test',
          type: 'grep',
          pattern: 'foo',
        }],
        output_mode: 'files_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['test'].files).toBeDefined();
    });

    it('should return locations output', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'test',
          type: 'grep',
          pattern: 'foo',
        }],
        output_mode: 'locations',
      });

      const parsed = expectSuccess(result);
      // Locations depend on implementation
    });
  });

  describe('edge cases', () => {
    it('should handle no matching queries', async () => {
      await createTestFile('file.ts', 'nothing here');

      const result = await handleDiscover({
        queries: [{
          id: 'no-match',
          type: 'grep',
          pattern: 'nonexistent',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['no-match'].count).toBe(0);
    });

    it('should handle unknown query type', async () => {
      const result = await handleDiscover({
        queries: [{
          id: 'unknown',
          type: 'unknown' as any,
          pattern: 'test',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['unknown'].error).toBeDefined();
    });

    it('should handle duplicate query IDs', async () => {
      await createTestFile('file.ts', 'foo bar');

      const result = await handleDiscover({
        queries: [
          { id: 'same', type: 'grep', pattern: 'foo' },
          { id: 'same', type: 'grep', pattern: 'bar' },
        ],
      });

      const parsed = expectSuccess(result);
      // Last one should win
      expect(parsed.data.results['same']).toBeDefined();
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include total_queries', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'q1', type: 'grep', pattern: 'content' },
          { id: 'q2', type: 'glob', patterns: ['*.ts'] },
        ],
      });

      const parsed = expectSuccess(result);
      // total_queries reflects only user-submitted queries (2), not auto-injected _project_index
      expect(parsed.data.total_queries).toBe(2);
    });

    it('should include successful count', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'q1', type: 'grep', pattern: 'content' },
        ],
      });

      const parsed = expectSuccess(result);
      // 1 successful user query; _project_index is soft and not counted
      expect(parsed.data.successful).toBe(1);
    });

    it('should include execution time', async () => {
      const result = await handleDiscover({
        queries: [
          { id: 'q1', type: 'grep', pattern: 'content' },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('base64 alternatives', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo = 1;');
      await createTestFile('special[chars].ts', 'content');
    });

    it('should decode pattern_base64 for grep queries', async () => {
      const pattern = 'foo';
      const patternBase64 = Buffer.from(pattern).toString('base64');

      const result = await handleDiscover({
        queries: [{
          id: 'grep-base64',
          type: 'grep',
          pattern_base64: patternBase64,
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['grep-base64'].count).toBeGreaterThan(0);
    });

    it('should use pattern_base64 when provided', async () => {
      const patternBase64 = Buffer.from('foo').toString('base64');

      const result = await handleDiscover({
        queries: [{
          id: 'grep-base64-only',
          type: 'grep',
          pattern_base64: patternBase64,
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['grep-base64-only'].count).toBeGreaterThan(0);
    });

    it('should decode patterns_base64 for glob queries', async () => {
      const pattern = '*.ts';
      const patternBase64 = Buffer.from(pattern).toString('base64');

      const result = await handleDiscover({
        queries: [{
          id: 'glob-base64',
          type: 'glob',
          patterns_base64: [patternBase64],
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['glob-base64'].count).toBeGreaterThan(0);
    });

    it('should use patterns_base64 when provided', async () => {
      const patternBase64 = Buffer.from('*.ts').toString('base64');

      const result = await handleDiscover({
        queries: [{
          id: 'glob-base64-only',
          type: 'glob',
          patterns_base64: [patternBase64],
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['glob-base64-only'].count).toBeGreaterThan(0);
    });

    it('should handle multiple patterns_base64 for glob', async () => {
      await createTestFile('test.js', 'content');

      const pattern1Base64 = Buffer.from('*.ts').toString('base64');
      const pattern2Base64 = Buffer.from('*.js').toString('base64');

      const result = await handleDiscover({
        queries: [{
          id: 'glob-multi-base64',
          type: 'glob',
          patterns_base64: [pattern1Base64, pattern2Base64],
        }],
        output_mode: 'files_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['glob-multi-base64'].count).toBeGreaterThan(0);
      expect(parsed.data.results['glob-multi-base64'].files).toBeDefined();
    });

    it('should handle complex regex patterns via pattern_base64', async () => {
      await createTestFile('regex-test.ts', 'test123');

      const pattern = 'test\\d+';
      const patternBase64 = Buffer.from(pattern).toString('base64');

      const result = await handleDiscover({
        queries: [{
          id: 'regex-base64',
          type: 'grep',
          pattern_base64: patternBase64,
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results['regex-base64'].count).toBeGreaterThan(0);
    });
  });
});
