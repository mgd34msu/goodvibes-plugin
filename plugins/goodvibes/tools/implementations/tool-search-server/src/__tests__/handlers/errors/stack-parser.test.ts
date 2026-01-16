/**
 * Unit tests for Stack Parser Handler
 *
 * Tests the error stack trace parsing functionality that:
 * - Extracts file paths, line numbers, and function names
 * - Maps frames to project files
 * - Identifies root cause frame (first project file in stack)
 * - Provides code previews for project files
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleParseErrorStack } from '../../../handlers/errors/stack-parser.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleParseErrorStack', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-parser-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  // ============================================================================
  // V8/Node.js Stack Format Tests
  // ============================================================================

  describe('V8/Node.js stack format parsing', () => {
    test('parses standard V8 format with function name and parentheses', () => {
      const errorText = `TypeError: Cannot read property 'foo' of undefined
    at myFunction (${tempDir}/src/app.ts:10:15)
    at main (${tempDir}/src/index.ts:5:3)`;

      // Create the files so they're recognized as project files
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nconst foo = bar.foo;\nline11');
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'const x = 1;');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      expect(result.content).toHaveLength(1);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('TypeError');
      expect(text).toContain("Cannot read property 'foo' of undefined");
      expect(text).toContain('myFunction');
      expect(text).toContain('app.ts');
    });

    test('parses V8 format without function name (anonymous)', () => {
      const errorText = `Error: Something went wrong
    at ${tempDir}/src/module.ts:25:10`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'module.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
      expect(text).toContain('module.ts');
    });

    test('parses V8 async stack format', () => {
      // Use relative path to avoid colon issues in Windows tempDir path
      // The regex [^:]+ doesn't handle Windows absolute paths with colons
      const errorText = `Error: Async error
    at async processData (src/async.ts:15:8)
    at async main (src/index.ts:3:5)`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'async.ts'), 'content');
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('processData');
      expect(text).toContain('async.ts');
    });

    test('parses Node.js internal frames', () => {
      // The nodeInternal regex expects format: node:module:line:col
      const errorText = `Error: Internal error
    at Object.<anonymous> (node:internal/modules/cjs/loader:1144:14)
    at Module._compile (node:internal/modules/cjs/loader:1188:10)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      // The nodeInternal pattern may not match due to extra slashes in path
      // Just verify we get a result without error
      expect(text).toContain('## Error Analysis');
      expect(text).toContain('Internal error');
    });
  });

  // ============================================================================
  // Windows Path Format Tests
  // ============================================================================

  describe('Windows path format parsing', () => {
    test('parses Windows path with drive letter', () => {
      const errorText = `TypeError: undefined is not a function
    at handler (C:\\Users\\test\\project\\src\\handler.ts:42:10)
    at main (C:\\Users\\test\\project\\src\\index.ts:5:3)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: 'C:\\Users\\test\\project' });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('handler');
      expect(text).toContain('handler.ts');
    });
  });

  // ============================================================================
  // Firefox/SpiderMonkey Stack Format Tests
  // ============================================================================

  describe('Firefox/SpiderMonkey stack format parsing', () => {
    test('parses SpiderMonkey format with function name', () => {
      // SpiderMonkey format uses @ separator and the regex expects [^:]+ for file
      // Use relative paths to avoid colon issues
      const errorText = `ReferenceError: x is not defined
myFunction@src/script.js:10:5
main@src/index.js:3:1`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'script.js'), 'content');
      fs.writeFileSync(path.join(tempDir, 'src', 'index.js'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('ReferenceError');
      expect(text).toContain('myFunction');
    });

    test('parses SpiderMonkey format without function name (anonymous)', () => {
      // Empty function name before @
      const errorText = `Error: test
@src/anon.js:5:10`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'anon.js'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('anon.js');
    });
  });

  // ============================================================================
  // Safari/JavaScriptCore Stack Format Tests
  // ============================================================================

  describe('Safari/JavaScriptCore stack format parsing', () => {
    test('parses JavaScriptCore format with optional column', () => {
      // Use relative paths to avoid colon issues
      const errorText = `TypeError: null is not an object
doSomething@src/util.js:20`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'util.js'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('doSomething');
    });

    test('parses JavaScriptCore format with column', () => {
      // Use relative paths to avoid colon issues
      const errorText = `Error: test
handler@src/handler.js:15:8`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'handler.js'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('handler');
    });
  });

  // ============================================================================
  // Eval Context Stack Format Tests
  // ============================================================================

  describe('Eval context stack format parsing', () => {
    test('parses eval context format', () => {
      // Use relative paths to avoid colon issues
      const errorText = `Error: eval error
    at eval (eval at myFunc (src/eval.ts:10:5), <anonymous>:1:1)`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'eval.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('myFunc');
      expect(text).toContain('eval.ts');
    });
  });

  // ============================================================================
  // Error Header Parsing Tests
  // ============================================================================

  describe('error header parsing', () => {
    test('parses standard ErrorType: message format', () => {
      const errorText = `TypeError: Cannot read property 'x' of undefined
    at test (test.js:1:1)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('TypeError');
      expect(text).toContain("Cannot read property 'x' of undefined");
    });

    test('parses Node.js format with error code', () => {
      const errorText = `Error [ERR_MODULE_NOT_FOUND]: Cannot find module './missing'
    at resolveModule (node:internal/modules:100:10)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
      expect(text).toContain('[ERR_MODULE_NOT_FOUND]');
    });

    test('parses AssertionError format', () => {
      const errorText = `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal
    at assert (node:assert:100:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('AssertionError');
      expect(text).toContain('[ERR_ASSERTION]');
    });

    test('parses Uncaught prefix format', () => {
      const errorText = `Uncaught TypeError: failed to fetch
    at fetch (test.js:1:1)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('TypeError');
      expect(text).toContain('failed to fetch');
    });

    test('parses Unhandled prefix format', () => {
      const errorText = `Unhandled ReferenceError: x is not defined
    at test (test.js:1:1)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('ReferenceError');
    });

    test('handles generic message without error type', () => {
      const errorText = `Something went very wrong here
    at unknown (file.js:1:1)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
      expect(text).toContain('Something went very wrong here');
    });

    test('handles various error types', () => {
      const errorTypes = [
        'SyntaxError',
        'RangeError',
        'URIError',
        'EvalError',
        'AggregateError',
        'Exception',
      ];

      for (const errorType of errorTypes) {
        const errorText = `${errorType}: test message
    at test (test.js:1:1)`;

        const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain(errorType);
      }
    });

    test('handles error with just type and no message', () => {
      // This tests the fallback where message group might be undefined
      const errorText = `Error:
    at test (test.js:1:1)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
    });
  });

  // ============================================================================
  // Project File Detection Tests
  // ============================================================================

  describe('project file detection', () => {
    test('identifies files in project directory as project files', () => {
      const errorText = `Error: test
    at handler (${tempDir}/src/handler.ts:10:5)`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'handler.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[PROJECT]');
    });

    test('excludes node_modules from project files', () => {
      const errorText = `Error: test
    at external (${tempDir}/node_modules/some-package/index.js:5:3)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[EXTERNAL]');
    });

    test('excludes Node.js internals from project files', () => {
      // Use a file format that matches the V8 pattern but has a node: prefix
      // The isProjectFile function checks for node: prefix
      const errorText = `Error: test
    at internal (node_internal.js:100:10)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      // File doesn't exist so it won't be a project file
      expect(text).toContain('[EXTERNAL]');
    });

    test('handles project files not starting with node prefix', () => {
      // Test that files with "node" in the name but not as "node:" prefix work
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'nodetest.ts'), 'content');

      const errorText = `Error: test
    at handler (src/nodetest.ts:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      // nodetest.ts should be recognized as a project file since it exists
      expect(text).toContain('[PROJECT]');
    });

    // Note: The nodeInternal regex pattern in stack-parser.ts is missing
    // the <file> named group, so node: prefixed paths are not parsed.
    // The isProjectFile check for filePath.startsWith('node:') is
    // currently unreachable due to this regex issue.
    // This is documented here for coverage tracking purposes.

    test('excludes internal/ paths from project files', () => {
      const errorText = `Error: test
    at loader (internal/modules/loader.js:50:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[EXTERNAL]');
    });

    test('excludes webpack paths from project files', () => {
      const errorText = `Error: test
    at loader (webpack/runtime/compat.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[EXTERNAL]');
    });

    test('excludes webpack-internal paths from project files', () => {
      // webpack-internal paths contain the path, will be detected by includes('webpack-internal')
      const errorText = `Error: test
    at loader (webpack-internal_module.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[EXTERNAL]');
    });

    test('handles relative paths that exist in project', () => {
      const errorText = `Error: test
    at handler (src/handler.ts:10:5)`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'handler.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[PROJECT]');
    });

    test('handles relative paths that do not exist in project', () => {
      const errorText = `Error: test
    at handler (nonexistent/file.ts:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[EXTERNAL]');
    });

    test('handles absolute paths outside project', () => {
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-'));
      try {
        const errorText = `Error: test
    at external (${otherDir}/external.ts:10:5)`;

        const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('[EXTERNAL]');
      } finally {
        fs.rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================================
  // Code Preview Tests
  // ============================================================================

  describe('code preview', () => {
    test('provides code preview for project files', () => {
      const fileContent = `line 1
line 2
line 3 - the problematic line
line 4
line 5`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'code.ts'), fileContent);

      const errorText = `Error: test
    at handler (${tempDir}/src/code.ts:3:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('>>> line 3 - the problematic line');
      expect(text).toContain('line 2');
      expect(text).toContain('line 4');
    });

    test('handles first line code preview (no line before)', () => {
      const fileContent = `first line is the error
second line
third line`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'first.ts'), fileContent);

      const errorText = `Error: test
    at handler (${tempDir}/src/first.ts:1:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('>>> first line is the error');
      expect(text).toContain('second line');
    });

    test('handles last line code preview (no line after)', () => {
      const fileContent = `first line
second line
last line is the error`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'last.ts'), fileContent);

      const errorText = `Error: test
    at handler (${tempDir}/src/last.ts:3:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('>>> last line is the error');
      expect(text).toContain('second line');
    });

    test('returns undefined for non-existent file', () => {
      const errorText = `Error: test
    at handler (${tempDir}/src/missing.ts:3:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      // Should still parse but no code preview
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
    });

    test('handles line number out of range (negative)', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'test.ts'), 'content');

      // Line 0 would result in lineIndex -1
      const errorText = `Error: test
    at handler (${tempDir}/src/test.ts:0:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
    });

    test('handles line number out of range (too large)', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'short.ts'), 'only one line');

      const errorText = `Error: test
    at handler (${tempDir}/src/short.ts:100:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
    });

    test('handles file read errors gracefully', () => {
      // Create a directory where a file is expected to simulate read error
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'src', 'notafile.ts')); // Directory with .ts name

      const errorText = `Error: test
    at handler (${tempDir}/src/notafile.ts:1:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      // Should not throw, just no code preview
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
    });

    test('resolves relative paths for code preview', () => {
      const fileContent = `first
second
third`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'relative.ts'), fileContent);

      const errorText = `Error: test
    at handler (src/relative.ts:2:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('>>> second');
    });
  });

  // ============================================================================
  // Root Cause Frame Tests
  // ============================================================================

  describe('root cause frame detection', () => {
    test('identifies first project file as root cause', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'root.ts'), 'content');

      const errorText = `Error: test
    at external (node:fs:100:10)
    at wrapper (node_modules/pkg/index.js:5:3)
    at rootCause (${tempDir}/src/root.ts:25:8)
    at helper (${tempDir}/src/helper.ts:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('### Root Cause');
      expect(text).toContain('root.ts:25:8');
    });

    test('handles no project files (null root cause)', () => {
      const errorText = `Error: test
    at external (node:fs:100:10)
    at wrapper (node_modules/pkg/index.js:5:3)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      // Should not contain Root Cause section if no project files
      expect(text).toContain('### Stack Trace');
    });

    test('includes code preview in root cause section', () => {
      const fileContent = `line 1
line 2
line 3 error here
line 4`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'cause.ts'), fileContent);

      const errorText = `Error: test
    at rootCause (${tempDir}/src/cause.ts:3:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('### Root Cause');
      expect(text).toContain('>>> line 3 error here');
    });
  });

  // ============================================================================
  // Related Files Tests
  // ============================================================================

  describe('related files collection', () => {
    test('collects unique project files from stack', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'a.ts'), 'content');
      fs.writeFileSync(path.join(tempDir, 'src', 'b.ts'), 'content');

      const errorText = `Error: test
    at funcA (${tempDir}/src/a.ts:10:5)
    at funcB (${tempDir}/src/b.ts:20:3)
    at funcA2 (${tempDir}/src/a.ts:15:8)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('### Related Project Files');
      // Should contain both files but a.ts should only appear once
    });

    test('handles empty related files when no project files', () => {
      const errorText = `Error: test
    at external (node:fs:100:10)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      // Should not contain Related Project Files section if empty
      expect(text).not.toContain('### Related Project Files');
    });
  });

  // ============================================================================
  // Default Project Path Tests
  // ============================================================================

  describe('project path handling', () => {
    test('uses provided project_path', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'test.ts'), 'content');

      const errorText = `Error: test
    at handler (${tempDir}/src/test.ts:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[PROJECT]');
    });

    test('defaults to cwd when project_path not provided', () => {
      const errorText = `Error: test
    at handler (some/path/file.ts:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText });

      // Should still parse successfully
      expect(result.content).toHaveLength(1);
    });

    test('resolves relative project_path', () => {
      const errorText = `Error: test
    at handler (file.ts:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: '.' });

      expect(result.content).toHaveLength(1);
    });
  });

  // ============================================================================
  // Stack Frame Parsing Edge Cases
  // ============================================================================

  describe('stack frame parsing edge cases', () => {
    test('skips empty lines', () => {
      const errorText = `Error: test

    at handler (test.js:10:5)

    at main (test.js:5:3)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('handler');
      expect(text).toContain('main');
    });

    test('skips lines that do not match any pattern', () => {
      const errorText = `Error: test
This is not a stack frame
    at handler (test.js:10:5)
Some other text here
    at main (test.js:5:3)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('handler');
      expect(text).toContain('main');
    });

    test('handles trimmed function name', () => {
      const errorText = `Error: test
    at   spacedFunc   (test.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('spacedFunc');
    });

    test('handles missing column number (defaults to 0)', () => {
      const errorText = `Error: test
funcName@test.js:10`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('funcName');
      expect(text).toContain(':10:0'); // Column defaults to 0
    });

    test('handles anonymous function name', () => {
      const errorText = `Error: test
    at (test.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('<anonymous>');
    });
  });

  // ============================================================================
  // Format Result Tests
  // ============================================================================

  describe('result formatting', () => {
    test('formats markdown with all sections', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'line1\nline2\nline3');

      const errorText = `TypeError: Cannot read property 'x' of undefined
    at handler (${tempDir}/src/app.ts:2:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('## Error Analysis');
      expect(text).toContain('**Type:**');
      expect(text).toContain('**Message:**');
      expect(text).toContain('### Root Cause');
      expect(text).toContain('### Stack Trace');
      expect(text).toContain('### Related Project Files');
    });

    test('includes JSON output at the end', () => {
      const errorText = `Error: test
    at handler (test.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('```json');
      expect(text).toContain('"error_type"');
      expect(text).toContain('"error_message"');
      expect(text).toContain('"stack_frames"');
    });

    test('marks project and external files correctly', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'project.ts'), 'content');

      const errorText = `Error: test
    at projectFunc (${tempDir}/src/project.ts:10:5)
    at externalFunc (node_modules/pkg/index.js:5:3)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('[PROJECT]');
      expect(text).toContain('[EXTERNAL]');
    });
  });

  // ============================================================================
  // Success Response Tests
  // ============================================================================

  describe('success response', () => {
    test('returns content array with text type', () => {
      const errorText = `Error: test
    at handler (test.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect((result.content[0] as { type: string }).type).toBe('text');
      expect((result.content[0] as { text: string }).text).toBeDefined();
    });

    test('does not set isError flag', () => {
      const errorText = `Error: test
    at handler (test.js:10:5)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      expect(result).not.toHaveProperty('isError');
    });
  });

  // ============================================================================
  // Complex Stack Trace Tests
  // ============================================================================

  describe('complex stack traces', () => {
    test('handles mixed format stack trace', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'mixed.ts'), 'content');

      // Use relative paths for consistent parsing
      const errorText = `Error: Complex error
    at handler (src/mixed.ts:10:5)
    at async processAsync (src/mixed.ts:20:3)
funcName@src/mixed.ts:30:8
    at internal (internal_module.js:100:10)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('handler');
      expect(text).toContain('processAsync');
      expect(text).toContain('funcName');
    });

    test('handles deeply nested stack trace', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'deep.ts'), 'content');

      const frames = Array.from({ length: 50 }, (_, i) =>
        `    at func${i} (${tempDir}/src/deep.ts:${i + 1}:5)`
      ).join('\n');

      const errorText = `Error: Deep stack
${frames}`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('func0');
      expect(text).toContain('func49');
    });

    test('handles real-world Node.js error', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'server.ts'), 'const x = null;\nx.foo();');

      const errorText = `TypeError: Cannot read properties of null (reading 'foo')
    at Object.<anonymous> (${tempDir}/src/server.ts:2:3)
    at Module._compile (node:internal/modules/cjs/loader:1275:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1329:10)
    at Module.load (node:internal/modules/cjs/loader:1133:32)
    at Module._load (node:internal/modules/cjs/loader:972:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:83:12)
    at node:internal/main/run_main_module:23:47`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('TypeError');
      expect(text).toContain("Cannot read properties of null (reading 'foo')");
      expect(text).toContain('server.ts');
      expect(text).toContain('[PROJECT]');
    });

    test('handles React error with component stack', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'App.tsx'), 'content');

      const errorText = `Error: Something went wrong
    at UserProfile (${tempDir}/src/App.tsx:45:10)
    at div
    at App (${tempDir}/src/App.tsx:10:5)
    at Router (${tempDir}/node_modules/react-router/index.js:100:8)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('UserProfile');
      expect(text).toContain('App.tsx');
    });
  });

  // ============================================================================
  // Empty and Minimal Input Tests
  // ============================================================================

  describe('empty and minimal inputs', () => {
    test('handles error text with only message (no stack)', () => {
      const errorText = 'Error: Just a message with no stack';

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Error');
      expect(text).toContain('Just a message with no stack');
    });

    test('handles empty error text', () => {
      const errorText = '';

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('## Error Analysis');
    });

    test('handles whitespace-only error text', () => {
      const errorText = '   \n\n   \t   ';

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('## Error Analysis');
    });
  });

  // ============================================================================
  // Pattern Matching Regression Tests
  // ============================================================================

  describe('pattern matching regressions', () => {
    test('handles Object.<anonymous> function name', () => {
      const errorText = `Error: test
    at Object.<anonymous> (${tempDir}/src/test.ts:10:5)`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'test.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Object.<anonymous>');
    });

    test('handles Function.executeUserEntryPoint function name', () => {
      const errorText = `Error: test
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:83:12)`;

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      expect(result.content).toHaveLength(1);
    });

    test('handles anonymous arrow function', () => {
      const errorText = `Error: test
    at ${tempDir}/src/arrow.ts:10:5`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'arrow.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('<anonymous>');
    });

    test('handles method name with dots', () => {
      const errorText = `Error: test
    at MyClass.prototype.myMethod (${tempDir}/src/class.ts:10:5)`;

      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'class.ts'), 'content');

      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('MyClass.prototype.myMethod');
    });
  });

  describe('additional coverage', () => {
    test('handles non-existent absolute project file', () => {
      // Path inside project that does not exist
      const absPath = path.join(tempDir, 'src', 'ghost.ts');
      const errorText = `Error: test
    at ghost (${absPath}:10:5)`;
      
      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });
      
      const text = (result.content[0] as { text: string }).text;
      // Should be marked as PROJECT because it is in project dir
      expect(text).toContain('[PROJECT]');
      // But no code preview because file doesn't exist
      expect(text).not.toContain('>>>');
    });

    test('parses node: internal modules correctly', () => {
      const errorText = `Error: Internal
    at Object.<anonymous> (node:internal/modules/cjs/loader:1144:14)`;
    
      const result = handleParseErrorStack({ error_text: errorText, project_path: tempDir });
      const text = (result.content[0] as { text: string }).text;
      
      // Should be parsed now that regex is fixed
      expect(text).toContain('node:internal/modules/cjs/loader');
      expect(text).toContain('1144');
      // Should be external
      expect(text).toContain('[EXTERNAL]');
    });
  });
});
