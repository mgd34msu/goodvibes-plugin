/**
 * Test for Bug 3 and Bug 11 fixes in precision-grep
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { handlePrecisionGrep } from '../../handlers/precision-grep.js';

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
      console.error('Bug 3 test error:', result.content[0].text);
    }
    expect(result.isError).toBe(false);
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    const queries = response.data.queries;
    expect(queries['bug3-test'].file_count).toBeGreaterThan(0);
    expect(queries['bug3-test'].files).toBeDefined();
    expect(queries['bug3-test'].files.length).toBeGreaterThan(0);
    expect(queries['bug3-test'].files[0].file).toContain('sample.ts');
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
      console.error('Bug 11 test error:', result.content[0].text);
    }
    expect(result.isError).toBe(false);
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    const queries = response.data.queries;
    expect(queries['bug11-test'].file_count).toBe(1);
    expect(queries['bug11-test'].files).toBeDefined();
    expect(queries['bug11-test'].files[0].file).toContain('single-file.ts');
  });
});
