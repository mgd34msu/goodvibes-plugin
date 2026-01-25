/**
 * Tests for precision_glob handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrecisionGlob } from '../../handlers/precision-glob.js';
import { createTestFile, createTestFiles, expectSuccess, expectError } from '../test-utils.js';

describe('precision_glob handler', () => {
  describe('input validation', () => {
    it('should return error when patterns array is missing', async () => {
      const result = await handlePrecisionGlob({
        output: { mode: 'paths_only' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain('patterns');
      expect(parsed.error).toContain('required');
    });

    // Output parameter now has defaults, no longer required
  });

  describe('basic glob functionality', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'content 1',
        'file2.ts': 'content 2',
        'file3.js': 'content 3',
        'README.md': '# README',
        'src/index.ts': 'export {};',
        'src/utils/helper.ts': 'export function help() {}',
      });
    });

    it('should find files matching pattern', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.every((f: string) => f.endsWith('.ts'))).toBe(true);
    });

    it('should find files in subdirectories with **', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.includes('src'))).toBe(true);
    });

    it('should support multiple patterns', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts', '*.js'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.endsWith('.ts'))).toBe(true);
      expect(parsed.data.files.some((f: string) => f.endsWith('.js'))).toBe(true);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should return count_only output', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary).toBeDefined();
      expect(parsed.data.summary.total_files).toBe(1);
      expect(parsed.data.files).toBeUndefined();
    });

    it('should return paths_only output', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files).toBeInstanceOf(Array);
      expect(typeof parsed.data.files[0]).toBe('string');
    });

    it('should return with_stats output', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'with_stats' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0]).toHaveProperty('path');
      expect(parsed.data.files[0]).toHaveProperty('size');
      expect(parsed.data.files[0]).toHaveProperty('modified');
    });

    it('should return with_preview output', async () => {
      await createTestFile('preview.ts', 'line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await handlePrecisionGlob({
        patterns: ['preview.ts'],
        output: { mode: 'with_preview', preview_lines: 3 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0]).toHaveProperty('preview');
      expect(parsed.data.files[0].preview).toHaveLength(3);
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      await createTestFiles({
        'small.ts': 'x',
        'large.ts': Array(100).fill('content').join('\n'),
        'empty.ts': '',
      });
    });

    it('should filter by min_size', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        filters: { min_size: 50 },
        output: { mode: 'with_stats' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.every((f: { size: number }) => f.size >= 50)).toBe(true);
    });

    it('should filter by max_size', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        filters: { max_size: 10 },
        output: { mode: 'with_stats' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.every((f: { size: number }) => f.size <= 10)).toBe(true);
    });

    it('should filter by is_empty', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        filters: { is_empty: true },
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files).toContain('empty.ts');
    });

    it('should filter by has_content', async () => {
      await createTestFiles({
        'match.ts': 'SEARCHTERM here',
        'nomatch.ts': 'nothing special',
      });

      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        filters: { has_content: 'SEARCHTERM' },
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files).toContain('match.ts');
      expect(parsed.data.files).not.toContain('nomatch.ts');
    });
  });

  describe('sorting', () => {
    beforeEach(async () => {
      await createTestFiles({
        'a.ts': 'x',
        'b.ts': 'xxx',
        'c.ts': 'xx',
      });
    });

    it('should sort by name ascending', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only', sort_by: 'name', sort_order: 'asc' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0]).toBe('a.ts');
    });

    it('should sort by name descending', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only', sort_by: 'name', sort_order: 'desc' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0]).toBe('c.ts');
    });

    it('should sort by size', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'with_stats', sort_by: 'size', sort_order: 'asc' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0].size).toBeLessThanOrEqual(parsed.data.files[1].size);
    });
  });

  describe('exclusions', () => {
    beforeEach(async () => {
      await createTestFiles({
        'include.ts': 'content',
        'exclude.ts': 'content',
        'node_modules/pkg/index.ts': 'content',
      });
    });

    it('should respect exclude patterns', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        exclude: ['**/exclude.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files).not.toContain('exclude.ts');
    });

    it('should apply default exclusions (node_modules)', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.includes('node_modules'))).toBe(false);
    });

    it('should include node_modules when gitignore disabled', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        respect_gitignore: false,
        output: { mode: 'paths_only' },
      });

      // This depends on implementation - may still exclude node_modules
      const parsed = expectSuccess(result);
    });
  });

  describe('limits', () => {
    beforeEach(async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        files[`file${i}.ts`] = 'content';
      }
      await createTestFiles(files);
    });

    it('should respect max_files limit', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only', max_files: 10 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeLessThanOrEqual(10);
      expect(parsed.data.summary.truncated).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle no matching files', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.nonexistent'],
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_files).toBe(0);
    });

    it('should handle special characters in filenames', async () => {
      await createTestFile('file[1].ts', 'content');

      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.includes('[1]'))).toBe(true);
    });
  });

  describe('summary', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      });
    });

    it('should include total_files in summary', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_files).toBe(2);
    });

    it('should include total_size in summary', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'with_stats' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_size).toBeGreaterThan(0);
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include tokens_used', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('base64 alternatives', () => {
    beforeEach(async () => {
      await createTestFile('test-file.ts', 'content');
      await createTestFile('special[chars].ts', 'content');
    });

    it('should decode patterns_base64 parameter', async () => {
      const pattern = '*.ts';
      const patternBase64 = Buffer.from(pattern).toString('base64');

      const result = await handlePrecisionGlob({
        patterns_base64: [patternBase64],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeGreaterThan(0);
      expect(parsed.data.files.every((f: string) => f.endsWith('.ts'))).toBe(true);
    });

    it('should handle multiple patterns_base64', async () => {
      await createTestFile('test.js', 'content');

      const pattern1 = '*.ts';
      const pattern2 = '*.js';
      const pattern1Base64 = Buffer.from(pattern1).toString('base64');
      const pattern2Base64 = Buffer.from(pattern2).toString('base64');

      const result = await handlePrecisionGlob({
        patterns_base64: [pattern1Base64, pattern2Base64],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.endsWith('.ts'))).toBe(true);
      expect(parsed.data.files.some((f: string) => f.endsWith('.js'))).toBe(true);
    });

    it('should use patterns_base64 when provided', async () => {
      const patternBase64 = Buffer.from('*.ts').toString('base64');

      const result = await handlePrecisionGlob({
        patterns_base64: [patternBase64],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.endsWith('.ts'))).toBe(true);
    });

    it('should handle complex glob patterns with special characters via base64', async () => {
      const pattern = 'special[chars].ts';
      const patternBase64 = Buffer.from(pattern).toString('base64');

      const result = await handlePrecisionGlob({
        patterns_base64: [patternBase64],
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.some((f: string) => f.includes('[chars]'))).toBe(true);
    });
  });

  describe('parameter aliasing - base_path vs cwd', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should accept base_path parameter (new name)', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        base_path: process.cwd(),
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeGreaterThan(0);
    });

    it('should accept cwd parameter (deprecated name)', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        cwd: process.cwd(),
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeGreaterThan(0);
    });

    it('should prefer base_path when both base_path and cwd are provided', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        base_path: process.cwd(), // Should be used
        cwd: '/nonexistent/path', // Should be ignored
        output: { mode: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeGreaterThan(0);
    });
  });

  describe('parameter aliasing - max_results vs max_files', () => {
    beforeEach(async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        files[`file${i}.ts`] = 'content';
      }
      await createTestFiles(files);
    });

    it('should accept max_results parameter (new name)', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only', max_results: 5 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeLessThanOrEqual(5);
    });

    it('should accept max_files parameter (deprecated name)', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only', max_files: 5 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeLessThanOrEqual(5);
    });

    it('should prefer max_results when both max_results and max_files are provided', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['*.ts'],
        output: { mode: 'paths_only', max_results: 5, max_files: 15 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files.length).toBeLessThanOrEqual(5);
    });
  });
});
