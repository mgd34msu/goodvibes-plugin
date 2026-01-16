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

import { handleGenerateTypes, GenerateTypesArgs } from '../../../handlers/analysis/generate-types.js';

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
});
