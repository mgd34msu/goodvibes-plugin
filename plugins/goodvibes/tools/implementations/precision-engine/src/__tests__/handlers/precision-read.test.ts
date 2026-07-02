/**
 * Tests for precision_read handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { handlePrecisionRead } from '../../handlers/precision-read.js';
import { FileStateCache } from '../../state/file-cache.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, SAMPLE_TS_CODE } from '../test-utils.js';

interface ReadEntry {
  exists: boolean;
  content?: string;
  lines?: string[];
  line_count?: number;
  truncated?: boolean;
  probe?: boolean;
  cache_hit?: boolean;
  cache?: {
    status: string;
    unchanged_since_last_read?: boolean;
    hash?: string;
    read_count?: number;
  };
}

interface ReadData {
  files: Record<string, ReadEntry>;
  summary: Record<string, unknown>;
}

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

    it('should exclude line numbers by default (v1.11 default flip)', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.files['file.ts'].content).not.toMatch(/\d+\s*\|/);
    });

    it('should include line numbers when explicitly enabled', async () => {
      const result = await handlePrecisionRead({
        files: ['file.ts'],
        extract: 'content',
        output: { mode: 'standard', include_line_numbers: true },
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

    it('should return suggestions for ENOENT errors in minimal mode', async () => {
      const result = await handlePrecisionRead({
        files: ['existing-flie.ts'], // Typo: flie instead of file
        extract: 'content',
        output: { mode: 'minimal' },
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

    it('should NOT detect slow filesystem on normal local filesystem', async () => {
      const result = await handlePrecisionRead({
        files: ['test-file.ts'],
        extract: 'content',
        output: { mode: 'standard', include_metadata: true },
      });

      const parsed = expectSuccess(result);
      const fileResult = parsed.data.files['test-file.ts'];
      
      expect(fileResult.exists).toBe(true);
      expect(fileResult.metadata).toBeDefined();
      
      if (fileResult.metadata) {
        // On a normal fast local filesystem:
        // - filesystem should NOT be 'slow'
        // - is_network should NOT be true
        // - note should NOT be set (no slow filesystem warning)
        // - stat_ms might be present but should be below threshold (typically < 100ms)
        expect(fileResult.metadata.filesystem).not.toBe('slow');
        expect(fileResult.metadata.is_network).not.toBe(true);
        expect(fileResult.metadata.note).toBeUndefined();
        
        // If stat_ms is present, it should be reasonable for a local filesystem
        if (fileResult.metadata.stat_ms !== undefined) {
          expect(fileResult.metadata.stat_ms).toBeLessThan(1000);
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

  describe('output.max_tokens enforcement for outline/symbols (v1.11)', () => {
    // ~600 exported functions -> outline/symbols JSON far larger than 8000 tokens.
    const FN_COUNT = 600;
    const bigSource = Array.from(
      { length: FN_COUNT },
      (_, i) =>
        'export function generatedFunction_' +
        String(i).padStart(4, '0') +
        '(argumentOne: string, argumentTwo: number): string {\n  return argumentOne + String(argumentTwo);\n}'
    ).join('\n\n');

    interface TruncatableFile {
      truncated?: boolean;
      outline?: unknown[];
      symbols?: unknown[];
    }
    interface TruncatableData {
      files: Record<string, TruncatableFile>;
      summary: { truncated: boolean };
    }

    function payloadText(result: { content?: unknown[] }): string {
      return (result.content?.[0] as { text: string }).text;
    }

    it('outline extract never returns a payload larger than max_tokens 8000', async () => {
      await createTestFile('big-outline.ts', bigSource);
      const result = await handlePrecisionRead({
        files: [{ path: 'big-outline.ts', force: true }],
        extract: 'outline',
        output: { mode: 'standard', max_tokens: 8000 },
      });
      const data = expectSuccess<TruncatableData>(result).data!;
      // Enforced on the final rendered payload: chars / 3.5 must fit the cap.
      expect(Math.ceil(payloadText(result).length / 3.5)).toBeLessThanOrEqual(8000);
      // Explicit truncation flags instead of oversized output.
      expect(data.files['big-outline.ts'].truncated).toBe(true);
      expect(data.summary.truncated).toBe(true);
      // Items were trimmed, not deleted wholesale.
      expect((data.files['big-outline.ts'].outline ?? []).length).toBeGreaterThan(0);
    });

    it('symbols extract never returns a payload larger than max_tokens 8000', async () => {
      await createTestFile('big-symbols.ts', bigSource);
      const result = await handlePrecisionRead({
        files: [{ path: 'big-symbols.ts', force: true }],
        extract: 'symbols',
        output: { mode: 'standard', max_tokens: 8000 },
      });
      const data = expectSuccess<TruncatableData>(result).data!;
      expect(Math.ceil(payloadText(result).length / 3.5)).toBeLessThanOrEqual(8000);
      expect(data.files['big-symbols.ts'].truncated).toBe(true);
      expect(data.summary.truncated).toBe(true);
    });

    it('does not flag truncation when output fits within max_tokens', async () => {
      await createTestFile('small-outline.ts', SAMPLE_TS_CODE);
      const result = await handlePrecisionRead({
        files: ['small-outline.ts'],
        extract: 'outline',
        output: { mode: 'standard', max_tokens: 8000 },
      });
      const data = expectSuccess<TruncatableData>(result).data!;
      expect(data.files['small-outline.ts'].truncated).toBeUndefined();
      expect(data.summary.truncated).toBe(false);
    });
  });

  describe('base_path parameter', () => {
    it('resolves relative paths against base_path', async () => {
      await createTestFile('sub/base-target.ts', 'base path content');
      const result = await handlePrecisionRead({
        files: ['base-target.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        base_path: path.join(process.cwd(), 'sub'),
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['base-target.ts'].exists).toBe(true);
      expect(data.files['base-target.ts'].content).toContain('base path content');
    });

    it('returns an error for a nonexistent base_path', async () => {
      const result = await handlePrecisionRead({
        files: ['whatever.ts'],
        extract: 'content',
        output: { mode: 'standard' },
        base_path: path.join(process.cwd(), 'does-not-exist-dir'),
      });
      expectError(result);
    });
  });

  describe('same-path batch entries (field issue 3)', () => {
    beforeEach(async () => {
      FileStateCache.resetInstance();
      await createTestFile('dup.ts', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6');
    });

    it('returns both ranges when one file is requested twice with different ranges', async () => {
      const result = await handlePrecisionRead({
        files: [
          { path: 'dup.ts', extract: 'lines', range: { start: 1, end: 2 } },
          { path: 'dup.ts', extract: 'lines', range: { start: 4, end: 5 } },
        ],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      const keys = Object.keys(data.files);
      expect(keys).toHaveLength(2);
      const allLines = keys.map((k) => data.files[k].lines);
      expect(allLines).toContainEqual(['line 1', 'line 2']);
      expect(allLines).toContainEqual(['line 4', 'line 5']);
      expect(data.summary.files_read).toBe(2);
    });

    it('keeps the plain path key for unique entries', async () => {
      const result = await handlePrecisionRead({
        files: [{ path: 'dup.ts', extract: 'lines', range: { start: 1, end: 2 } }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(Object.keys(data.files)).toEqual(['dup.ts']);
    });
  });

  describe('file cache rebuild (v2): content always served, probe opt-in', () => {
    beforeEach(() => {
      FileStateCache.resetInstance();
    });

    it('returns content for a first-in-session read of a file another tool wrote', async () => {
      const fullPath = await createTestFile('written.ts', 'written by another process');
      // Simulate a write/edit having registered the file in the server-global cache
      const realPath = await fs.realpath(fullPath);
      FileStateCache.getInstance().update(realPath, 'written by another process', 'precision_write');
      const result = await handlePrecisionRead({
        files: ['written.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['written.ts'].content).toContain('written by another process');
    });

    it('serves a range read of a previously-read file without force', async () => {
      await createTestFile('cached-range.ts', 'line 1\nline 2\nline 3\nline 4');
      await handlePrecisionRead({
        files: ['cached-range.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const result = await handlePrecisionRead({
        files: [{ path: 'cached-range.ts', extract: 'lines', range: { start: 2, end: 3 } }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      const entry = data.files['cached-range.ts'];
      expect(entry.lines).toEqual(['line 2', 'line 3']);
      expect(entry.cache_hit).toBe(true);
      expect(entry.cache?.status).toBe('unchanged');
      expect(entry.cache?.unchanged_since_last_read).toBe(true);
      expect(entry.cache?.hash).toBeDefined();
    });

    it('probe returns freshness metadata with no content', async () => {
      await createTestFile('probe.ts', 'alpha\nbeta');
      await handlePrecisionRead({
        files: ['probe.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const result = await handlePrecisionRead({
        files: [{ path: 'probe.ts', probe: true }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      const entry = data.files['probe.ts'];
      expect(entry.content).toBeUndefined();
      expect(entry.lines).toBeUndefined();
      expect(entry.probe).toBe(true);
      expect(entry.cache_hit).toBe(true);
      expect(entry.cache?.status).toBe('unchanged');
      expect(entry.cache?.unchanged_since_last_read).toBe(true);
      expect(entry.cache?.hash).toBeDefined();
      expect(entry.line_count).toBe(2);
    });

    it('probe on an unread file reports status new with no content', async () => {
      await createTestFile('probe-new.ts', 'first sight');
      const result = await handlePrecisionRead({
        files: [{ path: 'probe-new.ts', probe: true }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      const entry = data.files['probe-new.ts'];
      expect(entry.content).toBeUndefined();
      expect(entry.probe).toBe(true);
      expect(entry.cache?.status).toBe('new');
      expect(entry.cache?.hash).toBeDefined();
    });

    it('probe detects external modification', async () => {
      const fullPath = await createTestFile('probe-mod.ts', 'v1');
      await handlePrecisionRead({
        files: ['probe-mod.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      await fs.writeFile(fullPath, 'v2 changed', 'utf-8');
      const result = await handlePrecisionRead({
        files: [{ path: 'probe-mod.ts', probe: true }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      const entry = data.files['probe-mod.ts'];
      expect(entry.content).toBeUndefined();
      expect(entry.cache?.status).toBe('modified');
    });

    it('never reports tokens_saved', async () => {
      await createTestFile('no-credit.ts', 'no self crediting');
      await handlePrecisionRead({
        files: ['no-credit.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const result = await handlePrecisionRead({
        files: ['no-credit.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const parsed = expectSuccess<ReadData>(result);
      expect(JSON.stringify(parsed)).not.toContain('tokens_saved');
      expect(parsed.data!.files['no-credit.ts'].content).toBeDefined();
    });

    it('force bypasses cache metadata but still returns content', async () => {
      await createTestFile('force.ts', 'force content');
      await handlePrecisionRead({
        files: ['force.ts'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const result = await handlePrecisionRead({
        files: [{ path: 'force.ts', force: true }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['force.ts'].content).toContain('force content');
      expect(data.files['force.ts'].cache).toBeUndefined();
      expect(data.files['force.ts'].cache_hit).toBeUndefined();
    });
  });

  describe('extract lines honors include_line_numbers', () => {
    beforeEach(async () => {
      FileStateCache.resetInstance();
      await createTestFile('numbered.ts', 'alpha\nbeta\ngamma');
    });

    it('numbers lines when enabled, using the range start line', async () => {
      const result = await handlePrecisionRead({
        files: [{ path: 'numbered.ts', extract: 'lines', range: { start: 2, end: 3 } }],
        extract: 'content',
        output: { mode: 'standard', include_line_numbers: true },
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['numbered.ts'].lines).toEqual(['    2 | beta', '    3 | gamma']);
    });

    it('returns raw lines when disabled (default)', async () => {
      const result = await handlePrecisionRead({
        files: [{ path: 'numbered.ts', extract: 'lines' }],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      expect(data.files['numbered.ts'].lines).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('size gate UTF-8 safety', () => {
    it('does not split multi-byte characters or return a partial final line', async () => {
      FileStateCache.resetInstance();
      const line = 'é'.repeat(1000); // 2000 bytes per line (2-byte chars)
      const lineCount = 300; // > 512KB total, triggers the pre-read size gate
      await createTestFile('big-utf8.txt', Array.from({ length: lineCount }, () => line).join('\n'));
      const result = await handlePrecisionRead({
        files: ['big-utf8.txt'],
        extract: 'content',
        output: { mode: 'standard' },
      });
      const data = expectSuccess<ReadData>(result).data!;
      const entry = data.files['big-utf8.txt'];
      expect(entry.truncated).toBe(true);
      expect(entry.content).not.toContain('�');
      expect(entry.lines!.length).toBeGreaterThan(0);
      for (const l of entry.lines!) {
        expect(l).toBe(line);
      }
    });
  });
});
