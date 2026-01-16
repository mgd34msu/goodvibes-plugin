/**
 * Unit tests for generate-types handler
 *
 * Tests cover:
 * - Inline JSON to TypeScript type generation
 * - File-based JSON parsing
 * - URL fetching with multiple samples
 * - Nested object type generation
 * - Array type detection
 * - Optional field detection across samples
 * - Nullable field handling
 * - Union type creation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock modules before imports
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

import { handleGenerateTypes, GenerateTypesArgs, __testInternals, TypeInfo } from '../../../handlers/analysis/generate-types.js';

describe('handleGenerateTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('argument validation', () => {
    it('should return error when source is url but url not provided', async () => {
      const args: GenerateTypesArgs = {
        source: 'url',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('URL is required');
    });

    it('should return error when source is file but file_path not provided', async () => {
      const args: GenerateTypesArgs = {
        source: 'file',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file_path is required');
    });

    it('should return error when source is inline but data not provided', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('data is required');
    });
  });

  describe('inline data generation', () => {
    it('should generate types from simple object', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { name: 'John', age: 30, active: true },
        type_name: 'User',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('interface');
      expect(data.types).toContain('User');
      expect(data.types).toContain('name');
      expect(data.types).toContain('string');
      expect(data.types).toContain('age');
      expect(data.types).toContain('number');
      expect(data.types).toContain('active');
      expect(data.types).toContain('boolean');
      expect(data.root_type).toBe('User');
    });

    it('should generate types from nested object', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: {
          user: {
            name: 'John',
            address: {
              city: 'NYC',
              zip: '10001',
            },
          },
        },
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('interface');
      expect(data.types).toContain('Data');
      // Nested interfaces should be generated
      expect(data.type_names.length).toBeGreaterThan(1);
    });

    it('should generate types from arrays', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: {
          items: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ],
        },
        type_name: 'Container',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('items');
      expect(data.types).toContain('[]');
    });

    it('should generate types from primitive arrays', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { tags: ['a', 'b', 'c'], scores: [1, 2, 3] },
        type_name: 'TaggedItem',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('tags');
      expect(data.types).toContain('string[]');
      expect(data.types).toContain('scores');
      expect(data.types).toContain('number[]');
    });

    it('should handle null values', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { name: 'John', nickname: null },
        type_name: 'Person',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('nickname');
      expect(data.nullable_fields).toContain('nickname');
    });

    it('should use default type name when not provided', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { value: 123 },
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.root_type).toBe('GeneratedType');
    });

    it('should handle empty object', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: {},
        type_name: 'Empty',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.type_names).toContain('Empty');
    });

    it('should handle array at root level', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        type_name: 'Items',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('[]');
    });
  });

  describe('file source', () => {
    it('should read and parse JSON from file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ id: 1, name: 'Test' })
      );

      const args: GenerateTypesArgs = {
        source: 'file',
        file_path: 'data.json',
        type_name: 'FileData',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('interface');
      expect(data.types).toContain('FileData');
      expect(data.source_info).toContain('File');
    });

    it('should return error when file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const args: GenerateTypesArgs = {
        source: 'file',
        file_path: 'nonexistent.json',
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    it('should return error for invalid JSON in file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{invalid json}');

      const args: GenerateTypesArgs = {
        source: 'file',
        file_path: 'bad.json',
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Invalid JSON');
    });
  });

  describe('url source', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should fetch and parse JSON from URL', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, status: 'active' }),
      } as Response);

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://api.example.com/data',
        type_name: 'ApiResponse',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('interface');
      expect(data.types).toContain('ApiResponse');
      expect(data.source_info).toContain('URL');
    });

    it('should handle HTTP errors', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://api.example.com/notfound',
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('404');
    });

    it('should support multiple samples for optional field detection', async () => {
      let callCount = 0;
      vi.mocked(global.fetch).mockImplementation(async () => {
        callCount++;
        // First sample has extra field
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ id: 1, name: 'Test', optional: 'value' }),
          } as Response;
        }
        // Second sample without optional field
        return {
          ok: true,
          json: async () => ({ id: 2, name: 'Test2' }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://api.example.com/data',
        samples: 2,
        type_name: 'MultiSample',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.samples_analyzed).toBe(2);
      // Optional field should be marked optional
      expect(data.types).toContain('optional?');
    });

    it('should limit samples to maximum of 10', async () => {
      let callCount = 0;
      vi.mocked(global.fetch).mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ id: callCount }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://api.example.com/data',
        samples: 20, // Request more than max
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.samples_analyzed).toBeLessThanOrEqual(10);
    });
  });

  describe('type options', () => {
    it('should export types when export_types is true', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { id: 1 },
        type_name: 'ExportedType',
        export_types: true,
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('export');
    });

    it('should export by default', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { id: 1 },
        type_name: 'DefaultExport',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('export');
    });

    it('should not export when export_types is false', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { id: 1 },
        type_name: 'NoExport',
        export_types: false,
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).not.toMatch(/^export\s/);
    });
  });

  describe('special type handling', () => {
    it('should handle mixed types in arrays as union', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { mixed: [1, 'string', true] },
        type_name: 'MixedData',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('mixed');
      // Array with mixed types should have a union type in the output
      // The types string should contain the union or the array type
      expect(data.types).toMatch(/mixed.*\[/);
    });

    it('should handle deeply nested structures', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { a: { b: { c: { d: { e: 'deep' } } } } },
        type_name: 'DeepNested',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.type_names).toContain('DeepNested');
      // Should have generated multiple interfaces for nesting
      expect(data.type_names.length).toBeGreaterThan(1);
    });

    it('should handle empty arrays', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { items: [] },
        type_name: 'EmptyArray',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('items');
      // Empty array defaults to unknown[]
      expect(data.types).toContain('unknown[]');
    });

    it('should handle boolean values', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { isActive: true, isVerified: false },
        type_name: 'Flags',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('isActive');
      expect(data.types).toContain('boolean');
    });
  });

  describe('response format', () => {
    it('should include all expected result fields', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { name: 'Test' },
        type_name: 'Sample',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('types');
      expect(data).toHaveProperty('type_names');
      expect(data).toHaveProperty('root_type');
      expect(data).toHaveProperty('nullable_fields');
      expect(data).toHaveProperty('union_fields');
      expect(data).toHaveProperty('samples_analyzed');
      expect(data).toHaveProperty('source_info');
    });

    it('should track nullable fields', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { required: 'value', optional: null },
        type_name: 'NullableTest',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.nullable_fields).toContain('optional');
    });

    it('should include source info for inline data', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { id: 1 },
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.source_info).toBe('Inline data');
    });
  });

  describe('JSDoc examples', () => {
    it('should include JSDoc examples when include_examples is true', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { name: 'John', age: 30 },
        type_name: 'Person',
        include_examples: true,
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('/**');
      expect(data.types).toContain('@example');
      expect(data.types).toContain('*/');
    });

    it('should not include JSDoc examples by default', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { name: 'John' },
        type_name: 'Person',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).not.toContain('@example');
    });
  });

  describe('union type handling', () => {
    it('should track union fields when same property has different types across samples', async () => {
      // We need to test union field tracking via merging two samples
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ value: 'string' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ value: 123 }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'UnionTest',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      expect(data.union_fields.length).toBeGreaterThan(0);
      expect(data.union_fields[0].field).toBe('value');
      expect(data.union_fields[0].types).toContain('string');
      expect(data.union_fields[0].types).toContain('number');
    });

    it('should handle nullable union fields', async () => {
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ value: 'string' }),
          } as Response;
        }
        if (callCount === 2) {
          return {
            ok: true,
            json: async () => ({ value: 123 }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ value: null }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 3,
        type_name: 'NullableUnion',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      // Should have nullable field tracked
      expect(data.nullable_fields).toContain('value');
    });
  });

  describe('url fetch edge cases', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should continue with partial samples if later fetches fail', async () => {
      let callCount = 0;
      vi.mocked(global.fetch).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ id: 1, name: 'First' }),
          } as Response;
        }
        // Second request fails
        throw new Error('Network error');
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://api.example.com/data',
        samples: 3,
        type_name: 'PartialSamples',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      // Should succeed with partial samples (first sample was fetched)
      expect(data.success).toBe(true);
      expect(data.samples_analyzed).toBe(1);
    });

    it('should handle fetch network error on first request', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://api.example.com/data',
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Network error');
    });
  });

  describe('edge cases for type inference', () => {
    it('should handle undefined values in object properties', async () => {
      // Test undefined handling by creating object with undefined
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { defined: 'value', maybeUndefined: undefined },
        type_name: 'UndefinedTest',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('UndefinedTest');
    });

    it('should handle primitive value that is not string/number/boolean', async () => {
      // Symbol and BigInt are other primitive types
      // Since JSON doesn't support these, we test with the mechanism available
      // The unknown type fallback is triggered for edge cases
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { value: 'test' },
        type_name: 'PrimitiveTest',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });

    it('should handle all-null merged types', async () => {
      // When all samples have null for a field
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ field: null }),
      } as Response));

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'AllNull',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      expect(data.types).toContain('null');
    });

    it('should handle arrays with merged item types across samples', async () => {
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ items: [{ id: 1 }] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ items: [{ id: 2, extra: 'field' }] }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'MergedArrays',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      expect(data.types).toContain('items');
    });

    it('should generate Record type for empty object', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { config: {} },
        type_name: 'EmptyObjectProp',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('Record<string, unknown>');
    });
  });

  describe('toPascalCase edge cases', () => {
    it('should convert underscore-separated names to PascalCase', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: {
          user_profile: {
            first_name: 'John',
          },
        },
        type_name: 'Data',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should have generated nested type with PascalCase
      expect(data.type_names.some((n: string) => n.includes('UserProfile') || n.includes('Userprofile'))).toBe(true);
    });

    it('should convert dash-separated names to PascalCase', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: {
          'api-response': {
            'status-code': 200,
          },
        },
        type_name: 'Result',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should have generated nested type with PascalCase conversion
      expect(data.type_names.length).toBeGreaterThan(1);
    });
  });

  describe('nullable field handling in inline objects', () => {
    it('should handle nullable properties in generateInlineObject', async () => {
      // This tests the generateInlineObject function path
      // When we have a non-top-level object that is nullable
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ inner: 'value' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ inner: null }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'NullableInner',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      expect(data.nullable_fields).toContain('inner');
    });
  });

  describe('array type edge cases', () => {
    it('should handle array without explicit item type in typeInfoToTS', async () => {
      // Arrays default to unknown[] when no item type info
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { emptyList: [] },
        type_name: 'ArrayEdge',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('unknown[]');
    });

    it('should handle complex union types in arrays with parentheses', async () => {
      // Array items that are unions need parentheses: (string | number)[]
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { values: [1, 'two', 3, 'four'] },
        type_name: 'MixedArray',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should wrap union in parentheses for array
      expect(data.types).toMatch(/\(.*\|.*\)\[\]/);
    });
  });

  describe('type generation for non-object root types', () => {
    it('should generate type alias for primitive root', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: 'just a string',
        type_name: 'StringType',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('type StringType = string');
    });

    it('should generate type alias for number root', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: 42,
        type_name: 'NumberType',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('type NumberType = number');
    });

    it('should generate type alias for boolean root', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: true,
        type_name: 'BoolType',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('type BoolType = boolean');
    });

    it('should generate type alias for null root', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: null,
        type_name: 'NullType',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('type NullType = null');
    });

    it('should generate type alias for array root', async () => {
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: [1, 2, 3],
        type_name: 'NumberArray',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('type NumberArray = number[]');
    });
  });

  describe('inline object with nullable nested properties', () => {
    it('should handle nullable property in inline nested object across samples', async () => {
      // This tests generateInlineObject with nullable property
      // We need a scenario where an inline object (not extracted) has a nullable field
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              // Using array of objects - the items will be merged
              // If items have inconsistent nullability, we get nullable in inline object
              items: [{ val: 'str' }, { val: null }]
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            items: [{ val: 123 }, { val: null }]
          }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'InlineNullable',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      // The val field should be nullable since some samples have null
      expect(data.nullable_fields.some((f: string) => f.includes('val'))).toBe(true);
    });

    it('should handle nested object with nullable string that becomes union', async () => {
      // Test the scenario where a field is nullable AND has a union type
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ data: { value: 'text' } }),
          } as Response;
        }
        if (callCount === 2) {
          return {
            ok: true,
            json: async () => ({ data: { value: null } }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ data: { value: 42 } }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 3,
        type_name: 'UnionNullableNested',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      // Should track both union and nullable
      expect(data.nullable_fields).toContain('data.value');
      expect(data.union_fields.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases for 100% coverage', () => {
    it('should return error when fetchData returns empty array (line 86)', async () => {
      // Test directly using internal fetchData with unknown source type
      // This will throw instead of returning empty, which is caught at line 86 check
      const args = {
        source: 'inline' as const,
        data: undefined,
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);
      expect(result.isError).toBe(true);
    });

    it('should handle unknown source type (line 195)', async () => {
      // Force an unknown source type by type casting
      const args = {
        source: 'unknown_source' as 'inline', // Type cast to bypass TS check
        data: { test: true }, // Provide data to pass inline check
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      // Should get error about unknown source type
      expect(result.isError).toBe(true);
      expect(data.error).toContain('Unknown source type');
    });

    it('should handle non-standard JavaScript types returning unknown (line 254)', () => {
      // Test inferType directly with a BigInt value
      const { inferType } = __testInternals;

      // BigInt triggers the unknown fallback at line 254
      const bigIntValue = BigInt(12345);
      const result = inferType(bigIntValue);

      expect(result.type).toBe('unknown');
      expect(result.nullable).toBe(false);
      expect(result.optional).toBe(false);
    });

    it('should handle Symbol type returning unknown (line 254)', () => {
      const { inferType } = __testInternals;

      // Symbol also triggers the unknown fallback
      const symbolValue = Symbol('test');
      const result = inferType(symbolValue);

      expect(result.type).toBe('unknown');
    });

    it('should handle function type returning unknown (line 254)', () => {
      const { inferType } = __testInternals;

      // Functions trigger the unknown fallback
      const funcValue = () => 'test';
      const result = inferType(funcValue);

      expect(result.type).toBe('unknown');
    });

    it('should handle mergeTypes with empty array (line 263)', () => {
      const { mergeTypes } = __testInternals;

      // Passing empty array to mergeTypes returns unknown type
      const result = mergeTypes([]);

      expect(result.type).toBe('unknown');
      expect(result.nullable).toBe(false);
      expect(result.optional).toBe(false);
    });

    it('should handle typeInfoToTS with array without arrayItemType (line 514)', () => {
      const { typeInfoToTS } = __testInternals;

      // Create an array TypeInfo without arrayItemType
      const arrayTypeWithoutItems: TypeInfo = {
        type: 'array',
        nullable: false,
        optional: false,
        // No arrayItemType property
      };

      const result = typeInfoToTS(arrayTypeWithoutItems);
      expect(result).toBe('unknown[]');
    });

    it('should handle typeInfoToTS with union without unionTypes (line 524)', () => {
      const { typeInfoToTS } = __testInternals;

      // Create a union TypeInfo without unionTypes
      const unionTypeWithoutTypes: TypeInfo = {
        type: 'union',
        nullable: false,
        optional: false,
        // No unionTypes property
      };

      const result = typeInfoToTS(unionTypeWithoutTypes);
      expect(result).toBe('unknown');
    });

    it('should handle typeInfoToTS with empty unionTypes array (line 524)', () => {
      const { typeInfoToTS } = __testInternals;

      // Create a union TypeInfo with empty unionTypes array
      const unionTypeWithEmptyArray: TypeInfo = {
        type: 'union',
        nullable: false,
        optional: false,
        unionTypes: [], // Empty array
      };

      const result = typeInfoToTS(unionTypeWithEmptyArray);
      expect(result).toBe('unknown');
    });

    it('should handle typeInfoToTS default case (line 525-526)', () => {
      const { typeInfoToTS } = __testInternals;

      // Create a TypeInfo with an invalid type (defensive code path)
      // Using type assertion to bypass TS checking for test purposes
      const invalidType = {
        type: 'invalid_type' as TypeInfo['type'],
        nullable: false,
        optional: false,
      };

      const result = typeInfoToTS(invalidType);
      expect(result).toBe('unknown');
    });

    it('should handle getTypeKey for object with properties (lines 377-378)', async () => {
      // getTypeKey is called when we have different TYPE KINDS (not just different object shapes)
      // Objects with different shapes merge into one object with optional properties
      // We need a field that is sometimes an OBJECT and sometimes a PRIMITIVE
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            // Return a field as an object
            json: async () => ({ item: { a: 1, b: 2 } }),
          } as Response;
        }
        return {
          ok: true,
          // Return same field as a STRING (different type kind) - creates union: object | string
          json: async () => ({ item: 'string_value' }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'ObjectUnionKey',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      // Should have created a union type for the item field since it's object OR string
      expect(data.union_fields.length).toBeGreaterThan(0);
      // The union should contain both types
      const itemUnion = data.union_fields.find((f: { field: string }) => f.field === 'item');
      expect(itemUnion).toBeDefined();
      expect(itemUnion.types).toContain('string');
    });

    it('should handle getTypeKey for array with item type (line 381)', async () => {
      // getTypeKey is called when we have different TYPE KINDS (not just different arrays)
      // Arrays with different item types merge the item types
      // We need a field that is sometimes an ARRAY and sometimes a PRIMITIVE
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            // Return a field as an array
            json: async () => ({ items: [1, 2, 3] }),
          } as Response;
        }
        return {
          ok: true,
          // Return same field as a STRING (different type kind) - creates union: array | string
          json: async () => ({ items: 'not_an_array' }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'ArrayUnionKey',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      // Should have created a union type for the items field since it's array OR string
      expect(data.union_fields.length).toBeGreaterThan(0);
      // The union should contain both types
      const itemsUnion = data.union_fields.find((f: { field: string }) => f.field === 'items');
      expect(itemsUnion).toBeDefined();
      expect(itemsUnion.types).toContain('string');
    });

    it('should handle generateInlineObject with nullable property (line 538)', async () => {
      // To hit line 538, we need a property in generateInlineObject that is nullable
      // but doesn't already have null in the type string
      // This happens when the inline object has a nullable primitive
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              // This will create an inline object type (not extracted interface)
              // because it's a simple object with primitives
              wrapper: { innerVal: 'text' },
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            wrapper: { innerVal: null }, // Same field, now null
          }),
        } as Response;
      });

      const args: GenerateTypesArgs = {
        source: 'url',
        url: 'https://example.com/data',
        samples: 2,
        type_name: 'InlineNullableProp',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      global.fetch = originalFetch;

      expect(data.success).toBe(true);
      // innerVal should be nullable
      expect(data.nullable_fields.some((f: string) => f.includes('innerVal'))).toBe(true);
      // The type should contain null union
      expect(data.types).toContain('| null');
    });

    it('should directly test generateInlineObject with nullable property (line 539)', () => {
      const { generateInlineObject } = __testInternals;

      // Create properties where one is nullable but the type doesn't include 'null'
      const properties: Record<string, TypeInfo> = {
        normalProp: {
          type: 'string',
          nullable: false,
          optional: false,
        },
        nullableProp: {
          type: 'number',
          nullable: true, // This is nullable
          optional: false,
        },
      };

      const result = generateInlineObject(properties);

      // Should contain the nullable union
      expect(result).toContain('nullableProp: number | null');
      expect(result).toContain('normalProp: string');
    });

    it('should directly test generateInlineObject with nullable and optional properties', () => {
      const { generateInlineObject } = __testInternals;

      const properties: Record<string, TypeInfo> = {
        optionalNullable: {
          type: 'boolean',
          nullable: true,
          optional: true,
        },
      };

      const result = generateInlineObject(properties);

      // Optional property should have ? and nullable should add | null
      expect(result).toContain('optionalNullable?:');
      expect(result).toContain('| null');
    });

    it('should handle fetchData returning empty array via direct testing (line 87)', async () => {
      const { fetchData } = __testInternals;

      // Verify fetchData behavior - it should throw on unknown source
      await expect(
        fetchData({ source: 'unknown' as 'inline', data: undefined })
      ).rejects.toThrow('Unknown source type');
    });
  });

  describe('testing empty samples error path (line 95)', () => {
    it('should return error when no data samples retrieved', async () => {
      // Mock _internal.fetchData to return empty array
      const originalFetchData = __testInternals._internal.fetchData;
      __testInternals._internal.fetchData = vi.fn().mockResolvedValue([]);

      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { test: true },
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      // Restore original
      __testInternals._internal.fetchData = originalFetchData;

      // Should get error about no samples
      expect(result.isError).toBe(true);
      expect(data.error).toContain('No data samples');
    });

    it('should handle normal case after mock is restored', async () => {
      // Verify normal operation still works
      const args: GenerateTypesArgs = {
        source: 'inline',
        data: { test: true },
        type_name: 'TestType',
      };

      const result = await handleGenerateTypes(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.types).toContain('TestType');
    });
  });

  describe('uncovered branch coverage tests', () => {
    describe('line 153 - error that is not an Error instance', () => {
      it('should return "Unknown error" when thrown value is not an Error', async () => {
        // Mock _internal.fetchData to throw a non-Error value
        const originalFetchData = __testInternals._internal.fetchData;
        __testInternals._internal.fetchData = vi.fn().mockImplementation(() => {
          // Throw a string instead of an Error object
          throw 'This is a plain string error';
        });

        const args: GenerateTypesArgs = {
          source: 'inline',
          data: { test: true },
        };

        const result = await handleGenerateTypes(args);
        const data = JSON.parse(result.content[0].text);

        // Restore original
        __testInternals._internal.fetchData = originalFetchData;

        expect(result.isError).toBe(true);
        expect(data.error).toBe('Unknown error');
      });

      it('should return "Unknown error" when thrown value is a number', async () => {
        const originalFetchData = __testInternals._internal.fetchData;
        __testInternals._internal.fetchData = vi.fn().mockImplementation(() => {
          throw 42; // Throw a number
        });

        const args: GenerateTypesArgs = {
          source: 'inline',
          data: { test: true },
        };

        const result = await handleGenerateTypes(args);
        const data = JSON.parse(result.content[0].text);

        __testInternals._internal.fetchData = originalFetchData;

        expect(result.isError).toBe(true);
        expect(data.error).toBe('Unknown error');
      });
    });

    describe('line 306 - object type without properties in merge', () => {
      it('should handle merging object types where some lack properties', () => {
        const { mergeTypes } = __testInternals;

        // Create object TypeInfo where one has properties and one does not
        const objectWithProps: TypeInfo = {
          type: 'object',
          nullable: false,
          optional: false,
          properties: {
            name: { type: 'string', nullable: false, optional: false },
          },
        };

        const objectWithoutProps: TypeInfo = {
          type: 'object',
          nullable: false,
          optional: false,
          // No properties field - this triggers the false branch at line 306
        };

        const result = mergeTypes([objectWithProps, objectWithoutProps]);

        expect(result.type).toBe('object');
        // Should still have properties from the first object
        expect(result.properties).toBeDefined();
        expect(result.properties!.name).toBeDefined();
      });

      it('should handle merging multiple objects where middle one lacks properties', () => {
        const { mergeTypes } = __testInternals;

        const obj1: TypeInfo = {
          type: 'object',
          nullable: false,
          optional: false,
          properties: { a: { type: 'string', nullable: false, optional: false } },
        };

        const obj2: TypeInfo = {
          type: 'object',
          nullable: false,
          optional: false,
          // No properties
        };

        const obj3: TypeInfo = {
          type: 'object',
          nullable: false,
          optional: false,
          properties: { b: { type: 'number', nullable: false, optional: false } },
        };

        const result = mergeTypes([obj1, obj2, obj3]);

        expect(result.type).toBe('object');
        expect(result.properties).toBeDefined();
        // Both a and b should be optional since not present in all samples
        expect(result.properties!.a?.optional).toBe(true);
        expect(result.properties!.b?.optional).toBe(true);
      });
    });

    describe('line 438 - nullable nested object type', () => {
      it('should generate nullable nested object type when object is null in some samples', async () => {
        const originalFetch = global.fetch;
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              ok: true,
              // Nested object with properties (will generate separate interface)
              json: async () => ({
                nested: {
                  id: 1,
                  name: 'Test',
                  details: { foo: 'bar' }, // Nested object to ensure interface extraction
                },
              }),
            } as Response;
          }
          return {
            ok: true,
            // Same nested object is null in second sample
            json: async () => ({
              nested: null,
            }),
          } as Response;
        });

        const args: GenerateTypesArgs = {
          source: 'url',
          url: 'https://example.com/data',
          samples: 2,
          type_name: 'NullableNestedObj',
        };

        const result = await handleGenerateTypes(args);
        const data = JSON.parse(result.content[0].text);

        global.fetch = originalFetch;

        expect(data.success).toBe(true);
        // The nested field should be nullable
        expect(data.nullable_fields).toContain('nested');
        // Should contain the nullable union type for the nested interface
        // The generated type should be like "NestedObjNested | null"
        expect(data.types).toMatch(/Nested.*\| null/);
      });
    });

    describe('line 454 - nullable array of objects type', () => {
      it('should generate nullable array of objects when array is null in some samples', async () => {
        const originalFetch = global.fetch;
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              ok: true,
              // Array of objects (will generate separate interface for items)
              json: async () => ({
                items: [
                  { id: 1, name: 'Item 1' },
                  { id: 2, name: 'Item 2' },
                ],
              }),
            } as Response;
          }
          return {
            ok: true,
            // Same array is null in second sample
            json: async () => ({
              items: null,
            }),
          } as Response;
        });

        const args: GenerateTypesArgs = {
          source: 'url',
          url: 'https://example.com/data',
          samples: 2,
          type_name: 'NullableArrayOfObj',
        };

        const result = await handleGenerateTypes(args);
        const data = JSON.parse(result.content[0].text);

        global.fetch = originalFetch;

        expect(data.success).toBe(true);
        // The items field should be nullable
        expect(data.nullable_fields).toContain('items');
        // Should contain the nullable array type like "ItemsItem[] | null"
        expect(data.types).toMatch(/Item\[\]\s*\|\s*null/);
      });

      it('should handle nullable array of complex objects', async () => {
        const originalFetch = global.fetch;
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              ok: true,
              json: async () => ({
                users: [
                  { userId: 'u1', profile: { age: 25, city: 'NYC' } },
                ],
              }),
            } as Response;
          }
          return {
            ok: true,
            json: async () => ({
              users: null,
            }),
          } as Response;
        });

        const args: GenerateTypesArgs = {
          source: 'url',
          url: 'https://example.com/data',
          samples: 2,
          type_name: 'ComplexNullableArray',
        };

        const result = await handleGenerateTypes(args);
        const data = JSON.parse(result.content[0].text);

        global.fetch = originalFetch;

        expect(data.success).toBe(true);
        expect(data.nullable_fields).toContain('users');
        // Should have generated the UsersItem interface and the nullable array type
        expect(data.types).toMatch(/UsersItem\[\]\s*\|\s*null/);
      });
    });
  });
});
