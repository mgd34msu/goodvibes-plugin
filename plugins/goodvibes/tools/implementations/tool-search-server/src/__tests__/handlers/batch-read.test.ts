/**
 * Unit tests for batch-read handler
 *
 * Tests cover:
 * - Basic file reading with string paths
 * - FileReadRequest objects with offset/limit
 * - Mixed arrays (strings and objects)
 * - Range metadata accuracy
 * - Output mode behavior (minimal, standard, verbose)
 * - Edge cases (non-existent files, out-of-range offsets, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { handleBatchRead } from '../../handlers/batch/batch-read.js';

// Mock modules
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));
vi.mock('../../utils.js', () => ({
  fileExists: vi.fn(),
}));

import { fileExists } from '../../utils.js';

/**
 * Helper to generate a file with N lines
 */
function generateFileContent(lineCount: number, prefix = 'Line'): string {
  return Array.from({ length: lineCount }, (_, i) => `${prefix} ${i + 1}`).join('\n');
}

/**
 * Helper to parse result from handler response
 */
function parseResult(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('batch-read handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic functionality', () => {
    it('should return error when no files provided', async () => {
      const result = await handleBatchRead({ files: [] });
      const parsed = parseResult(result);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe('No files provided');
    });

    it('should read a single file with string path', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue('Line 1\nLine 2\nLine 3');

      const result = await handleBatchRead({
        files: ['test.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.success_count).toBe(1);
      expect(parsed.error_count).toBe(0);
      expect(parsed.files[0].exists).toBe(true);
      expect(parsed.files[0].total_lines).toBe(3);
      expect(parsed.files[0].content).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle non-existent files', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await handleBatchRead({
        files: ['nonexistent.ts'],
      });
      const parsed = parseResult(result);

      expect(parsed.success_count).toBe(0);
      expect(parsed.error_count).toBe(1);
      expect(parsed.files[0].exists).toBe(false);
      expect(parsed.files[0].error).toBe('File not found');
    });

    it('should read multiple files in parallel', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 50 } as fs.Stats);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('Content A')
        .mockResolvedValueOnce('Content B');

      const result = await handleBatchRead({
        files: ['file-a.ts', 'file-b.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.success_count).toBe(2);
      expect(parsed.files).toHaveLength(2);
      expect(parsed.files[0].content).toBe('Content A');
      expect(parsed.files[1].content).toBe('Content B');
    });
  });

  describe('FileReadRequest with offset/limit', () => {
    it('should read from specific offset to end', async () => {
      const content = generateFileContent(100);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', offset: 50 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].range.start).toBe(50);
      expect(parsed.files[0].range.end).toBe(100);
      expect(parsed.files[0].range.lines_returned).toBe(51);
      expect(parsed.files[0].range.has_more_before).toBe(true);
      expect(parsed.files[0].range.has_more_after).toBe(false);
    });

    it('should read specific number of lines from start', async () => {
      const content = generateFileContent(100);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', limit: 20 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].range.start).toBe(1);
      expect(parsed.files[0].range.end).toBe(20);
      expect(parsed.files[0].range.lines_returned).toBe(20);
      expect(parsed.files[0].range.has_more_before).toBe(false);
      expect(parsed.files[0].range.has_more_after).toBe(true);
    });

    it('should read exact range with both offset and limit', async () => {
      const content = generateFileContent(100);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', offset: 30, limit: 20 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].range.start).toBe(30);
      expect(parsed.files[0].range.end).toBe(49);
      expect(parsed.files[0].range.lines_returned).toBe(20);
      expect(parsed.files[0].range.has_more_before).toBe(true);
      expect(parsed.files[0].range.has_more_after).toBe(true);
      expect(parsed.files[0].content).toContain('Line 30');
      expect(parsed.files[0].content).toContain('Line 49');
      expect(parsed.files[0].content).not.toContain('Line 29');
      expect(parsed.files[0].content).not.toContain('Line 50');
    });

    it('should handle offset beyond file length', async () => {
      const content = generateFileContent(10);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', offset: 100 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].range.lines_returned).toBe(0);
      expect(parsed.files[0].range.start).toBe(100);
      expect(parsed.files[0].content).toBe('');
    });

    it('should clamp limit to available lines', async () => {
      const content = generateFileContent(10);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', offset: 8, limit: 100 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].range.start).toBe(8);
      expect(parsed.files[0].range.end).toBe(10);
      expect(parsed.files[0].range.lines_returned).toBe(3);
      expect(parsed.files[0].range.has_more_after).toBe(false);
    });
  });

  describe('mixed array support', () => {
    it('should handle mix of string paths and FileReadRequest objects', async () => {
      const content = generateFileContent(100);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [
          'file1.ts',                                    // String path
          { path: 'file2.ts', offset: 10, limit: 20 },   // With range
          { path: 'file3.ts' },                          // Object without range
          'file4.ts',                                    // Another string
        ],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files).toHaveLength(4);
      // First file - no explicit range
      expect(parsed.files[0].range.start).toBe(1);
      expect(parsed.files[0].range.end).toBe(100);
      // Second file - explicit range
      expect(parsed.files[1].range.start).toBe(10);
      expect(parsed.files[1].range.lines_returned).toBe(20);
      // Third file - object without range
      expect(parsed.files[2].range.start).toBe(1);
      expect(parsed.files[2].range.end).toBe(100);
      // Fourth file - string path
      expect(parsed.files[3].range.start).toBe(1);
    });
  });

  describe('output mode behavior', () => {
    const content = generateFileContent(100);

    beforeEach(() => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);
    });

    describe('minimal mode', () => {
      it('should return metadata without content', async () => {
        const result = await handleBatchRead({
          files: ['test.ts'],
          output_mode: 'minimal',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].total_lines).toBe(100);
        expect(parsed.files[0].size).toBeDefined();
        expect(parsed.files[0].content).toBeUndefined();
      });

      it('should include range metadata when explicit range specified', async () => {
        const result = await handleBatchRead({
          files: [{ path: 'test.ts', offset: 20, limit: 30 }],
          output_mode: 'minimal',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].content).toBeUndefined();
        expect(parsed.files[0].range).toBeDefined();
        expect(parsed.files[0].range.start).toBe(20);
        expect(parsed.files[0].range.lines_returned).toBe(0); // No content in minimal
      });
    });

    describe('standard mode', () => {
      it('should return first 50 lines by default', async () => {
        const result = await handleBatchRead({
          files: ['test.ts'],
          output_mode: 'standard',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].range.lines_returned).toBe(50);
        expect(parsed.files[0].range.has_more_after).toBe(true);
        expect(parsed.files[0].content).toContain('Line 1');
        expect(parsed.files[0].content).toContain('Line 50');
        expect(parsed.files[0].content).not.toContain('Line 51');
      });

      it('should respect explicit range over default', async () => {
        const result = await handleBatchRead({
          files: [{ path: 'test.ts', offset: 60, limit: 10 }],
          output_mode: 'standard',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].range.start).toBe(60);
        expect(parsed.files[0].range.lines_returned).toBe(10);
        expect(parsed.files[0].content).toContain('Line 60');
        expect(parsed.files[0].content).toContain('Line 69');
      });

      it('should be the default output mode', async () => {
        const result = await handleBatchRead({
          files: ['test.ts'],
        });
        const parsed = parseResult(result);

        // Standard mode defaults to 50 lines
        expect(parsed.files[0].range.lines_returned).toBe(50);
      });
    });

    describe('verbose mode', () => {
      it('should return full file content without explicit range', async () => {
        const result = await handleBatchRead({
          files: ['test.ts'],
          output_mode: 'verbose',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].range.start).toBe(1);
        expect(parsed.files[0].range.end).toBe(100);
        expect(parsed.files[0].range.lines_returned).toBe(100);
        expect(parsed.files[0].range.has_more_before).toBe(false);
        expect(parsed.files[0].range.has_more_after).toBe(false);
      });

      it('should respect explicit range when specified', async () => {
        const result = await handleBatchRead({
          files: [{ path: 'test.ts', offset: 25, limit: 25 }],
          output_mode: 'verbose',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].range.start).toBe(25);
        expect(parsed.files[0].range.lines_returned).toBe(25);
      });
    });
  });

  describe('range metadata accuracy', () => {
    it('should correctly report has_more_before and has_more_after', async () => {
      const content = generateFileContent(50);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      // Test cases for different range positions
      const testCases = [
        { offset: 1, limit: 10, expectBefore: false, expectAfter: true },
        { offset: 20, limit: 10, expectBefore: true, expectAfter: true },
        { offset: 45, limit: 10, expectBefore: true, expectAfter: false },
        { offset: 1, limit: 50, expectBefore: false, expectAfter: false },
      ];

      for (const tc of testCases) {
        const result = await handleBatchRead({
          files: [{ path: 'test.ts', offset: tc.offset, limit: tc.limit }],
          output_mode: 'verbose',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].range.has_more_before).toBe(tc.expectBefore);
        expect(parsed.files[0].range.has_more_after).toBe(tc.expectAfter);
      }
    });

    it('should always return total_lines for existing files', async () => {
      const content = generateFileContent(75);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      for (const mode of ['minimal', 'standard', 'verbose'] as const) {
        const result = await handleBatchRead({
          files: ['test.ts'],
          output_mode: mode,
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].total_lines).toBe(75);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty file', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 0 } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue('');

      const result = await handleBatchRead({
        files: ['empty.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].total_lines).toBe(1); // Empty string splits to ['']
      expect(parsed.files[0].content).toBe('');
    });

    it('should handle offset of 0 (treat as 1)', async () => {
      const content = generateFileContent(10);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', offset: 0, limit: 5 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      // offset 0 should be treated as 1 (Math.max(1, offset))
      expect(parsed.files[0].range.start).toBe(1);
    });

    it('should handle negative offset (treat as 1)', async () => {
      const content = generateFileContent(10);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await handleBatchRead({
        files: [{ path: 'test.ts', offset: -5, limit: 5 }],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].range.start).toBe(1);
    });

    it('should handle file read errors', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as fs.Stats);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await handleBatchRead({
        files: ['protected.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].exists).toBe(true);
      expect(parsed.files[0].error).toBe('Permission denied');
      expect(parsed.error_count).toBe(1);
    });

    it('should reject files exceeding max size', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 10 * 1024 * 1024 } as fs.Stats); // 10MB

      const result = await handleBatchRead({
        files: ['huge.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].error).toContain('File too large');
      expect(parsed.error_count).toBe(1);
    });

    it('should calculate total_lines across all files', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as fs.Stats);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(generateFileContent(30))
        .mockResolvedValueOnce(generateFileContent(40))
        .mockResolvedValueOnce(generateFileContent(50));

      const result = await handleBatchRead({
        files: ['a.ts', 'b.ts', 'c.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.total_lines).toBe(30 + 40 + 50);
    });
  });

  describe('FileReadRequest object without offset/limit', () => {
    it('should behave same as string path when no offset/limit', async () => {
      const content = generateFileContent(100);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const resultString = await handleBatchRead({
        files: ['test.ts'],
        output_mode: 'standard',
      });
      const parsedString = parseResult(resultString);

      vi.mocked(fs.readFile).mockResolvedValue(content);
      const resultObject = await handleBatchRead({
        files: [{ path: 'test.ts' }],
        output_mode: 'standard',
      });
      const parsedObject = parseResult(resultObject);

      // Both should get standard mode default (50 lines)
      expect(parsedString.files[0].range.lines_returned).toBe(50);
      expect(parsedObject.files[0].range.lines_returned).toBe(50);
    });
  });
});
