/**
 * Tests for atomic_multi_edit handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAtomicMultiEdit } from '../../handlers/atomic-multi-edit.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, readTestFile, fileExists } from '../test-utils.js';

describe('atomic_multi_edit handler', () => {
  describe('input validation', () => {
    it('should return error when edits array is missing', async () => {
      const result = await handleAtomicMultiEdit({});
      const parsed = expectError(result);
      expect(parsed.error).toContain('edits array is required');
    });

    it('should return error when edits array is empty', async () => {
      const result = await handleAtomicMultiEdit({ edits: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain('edits array is required');
    });
  });

  describe('replace operation', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo = 1;\nconst bar = 2;\nconst baz = 3;');
    });

    it('should replace content in file', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'const foo = 1;',
          new_content: 'const foo = 42;',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_applied).toBe(1);

      const content = await readTestFile('file.ts');
      expect(content).toContain('const foo = 42;');
      expect(content).not.toContain('const foo = 1;');
    });

    it('should return not_found when content does not exist', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'nonexistent content',
          new_content: 'new content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_failed).toBe(1);
      expect(parsed.data.results[0].status).toBe('not_found');
    });

    it('should return ambiguous when multiple occurrences exist', async () => {
      await createTestFile('ambiguous.ts', 'foo\nfoo\nfoo');

      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'ambiguous.ts',
          operation: 'replace',
          old_content: 'foo',
          new_content: 'bar',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].status).toBe('ambiguous');
    });
  });

  describe('insert operation', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'line 1\nline 2\nline 3');
    });

    it('should insert content at specified position', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'insert',
          new_content: 'INSERTED',
          position: { line: 2, character: 0 },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_applied).toBe(1);

      const content = await readTestFile('file.ts');
      expect(content).toContain('INSERTED');
    });

    it('should return error without position', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'insert',
          new_content: 'content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].status).toBe('failed');
    });
  });

  describe('delete operation', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'keep this\ndelete me\nkeep this too');
    });

    it('should delete specified content', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'delete',
          old_content: 'delete me\n',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_applied).toBe(1);

      const content = await readTestFile('file.ts');
      expect(content).not.toContain('delete me');
    });
  });

  describe('create operation', () => {
    it('should create new file', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'newfile.ts',
          operation: 'create',
          new_content: 'export const value = 1;',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_applied).toBe(1);

      const exists = await fileExists('newfile.ts');
      expect(exists).toBe(true);

      const content = await readTestFile('newfile.ts');
      expect(content).toBe('export const value = 1;');
    });

    it('should return conflict when file already exists', async () => {
      await createTestFile('existing.ts', 'existing content');

      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'existing.ts',
          operation: 'create',
          new_content: 'new content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].status).toBe('conflict');
    });

    it('should create file in nested directory', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'deep/nested/dir/file.ts',
          operation: 'create',
          new_content: 'content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_applied).toBe(1);

      const exists = await fileExists('deep/nested/dir/file.ts');
      expect(exists).toBe(true);
    });
  });

  describe('multiple edits', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const a = 1;',
        'file2.ts': 'const b = 2;',
      });
    });

    it('should apply multiple edits to different files', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [
          { file: 'file1.ts', operation: 'replace', old_content: 'const a = 1;', new_content: 'const a = 10;' },
          { file: 'file2.ts', operation: 'replace', old_content: 'const b = 2;', new_content: 'const b = 20;' },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files_modified).toBe(2);
      expect(parsed.data.edits_applied).toBe(2);

      const content1 = await readTestFile('file1.ts');
      const content2 = await readTestFile('file2.ts');
      expect(content1).toContain('const a = 10;');
      expect(content2).toContain('const b = 20;');
    });

    it('should apply multiple edits to same file', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [
          { file: 'file1.ts', operation: 'replace', old_content: 'const', new_content: 'let' },
          { file: 'file1.ts', operation: 'replace', old_content: '1', new_content: '100' },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits_applied).toBe(2);

      const content = await readTestFile('file1.ts');
      expect(content).toBe('let a = 100;');
    });
  });

  describe('dry_run mode', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'original content');
    });

    it('should not modify files in dry_run mode', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'original',
          new_content: 'modified',
        }],
        dry_run: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.dry_run).toBe(true);

      const content = await readTestFile('file.ts');
      expect(content).toBe('original content');
    });

    it('should report what would be modified', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'original',
          new_content: 'modified',
        }],
        dry_run: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].status).toBe('applied');
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const x = 1;');
    });

    it('should return count_only output', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'const x = 1;',
          new_content: 'const x = 2;',
        }],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('files_modified');
      expect(parsed.data).toHaveProperty('edits_applied');
      expect(parsed.data).toHaveProperty('edits_failed');
      expect(parsed.data).not.toHaveProperty('results');
    });

    it('should return minimal output', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'const x = 1;',
          new_content: 'const x = 2;',
        }],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results).toBeDefined();
      expect(parsed.data.results[0]).toHaveProperty('file');
      expect(parsed.data.results[0]).toHaveProperty('status');
    });

    it('should return standard output with full results', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'const x = 1;',
          new_content: 'const x = 2;',
        }],
        output_mode: 'standard',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results).toBeDefined();
      expect(parsed.data.results[0]).toHaveProperty('operation');
      expect(parsed.data.results[0]).toHaveProperty('line');
    });
  });

  describe('error handling', () => {
    it('should handle non-existent file for replace', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'nonexistent.ts',
          operation: 'replace',
          old_content: 'content',
          new_content: 'new content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].status).toBe('not_found');
    });

    it('should handle non-existent file for delete', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'nonexistent.ts',
          operation: 'delete',
          old_content: 'content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].status).toBe('not_found');
    });

    it('should report line number in results', async () => {
      await createTestFile('file.ts', 'line 1\nline 2\nTARGET LINE\nline 4');

      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'TARGET LINE',
          new_content: 'REPLACED LINE',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.results[0].line).toBe(3);
    });
  });

  describe('metadata', () => {
    it('should include execution time', async () => {
      await createTestFile('file.ts', 'content');

      const result = await handleAtomicMultiEdit({
        edits: [{
          file: 'file.ts',
          operation: 'replace',
          old_content: 'content',
          new_content: 'new content',
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
