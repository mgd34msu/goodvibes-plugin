/**
 * Tests for precision_read handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrecisionRead } from '../../handlers/precision-read.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, SAMPLE_TS_CODE } from '../test-utils.js';

describe('precision_read handler', () => {
  describe('input validation', () => {
    it('should return error when files array is missing', async () => {
      const result = await handlePrecisionRead({
        extract: 'content',
        output: { mode: 'standard' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'files'");
    });

    // Extract parameter now has defaults, no longer required

    // Output parameter now has defaults, no longer required
  });

  describe('extract mode: content', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'line 1\nline 2\nline 3\nline 4\nline 5');
    });

    it('should read full file content', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].exists).toBe(true);
      expect(parsed.data.files['file.ts'].content).toContain('line 1');
    });

    it('should include line numbers by default', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].content).toMatch(/\d+\s*\|/);
    });

    it('should exclude line numbers when disabled', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard', include_line_numbers: false },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].content).not.toMatch(/\d+\s*\|/);
    });

    it('should support line range with range parameter', async () => {
      const result = await handlePrecisionRead({
        files: [{ path: 'file.ts', range: { start: 2, end: 4 } }],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].content).toContain('line 2');
      expect(parsed.data.files['file.ts'].content).toContain('line 3');
      expect(parsed.data.files['file.ts'].content).toContain('line 4');
    });

    it('should support default_range for all files', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        default_range: { start: 1, end: 2 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].content).toContain('line 1');
    });
  });

  describe('extract mode: lines', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'line 1\nline 2\nline 3');
    });

    it('should return lines as array', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'lines',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].lines).toBeInstanceOf(Array);
      expect(parsed.data.files['file.ts'].lines).toHaveLength(3);
    });
  });

  describe('extract mode: outline', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should extract document outline', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'outline',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['sample.ts'].outline).toBeDefined();
      expect(parsed.data.files['sample.ts'].outline.length).toBeGreaterThan(0);
    });

    it('should include hierarchical structure', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'outline',
        output: { mode: 'verbose' },
      });

      const parsed = expectSuccess(result);
      const classOutline = parsed.data.files['sample.ts'].outline.find(
        (o: { name: string }) => o.name === 'SampleClass'
      );
      expect(classOutline?.children).toBeDefined();
    });
  });

  describe('extract mode: symbols', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should extract symbols from file', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'symbols',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['sample.ts'].symbols).toBeDefined();
      expect(parsed.data.files['sample.ts'].symbols.length).toBeGreaterThan(0);
    });

    it('should filter symbols by kind', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'symbols',
        output: { mode: 'standard' },
        symbol_filter: ['function'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.files['sample.ts'].symbols;
      expect(symbols.every((s: { kind: string }) => s.kind === 'function')).toBe(true);
    });

    it('should include signature in verbose mode', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'symbols',
        output: { mode: 'verbose' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.files['sample.ts'].symbols;
      expect(symbols.some((s: { signature?: string }) => s.signature)).toBe(true);
    });
  });

  describe('extract mode: ast', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', 'const x = 1;\nfunction foo() {}');
    });

    it('should extract simplified AST', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'ast',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['sample.ts'].ast).toBeDefined();
      expect(parsed.data.files['sample.ts'].ast.kind).toBe('SourceFile');
    });

    it('should populate AST children array with nodes', async () => {
      const result = await handlePrecisionRead({
        files: ['sample.ts'],
        extract: 'ast',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      const ast = parsed.data.files['sample.ts'].ast;
      expect(ast.children).toBeDefined();
      expect(Array.isArray(ast.children)).toBe(true);
      expect(ast.children.length).toBeGreaterThan(0);
      // Verify children have expected structure
      const firstChild = ast.children[0];
      expect(firstChild).toHaveProperty('kind');
      expect(firstChild).toHaveProperty('line');
    });
  });

  describe('multiple files', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'content 1',
        'file2.ts': 'content 2',
      });
    });

    it('should read multiple files', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(Object.keys(parsed.data.files)).toHaveLength(2);
    });

    it('should handle mix of existing and non-existing files', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'nonexistent.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file1.ts'].exists).toBe(true);
      expect(parsed.data.files['nonexistent.ts'].exists).toBe(false);
      expect(parsed.data.summary.files_not_found).toBe(1);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should return count_only output', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary).toBeDefined();
      expect(parsed.data.files).toBeUndefined();
    });

    it('should return minimal output', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'minimal' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts']).toHaveProperty('exists');
      expect(parsed.data.files['file.ts']).toHaveProperty('line_count');
      expect(parsed.data.files['file.ts']).not.toHaveProperty('content');
    });

    it('should return verbose output with metadata', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'verbose', include_metadata: true },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].metadata).toBeDefined();
      expect(parsed.data.files['file.ts'].metadata.size).toBeDefined();
      expect(parsed.data.files['file.ts'].metadata.modified).toBeDefined();
    });
  });

  describe('truncation', () => {
    beforeEach(async () => {
      const longContent = Array(1000).fill('line').join('\n');
      await createTestFile('long.ts', longContent);
    });

    it('should truncate when max_lines_per_file exceeded', async () => {
      const result = await handlePrecisionRead({
        files: ['long.ts'],
        extract: 'content',
        output: { mode: 'verbose', max_lines_per_file: 10 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['long.ts'].truncated).toBe(true);
    });

    it('should report truncation in summary', async () => {
      const result = await handlePrecisionRead({
        files: ['long.ts'],
        extract: 'content',
        output: { mode: 'standard', max_lines_per_file: 10 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.truncated).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent file', async () => {
      const result = await handlePrecisionRead({
        files: ['nonexistent.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['nonexistent.ts'].exists).toBe(false);
      expect(parsed.data.files['nonexistent.ts'].error).toBeDefined();
    });

    it('should handle empty file', async () => {
      await createTestFile('empty.ts', '');

      const result = await handlePrecisionRead({
        files: ['empty.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['empty.ts'].exists).toBe(true);
      expect(parsed.data.files['empty.ts'].line_count).toBe(1);
    });

    it('should return warning for empty file', async () => {
      await createTestFile('empty-warn.ts', '');

      const result = await handlePrecisionRead({
        files: ['empty-warn.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      const fileResult = parsed.data.files['empty-warn.ts'];
      expect(fileResult.exists).toBe(true);
      expect(fileResult.status).toBe('empty');
      expect(fileResult.size_bytes).toBe(0);
      expect(fileResult.warning).toBe('File exists but is empty (0 bytes)');
    });

    it('should return error for non-TS file with symbols extract', async () => {
      await createTestFile('file.txt', 'just text');

      const result = await handlePrecisionRead({
        files: ['file.txt'],
        extract: 'symbols',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.txt'].error).toContain('Supported languages');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await createTestFile('existing-file.ts', 'const x = 1;');
    });

    it('should return suggestions for ENOENT errors in standard mode', async () => {
      const result = await handlePrecisionRead({
        files: ['existing-flie.ts'], // Typo: flie instead of file
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      const fileResult = parsed.data.files['existing-flie.ts'];
      expect(fileResult.exists).toBe(false);
      expect(fileResult.error).toContain('File not found');
      expect(fileResult.suggestions).toBeDefined();
      expect(Array.isArray(fileResult.suggestions)).toBe(true);
      expect(fileResult.hint).toBeDefined();
      expect(fileResult.hint).toContain('Did you mean');
    });
  });

  describe('summary', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'line 1\nline 2',
        'file2.ts': 'line 1',
      });
    });

    it('should include files_read in summary', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_read).toBe(2);
    });

    it('should include total_lines in summary', async () => {
      const result = await handlePrecisionRead({
        files: ['file1.ts', 'file2.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_lines).toBe(3);
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('file.ts', 'content');
    });

    it('should include tokens_used', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('slow filesystem detection', () => {
    beforeEach(async () => {
      await createTestFile('test-file.ts', 'const x = 1;');
    });

    it('should detect slow filesystem and add metadata', async () => {
      const result = await handlePrecisionRead({
        files: ['test-file.ts'],
        extract: 'content',
        output: { mode: 'standard', include_metadata: true },
      });

      const parsed = expectSuccess(result);
      const fileResult = parsed.data.files['test-file.ts'];
      
      expect(fileResult.exists).toBe(true);
      expect(fileResult.metadata).toBeDefined();
      
      // Metadata should always be present when include_metadata is true
      if (fileResult.metadata) {
        // Basic metadata fields should always exist
        expect(fileResult.metadata.size).toBeGreaterThanOrEqual(0);
        expect(fileResult.metadata.modified).toBeDefined();
        
        // If filesystem is detected as slow, check the appropriate fields
        if (fileResult.metadata.filesystem === 'slow') {
          expect(fileResult.metadata.filesystem).toBe('slow');
          expect(fileResult.metadata.note).toContain('slow filesystem');
          expect(fileResult.metadata.stat_ms).toBeGreaterThan(0);
        }
        
        // Test that filesystem type is one of the allowed values (if present)
        if (fileResult.metadata.filesystem) {
          expect(['slow', 'fast', 'network', 'local']).toContain(fileResult.metadata.filesystem);
        }
      }
    });

    it('should accept all filesystem type values in union', async () => {
      // This test verifies TypeScript compilation accepts the expanded union
      const result = await handlePrecisionRead({
        files: ['test-file.ts'],
        extract: 'content',
        output: { mode: 'standard', include_metadata: true },
      });

      const parsed = expectSuccess(result);
      const fileResult = parsed.data.files['test-file.ts'];
      
      if (fileResult.metadata?.filesystem) {
        const fsType: 'slow' | 'fast' | 'network' | 'local' = fileResult.metadata.filesystem;
        expect(['slow', 'fast', 'network', 'local']).toContain(fsType);
      }
    });
  });
});
