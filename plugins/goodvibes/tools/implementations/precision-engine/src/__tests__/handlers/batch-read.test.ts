/**
 * Tests for batch_read handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleBatchRead } from '../../handlers/batch-read.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, parseResult } from '../test-utils.js';

describe('batch_read handler', () => {
  describe('input validation', () => {
    it('should return error when files array is missing', async () => {
      const result = await handleBatchRead({});
      const parsed = expectError(result);
      expect(parsed.error).toContain('files array is required');
    });

    it('should return error when files array is empty', async () => {
      const result = await handleBatchRead({ files: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain('files array is required');
    });

    it('should return error when files is not an array', async () => {
      const result = await handleBatchRead({ files: 'not-an-array' });
      const parsed = expectError(result);
      expect(parsed.error).toContain('files array is required');
    });
  });

  describe('basic functionality', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.txt': 'Line 1\nLine 2\nLine 3',
        'file2.txt': 'Hello World\nFoo Bar\nBaz Qux',
        'subdir/file3.txt': 'Nested file content\nWith multiple lines',
      });
    });

    it('should read a single file with string path', async () => {
      const result = await handleBatchRead({
        files: ['file1.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].path).toBe('file1.txt');
      expect(parsed.data[0].exists).toBe(true);
      expect(parsed.data[0].content).toContain('Line 1');
    });

    it('should read multiple files', async () => {
      const result = await handleBatchRead({
        files: ['file1.txt', 'file2.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].exists).toBe(true);
      expect(parsed.data[1].exists).toBe(true);
    });

    it('should read files in subdirectories', async () => {
      const result = await handleBatchRead({
        files: ['subdir/file3.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].exists).toBe(true);
      expect(parsed.data[0].content).toContain('Nested file content');
    });

    it('should handle file spec objects with offset and limit', async () => {
      const result = await handleBatchRead({
        files: [{ path: 'file1.txt', offset: 1, limit: 1 }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].content).toBe('Line 2');
      expect(parsed.data[0].line_count).toBe(1);
    });

    it('should handle mixed string paths and file spec objects', async () => {
      const result = await handleBatchRead({
        files: [
          'file1.txt',
          { path: 'file2.txt', offset: 0, limit: 2 },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].line_count).toBe(3);
      expect(parsed.data[1].line_count).toBe(2);
    });
  });

  describe('non-existent files', () => {
    it('should report non-existent files gracefully', async () => {
      const result = await handleBatchRead({
        files: ['nonexistent.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].exists).toBe(false);
      expect(parsed.data[0].error).toBeDefined();
    });

    it('should handle mix of existing and non-existing files', async () => {
      await createTestFile('exists.txt', 'content');

      const result = await handleBatchRead({
        files: ['exists.txt', 'not-exists.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].exists).toBe(true);
      expect(parsed.data[1].exists).toBe(false);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.txt': 'Line 1\nLine 2\nLine 3',
        'file2.txt': 'Hello World',
      });
    });

    it('should return count_only output', async () => {
      const result = await handleBatchRead({
        files: ['file1.txt', 'file2.txt'],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toEqual({
        files_read: 2,
        total_lines: 4,
      });
      expect(parsed.meta.output_mode).toBe('count_only');
    });

    it('should return minimal output', async () => {
      const result = await handleBatchRead({
        files: ['file1.txt'],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data[0]).toHaveProperty('path');
      expect(parsed.data[0]).toHaveProperty('exists');
      expect(parsed.data[0]).toHaveProperty('line_count');
      expect(parsed.data[0]).not.toHaveProperty('content');
    });

    it('should return standard output (default)', async () => {
      const result = await handleBatchRead({
        files: ['file1.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0]).toHaveProperty('path');
      expect(parsed.data[0]).toHaveProperty('exists');
      expect(parsed.data[0]).toHaveProperty('content');
      expect(parsed.data[0]).toHaveProperty('line_count');
      expect(parsed.meta.output_mode).toBe('standard');
    });

    it('should return verbose output', async () => {
      const result = await handleBatchRead({
        files: ['file1.txt'],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0]).toHaveProperty('path');
      expect(parsed.data[0]).toHaveProperty('exists');
      expect(parsed.data[0]).toHaveProperty('content');
      expect(parsed.data[0]).toHaveProperty('lines');
      expect(parsed.data[0]).toHaveProperty('size');
      expect(parsed.data[0]).toHaveProperty('modified');
      expect(parsed.meta.output_mode).toBe('verbose');
    });
  });

  describe('edge cases', () => {
    it('should handle empty file', async () => {
      await createTestFile('empty.txt', '');

      const result = await handleBatchRead({
        files: ['empty.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].exists).toBe(true);
      expect(parsed.data[0].line_count).toBe(1); // Empty file has one empty line
    });

    it('should handle file with only newlines', async () => {
      await createTestFile('newlines.txt', '\n\n\n');

      const result = await handleBatchRead({
        files: ['newlines.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].exists).toBe(true);
      expect(parsed.data[0].line_count).toBe(4);
    });

    it('should handle offset beyond file length', async () => {
      await createTestFile('short.txt', 'One line');

      const result = await handleBatchRead({
        files: [{ path: 'short.txt', offset: 100 }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].content).toBe('');
      expect(parsed.data[0].line_count).toBe(0);
    });

    it('should handle limit of 0 lines', async () => {
      await createTestFile('file.txt', 'Line 1\nLine 2');

      const result = await handleBatchRead({
        files: [{ path: 'file.txt', offset: 0, limit: 0 }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].content).toBe('');
      expect(parsed.data[0].line_count).toBe(0);
    });

    it('should mark truncated when file is partially read', async () => {
      await createTestFile('long.txt', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

      const result = await handleBatchRead({
        files: [{ path: 'long.txt', offset: 0, limit: 2 }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].truncated).toBe(true);
    });

    it('should handle special characters in file paths', async () => {
      await createTestFile('file with spaces.txt', 'content');

      const result = await handleBatchRead({
        files: ['file with spaces.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].exists).toBe(true);
    });
  });

  describe('metadata', () => {
    it('should include execution time in meta', async () => {
      await createTestFile('file.txt', 'content');

      const result = await handleBatchRead({
        files: ['file.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include token estimate in meta', async () => {
      await createTestFile('file.txt', 'content');

      const result = await handleBatchRead({
        files: ['file.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.token_estimate).toBeGreaterThan(0);
    });
  });
});
