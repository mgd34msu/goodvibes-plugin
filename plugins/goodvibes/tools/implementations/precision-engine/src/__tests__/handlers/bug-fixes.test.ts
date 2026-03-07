/**
 * Test for Bug 3 and Bug 11 fixes in precision-grep, plus ensureArray/parseJsonField edge cases
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { handlePrecisionGrep } from '../../handlers/precision-grep.js';
import { handlePrecisionEdit } from '../../handlers/precision-edit.js';
import { ensureArray } from '../../utils/index.js';

const TEST_DIR = path.join(process.cwd(), 'test-bugs-unit');
const SUBDIR = path.join(TEST_DIR, 'subdir');
const SAMPLE_FILE = path.join(SUBDIR, 'sample.ts');
const SINGLE_FILE = path.join(TEST_DIR, 'single-file.ts');

describe('precision-grep bug fixes', () => {
  beforeAll(async () => {
    // Create test files
    await fs.mkdir(SUBDIR, { recursive: true });
    await fs.writeFile(SAMPLE_FILE, 'export function testFunction() { return "hello"; }\n');
    await fs.writeFile(SINGLE_FILE, 'export const CONSTANT = 42;\n');
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('Bug 3: glob parameter should work with subdirectory patterns', async () => {
    const result = await handlePrecisionGrep({
      queries: [{
        id: 'bug3-test',
        pattern: 'export',
        glob: `${TEST_DIR}/subdir/**/*.ts`
      }],
      output: {
        mode: 'files_only'
      }
    });

    if (result.isError) {
      console.error('Bug 3 test error:', (result.content[0] as { type: 'text'; text: string }).text);
    }
    expect(result.isError).toBe(false);
    const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(response.success).toBe(true);
    const queries = response.data.queries;
    expect(queries['bug3-test'].file_count).toBeGreaterThan(0);
    expect(queries['bug3-test'].files).toBeDefined();
    expect(queries['bug3-test'].files.length).toBeGreaterThan(0);
    expect(queries['bug3-test'].files[0].file).toContain('sample.ts');
  });

  it('ensureArray: handlePrecisionEdit works when edits is an object with numeric keys', async () => {
    // MCP serialization may deliver arrays as {"0": {...}, "1": {...}} objects
    const result = await handlePrecisionEdit({
      edits: { "0": { path: 'test-nonexistent.ts', find: 'a', replace: 'b' } }
    });
    // Should NOT error with "edits array is required" — it should convert and then
    // fail only because the file doesn't exist (a different, expected error)
    const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(response.error ?? '').not.toContain('edits array is required');
  });

  it('parseJsonField on output: handlePrecisionGrep works when output is a JSON string', async () => {
    // MCP serialization may deliver nested objects as JSON strings
    const result = await handlePrecisionGrep({
      queries: [{
        id: 'json-string-output-test',
        pattern: 'export',
        path: SINGLE_FILE
      }],
      output: '{"format":"matches"}'
    });
    expect(result.isError).toBe(false);
    const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(response.success).toBe(true);
    // With format:"matches", results should include match content
    const queryResult = response.data.queries['json-string-output-test'];
    expect(queryResult).toBeDefined();
  });

  it('Bug 11: path parameter should accept file paths, not just directories', async () => {
    const result = await handlePrecisionGrep({
      queries: [{
        id: 'bug11-test',
        pattern: 'CONSTANT',
        path: SINGLE_FILE
      }],
      output: {
        mode: 'files_only'
      }
    });

    if (result.isError) {
      console.error('Bug 11 test error:', (result.content[0] as { type: 'text'; text: string }).text);
    }
    expect(result.isError).toBe(false);
    const response = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(response.success).toBe(true);
    const queries = response.data.queries;
    expect(queries['bug11-test'].file_count).toBe(1);
    expect(queries['bug11-test'].files).toBeDefined();
    expect(queries['bug11-test'].files[0].file).toContain('single-file.ts');
  });
});

describe('ensureArray', () => {
  it('returns null for null/undefined', () => {
    expect(ensureArray(null)).toBeNull();
    expect(ensureArray(undefined)).toBeNull();
  });

  it('returns array as-is', () => {
    const arr = [{ a: 1 }, { b: 2 }];
    expect(ensureArray(arr)).toBe(arr);
  });

  it('parses JSON string to array', () => {
    const result = ensureArray('[{"a":1},{"b":2}]');
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('returns null for non-array JSON string', () => {
    expect(ensureArray('"hello"')).toBeNull();
    expect(ensureArray('42')).toBeNull();
  });

  it('converts object with numeric keys to array', () => {
    const obj = { '0': { path: 'a.ts' }, '1': { path: 'b.ts' } };
    const result = ensureArray(obj);
    expect(result).toEqual([{ path: 'a.ts' }, { path: 'b.ts' }]);
  });

  it('preserves order when numeric keys are unsorted', () => {
    const obj = { '2': 'c', '0': 'a', '1': 'b' };
    expect(ensureArray(obj)).toEqual(['a', 'b', 'c']);
  });

  it('returns null for object with non-numeric keys', () => {
    expect(ensureArray({ foo: 'bar' })).toBeNull();
  });

  it('returns null for non-convertible values', () => {
    expect(ensureArray(42)).toBeNull();
    expect(ensureArray(true)).toBeNull();
  });
});
