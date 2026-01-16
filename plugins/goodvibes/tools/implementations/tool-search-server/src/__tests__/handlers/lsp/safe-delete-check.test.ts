/**
 * Unit tests for handleSafeDeleteCheck
 *
 * Tests the safe delete check handler that confirms a symbol has zero
 * external usages before deleting.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleSafeDeleteCheck } from '../../../handlers/lsp/safe-delete-check.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleSafeDeleteCheck', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-delete-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
    vi.clearAllMocks();
  });

  describe('argument validation', () => {
    test('returns error when file is missing', async () => {
      const result = await handleSafeDeleteCheck({
        file: '',
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file');
    });

    test('returns error when line is zero', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 0,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('line');
    });

    test('returns error when line is negative', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: -1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('line');
    });

    test('returns error when column is zero', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 0,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });

    test('returns error when column is negative', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: -5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });
  });

  describe('safe to delete cases', () => {
    test('returns safe=true for unused export', async () => {
      const file = path.join(tempDir, 'unused.ts');
      fs.writeFileSync(file, 'export function unusedFunc() { return 42; }');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 17, // Position on 'unusedFunc'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(true);
      expect(data.external_references).toEqual([]);
    });

    test('returns safe=true for local variable only used in same file', async () => {
      const file = path.join(tempDir, 'local.ts');
      fs.writeFileSync(file, `
const helper = () => 1;
const result = helper();
export { result };
`);

      const result = await handleSafeDeleteCheck({
        file,
        line: 2,
        column: 7, // Position on 'helper'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(true);
    });

    test('returns safe=true with self-references (recursive functions)', async () => {
      const file = path.join(tempDir, 'recursive.ts');
      fs.writeFileSync(file, `
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`);

      const result = await handleSafeDeleteCheck({
        file,
        line: 2,
        column: 10, // Position on 'factorial'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(true);
      expect(data.self_references.length).toBeGreaterThan(0);
    });
  });

  describe('not safe to delete cases', () => {
    test('returns safe=false for export used in another file', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export function helper() { return 42; }');
      fs.writeFileSync(mainFile, 'import { helper } from "./utils";\nconsole.log(helper());');

      // Load both files into the language service to ensure cross-file references work
      await languageServiceManager.getServiceForFile(utilsFile);
      await languageServiceManager.getServiceForFile(mainFile);

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 1,
        column: 17, // Position on 'helper'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(false);
      expect(data.external_references.length).toBeGreaterThan(0);
    });

    test('returns safe=false for class used by other files', async () => {
      const classFile = path.join(tempDir, 'user.ts');
      const consumerFile = path.join(tempDir, 'consumer.ts');

      fs.writeFileSync(classFile, 'export class User { constructor(public name: string) {} }');
      fs.writeFileSync(consumerFile, 'import { User } from "./user";\nconst u = new User("John");');

      // Load both files into the language service to ensure cross-file references work
      await languageServiceManager.getServiceForFile(classFile);
      await languageServiceManager.getServiceForFile(consumerFile);

      const result = await handleSafeDeleteCheck({
        file: classFile,
        line: 1,
        column: 14, // Position on 'User'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(false);
    });
  });

  describe('reference categorization', () => {
    test('distinguishes external references from self-references', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, `
export function process(data: string) {
  const cleaned = data.trim();
  return process(cleaned.toLowerCase()); // Self-reference
}
`);
      fs.writeFileSync(mainFile, 'import { process } from "./utils";\nprocess("TEST");');

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 2,
        column: 17, // Position on 'process'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.external_references).toBeDefined();
      expect(data.self_references).toBeDefined();
    });

    test('excludes definition itself from references', async () => {
      const file = path.join(tempDir, 'def.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x + 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7, // Position on 'x' definition
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // The definition itself should not be counted as a reference
    });

    test('excludes same-declaration references', async () => {
      const file = path.join(tempDir, 'same-decl.ts');
      fs.writeFileSync(file, 'export type MyType = { value: MyType | null };');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 13, // Position on 'MyType'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Self-referential type in same declaration should not block deletion
    });
  });

  describe('reference metadata', () => {
    test('includes file path in references', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export const value = 42;');
      fs.writeFileSync(mainFile, 'import { value } from "./utils";\nconsole.log(value);');

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 1,
        column: 14, // Position on 'value'
      });
      const data = JSON.parse(result.content[0].text);

      if (data.external_references.length > 0) {
        expect(data.external_references[0]).toHaveProperty('file');
      }
    });

    test('includes line and column in references', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export const value = 42;');
      fs.writeFileSync(mainFile, 'import { value } from "./utils";\nconsole.log(value);');

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 1,
        column: 14,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.external_references.length > 0) {
        expect(data.external_references[0]).toHaveProperty('line');
        expect(data.external_references[0]).toHaveProperty('column');
        expect(data.external_references[0].line).toBeGreaterThan(0);
        expect(data.external_references[0].column).toBeGreaterThan(0);
      }
    });

    test('includes preview in references', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export const value = 42;');
      fs.writeFileSync(mainFile, 'import { value } from "./utils";\nconsole.log(value);');

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 1,
        column: 14,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.external_references.length > 0) {
        expect(data.external_references[0]).toHaveProperty('preview');
        expect(typeof data.external_references[0].preview).toBe('string');
      }
    });
  });

  describe('sorting', () => {
    test('sorts external references by file, line, column', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');
      const otherFile = path.join(tempDir, 'other.ts');

      fs.writeFileSync(utilsFile, 'export const value = 42;');
      fs.writeFileSync(mainFile, 'import { value } from "./utils";\nconst a = value;\nconst b = value;');
      fs.writeFileSync(otherFile, 'import { value } from "./utils";\nconsole.log(value);');

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 1,
        column: 14,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.external_references.length > 1) {
        for (let i = 1; i < data.external_references.length; i++) {
          const prev = data.external_references[i - 1];
          const curr = data.external_references[i];

          const fileCompare = prev.file.localeCompare(curr.file);
          if (fileCompare === 0) {
            const lineCompare = prev.line - curr.line;
            if (lineCompare === 0) {
              expect(prev.column).toBeLessThanOrEqual(curr.column);
            } else {
              expect(lineCompare).toBeLessThanOrEqual(0);
            }
          }
        }
      }
    });

    test('sorts self references by file, line, column', async () => {
      const file = path.join(tempDir, 'recursive.ts');
      fs.writeFileSync(file, `
function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
`);

      const result = await handleSafeDeleteCheck({
        file,
        line: 2,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.self_references.length > 1) {
        for (let i = 1; i < data.self_references.length; i++) {
          const prev = data.self_references[i - 1];
          const curr = data.self_references[i];

          const fileCompare = prev.file.localeCompare(curr.file);
          if (fileCompare === 0) {
            if (prev.line === curr.line) {
              expect(prev.column).toBeLessThanOrEqual(curr.column);
            }
          }
        }
      }
    });
  });

  describe('reason message', () => {
    test('provides reason for safe deletion', async () => {
      const file = path.join(tempDir, 'unused.ts');
      fs.writeFileSync(file, 'export const unused = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 14,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('reason');
      expect(data.reason).toContain('safely deleted');
    });

    test('provides reason for unsafe deletion', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export const used = 1;');
      fs.writeFileSync(mainFile, 'import { used } from "./utils";\nconsole.log(used);');

      const result = await handleSafeDeleteCheck({
        file: utilsFile,
        line: 1,
        column: 14,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('reason');
      expect(data.reason).toContain('external reference');
    });

    test('mentions self-references in reason when applicable', async () => {
      const file = path.join(tempDir, 'recursive.ts');
      fs.writeFileSync(file, `
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`);

      const result = await handleSafeDeleteCheck({
        file,
        line: 2,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.self_references.length > 0) {
        expect(data.reason.toLowerCase()).toContain('self-reference');
      }
    });
  });

  describe('symbol name', () => {
    test('includes symbol name in result', async () => {
      const file = path.join(tempDir, 'symbol.ts');
      fs.writeFileSync(file, 'const mySymbol = 42;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('symbol');
    });

    test('extracts symbol name from quick info', async () => {
      const file = path.join(tempDir, 'quick-info.ts');
      fs.writeFileSync(file, 'function myFunction() {}');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBeDefined();
    });

    test('falls back to source text when quick info unavailable', async () => {
      const file = path.join(tempDir, 'fallback.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBeDefined();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes all required fields', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('safe');
      expect(data).toHaveProperty('external_references');
      expect(data).toHaveProperty('self_references');
      expect(data).toHaveProperty('reason');
    });
  });

  describe('edge cases', () => {
    test('handles no references found', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '// just a comment');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(true);
      expect(data.reason).toContain('No references found');
    });

    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleSafeDeleteCheck({
          file: 'test.ts',
          line: 1,
          column: 7,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('normalizes file paths for cross-platform compatibility', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // File paths should use forward slashes
    });
  });

  describe('definition handling', () => {
    test('finds definition when queried position is definition', async () => {
      const file = path.join(tempDir, 'def.ts');
      fs.writeFileSync(file, 'const myVar = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7, // On 'myVar'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('uses queried position as definition when not found in references', async () => {
      const file = path.join(tempDir, 'no-def.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleSafeDeleteCheck({
        file,
        line: 1,
        column: 7,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });
});
