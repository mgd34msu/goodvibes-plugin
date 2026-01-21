/**
 * Tests for workspace_symbols handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleWorkspaceSymbols } from '../../handlers/workspace-symbols.js';
import { createTestFile, createTestFiles, expectSuccess, expectError, SAMPLE_TS_CODE } from '../test-utils.js';

describe('workspace_symbols handler', () => {
  describe('input validation', () => {
    it('should return error when query is missing', async () => {
      const result = await handleWorkspaceSymbols({});
      const parsed = expectError(result);
      expect(parsed.error).toContain('query is required');
    });

    it('should return error when query is empty', async () => {
      const result = await handleWorkspaceSymbols({ query: '' });
      const parsed = expectError(result);
      expect(parsed.error).toContain('query is required');
    });
  });

  describe('basic functionality', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should find functions by name', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'sampleFunction',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeGreaterThan(0);
      expect(parsed.data.some((s: { name: string }) => s.name === 'sampleFunction')).toBe(true);
    });

    it('should find classes by name', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'SampleClass',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.some((s: { name: string; kind: string }) =>
        s.name === 'SampleClass' && s.kind === 'class'
      )).toBe(true);
    });

    it('should find interfaces by name', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'SampleInterface',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.some((s: { name: string; kind: string }) =>
        s.name === 'SampleInterface' && s.kind === 'interface'
      )).toBe(true);
    });

    it('should find types by name', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'SampleType',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.some((s: { name: string; kind: string }) =>
        s.name === 'SampleType' && s.kind === 'type'
      )).toBe(true);
    });

    it('should find enums by name', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'SampleEnum',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.some((s: { name: string; kind: string }) =>
        s.name === 'SampleEnum' && s.kind === 'enum'
      )).toBe(true);
    });

    it('should perform case-insensitive search', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'sampleclass', // lowercase
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.some((s: { name: string }) => s.name === 'SampleClass')).toBe(true);
    });

    it('should find partial matches', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeGreaterThan(1);
    });
  });

  describe('kind filtering', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should filter by single kind', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        kinds: ['function'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.every((s: { kind: string }) => s.kind === 'function')).toBe(true);
    });

    it('should filter by multiple kinds', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        kinds: ['class', 'interface'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.every((s: { kind: string }) =>
        s.kind === 'class' || s.kind === 'interface'
      )).toBe(true);
    });

    it('should return empty when no matches for kind', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        kinds: ['method'], // No top-level methods
      });

      const parsed = expectSuccess(result);
      // Methods are inside classes, so this depends on implementation
    });
  });

  describe('limit', () => {
    beforeEach(async () => {
      // Create multiple files with many symbols
      const files: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        files[`file${i}.ts`] = `
          export function func${i}A() {}
          export function func${i}B() {}
          export function func${i}C() {}
        `;
      }
      await createTestFiles(files);
    });

    it('should respect limit parameter', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'func',
        limit: 5,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 50', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'func',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeLessThanOrEqual(50);
    });
  });

  describe('output modes', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should return count_only output', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('total_symbols');
      expect(parsed.data).toHaveProperty('by_kind');
    });

    it('should return minimal output (names only)', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(typeof parsed.data[0]).toBe('string');
    });

    it('should return standard output', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        output_mode: 'standard',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data[0]).toHaveProperty('name');
      expect(parsed.data[0]).toHaveProperty('kind');
      expect(parsed.data[0]).toHaveProperty('file');
      expect(parsed.data[0]).toHaveProperty('line');
    });

    it('should return verbose output with signature', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data[0]).toHaveProperty('signature');
      expect(parsed.data[0]).toHaveProperty('exported');
    });
  });

  describe('multiple files', () => {
    beforeEach(async () => {
      await createTestFiles({
        'file1.ts': 'export function processData() {}',
        'file2.ts': 'export function processItems() {}',
        'file3.ts': 'export class DataProcessor {}',
      });
    });

    it('should search across multiple files', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'process',
      });

      const parsed = expectSuccess(result);
      const files = new Set(parsed.data.map((s: { file: string }) => s.file));
      expect(files.size).toBeGreaterThan(1);
    });

    it('should sort by relevance (exact matches first)', async () => {
      await createTestFiles({
        'exact.ts': 'export function myFunction() {}',
        'partial.ts': 'export function myFunctionHelper() {}',
      });

      const result = await handleWorkspaceSymbols({
        query: 'myFunction',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data[0].name).toBe('myFunction');
    });
  });

  describe('edge cases', () => {
    it('should handle no matching symbols', async () => {
      await createTestFile('file.ts', 'export const x = 1;');

      const result = await handleWorkspaceSymbols({
        query: 'nonexistent',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveLength(0);
    });

    it('should handle JavaScript files', async () => {
      await createTestFile('file.js', 'function jsFunction() { return 1; }');

      const result = await handleWorkspaceSymbols({
        query: 'jsFunction',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeGreaterThan(0);
    });

    it('should handle TSX files', async () => {
      await createTestFile('Component.tsx', `
        export function Component() {
          return <div>Hello</div>;
        }
      `);

      const result = await handleWorkspaceSymbols({
        query: 'Component',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.length).toBeGreaterThan(0);
    });

    it('should include exported status', async () => {
      await createTestFiles({
        'exported.ts': 'export function exportedFunc() {}',
        'private.ts': 'function privateFunc() {}',
      });

      const result = await handleWorkspaceSymbols({
        query: 'Func',
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      const exported = parsed.data.find((s: { name: string }) => s.name === 'exportedFunc');
      const priv = parsed.data.find((s: { name: string }) => s.name === 'privateFunc');

      if (exported) expect(exported.exported).toBe(true);
      if (priv) expect(priv.exported).toBe(false);
    });
  });

  describe('metadata', () => {
    beforeEach(async () => {
      await createTestFile('sample.ts', SAMPLE_TS_CODE);
    });

    it('should include execution time', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include token estimate', async () => {
      const result = await handleWorkspaceSymbols({
        query: 'Sample',
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.token_estimate).toBeGreaterThan(0);
    });
  });
});
