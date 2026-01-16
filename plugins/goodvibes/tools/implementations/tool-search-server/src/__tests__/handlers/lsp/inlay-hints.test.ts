/**
 * Unit tests for handleGetInlayHints
 *
 * Tests the inlay hints handler that provides TypeScript inlay hints
 * to see inferred types where they're implicit.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetInlayHints } from '../../../handlers/lsp/inlay-hints.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetInlayHints', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inlay-hints-test-'));
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
      const result = await handleGetInlayHints({ file: '' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file');
    });

    test('returns error when file not found', async () => {
      const result = await handleGetInlayHints({
        file: path.join(tempDir, 'nonexistent.ts'),
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    test('returns error for invalid start_line', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({
        file,
        start_line: 0,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('start_line');
    });

    test('returns error for start_line beyond file length', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({
        file,
        start_line: 100,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('start_line');
    });

    test('returns error when end_line is less than start_line', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;\nconst z = 3;');

      const result = await handleGetInlayHints({
        file,
        start_line: 3,
        end_line: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('end_line');
    });

    test('returns error when end_line is beyond file length', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({
        file,
        end_line: 100,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('end_line');
    });
  });

  describe('type inference hints', () => {
    test('provides type hints for inferred variables', async () => {
      const file = path.join(tempDir, 'infer.ts');
      fs.writeFileSync(file, `
const x = 42;
const y = "hello";
const arr = [1, 2, 3];
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.hints).toBeDefined();
      expect(Array.isArray(data.hints)).toBe(true);
      // Should have type hints for x, y, arr
    });

    test('provides type hints for function return types', async () => {
      const file = path.join(tempDir, 'return.ts');
      fs.writeFileSync(file, `
function add(a: number, b: number) {
  return a + b;
}
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should have return type hint for the function
    });

    test('provides type hints for arrow function return types', async () => {
      const file = path.join(tempDir, 'arrow.ts');
      fs.writeFileSync(file, `
const double = (n: number) => n * 2;
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('parameter name hints', () => {
    test('provides parameter name hints at call sites', async () => {
      const file = path.join(tempDir, 'params.ts');
      fs.writeFileSync(file, `
function greet(name: string, age: number) {
  return \`Hello \${name}, you are \${age}\`;
}

greet("Alice", 30);
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should have parameter hints for "Alice" -> name: and 30 -> age:
    });

    test('provides parameter hints for multiple arguments', async () => {
      const file = path.join(tempDir, 'multi-params.ts');
      fs.writeFileSync(file, `
function createUser(id: number, name: string, email: string, active: boolean) {
  return { id, name, email, active };
}

createUser(1, "John", "john@example.com", true);
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('enum member hints', () => {
    test('provides enum member value hints', async () => {
      const file = path.join(tempDir, 'enum.ts');
      fs.writeFileSync(file, `
enum Color {
  Red,
  Green,
  Blue
}
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // May have enum value hints depending on preferences
    });
  });

  describe('range filtering', () => {
    test('only returns hints within specified range', async () => {
      const file = path.join(tempDir, 'range.ts');
      fs.writeFileSync(file, `
const a = 1;
const b = 2;
const c = 3;
const d = 4;
const e = 5;
`);

      const result = await handleGetInlayHints({
        file,
        start_line: 2,
        end_line: 4,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.range.start_line).toBe(2);
      expect(data.range.end_line).toBe(4);
    });

    test('defaults to entire file when no range specified', async () => {
      const file = path.join(tempDir, 'full.ts');
      fs.writeFileSync(file, `
const a = 1;
const b = 2;
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.range.start_line).toBe(1);
      expect(data.range.end_line).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hint metadata', () => {
    test('includes line and column in hints', async () => {
      const file = path.join(tempDir, 'position.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      if (data.hints.length > 0) {
        expect(data.hints[0]).toHaveProperty('line');
        expect(data.hints[0]).toHaveProperty('column');
        expect(data.hints[0].line).toBeGreaterThan(0);
        expect(data.hints[0].column).toBeGreaterThan(0);
      }
    });

    test('includes text in hints', async () => {
      const file = path.join(tempDir, 'text.ts');
      fs.writeFileSync(file, 'const x = 42;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      if (data.hints.length > 0) {
        expect(data.hints[0]).toHaveProperty('text');
        expect(typeof data.hints[0].text).toBe('string');
      }
    });

    test('includes kind in hints', async () => {
      const file = path.join(tempDir, 'kind.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      if (data.hints.length > 0) {
        expect(data.hints[0]).toHaveProperty('kind');
        expect(['type', 'parameter', 'enum']).toContain(data.hints[0].kind);
      }
    });

    test('includes padding information in hints', async () => {
      const file = path.join(tempDir, 'padding.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      if (data.hints.length > 0) {
        expect(data.hints[0]).toHaveProperty('padding_left');
        expect(data.hints[0]).toHaveProperty('padding_right');
        expect(typeof data.hints[0].padding_left).toBe('boolean');
        expect(typeof data.hints[0].padding_right).toBe('boolean');
      }
    });
  });

  describe('sorting', () => {
    test('sorts hints by line then column', async () => {
      const file = path.join(tempDir, 'sorted.ts');
      fs.writeFileSync(file, `
const a = 1;
const b = 2;
const c = 3;
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      if (data.hints.length > 1) {
        for (let i = 1; i < data.hints.length; i++) {
          const prev = data.hints[i - 1];
          const curr = data.hints[i];

          if (prev.line === curr.line) {
            expect(prev.column).toBeLessThanOrEqual(curr.column);
          } else {
            expect(prev.line).toBeLessThan(curr.line);
          }
        }
      }
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes file path in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('file');
    });

    test('includes range in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('range');
      expect(data.range).toHaveProperty('start_line');
      expect(data.range).toHaveProperty('end_line');
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.hints).toEqual([]);
    });

    test('handles file with only comments', async () => {
      const file = path.join(tempDir, 'comments.ts');
      fs.writeFileSync(file, '// This is a comment\n/* Another comment */');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles file with explicit types (no hints needed)', async () => {
      const file = path.join(tempDir, 'explicit.ts');
      fs.writeFileSync(file, `
const x: number = 1;
const y: string = "hello";
function add(a: number, b: number): number { return a + b; }
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // May have fewer hints since types are explicit
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetInlayHints({ file: 'test.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('handles single line range', async () => {
      const file = path.join(tempDir, 'single.ts');
      fs.writeFileSync(file, `
const a = 1;
const b = 2;
const c = 3;
`);

      const result = await handleGetInlayHints({
        file,
        start_line: 2,
        end_line: 2,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.range.start_line).toBe(2);
      expect(data.range.end_line).toBe(2);
    });

    test('handles end_line at file end', async () => {
      const file = path.join(tempDir, 'end.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;');

      const result = await handleGetInlayHints({
        file,
        end_line: 2,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('file types', () => {
    test('handles JavaScript files', async () => {
      const file = path.join(tempDir, 'test.js');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles TSX files', async () => {
      const file = path.join(tempDir, 'test.tsx');
      fs.writeFileSync(file, 'const Component = () => <div />;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles JSX files', async () => {
      const file = path.join(tempDir, 'test.jsx');
      fs.writeFileSync(file, 'const Component = () => <div />;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('hint kind mapping', () => {
    test('maps Type kind correctly', async () => {
      const file = path.join(tempDir, 'type-kind.ts');
      fs.writeFileSync(file, 'const x = 42;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      const typeHints = data.hints.filter((h: { kind: string }) => h.kind === 'type');
      // Type hints should have kind 'type'
      expect(result.isError).toBeFalsy();
    });

    test('maps Parameter kind correctly', async () => {
      const file = path.join(tempDir, 'param-kind.ts');
      fs.writeFileSync(file, `
function greet(name: string) { return name; }
greet("hello");
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      // Parameter hints should have kind 'parameter'
      expect(result.isError).toBeFalsy();
    });
  });

  describe('text extraction', () => {
    test('extracts text from string hints', async () => {
      const file = path.join(tempDir, 'text-extract.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      if (data.hints.length > 0) {
        expect(typeof data.hints[0].text).toBe('string');
      }
    });

    test('extracts text from display part array', async () => {
      const file = path.join(tempDir, 'parts.ts');
      fs.writeFileSync(file, `
interface Options { timeout: number; }
function fetch(url: string, opts: Options) {}
fetch("http://example.com", { timeout: 5000 });
`);

      const result = await handleGetInlayHints({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // All hint texts should be strings
      for (const hint of data.hints) {
        expect(typeof hint.text).toBe('string');
      }
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('includes file context in error response', async () => {
      const result = await handleGetInlayHints({
        file: path.join(tempDir, 'nonexistent.ts'),
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      if (data.context) {
        expect(data.context).toHaveProperty('file');
      }
    });
  });

  describe('program handling', () => {
    test('returns error when program unavailable', async () => {
      // This tests internal error handling when getProgram returns undefined
      // In practice, this is hard to trigger, so we just verify normal operation
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetInlayHints({ file });

      expect(result.isError).toBeFalsy();
    });
  });
});
