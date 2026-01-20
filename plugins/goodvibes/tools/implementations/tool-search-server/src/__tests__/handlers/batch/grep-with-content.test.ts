/**
 * Unit tests for grep-with-content handler
 *
 * Tests cover:
 * - Basic pattern searching
 * - Output mode behavior (count_only, minimal, standard, verbose)
 * - Per-query context control (context_before, context_after)
 * - Asymmetric context (different before/after values)
 * - Line range filtering (line_range.start, line_range.end)
 * - Edge cases and defaults
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { handleGrepWithContent } from '../../../handlers/batch/grep-with-content.js';

// Mock modules
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

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

describe('grep-with-content handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: return a simple file content
    vi.mocked(fs.readFileSync).mockReturnValue(generateFileContent(20));
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.ts', isFile: () => true, isDirectory: () => false },
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500, isFile: () => true } as fs.Stats);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic functionality', () => {
    it('should return error when no pattern provided', async () => {
      const result = await handleGrepWithContent({ pattern: '' });
      const parsed = parseResult(result);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe('No pattern provided');
    });

    it('should return error for invalid regex pattern', async () => {
      const result = await handleGrepWithContent({ pattern: '[invalid' });
      const parsed = parseResult(result);

      expect(result.isError).toBe(true);
      expect(parsed.error).toContain('Invalid regex pattern');
    });

    it('should search for simple pattern', async () => {
      const content = 'Line 1\nmatching line\nLine 3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'matching',
        paths: ['/mock/project/test.ts'],
      });
      const parsed = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(parsed.match_count).toBe(1);
      expect(parsed.matches[0].line).toBe(2);
      expect(parsed.matches[0].content).toBe('matching line');
    });
  });

  describe('output modes', () => {
    it('should return count_only results', async () => {
      const content = 'match1\nmatch2\nno\nmatch3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'count_only',
      });
      const parsed = parseResult(result);

      expect(parsed.match_count).toBe(3);
      expect(parsed.matches).toBeUndefined();
    });

    it('should return minimal results (file:line only)', async () => {
      const content = 'match1\nno\nmatch2';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'minimal',
      });
      const parsed = parseResult(result);

      expect(parsed.match_count).toBe(2);
      expect(parsed.matches).toEqual(['test.ts:1', 'test.ts:3']);
    });

    it('should return standard results with 1 line context by default', async () => {
      const content = 'before\nmatch\nafter\nmore';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'standard',
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 1, after: 1 });
      expect(parsed.matches[0].before).toEqual(['before']);
      expect(parsed.matches[0].after).toEqual(['after']);
    });

    it('should return verbose results with 3 lines context by default', async () => {
      const content = 'l1\nl2\nl3\nmatch\nl5\nl6\nl7\nl8';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 3, after: 3 });
      expect(parsed.matches[0].before).toEqual(['l1', 'l2', 'l3']);
      expect(parsed.matches[0].after).toEqual(['l5', 'l6', 'l7']);
    });
  });

  describe('context_before and context_after parameters', () => {
    it('should use explicit context_before value', async () => {
      const content = 'l1\nl2\nl3\nmatch\nl5\nl6';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 2,
      });
      const parsed = parseResult(result);

      // context_after should default to same as context_before when not specified
      expect(parsed.context).toEqual({ before: 2, after: 2 });
      expect(parsed.matches[0].before).toEqual(['l2', 'l3']);
      expect(parsed.matches[0].after).toEqual(['l5', 'l6']);
    });

    it('should use explicit context_after value', async () => {
      const content = 'l1\nl2\nmatch\nl4\nl5\nl6\nl7';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 1,
        context_after: 4,
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 1, after: 4 });
      expect(parsed.matches[0].before).toEqual(['l2']);
      expect(parsed.matches[0].after).toEqual(['l4', 'l5', 'l6', 'l7']);
    });

    it('should support zero context (no context lines)', async () => {
      const content = 'before\nmatch\nafter';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 0,
        context_after: 0,
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 0, after: 0 });
      expect(parsed.matches[0].before).toBeUndefined();
      expect(parsed.matches[0].after).toBeUndefined();
    });

    it('should support asymmetric context (0 before, 5 after)', async () => {
      const content = 'l1\nmatch\nl3\nl4\nl5\nl6\nl7';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 0,
        context_after: 5,
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 0, after: 5 });
      expect(parsed.matches[0].before).toBeUndefined();
      expect(parsed.matches[0].after).toEqual(['l3', 'l4', 'l5', 'l6', 'l7']);
    });

    it('should support asymmetric context (5 before, 0 after)', async () => {
      const content = 'l1\nl2\nl3\nl4\nl5\nmatch\nafter';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 5,
        context_after: 0,
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 5, after: 0 });
      expect(parsed.matches[0].before).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
      expect(parsed.matches[0].after).toBeUndefined();
    });

    it('should override output_mode defaults with explicit context values', async () => {
      const content = 'l1\nmatch\nl3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      // verbose mode defaults to 3 lines, but explicit value should override
      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'verbose',
        context_before: 0,
        context_after: 1,
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 0, after: 1 });
      expect(parsed.matches[0].before).toBeUndefined();
      expect(parsed.matches[0].after).toEqual(['l3']);
    });

    it('should handle negative context values by treating as 0', async () => {
      const content = 'before\nmatch\nafter';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: -5,
        context_after: -3,
      });
      const parsed = parseResult(result);

      // Negative values should be clamped to 0
      expect(parsed.context).toEqual({ before: 0, after: 0 });
    });
  });

  describe('line_range parameter', () => {
    it('should only search within specified line range (start only)', async () => {
      // Lines 1-10: no match, Lines 11-20: contains "match"
      const content = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`)
        .concat(['match here'])
        .concat(Array.from({ length: 9 }, (_, i) => `Line ${i + 12}`))
        .join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        line_range: { start: 11 },
      });
      const parsed = parseResult(result);

      expect(parsed.match_count).toBe(1);
      expect(parsed.matches[0].line).toBe(11);
      expect(parsed.searched_range).toEqual({ start: 11 });
    });

    it('should only search within specified line range (end only)', async () => {
      // Put match at line 15, but restrict search to first 10 lines
      const content = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`)
        .concat(['extra1', 'extra2', 'extra3', 'extra4', 'match here'])
        .join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        line_range: { end: 10 },
      });
      const parsed = parseResult(result);

      // Should not find the match since it's at line 15
      expect(parsed.match_count).toBe(0);
      expect(parsed.searched_range).toEqual({ end: 10 });
    });

    it('should only search within specified line range (start and end)', async () => {
      const content = 'no1\nno2\nmatch1\nmatch2\nno3\nno4\nmatch3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        line_range: { start: 2, end: 5 },
      });
      const parsed = parseResult(result);

      // Should find match1 (line 3) and match2 (line 4), but not match3 (line 7)
      expect(parsed.match_count).toBe(2);
      expect(parsed.matches[0].line).toBe(3);
      expect(parsed.matches[1].line).toBe(4);
      expect(parsed.searched_range).toEqual({ start: 2, end: 5 });
    });

    it('should include context even when it extends beyond search range', async () => {
      // Search range is 3-5, but context should show lines 1-2 and 6-7
      const content = 'ctx1\nctx2\nmatch\nafter1\nafter2\nctx6\nctx7';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        line_range: { start: 3, end: 5 },
        context_before: 2,
        context_after: 3,
      });
      const parsed = parseResult(result);

      expect(parsed.match_count).toBe(1);
      expect(parsed.matches[0].line).toBe(3);
      // Context should extend beyond the search range
      expect(parsed.matches[0].before).toEqual(['ctx1', 'ctx2']);
      expect(parsed.matches[0].after).toEqual(['after1', 'after2', 'ctx6']);
    });

    it('should handle line range beyond file length', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'Line',
        paths: ['/mock/project/test.ts'],
        line_range: { start: 100, end: 200 },
      });
      const parsed = parseResult(result);

      // No matches since lines 100-200 don't exist
      expect(parsed.match_count).toBe(0);
    });

    it('should not include searched_range when line_range not specified', async () => {
      const content = 'match';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
      });
      const parsed = parseResult(result);

      expect(parsed.searched_range).toBeUndefined();
    });
  });

  describe('combined context and line_range', () => {
    it('should work with zero context and line range', async () => {
      const content = 'no\nmatch\nno';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 0,
        context_after: 0,
        line_range: { start: 1, end: 3 },
      });
      const parsed = parseResult(result);

      expect(parsed.match_count).toBe(1);
      expect(parsed.matches[0].before).toBeUndefined();
      expect(parsed.matches[0].after).toBeUndefined();
      expect(parsed.context).toEqual({ before: 0, after: 0 });
      expect(parsed.searched_range).toEqual({ start: 1, end: 3 });
    });

    it('should work with count_only mode and line_range', async () => {
      const content = 'match1\nmatch2\nmatch3\nmatch4\nmatch5';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'count_only',
        line_range: { start: 2, end: 4 },
      });
      const parsed = parseResult(result);

      // Only matches 2-4 should be counted
      expect(parsed.match_count).toBe(3);
      expect(parsed.matches).toBeUndefined();
      expect(parsed.searched_range).toEqual({ start: 2, end: 4 });
    });
  });

  describe('edge cases', () => {
    it('should handle match at first line with context', async () => {
      const content = 'match\nline2\nline3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 3,
        context_after: 2,
      });
      const parsed = parseResult(result);

      expect(parsed.matches[0].before).toEqual([]);
      expect(parsed.matches[0].after).toEqual(['line2', 'line3']);
    });

    it('should handle match at last line with context', async () => {
      const content = 'line1\nline2\nmatch';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 2,
        context_after: 3,
      });
      const parsed = parseResult(result);

      expect(parsed.matches[0].before).toEqual(['line1', 'line2']);
      expect(parsed.matches[0].after).toEqual([]);
    });

    it('should handle single line file', async () => {
      const content = 'single match line';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        context_before: 5,
        context_after: 5,
      });
      const parsed = parseResult(result);

      expect(parsed.matches[0].before).toEqual([]);
      expect(parsed.matches[0].after).toEqual([]);
    });

    it('should handle line_range with start > end gracefully', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'Line',
        paths: ['/mock/project/test.ts'],
        line_range: { start: 5, end: 2 },
      });
      const parsed = parseResult(result);

      // No matches since range is invalid
      expect(parsed.match_count).toBe(0);
    });
  });

  describe('context metadata in response', () => {
    it('should include context metadata in standard mode', async () => {
      const content = 'match';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'standard',
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 1, after: 1 });
    });

    it('should include context metadata in verbose mode', async () => {
      const content = 'match';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'verbose',
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 3, after: 3 });
    });

    it('should include context metadata when explicitly specified', async () => {
      const content = 'match';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'minimal',
        context_before: 2,
      });
      const parsed = parseResult(result);

      expect(parsed.context).toEqual({ before: 2, after: 2 });
    });

    it('should not include context metadata for count_only without explicit context', async () => {
      const content = 'match';
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = await handleGrepWithContent({
        pattern: 'match',
        paths: ['/mock/project/test.ts'],
        output_mode: 'count_only',
      });
      const parsed = parseResult(result);

      expect(parsed.context).toBeUndefined();
    });
  });
});
