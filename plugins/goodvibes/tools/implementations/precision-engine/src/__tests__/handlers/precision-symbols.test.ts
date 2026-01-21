/**
 * Tests for precision_symbols handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrecisionSymbols } from '../../handlers/precision-symbols.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, SAMPLE_TS_CODE } from '../test-utils.js';

describe('precision_symbols handler', () => {
  describe('input validation', () => {
    it('should return error when mode is missing', async () => {
      const result = await handlePrecisionSymbols({
        output: { mode: 'names_only' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain('mode is required');
    });

    it('should return error when output is missing', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'test',
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain('output configuration is required');
    });

    it('should return error for document mode without files', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'document',
        output: { mode: 'names_only' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain('files array is required');
    });
  });

  describe('workspace mode', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should find symbols by query', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should filter by kinds', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        kinds: ['class'],
        output: { mode: 'locations' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      expect(symbols.every((s: { kind: string }) => s.kind === 'class')).toBe(true);
    });

    it('should filter by exported_only', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: '',
        exported_only: true,
        output: { mode: 'full' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      expect(symbols.every((s: { exported: boolean }) => s.exported)).toBe(true);
    });

    it('should include private when requested', async () => {
      await createTestFile('private.ts', `
        class MyClass {
          private privateMethod() {}
          public publicMethod() {}
        }
      `);

      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Method',
        include_private: true,
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      const names = parsed.data.symbols.map((s: { name: string } | string) =>
        typeof s === 'string' ? s : s.name
      );
      expect(names).toContain('privateMethod');
    });
  });

  describe('document mode', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should analyze specific files', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['sample.ts'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should analyze multiple files', async () => {
      await createTestFile('other.ts', 'export function otherFunc() {}');

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['sample.ts', 'other.ts'],
        output: { mode: 'locations' },
      });

      const parsed = expectSuccess(result);
      const files = new Set(parsed.data.symbols.map((s: { file: string }) => s.file));
      expect(files.size).toBe(2);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should return count_only output', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'count_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary).toBeDefined();
      expect(parsed.data.summary.total_symbols).toBeGreaterThan(0);
      expect(parsed.data.summary.by_kind).toBeDefined();
      expect(parsed.data.symbols).toBeUndefined();
    });

    it('should return names_only output', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols[0]).toHaveProperty('name');
      expect(parsed.data.symbols[0]).toHaveProperty('kind');
      expect(parsed.data.symbols[0]).not.toHaveProperty('file');
    });

    it('should return locations output', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'locations' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols[0]).toHaveProperty('name');
      expect(parsed.data.symbols[0]).toHaveProperty('kind');
      expect(parsed.data.symbols[0]).toHaveProperty('file');
      expect(parsed.data.symbols[0]).toHaveProperty('line');
      expect(parsed.data.symbols[0]).toHaveProperty('column');
    });

    it('should return signatures output', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'signatures' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols[0]).toHaveProperty('signature');
    });

    it('should return full output', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'full' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols[0]).toHaveProperty('name');
      expect(parsed.data.symbols[0]).toHaveProperty('kind');
      expect(parsed.data.symbols[0]).toHaveProperty('file');
      expect(parsed.data.symbols[0]).toHaveProperty('line');
      expect(parsed.data.symbols[0]).toHaveProperty('signature');
      expect(parsed.data.symbols[0]).toHaveProperty('exported');
    });
  });

  describe('grouping', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'export function func1() {}\nexport class Class1 {}',
        'file2.ts': 'export function func2() {}',
      });
    });

    it('should group by file', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: '',
        output: { mode: 'locations', group_by: 'file' },
      });

      const parsed = expectSuccess(result);
      expect(typeof parsed.data.symbols).toBe('object');
      expect(Array.isArray(parsed.data.symbols)).toBe(false);
    });

    it('should group by kind', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: '',
        output: { mode: 'locations', group_by: 'kind' },
      });

      const parsed = expectSuccess(result);
      expect(typeof parsed.data.symbols).toBe('object');
      expect(Array.isArray(parsed.data.symbols)).toBe(false);
    });

    it('should return flat list when group_by is none', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: '',
        output: { mode: 'locations', group_by: 'none' },
      });

      const parsed = expectSuccess(result);
      expect(Array.isArray(parsed.data.symbols)).toBe(true);
    });
  });

  describe('limits', () => {
    beforeEach(async () => {
      // Create files with many symbols
      const funcs = Array.from({ length: 50 }, (_, i) => `export function func${i}() {}`).join('\n');
      await createTestFile('many.ts', funcs);
    });

    it('should respect max_results limit', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'func',
        output: { mode: 'names_only', max_results: 10 },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeLessThanOrEqual(10);
    });
  });

  describe('symbol kinds', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should find functions', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'sampleFunction',
        kinds: ['function'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should find classes', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'SampleClass',
        kinds: ['class'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should find interfaces', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'SampleInterface',
        kinds: ['interface'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should find types', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'SampleType',
        kinds: ['type'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should find enums', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'SampleEnum',
        kinds: ['enum'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should find methods', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'getValue',
        kinds: ['method'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('summary', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should include total_symbols', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_symbols).toBeGreaterThan(0);
    });

    it('should include by_kind breakdown', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: '',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.by_kind).toBeDefined();
      expect(typeof parsed.data.summary.by_kind).toBe('object');
    });

    it('should include files_searched', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.files_searched).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle no matching symbols', async () => {
      await createTestFile('empty.ts', '// just a comment');

      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'nonexistent',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols).toHaveLength(0);
    });

    it('should handle empty query (find all)', async () => {
      await createTestFile('simple.ts', 'export function foo() {}');

      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: '',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.symbols.length).toBeGreaterThan(0);
    });

    it('should handle JSX files', async () => {
      await createTestFile('Component.tsx', `
        export interface Props { name: string; }
        export function Component(props: Props) {
          return <div>{props.name}</div>;
        }
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['Component.tsx'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      const names = parsed.data.symbols.map((s: { name: string } | string) =>
        typeof s === 'string' ? s : s.name
      );
      expect(names).toContain('Component');
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should include tokens_used', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'Sample',
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
