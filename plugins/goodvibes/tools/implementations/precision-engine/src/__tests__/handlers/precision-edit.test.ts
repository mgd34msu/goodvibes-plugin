/**
 * Tests for precision_edit handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrecisionEdit } from '../../handlers/precision-edit.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, readTestFile, fileExists } from '../test-utils.js';

describe('precision_edit handler', () => {
  describe('input validation', () => {
    it('should return error when edits array is missing', async () => {
      const result = await handlePrecisionEdit({
        transaction: { mode: 'atomic', rollback_on_fail: true },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain('edits array is required');
    });


  });

  describe('exact match mode', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo = 1;\nconst bar = 2;');
    });

    it('should replace exact match', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.edits_applied).toBe(1);

      const content = await readTestFile('file.ts');
      expect(content).toContain('const foo = 10;');
    });

    it('should handle case insensitive matching', async () => {
      await createTestFile('file.ts', 'const FOO = 1;');

      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const bar = 1;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact', case_sensitive: false },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.edits_applied).toBe(1);
    });
  });

  describe('fuzzy match mode', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const   foo   =   1;'); // Extra spaces
    });

    it('should match with whitespace variations', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const bar = 1;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'fuzzy', whitespace_sensitive: false },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.edits_applied).toBe(1);
    });
  });

  describe('regex match mode', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo1 = 1;\nconst foo2 = 2;');
    });

    it('should match with regex pattern', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo\\d', replace: 'const bar', occurrence: 'all' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'regex' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.edits_applied).toBe(2);
    });
  });

  describe('occurrence handling', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'foo foo foo');
    });

    it('should replace first occurrence by default', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'foo', replace: 'bar' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('file.ts');
      expect(content).toBe('bar foo foo');
    });

    it('should replace last occurrence', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'foo', replace: 'bar', occurrence: 'last' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('file.ts');
      expect(content).toBe('foo foo bar');
    });

    it('should replace all occurrences', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'foo', replace: 'bar', occurrence: 'all' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('file.ts');
      expect(content).toBe('bar bar bar');
    });

    it('should replace specific occurrence by number', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'foo', replace: 'bar', occurrence: 2 }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      const content = await readTestFile('file.ts');
      expect(content).toBe('foo bar foo');
    });
  });

  describe('hints', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', `
function foo() {
  const x = 1;
}

function bar() {
  const x = 2;
}
      `.trim());
    });

    it('should use near_line hint', async () => {
      const result = await handlePrecisionEdit({
        edits: [{
          file: 'file.ts',
          find: 'const x',
          replace: 'const y',
          hints: { near_line: 6 }, // Near bar function
        }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      // Should prefer the one near line 6
    });

    it('should use in_function hint', async () => {
      const result = await handlePrecisionEdit({
        edits: [{
          file: 'file.ts',
          find: 'const x',
          replace: 'const y',
          hints: { in_function: 'bar' },
        }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
    });
  });

  describe('transaction modes', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const a = 1;',
        'file2.ts': 'const b = 2;',
      });
    });

    it('should apply all edits in atomic mode', async () => {
      const result = await handlePrecisionEdit({
        edits: [
          { file: 'file1.ts', find: 'const a = 1;', replace: 'const a = 10;' },
          { file: 'file2.ts', find: 'const b = 2;', replace: 'const b = 20;' },
        ],
        transaction: { mode: 'atomic', rollback_on_fail: true },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.edits_applied).toBe(2);
    });

    it('should rollback on failure in atomic mode', async () => {
      // First edit succeeds, second fails
      const result = await handlePrecisionEdit({
        edits: [
          { file: 'file1.ts', find: 'const a = 1;', replace: 'const a = 10;' },
          { file: 'file2.ts', find: 'nonexistent', replace: 'replacement' },
        ],
        transaction: { mode: 'atomic', rollback_on_fail: true },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      // Atomic mode stops on first failure
      expect(parsed.data.summary.files_modified).toBe(0);
    });

    it('should stop on failure in partial mode', async () => {
      const result = await handlePrecisionEdit({
        edits: [
          { file: 'file1.ts', find: 'nonexistent', replace: 'replacement' },
          { file: 'file2.ts', find: 'const b = 2;', replace: 'const b = 20;' },
        ],
        transaction: { mode: 'partial', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      // First edit fails, second should not be attempted
    });
  });

  describe('dry_run mode', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo = 1;');
    });

    it('should not modify files in dry_run', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'with_diff' },
        dry_run: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0].status).toBe('applied');

      const content = await readTestFile('file.ts');
      expect(content).toBe('const foo = 1;'); // Unchanged
    });

    it('should show diff in dry_run', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'with_diff' },
        dry_run: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0].diff).toBeDefined();
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const foo = 1;');
    });

    it('should return count_only output', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary).toBeDefined();
      expect(parsed.data.edits).toBeUndefined();
    });

    it('should return minimal output', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0]).toHaveProperty('file');
      expect(parsed.data.edits[0]).toHaveProperty('status');
      expect(parsed.data.edits[0]).not.toHaveProperty('diff');
    });

    it('should return with_diff output', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'with_diff' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0]).toHaveProperty('diff');
    });

    it('should return verbose output with validation', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'verbose' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('validation');
    });
  });

  describe('edit statuses', () => {
    it('should return applied status on success', async () => {
      await createTestFile('file.ts', 'const foo = 1;');

      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'const foo = 1;', replace: 'const foo = 10;' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0].status).toBe('applied');
    });

    it('should return not_found when pattern not found', async () => {
      await createTestFile('file.ts', 'const foo = 1;');

      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'nonexistent', replace: 'replacement' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0].status).toBe('not_found');
    });

    it('should return not_found when file does not exist', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'nonexistent.ts', find: 'anything', replace: 'replacement' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0].status).toBe('not_found');
    });
  });

  describe('multiple edits', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;');
    });

    it('should apply multiple edits to same file', async () => {
      const result = await handlePrecisionEdit({
        edits: [
          { file: 'file.ts', find: 'const a = 1;', replace: 'const a = 10;' },
          { file: 'file.ts', find: 'const b = 2;', replace: 'const b = 20;' },
        ],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.edits_applied).toBe(2);

      const content = await readTestFile('file.ts');
      expect(content).toContain('const a = 10;');
      expect(content).toContain('const b = 20;');
    });
  });

  describe('edit ID tracking', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include edit ID in results', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ id: 'edit-1', file: 'file.ts', find: 'content', replace: 'new content' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.edits[0].id).toBe('edit-1');
    });
  });

  describe('rollback_id', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include rollback_id in results', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'content', replace: 'new content' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.rollback_id).toBeDefined();
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include tokens_used', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'content', replace: 'new content' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionEdit({
        edits: [{ file: 'file.ts', find: 'content', replace: 'new content' }],
        transaction: { mode: 'none', rollback_on_fail: false },
        match: { mode: 'exact' },
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
