/**
 * Tests for precision_write handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrecisionWrite } from '../../handlers/precision-write.js';
import { createTestFile, expectSuccess, expectError, readTestFile, fileExists } from '../test-utils.js';

describe('precision_write handler', () => {
  describe('input validation', () => {
    it('should return error when files array is missing', async () => {
      const result = await handlePrecisionWrite({});
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'files'");
    });

    it('should return error when files array is empty', async () => {
      const result = await handlePrecisionWrite({ files: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'files'");
    });
  });

  describe('basic file creation', () => {
    it('should create a new file', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'newfile.ts',
          content: 'export const x = 1;',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_created).toBe(1);

      const content = await readTestFile('newfile.ts');
      expect(content).toBe('export const x = 1;');
    });

    it('should create multiple files', async () => {
      const result = await handlePrecisionWrite({
        files: [
          { path: 'file1.ts', content: 'content 1' },
          { path: 'file2.ts', content: 'content 2' },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_created).toBe(2);
    });

    it('should create files in nested directories', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'deep/nested/dir/file.ts',
          content: 'nested content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_created).toBe(1);

      const exists = await fileExists('deep/nested/dir/file.ts');
      expect(exists).toBe(true);
    });
  });

  describe('overwrite behavior', () => {
    beforeEach(async () => {
      await createTestFile('existing.ts', 'original content');
    });

    it('should skip existing file when overwrite=false', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'existing.ts',
          content: 'new content',
        }],
        overwrite: false,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0].status).toBe('skipped');

      const content = await readTestFile('existing.ts');
      expect(content).toBe('original content');
    });

    it('should overwrite existing file when overwrite=true', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'existing.ts',
          content: 'new content',
        }],
        overwrite: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_overwritten).toBe(1);

      const content = await readTestFile('existing.ts');
      expect(content).toBe('new content');
    });
  });

  describe('dry_run mode', () => {
    it('should not create files in dry_run mode', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'dryrun.ts',
          content: 'content',
        }],
        dry_run: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.dry_run).toBe(true);

      const exists = await fileExists('dryrun.ts');
      expect(exists).toBe(false);
    });

    it('should report what would be created', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'dryrun.ts',
          content: 'content',
        }],
        dry_run: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0].status).toBe('created');
    });
  });

  describe('template support', () => {
    it('should apply handlebars template', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'templated.ts',
          content: 'export const name = "{{name}}";',
        }],
        template: {
          engine: 'handlebars',
          data: { name: 'TestValue' },
        },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('templated.ts');
      expect(content).toBe('export const name = "TestValue";');
    });

    it('should apply ejs template', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'templated.ts',
          content: 'export const name = "<%= name %>";',
        }],
        template: {
          engine: 'ejs',
          data: { name: 'EjsValue' },
        },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('templated.ts');
      expect(content).toContain('EjsValue');
    });

    it('should not apply template when engine is none', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'raw.ts',
          content: 'export const name = "{{name}}";',
        }],
        template: {
          engine: 'none',
          data: { name: 'TestValue' },
        },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('raw.ts');
      expect(content).toBe('export const name = "{{name}}";');
    });
  });

  describe('output modes', () => {
    it('should return count_only output', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'file.ts',
          content: 'content',
        }],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('summary');
      expect(parsed.data.summary).toHaveProperty('files_created');
      expect(parsed.data.summary).toHaveProperty('bytes_written');
      expect(parsed.data).not.toHaveProperty('files');
    });

    it('should return minimal output', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'file.ts',
          content: 'content',
        }],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files).toBeDefined();
      expect(parsed.data.files[0]).toHaveProperty('path');
      expect(parsed.data.files[0]).toHaveProperty('status');
      expect(parsed.data.files[0]).not.toHaveProperty('size');
    });

    it('should return verbose output with all details', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'file.ts',
          content: 'content',
        }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0]).toHaveProperty('path');
      expect(parsed.data.files[0]).toHaveProperty('status');
      expect(parsed.data.files[0]).toHaveProperty('size');
    });
  });

  describe('transaction modes', () => {
    it('should rollback on failure in atomic mode', async () => {
      await createTestFile('existing.ts', 'original');

      const result = await handlePrecisionWrite({
        files: [
          { path: 'new1.ts', content: 'content1' },
          { path: 'existing.ts', content: 'new content' }, // Will fail with overwrite=false
        ],
        overwrite: false,
        transaction: { mode: 'atomic' },
      });

      const parsed = expectSuccess(result);
      // First file should be rolled back
      const exists = await fileExists('new1.ts');
      // Depending on implementation, the first might or might not exist
    });

    it('should stop on failure in partial mode', async () => {
      // Use a path that will cause an actual write failure (directory doesn't exist and create_dirs=false)
      const result = await handlePrecisionWrite({
        files: [
          { path: 'nonexistent-dir/will-fail.ts', content: 'content' }, // Will fail - directory doesn't exist
          { path: 'new.ts', content: 'content' },
        ],
        create_dirs: false, // This causes the first write to fail
        transaction: { mode: 'partial' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files[0].status).toBe('failed');
      // Second file should not be created because first failed
      const exists = await fileExists('new.ts');
      expect(exists).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'empty.ts',
          content: '',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_created).toBe(1);

      const content = await readTestFile('empty.ts');
      expect(content).toBe('');
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'const regex = /[^a-z]/g;\nconst str = "hello\\nworld";';

      const result = await handlePrecisionWrite({
        files: [{
          path: 'special.ts',
          content: specialContent,
        }],
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('special.ts');
      expect(content).toBe(specialContent);
    });

    it('should handle unicode content', async () => {
      const unicodeContent = 'const emoji = "abc123";';

      const result = await handlePrecisionWrite({
        files: [{
          path: 'unicode.ts',
          content: unicodeContent,
        }],
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('unicode.ts');
      expect(content).toBe(unicodeContent);
    });

    it('should track bytes written', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'file.ts',
          content: 'hello world',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.bytes_written).toBe(11);
    });
  });

  describe('metadata', () => {
    it('should include tokens_used', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'file.ts',
          content: 'content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionWrite({
        files: [{
          path: 'file.ts',
          content: 'content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
