/**
 * Tests for smart_glob handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleSmartGlob } from '../../handlers/smart-glob.js';
import { createTestFile, createTestFiles, expectSuccess, expectError } from '../test-utils.js';

describe('smart_glob handler', () => {
  describe('input validation', () => {
    it('should return error when patterns array is missing', async () => {
      const result = await handleSmartGlob({});
      const parsed = expectError(result);
      expect(parsed.error).toContain('patterns array is required');
    });

    it('should return error when patterns array is empty', async () => {
      const result = await handleSmartGlob({ patterns: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain('patterns array is required');
    });

    it('should return error when patterns is not an array', async () => {
      const result = await handleSmartGlob({ patterns: '*.ts' });
      const parsed = expectError(result);
      expect(parsed.error).toContain('patterns array is required');
    });
  });

  describe('basic functionality', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const x = 1;',
        'file2.ts': 'const y = 2;',
        'file3.js': 'const z = 3;',
        'README.md': '# Test',
        'src/index.ts': 'export {};',
        'src/utils/helper.ts': 'export function help() {}',
      });
    });

    it('should find files matching single pattern', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data.length).toBeGreaterThanOrEqual(2);
      expect(parsed.data.every((f: { path: string }) => f.path.endsWith('.ts'))).toBe(true);
    });

    it('should find files matching multiple patterns', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts', '*.js'],
      });

      const parsed = expectSuccess(result);
      const extensions = parsed.data.map((f: { path: string }) =>
        f.path.substring(f.path.lastIndexOf('.'))
      );
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.js');
    });

    it('should find files in subdirectories with **', async () => {
      const result = await handleSmartGlob({
        patterns: ['**/*.ts'],
      });

      const parsed = expectSuccess(result);
      const paths = parsed.data.map((f: { path: string }) => f.path);
      expect(paths.some((p: string) => p.includes('src'))).toBe(true);
    });
  });

  describe('exclusions', () => {
    beforeEach(async () => {
      await createTestFiles({
        'src/index.ts': 'export {};',
        'src/test.ts': 'test',
        'src/utils.ts': 'utils',
      });
    });

    it('should respect exclude patterns', async () => {
      const result = await handleSmartGlob({
        patterns: ['**/*.ts'],
        exclude: ['**/test.ts'],
      });

      const parsed = expectSuccess(result);
      const paths = parsed.data.map((f: { path: string }) => f.path);
      expect(paths.some((p: string) => p.includes('test.ts'))).toBe(false);
    });

    it('should apply default exclusions (node_modules)', async () => {
      await createTestFiles({
        'node_modules/pkg/index.ts': 'export {};',
      });

      const result = await handleSmartGlob({
        patterns: ['**/*.ts'],
      });

      const parsed = expectSuccess(result);
      const paths = parsed.data.map((f: { path: string }) => f.path);
      expect(paths.some((p: string) => p.includes('node_modules'))).toBe(false);
    });
  });

  describe('limit', () => {
    beforeEach(async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        files[`file${i}.ts`] = `const x${i} = ${i};`;
      }
      await createTestFiles(files);
    });

    it('should respect limit parameter', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        limit: 5,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 100', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeLessThanOrEqual(100);
    });
  });

  describe('preview', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    });

    it('should include preview when enabled', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        preview: { enabled: true, lines: 3 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].preview).toBeDefined();
      expect(parsed.data[0].preview).toHaveLength(3);
      expect(parsed.data[0].preview[0]).toBe('Line 1');
    });

    it('should not include preview when disabled', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        preview: { enabled: false },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].preview).toBeUndefined();
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const x = 1;',
        'file2.ts': 'const y = 2;',
      });
    });

    it('should return count_only output', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('total_files');
      expect(parsed.data).toHaveProperty('total_size');
      expect(parsed.data.total_files).toBe(2);
      expect(parsed.meta.output_mode).toBe('count_only');
    });

    it('should return minimal output (paths only)', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(typeof parsed.data[0]).toBe('string');
      expect(parsed.meta.output_mode).toBe('minimal');
    });

    it('should return standard output with stats', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        output_mode: 'standard',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data[0]).toHaveProperty('path');
      expect(parsed.data[0]).toHaveProperty('size');
      expect(parsed.data[0]).toHaveProperty('modified');
    });
  });

  describe('edge cases', () => {
    it('should handle no matching files', async () => {
      const result = await handleSmartGlob({
        patterns: ['*.nonexistent'],
      });

      const parsed = expectSuccess(result);
      if (parsed.meta.output_mode === 'count_only') {
        expect(parsed.data.total_files).toBe(0);
      } else {
        expect(parsed.data).toHaveLength(0);
      }
    });

    it('should handle patterns with special characters', async () => {
      await createTestFile('test[1].ts', 'content');

      const result = await handleSmartGlob({
        patterns: ['*.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.some((f: { path: string } | string) => {
        const path = typeof f === 'string' ? f : f.path;
        return path.includes('test[1]');
      })).toBe(true);
    });

    it('should sort by modification time (newest first)', async () => {
      // Create files with slight delay to ensure different mtimes
      await createTestFile('old.ts', 'old');
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestFile('new.ts', 'new');

      const result = await handleSmartGlob({
        patterns: ['*.ts'],
      });

      const parsed = expectSuccess(result);
      // First file should be the newer one
      const firstPath = typeof parsed.data[0] === 'string' ? parsed.data[0] : parsed.data[0].path;
      expect(firstPath).toContain('new.ts');
    });
  });

  describe('metadata', () => {
    it('should include execution time in meta', async () => {
      await createTestFile('file.ts', 'content');

      const result = await handleSmartGlob({
        patterns: ['*.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include token estimate in meta', async () => {
      await createTestFile('file.ts', 'content');

      const result = await handleSmartGlob({
        patterns: ['*.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.token_estimate).toBeGreaterThan(0);
    });
  });
});
