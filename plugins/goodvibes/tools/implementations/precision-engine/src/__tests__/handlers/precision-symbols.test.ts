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
      expect(parsed.error).toContain("Missing required parameter 'mode'");
    });

    it('should return error when output is missing', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'workspace',
        query: 'test',
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'output'");
    });

    it('should return error for document mode without files', async () => {
      const result = await handlePrecisionSymbols({
        mode: 'document',
        output: { mode: 'names_only' },
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'files'");
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

  describe('Python support', () => {
    it('should extract symbols from Python files', async () => {
      await createTestFile('module.py', `
import os

# Constants
MAX_RETRY = 3

class DatabaseConnection:
    def __init__(self, host):
        self.host = host
    
    def connect(self):
        pass
    
    def _private_method(self):
        pass

def process_data(data):
    return data

async def async_fetch(url):
    return ""

class _PrivateClass:
    pass

def _private_function():
    pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['module.py'],
        output: { mode: 'signatures' },
      });

      const parsed = expectSuccess(result);
      const names = parsed.data.symbols.map((s: { name: string }) => s.name);
      
      // Should find classes and top-level functions
      expect(names).toContain('DatabaseConnection');
      expect(names).toContain('process_data');
      expect(names).toContain('async_fetch');
      
      // Should find dunder methods (not considered private)
      expect(names).toContain('__init__');
      
      // Private filtering: basic regex extractor finds all symbols
      // and relies on tree-sitter for proper scoping. For now, just verify
      // that at least public symbols are found.
      expect(parsed.data.summary.total_symbols).toBeGreaterThan(3);
    });

    it('should include private symbols when requested', async () => {
      await createTestFile('module.py', `
class MyClass:
    def _private_method(self):
        pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['module.py'],
        include_private: true,
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      const names = parsed.data.symbols.map((s: { name: string } | string) =>
        typeof s === 'string' ? s : s.name
      );
      expect(names).toContain('_private_method');
    });

    it('should filter Python symbols by kind', async () => {
      await createTestFile('module.py', `
class TestClass:
    pass

def test_function():
    pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['module.py'],
        kinds: ['class'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      expect(symbols.every((s: { kind: string } | string) => 
        typeof s === 'string' || s.kind === 'class'
      )).toBe(true);
    });

    it('should detect methods vs functions correctly', async () => {
      await createTestFile('methods.py', `
class MyClass:
    def instance_method(self):
        pass
    
    def another_method(self, arg):
        pass

def top_level_function():
    pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['methods.py'],
        output: { mode: 'full' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      
      const instanceMethod = symbols.find((s: { name: string }) => s.name === 'instance_method');
      const anotherMethod = symbols.find((s: { name: string }) => s.name === 'another_method');
      const topLevelFunc = symbols.find((s: { name: string }) => s.name === 'top_level_function');
      
      expect(instanceMethod?.kind).toBe('method');
      expect(anotherMethod?.kind).toBe('method');
      expect(topLevelFunc?.kind).toBe('function');
    });

    it('should set container field for class members', async () => {
      await createTestFile('containers.py', `
class OuterClass:
    def method_one(self):
        pass
    
    class InnerClass:
        def nested_method(self):
            pass

def standalone_function():
    pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['containers.py'],
        output: { mode: 'full' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      
      const methodOne = symbols.find((s: { name: string }) => s.name === 'method_one');
      const innerClass = symbols.find((s: { name: string }) => s.name === 'InnerClass');
      const nestedMethod = symbols.find((s: { name: string }) => s.name === 'nested_method');
      const standalone = symbols.find((s: { name: string }) => s.name === 'standalone_function');
      
      expect(methodOne?.container).toBe('OuterClass');
      expect(innerClass?.container).toBe('OuterClass');
      expect(nestedMethod?.container).toBe('InnerClass');
      expect(standalone?.container).toBeUndefined();
    });

    it('should distinguish dunder methods from name-mangled private', async () => {
      await createTestFile('privacy.py', `
class TestPrivacy:
    def __init__(self):
        pass
    
    def __str__(self):
        return "test"
    
    def __private_var(self):
        pass
    
    def _protected(self):
        pass
      `);

      const resultPublic = await handlePrecisionSymbols({
        mode: 'document',
        files: ['privacy.py'],
        include_private: false,
        output: { mode: 'names_only' },
      });

      const parsedPublic = expectSuccess(resultPublic);
      const publicNames = parsedPublic.data.symbols.map((s: { name: string } | string) =>
        typeof s === 'string' ? s : s.name
      );
      
      // Dunder methods should be included (public)
      expect(publicNames).toContain('__init__');
      expect(publicNames).toContain('__str__');
      
      // Name-mangled and single underscore should be excluded (private)
      expect(publicNames).not.toContain('__private_var');
      expect(publicNames).not.toContain('_protected');

      const resultPrivate = await handlePrecisionSymbols({
        mode: 'document',
        files: ['privacy.py'],
        include_private: true,
        output: { mode: 'names_only' },
      });

      const parsedPrivate = expectSuccess(resultPrivate);
      const privateNames = parsedPrivate.data.symbols.map((s: { name: string } | string) =>
        typeof s === 'string' ? s : s.name
      );
      
      // All should be included when include_private is true
      expect(privateNames).toContain('__init__');
      expect(privateNames).toContain('__private_var');
      expect(privateNames).toContain('_protected');
    });

    it('should not truncate signatures with type annotations', async () => {
      await createTestFile('annotations.py', `
def process_data(data: list[str], count: int = 10) -> dict[str, int]:
    pass

class Processor:
    def transform(self, items: list[dict[str, any]]) -> list[str]:
        pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['annotations.py'],
        output: { mode: 'signatures' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      
      const processData = symbols.find((s: { name: string }) => s.name === 'process_data');
      const transform = symbols.find((s: { name: string }) => s.name === 'transform');
      
      // Signatures should preserve type annotations (not truncated at first colon)
      expect(processData?.signature).toContain('list[str]');
      expect(processData?.signature).toContain('dict[str, int]');
      expect(transform?.signature).toContain('list[dict[str, any]]');
      expect(transform?.signature).toContain('list[str]');
    });

    it('should detect single-word constants', async () => {
      await createTestFile('constants.py', `
DEBUG = True
VERBOSE = False
MAX_RETRIES = 3
api_key = "secret"
lowercase = 42
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['constants.py'],
        kinds: ['constant'],
        output: { mode: 'names_only' },
      });

      const parsed = expectSuccess(result);
      const names = parsed.data.symbols.map((s: { name: string } | string) =>
        typeof s === 'string' ? s : s.name
      );
      
      // Single-word and multi-word constants
      expect(names).toContain('DEBUG');
      expect(names).toContain('VERBOSE');
      expect(names).toContain('MAX_RETRIES');
      
      // Lowercase should not be detected as constants
      expect(names).not.toContain('api_key');
      expect(names).not.toContain('lowercase');
    });

    it('should handle decorated functions', async () => {
      await createTestFile('decorators.py', `
class MyClass:
    @staticmethod
    def static_method():
        pass
    
    @classmethod
    def class_method(cls):
        pass
    
    @property
    def my_property(self):
        return 42
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['decorators.py'],
        output: { mode: 'full' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      const names = symbols.map((s: { name: string }) => s.name);
      
      // Decorated methods should still be detected
      expect(names).toContain('static_method');
      expect(names).toContain('class_method');
      expect(names).toContain('my_property');
      
      // Should be classified as methods with proper container
      const staticMethod = symbols.find((s: { name: string }) => s.name === 'static_method');
      expect(staticMethod?.kind).toBe('method');
      expect(staticMethod?.container).toBe('MyClass');
    });

    it('should handle nested scopes correctly', async () => {
      await createTestFile('nested.py', `
class Outer:
    def outer_method(self):
        def inner_function():
            pass
    
    class Inner:
        def inner_method(self):
            pass

def outer_function():
    def nested():
        pass
      `);

      const result = await handlePrecisionSymbols({
        mode: 'document',
        files: ['nested.py'],
        output: { mode: 'full' },
      });

      const parsed = expectSuccess(result);
      const symbols = parsed.data.symbols;
      
      const outerMethod = symbols.find((s: { name: string }) => s.name === 'outer_method');
      const innerClass = symbols.find((s: { name: string }) => s.name === 'Inner');
      const innerMethod = symbols.find((s: { name: string }) => s.name === 'inner_method');
      
      // outer_method should be a method of Outer
      expect(outerMethod?.kind).toBe('method');
      expect(outerMethod?.container).toBe('Outer');
      
      // Inner class should have Outer as container
      expect(innerClass?.kind).toBe('class');
      expect(innerClass?.container).toBe('Outer');
      
      // inner_method should be a method of Inner
      expect(innerMethod?.kind).toBe('method');
      expect(innerMethod?.container).toBe('Inner');
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
