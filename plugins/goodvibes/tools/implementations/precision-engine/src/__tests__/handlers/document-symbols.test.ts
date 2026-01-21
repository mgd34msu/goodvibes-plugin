/**
 * Tests for get_document_symbols handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleGetDocumentSymbols } from '../../handlers/document-symbols.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, SAMPLE_TS_CODE } from '../test-utils.js';

describe('get_document_symbols handler', () => {
  describe('input validation', () => {
    it('should return error when files array is missing', async () => {
      const result = await handleGetDocumentSymbols({});
      const parsed = expectError(result);
      expect(parsed.error).toContain('files array is required');
    });

    it('should return error when files array is empty', async () => {
      const result = await handleGetDocumentSymbols({ files: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain('files array is required');
    });
  });

  describe('basic functionality', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should extract symbols from a single file', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].file).toBe('sample.ts');
      expect(parsed.data[0].symbols.length).toBeGreaterThan(0);
    });

    it('should find class symbols', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      const classSymbol = symbols.find((s: { name: string; kind: string }) =>
        s.name === 'SampleClass' && s.kind === 'class'
      );
      expect(classSymbol).toBeDefined();
    });

    it('should find interface symbols', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      const interfaceSymbol = symbols.find((s: { name: string; kind: string }) =>
        s.name === 'SampleInterface' && s.kind === 'interface'
      );
      expect(interfaceSymbol).toBeDefined();
    });

    it('should find function symbols', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      const funcSymbol = symbols.find((s: { name: string; kind: string }) =>
        s.name === 'sampleFunction' && s.kind === 'function'
      );
      expect(funcSymbol).toBeDefined();
    });

    it('should find enum symbols', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      const enumSymbol = symbols.find((s: { name: string; kind: string }) =>
        s.name === 'SampleEnum' && s.kind === 'enum'
      );
      expect(enumSymbol).toBeDefined();
    });

    it('should include line numbers', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      expect(symbols[0]).toHaveProperty('line');
      expect(symbols[0].line).toBeGreaterThan(0);
    });
  });

  describe('hierarchical symbols', () => {
    beforeEach(async () => {
      await createTestFile('class.ts', `
        export class MyClass {
          private value: number;

          constructor() {
            this.value = 0;
          }

          public getValue(): number {
            return this.value;
          }

          private helper(): void {}
        }
      `);
    });

    it('should nest methods under class', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['class.ts'],
      });

      const parsed = expectSuccess(result);
      const classSymbol = parsed.data[0].symbols.find((s: { name: string; kind: string }) =>
        s.name === 'MyClass' && s.kind === 'class'
      );

      expect(classSymbol).toBeDefined();
      expect(classSymbol.children).toBeDefined();
      expect(classSymbol.children.length).toBeGreaterThan(0);
    });

    it('should include method children', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['class.ts'],
      });

      const parsed = expectSuccess(result);
      const classSymbol = parsed.data[0].symbols.find((s: { name: string }) =>
        s.name === 'MyClass'
      );

      const childNames = classSymbol.children.map((c: { name: string }) => c.name);
      expect(childNames).toContain('getValue');
    });
  });

  describe('kind filtering', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should filter by single kind', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
        kind_filter: ['function'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      expect(symbols.every((s: { kind: string }) => s.kind === 'function')).toBe(true);
    });

    it('should filter by multiple kinds', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
        kind_filter: ['class', 'interface'],
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data[0].symbols;
      expect(symbols.every((s: { kind: string }) =>
        s.kind === 'class' || s.kind === 'interface'
      )).toBe(true);
    });
  });

  describe('multiple files', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'export function func1() {}',
        'file2.ts': 'export class Class2 {}',
      });
    });

    it('should process multiple files', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['file1.ts', 'file2.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(2);
    });

    it('should include file path in each result', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['file1.ts', 'file2.ts'],
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.map((r: { file: string }) => r.file);
      expect(files).toContain('file1.ts');
      expect(files).toContain('file2.ts');
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should return count_only output', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('total_symbols');
      expect(parsed.data).toHaveProperty('files_processed');
    });

    it('should return minimal output (names only)', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0]).toHaveProperty('file');
      expect(parsed.data[0]).toHaveProperty('symbols');
      expect(typeof parsed.data[0].symbols[0]).toBe('string');
    });

    it('should return standard output with full structure', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
        output_mode: 'standard',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].symbols[0]).toHaveProperty('name');
      expect(parsed.data[0].symbols[0]).toHaveProperty('kind');
      expect(parsed.data[0].symbols[0]).toHaveProperty('line');
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent file', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['nonexistent.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].error).toBeDefined();
    });

    it('should handle empty file', async () => {
      await createTestFile('empty.ts', '');

      const result = await handleGetDocumentSymbols({
        files: ['empty.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].symbols).toHaveLength(0);
    });

    it('should handle file with only comments', async () => {
      await createTestFile('comments.ts', `
        // This is a comment
        /* This is a block comment */
        /**
         * JSDoc comment
         */
      `);

      const result = await handleGetDocumentSymbols({
        files: ['comments.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].symbols).toHaveLength(0);
    });

    it('should handle JSX/TSX files', async () => {
      await createTestFile('Component.tsx', `
        interface Props {
          name: string;
        }

        export function Component(props: Props) {
          return <div>{props.name}</div>;
        }
      `);

      const result = await handleGetDocumentSymbols({
        files: ['Component.tsx'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].symbols.length).toBeGreaterThan(0);
    });

    it('should handle JavaScript files', async () => {
      await createTestFile('file.js', `
        function jsFunction() {
          return 1;
        }

        class JsClass {
          method() {}
        }
      `);

      const result = await handleGetDocumentSymbols({
        files: ['file.js'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].symbols.length).toBeGreaterThan(0);
    });

    it('should include signature for symbols', async () => {
      await createTestFile('func.ts', 'export function myFunc(a: number, b: string): boolean { return true; }');

      const result = await handleGetDocumentSymbols({
        files: ['func.ts'],
      });

      const parsed = expectSuccess(result);
      const func = parsed.data[0].symbols.find((s: { name: string }) => s.name === 'myFunc');
      expect(func.signature).toBeDefined();
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should include execution time', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include token estimate', async () => {
      const result = await handleGetDocumentSymbols({
        files: ['sample.ts'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.token_estimate).toBeGreaterThan(0);
    });
  });
});
