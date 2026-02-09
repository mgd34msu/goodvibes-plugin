/**
 * Tests for precision_read token-budgeted batch pagination logic.
 * 
 * This test file focuses on the pagination feature triggered when token_budget is specified.
 * It tests the bin-packing algorithm that groups files into pages based on token cost.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrecisionRead } from '../../handlers/precision-read.js';
import { createTestFile, createTestFiles, expectSuccess } from '../test-utils.js';

describe('precision_read pagination', () => {
  describe('basic pagination', () => {
    beforeEach(async () => {
      // Create multiple files with varying content sizes
      await createTestFiles({
        'file1.ts': 'small content 1',
        'file2.ts': 'small content 2',
        'file3.ts': 'small content 3',
        'file4.ts': 'larger content with more text to increase token count for testing pagination behavior',
        'file5.ts': 'another file with some content',
      });
    });

    it('should paginate files when total tokens exceed budget', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 150, // Very small budget to force pagination
        page: 1,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.pagination).toBeDefined();
      
      const pagination = parsed.data.summary.pagination;
      expect(pagination.page).toBe(1);
      expect(pagination.total_pages).toBeGreaterThanOrEqual(1);
      expect(pagination.token_budget).toBe(150);
      expect(pagination.tokens_used).toBeLessThanOrEqual(150);
      expect(pagination.pending_files).toBeDefined();
      expect(Array.isArray(pagination.pending_files)).toBe(true);
    });

    it('should return first page when page=1', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 500,
        page: 1,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      expect(pagination.page).toBe(1);
      
      // First page should have files from the beginning
      const fileKeys = Object.keys(parsed.data.files);
      expect(fileKeys.length).toBeGreaterThan(0);
      expect(fileKeys[0]).toMatch(/file[1-5]\.ts/);
    });

    it('should return second page when page=2', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 500,
        page: 2,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      if (pagination.total_pages >= 2) {
        expect(pagination.page).toBe(2);
        expect(Object.keys(parsed.data.files).length).toBeGreaterThan(0);
      } else {
        // If there's only 1 page, it should clamp to page 1
        expect(pagination.page).toBe(1);
      }
    });

    it('should include all required pagination metadata fields', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 300,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination).toHaveProperty('page');
      expect(pagination).toHaveProperty('total_pages');
      expect(pagination).toHaveProperty('pending_files');
      expect(pagination).toHaveProperty('token_budget');
      expect(pagination).toHaveProperty('tokens_used');
      
      expect(typeof pagination.page).toBe('number');
      expect(typeof pagination.total_pages).toBe('number');
      expect(Array.isArray(pagination.pending_files)).toBe(true);
      expect(typeof pagination.token_budget).toBe('number');
      expect(typeof pagination.tokens_used).toBe('number');
    });

    it('should correctly populate pending_files list', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 300,
        page: 1,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      const filesOnPage = Object.keys(parsed.data.files);
      
      // Pending files should not include files on current page
      for (const file of filesOnPage) {
        expect(pagination.pending_files).not.toContain(file);
      }
      
      // If there are multiple pages, there should be pending files
      if (pagination.total_pages > 1) {
        expect(pagination.pending_files.length).toBeGreaterThan(0);
      }
    });
  });

  describe('budget exceeded scenario', () => {
    beforeEach(async () => {
      // Create a file with large content that exceeds typical small budgets
      const largeContent = Array(200).fill('This is a line of content that will contribute to token count').join('\n');
      await createTestFile('large-file.ts', largeContent);
      await createTestFile('small-file.ts', 'tiny');
    });

    it('should place single large file alone on page when it exceeds budget', async () => {
      const result = await handlePrecisionRead({
        files: ['large-file.ts', 'small-file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 100, // Very small budget
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      // The large file should be on its own page
      const filesOnPage = Object.keys(parsed.data.files);
      if (filesOnPage.length === 1 && filesOnPage[0] === 'large-file.ts') {
        expect(pagination.budget_exceeded).toBe(true);
        expect(pagination.tokens_used).toBeGreaterThan(pagination.token_budget);
      }
    });

    it('should set budget_exceeded flag when single file exceeds budget', async () => {
      const result = await handlePrecisionRead({
        files: ['large-file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 50,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.budget_exceeded).toBe(true);
    });

    it('should not set budget_exceeded when files fit in budget', async () => {
      const result = await handlePrecisionRead({
        files: ['small-file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 1000,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.budget_exceeded).toBeUndefined();
    });
  });

  describe('page clamping', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'content 1',
        'file2.ts': 'content 2',
        'file3.ts': 'content 3',
      });
    });

    it('should clamp page to total_pages when requesting beyond max', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 500,
        page: 999, // Request page far beyond available pages
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.page).toBe(pagination.total_pages);
      expect(pagination.warning).toBeDefined();
      expect(pagination.warning).toContain('Requested page');
      expect(pagination.warning).toContain('exceeds total pages');
    });

    it('should include warning message when page is clamped', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 1000,
        page: 10,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      if (pagination.page < 10) {
        expect(pagination.warning).toBeDefined();
        expect(pagination.warning).toContain('Showing page');
      }
    });

    it('should not include warning when page is within range', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 1000,
        page: 1,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.warning).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'content 1',
        'file2.ts': 'content 2',
      });
    });

    it('should handle single file within budget', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 5000,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.page).toBe(1);
      expect(pagination.total_pages).toBe(1);
      expect(pagination.pending_files).toEqual([]);
      expect(pagination.budget_exceeded).toBeUndefined();
    });

    it('should handle single file exceeding budget', async () => {
      const largeContent = Array(500).fill('line of content').join('\n');
      await createTestFile('huge.ts', largeContent);

      const result = await handlePrecisionRead({
        files: ['huge.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 50,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.page).toBe(1);
      expect(pagination.total_pages).toBe(1);
      expect(pagination.budget_exceeded).toBe(true);
      expect(pagination.tokens_used).toBeGreaterThan(pagination.token_budget);
    });

    it('should not paginate when token_budget is 0', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 0,
      });

      const parsed = expectSuccess(result);
      
      // No pagination should occur with token_budget=0
      expect(parsed.data.summary.pagination).toBeUndefined();
    });

    it('should not paginate when token_budget is negative', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: -100,
      });

      const parsed = expectSuccess(result);
      
      // No pagination should occur with negative token_budget
      expect(parsed.data.summary.pagination).toBeUndefined();
    });

    it('should generate warning when page is set without token_budget', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        page: 2,
      });

      const parsed = expectSuccess(result);
      
      expect(parsed.data.summary.warning).toBe('page parameter is ignored without token_budget');
      expect(parsed.data.summary.pagination).toBeUndefined();
    });

    it('should default to page 1 when page is not specified', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 500,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.page).toBe(1);
    });

    it('should handle all files fitting in single page', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 100000, // Very large budget
        page: 1,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.page).toBe(1);
      expect(pagination.total_pages).toBe(1);
      expect(pagination.pending_files).toEqual([]);
      expect(Object.keys(parsed.data.files)).toHaveLength(2);
    });

    it('should handle non-existent files with token_budget', async () => {
      const result = await handlePrecisionRead({
        files: ['nonexistent1.ts', 'nonexistent2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 500,
      });

      const parsed = expectSuccess(result);
      
      // Non-existent files should still have pagination metadata
      expect(parsed.data.summary.pagination).toBeDefined();
      const pagination = parsed.data.summary.pagination;
      expect(pagination.total_pages).toBeGreaterThanOrEqual(1);
      expect(pagination.pending_files).toBeDefined();
    });
  });

  describe('truthiness checks', () => {
    beforeEach(async () => {
      await createTestFile('file1.ts', 'content');
    });

    it('should handle page=0 correctly', async () => {
      // page=0 is a valid value (not nullish), so it should be used
      // Then clamped: Math.min(0, totalPages) - 1 = -1, so pageIndex is -1
      // This will select pageGroups[-1] which is undefined, fallback to pageGroups[0]
      const result = await handlePrecisionRead({
        files: ['file1.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 500,
        page: 0,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      // When page=0, Math.min(0, totalPages) = 0, then pageIndex = 0 - 1 = -1
      // Code: const selectedPage = pageGroups[pageIndex] || pageGroups[0] || [];
      // So it falls back to pageGroups[0], giving us page 1 content but reporting page=0
      expect(pagination.page).toBe(0);
    });

    it('should not warn about page parameter when page=1 and no token_budget', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        page: 1,
      });

      const parsed = expectSuccess(result);
      
      // Warning only triggers for page > 1 without token_budget
      expect(parsed.data.summary.warning).toBeUndefined();
    });

    it('should include token_cost in file results when pagination is active', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts'],
        extract: 'content',
        output: { mode: 'verbose' },
        token_budget: 500,
      });

      const parsed = expectSuccess(result);
      const fileResult = parsed.data.files['file1.ts'];
      
      expect(fileResult.token_cost).toBeDefined();
      expect(typeof fileResult.token_cost).toBe('number');
      expect(fileResult.token_cost).toBeGreaterThan(0);
    });
  });

  describe('bin-packing algorithm behavior', () => {
    beforeEach(async () => {
      // Create files with predictable sizes for testing bin packing
      await createTestFiles({
        'tiny1.ts': 'x',
        'tiny2.ts': 'y',
        'tiny3.ts': 'z',
        'medium.ts': 'This is a medium-sized file with more content',
        'large.ts': Array(50).fill('some content line').join('\n'),
      });
    });

    it('should pack files efficiently using first-fit algorithm', async () => {
      const result = await handlePrecisionRead({
        files: ['tiny1.ts', 'tiny2.ts', 'tiny3.ts', 'medium.ts', 'large.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 800,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      // First-fit bin packing should group small files together
      expect(pagination.total_pages).toBeGreaterThanOrEqual(1);
      expect(pagination.tokens_used).toBeLessThanOrEqual(pagination.token_budget);
    });

    it('should respect page boundaries and not exceed budget per page', async () => {
      const budget = 600;
      const result = await handlePrecisionRead({
        files: ['tiny1.ts', 'tiny2.ts', 'tiny3.ts', 'medium.ts', 'large.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: budget,
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      // Unless budget_exceeded is true, tokens_used should be <= budget
      if (!pagination.budget_exceeded) {
        expect(pagination.tokens_used).toBeLessThanOrEqual(budget);
      }
    });

    it('should distribute files across multiple pages when necessary', async () => {
      const result = await handlePrecisionRead({
        files: ['tiny1.ts', 'tiny2.ts', 'tiny3.ts', 'medium.ts', 'large.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 200, // Small budget to force multiple pages
      });

      const parsed = expectSuccess(result);
      const pagination = parsed.data.summary.pagination;
      
      expect(pagination.total_pages).toBeGreaterThan(1);
      
      // Verify we can fetch different pages
      const page2Result = await handlePrecisionRead({
        files: ['tiny1.ts', 'tiny2.ts', 'tiny3.ts', 'medium.ts', 'large.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 200,
        page: 2,
      });

      const page2Parsed = expectSuccess(page2Result);
      const page2Files = Object.keys(page2Parsed.data.files);
      const page1Files = Object.keys(parsed.data.files);
      
      // Files on page 2 should be different from page 1
      if (pagination.total_pages >= 2) {
        expect(page2Files).not.toEqual(page1Files);
      }
    });
  });

  describe('pagination with different extract modes', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const x = 1;\nconst y = 2;',
        'file2.ts': 'const a = 3;\nconst b = 4;',
        'file3.ts': 'const c = 5;\nconst d = 6;',
      });
    });

    it('should paginate with extract=lines mode', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        extract: 'lines',
        output: { mode: 'standard' },
        token_budget: 300,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.pagination).toBeDefined();
    });

    it('should paginate with extract=outline mode', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        extract: 'outline',
        output: { mode: 'standard' },
        token_budget: 500,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.pagination).toBeDefined();
    });

    it('should paginate with extract=symbols mode', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        extract: 'symbols',
        output: { mode: 'standard' },
        token_budget: 500,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.pagination).toBeDefined();
    });
  });

  describe('pagination metadata consistency', () => {
    beforeEach(async () => {
      await createTestFiles({
        'a.ts': 'content a',
        'b.ts': 'content b',
        'c.ts': 'content c',
        'd.ts': 'content d',
      });
    });

    it('should have consistent total_pages across all page requests', async () => {
      const page1Result = await handlePrecisionRead({
        files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 300,
        page: 1,
      });

      const page1Parsed = expectSuccess(page1Result);
      const totalPages = page1Parsed.data.summary.pagination.total_pages;

      // Request page 2 (if it exists)
      if (totalPages >= 2) {
        const page2Result = await handlePrecisionRead({
          files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
          extract: 'content',
          output: { mode: 'standard' },
          token_budget: 300,
          page: 2,
        });

        const page2Parsed = expectSuccess(page2Result);
        expect(page2Parsed.data.summary.pagination.total_pages).toBe(totalPages);
      }
    });

    it('should sum files across all pages to equal total input files', async () => {
      const totalFiles = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
      const page1Result = await handlePrecisionRead({
        files: totalFiles,
        extract: 'content',
        output: { mode: 'standard' },
        token_budget: 200,
        page: 1,
      });

      const page1Parsed = expectSuccess(page1Result);
      const pagination = page1Parsed.data.summary.pagination;
      
      let collectedFiles = Object.keys(page1Parsed.data.files);
      
      // Collect files from all pages
      for (let p = 2; p <= pagination.total_pages; p++) {
        const pageResult = await handlePrecisionRead({
          files: totalFiles,
          extract: 'content',
          output: { mode: 'standard' },
          token_budget: 200,
          page: p,
        });
        const pageParsed = expectSuccess(pageResult);
        collectedFiles = collectedFiles.concat(Object.keys(pageParsed.data.files));
      }
      
      expect(collectedFiles.sort()).toEqual(totalFiles.sort());
    });
  });
});
