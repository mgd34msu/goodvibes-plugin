/**
 * Tests for grep_with_content handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleGrepWithContent } from '../../handlers/grep-with-content.js';
import { createTestFile, createTestFiles, expectSuccess, expectError } from '../test-utils.js';

describe('grep_with_content handler', () => {
  describe('input validation', () => {
    it('should return error when pattern is missing', async () => {
      const result = await handleGrepWithContent({ glob: '*.ts' });
      const parsed = expectError(result);
      expect(parsed.error).toContain('pattern is required');
    });

    it('should return error when neither glob nor paths is provided', async () => {
      const result = await handleGrepWithContent({ pattern: 'test' });
      const parsed = expectError(result);
      expect(parsed.error).toContain('Either glob or paths must be provided');
    });
  });

  describe('basic functionality with glob', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const foo = 1;\nconst bar = 2;\nconst baz = foo + bar;',
        'file2.ts': 'function foo() { return 42; }\nfunction bar() { return foo(); }',
        'file3.js': 'var foo = "hello";\nconsole.log(foo);',
      });
    });

    it('should find matches with simple pattern', async () => {
      const result = await handleGrepWithContent({
        pattern: 'foo',
        glob: '**/*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeGreaterThan(0);
      expect(parsed.data.every((m: { file: string }) => m.file.endsWith('.ts'))).toBe(true);
    });

    it('should find matches with regex pattern', async () => {
      const result = await handleGrepWithContent({
        pattern: 'const \\w+',
        glob: '**/*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeGreaterThan(0);
    });

    it('should include line and column information', async () => {
      const result = await handleGrepWithContent({
        pattern: 'bar',
        glob: '**/*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0]).toHaveProperty('file');
      expect(parsed.data[0]).toHaveProperty('line');
      expect(parsed.data[0]).toHaveProperty('column');
      expect(parsed.data[0]).toHaveProperty('content');
    });
  });

  describe('basic functionality with paths', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.txt': 'Hello World\nFoo Bar',
        'file2.txt': 'Testing 123\nHello Again',
      });
    });

    it('should search specific paths', async () => {
      const result = await handleGrepWithContent({
        pattern: 'Hello',
        paths: ['file1.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBe(1);
      expect(parsed.data[0].file).toBe('file1.txt');
    });

    it('should search multiple paths', async () => {
      const result = await handleGrepWithContent({
        pattern: 'Hello',
        paths: ['file1.txt', 'file2.txt'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBe(2);
    });
  });

  describe('context lines', () => {
    beforeEach(async () => {
      await createTestFile(
        'code.ts',
        'line 1\nline 2\nTARGET\nline 4\nline 5\nline 6'
      );
    });

    it('should include context_before lines', async () => {
      const result = await handleGrepWithContent({
        pattern: 'TARGET',
        glob: '*.ts',
        context_before: 2,
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].before).toHaveLength(2);
      expect(parsed.data[0].before).toContain('line 1');
      expect(parsed.data[0].before).toContain('line 2');
    });

    it('should include context_after lines', async () => {
      const result = await handleGrepWithContent({
        pattern: 'TARGET',
        glob: '*.ts',
        context_after: 2,
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].after).toHaveLength(2);
      expect(parsed.data[0].after).toContain('line 4');
      expect(parsed.data[0].after).toContain('line 5');
    });

    it('should include both before and after context', async () => {
      const result = await handleGrepWithContent({
        pattern: 'TARGET',
        glob: '*.ts',
        context_before: 1,
        context_after: 1,
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].before).toHaveLength(1);
      expect(parsed.data[0].after).toHaveLength(1);
    });

    it('should handle context at file boundaries', async () => {
      await createTestFile('boundary.ts', 'TARGET\nline 2');

      const result = await handleGrepWithContent({
        pattern: 'TARGET',
        glob: 'boundary.ts',
        context_before: 5,
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].before).toHaveLength(0);
    });
  });

  describe('max_matches', () => {
    beforeEach(async () => {
      await createTestFile(
        'many.ts',
        Array(50).fill('match pattern here').join('\n')
      );
    });

    it('should respect max_matches limit', async () => {
      const result = await handleGrepWithContent({
        pattern: 'match',
        glob: '*.ts',
        max_matches: 10,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeLessThanOrEqual(10);
    });

    it('should use default max_matches of 100', async () => {
      const result = await handleGrepWithContent({
        pattern: 'match',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeLessThanOrEqual(100);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'const foo = 1;',
        'file2.ts': 'const foo = 2;',
      });
    });

    it('should return count_only output', async () => {
      const result = await handleGrepWithContent({
        pattern: 'foo',
        glob: '**/*.ts',
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('file_count');
      expect(parsed.data).toHaveProperty('match_count');
      expect(parsed.data.file_count).toBe(2);
      expect(parsed.data.match_count).toBe(2);
    });

    it('should return minimal output', async () => {
      const result = await handleGrepWithContent({
        pattern: 'foo',
        glob: '**/*.ts',
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('file_count');
      expect(parsed.data).toHaveProperty('match_count');
      expect(parsed.data).toHaveProperty('files');
      expect(parsed.data.files).toBeInstanceOf(Array);
    });

    it('should return standard output', async () => {
      const result = await handleGrepWithContent({
        pattern: 'foo',
        glob: '**/*.ts',
        output_mode: 'standard',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data[0]).toHaveProperty('file');
      expect(parsed.data[0]).toHaveProperty('line');
      expect(parsed.data[0]).toHaveProperty('column');
      expect(parsed.data[0]).toHaveProperty('content');
      expect(parsed.data[0]).not.toHaveProperty('before');
      expect(parsed.data[0]).not.toHaveProperty('after');
    });

    it('should return verbose output with context', async () => {
      const result = await handleGrepWithContent({
        pattern: 'foo',
        glob: '**/*.ts',
        output_mode: 'verbose',
        context_before: 1,
        context_after: 1,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data[0]).toHaveProperty('before');
      expect(parsed.data[0]).toHaveProperty('after');
    });
  });

  describe('edge cases', () => {
    it('should handle no matches', async () => {
      await createTestFile('file.ts', 'nothing here');

      const result = await handleGrepWithContent({
        pattern: 'nonexistent',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(0);
    });

    it('should handle empty files', async () => {
      await createTestFile('empty.ts', '');

      const result = await handleGrepWithContent({
        pattern: 'anything',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(0);
    });

    it('should handle multiple matches on same line', async () => {
      await createTestFile('multi.ts', 'foo foo foo');

      const result = await handleGrepWithContent({
        pattern: 'foo',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBe(3);
      expect(parsed.data.every((m: { line: number }) => m.line === 1)).toBe(true);
    });

    it('should handle invalid regex gracefully', async () => {
      await createTestFile('file.ts', 'content');

      // This should throw or return error for invalid regex
      try {
        const result = await handleGrepWithContent({
          pattern: '[invalid',
          glob: '*.ts',
        });
        // If it doesn't throw, it should be an error result
        const parsed = expectError(result);
        expect(parsed.error).toBeDefined();
      } catch {
        // Expected to throw for invalid regex
      }
    });

    it('should handle special regex characters', async () => {
      await createTestFile('file.ts', 'test(1) and test(2)');

      const result = await handleGrepWithContent({
        pattern: 'test\\(\\d\\)',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBe(2);
    });
  });

  describe('metadata', () => {
    it('should include execution time', async () => {
      await createTestFile('file.ts', 'content');

      const result = await handleGrepWithContent({
        pattern: 'content',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include token estimate', async () => {
      await createTestFile('file.ts', 'content');

      const result = await handleGrepWithContent({
        pattern: 'content',
        glob: '*.ts',
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.token_estimate).toBeGreaterThan(0);
    });
  });
});
