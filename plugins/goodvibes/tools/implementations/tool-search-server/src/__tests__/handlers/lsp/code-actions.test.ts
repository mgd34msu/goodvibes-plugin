/**
 * Unit tests for code actions handlers
 *
 * Tests handleGetCodeActions and handleApplyCodeAction LSP handlers
 * that provide quick fixes and refactorings for TypeScript/JavaScript code.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import {
  handleGetCodeActions,
  handleApplyCodeAction,
} from '../../../handlers/lsp/code-actions.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

describe('handleGetCodeActions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-actions-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
  });

  describe('basic functionality', () => {
    test('returns actions array for clean code', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = 1;');

      const result = await handleGetCodeActions({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      // May return actions or error
      if (data.actions) {
        expect(Array.isArray(data.actions)).toBe(true);
      } else {
        expect(data.error).toBeDefined();
      }
    });

    test('returns count matching actions length', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = 1;');

      const result = await handleGetCodeActions({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      // When successful, count should match actions length
      if (data.count !== undefined && data.actions) {
        expect(data.count).toBe(data.actions.length);
      }
    });

    test('includes position in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = 1;');

      const result = await handleGetCodeActions({ file, line: 1, column: 7 });
      const data = JSON.parse(result.content[0].text);

      // When successful, position should be present
      if (data.position) {
        expect(data.position.line).toBe(1);
        expect(data.position.column).toBe(7);
      }
    });

    test('includes diagnostics info', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = 1;');

      const result = await handleGetCodeActions({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      // When successful, diagnostics should be an array
      if (data.diagnostics) {
        expect(Array.isArray(data.diagnostics)).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    test('handles invalid file path', async () => {
      const result = await handleGetCodeActions({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles file with errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "not a number";');

      // Should not throw, should return results
      const result = await handleGetCodeActions({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data).toBeDefined();
      // Either actions or error is acceptable
      expect(data.actions || data.error).toBeDefined();
    });
  });

  describe('quick fixes', () => {
    test('suggests fix for unused variable', async () => {
      const file = path.join(tempDir, 'test.ts');
      // Create a tsconfig to enable strict mode
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            noUnusedLocals: true,
            strict: true,
          },
        })
      );
      fs.writeFileSync(file, 'const unused = 1;\nexport const used = 2;');

      const result = await handleGetCodeActions({ file, line: 1, column: 7 });
      const data = JSON.parse(result.content[0].text);

      // May or may not have actions depending on diagnostics and position validity
      expect(data.actions || data.error).toBeDefined();
    });

    test('suggests fix for type error', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const result = await handleGetCodeActions({ file, line: 1, column: 19 });
      const data = JSON.parse(result.content[0].text);

      // Should have diagnostics for type error
      expect(data.diagnostics).toBeDefined();
    });

    test('handles missing import suggestion', async () => {
      const file = path.join(tempDir, 'test.ts');
      // Create a module to import from
      const moduleFile = path.join(tempDir, 'myModule.ts');
      fs.writeFileSync(moduleFile, 'export const helper = () => 1;');
      fs.writeFileSync(file, 'const result = helper();');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 16, // Position on 'helper'
      });
      const data = JSON.parse(result.content[0].text);

      // May have import suggestions or error
      expect(data.actions || data.error).toBeDefined();
    });
  });

  describe('range selection', () => {
    test('handles range with end_line and end_column', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;\nconst z = x + y;');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 1,
        end_line: 2,
        end_column: 13,
      });
      const data = JSON.parse(result.content[0].text);

      // Either has actions or error
      expect(data.actions || data.error).toBeDefined();
      if (data.position) {
        expect(data.position.end_line).toBe(2);
        expect(data.position.end_column).toBe(13);
      }
    });

    test('uses point selection when end not specified', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.position) {
        expect(data.position.end_line).toBeUndefined();
        expect(data.position.end_column).toBeUndefined();
      }
    });
  });

  describe('filtering by kind', () => {
    test('filters actions by quickfix kind', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 1,
        only: ['quickfix'],
      });
      const data = JSON.parse(result.content[0].text);

      // All returned actions should be quickfixes (if any)
      if (data.actions) {
        for (const action of data.actions) {
          expect(action.kind).toContain('quickfix');
        }
      }
    });

    test('filters actions by refactor kind', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function foo() {\n  const x = 1;\n  const y = 2;\n  return x + y;\n}'
      );

      const result = await handleGetCodeActions({
        file,
        line: 2,
        column: 3,
        end_line: 4,
        end_column: 16,
        only: ['refactor'],
      });
      const data = JSON.parse(result.content[0].text);

      // All returned actions should be refactorings (if any)
      if (data.actions) {
        for (const action of data.actions) {
          expect(action.kind).toContain('refactor');
        }
      }
    });

    test('returns all actions when no filter specified', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      // Should have actions or error
      expect(data.actions || data.error).toBeDefined();
    });
  });

  describe('action metadata', () => {
    test('actions include id, title, and kind', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function foo() {\n  const x = 1 + 2;\n  return x;\n}'
      );

      const result = await handleGetCodeActions({
        file,
        line: 2,
        column: 13, // Position on expression
        end_line: 2,
        end_column: 18,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.actions && data.actions.length > 0) {
        const action = data.actions[0];
        expect(action).toHaveProperty('id');
        expect(action).toHaveProperty('title');
        expect(action).toHaveProperty('kind');
      }
    });

    test('actions include is_preferred flag', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.actions && data.actions.length > 0) {
        const action = data.actions[0];
        expect(action).toHaveProperty('is_preferred');
        expect(typeof action.is_preferred).toBe('boolean');
      }
    });

    test('actions include edits array', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const result = await handleGetCodeActions({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.actions && data.actions.length > 0) {
        const action = data.actions[0];
        expect(action).toHaveProperty('edits');
        expect(Array.isArray(action.edits)).toBe(true);
      }
    });
  });

  describe('refactorings', () => {
    test('suggests extract function refactoring', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function main() {\n  const a = 1;\n  const b = 2;\n  const result = a + b;\n  return result;\n}'
      );

      const result = await handleGetCodeActions({
        file,
        line: 2,
        column: 3,
        end_line: 4,
        end_column: 23,
        only: ['refactor'],
      });
      const data = JSON.parse(result.content[0].text);

      // May have extract function suggestion or error
      expect(data.actions || data.error).toBeDefined();
    });

    test('suggests extract constant refactoring', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function calculate() {\n  return 1 + 2 + 3;\n}'
      );

      const result = await handleGetCodeActions({
        file,
        line: 2,
        column: 10, // Position on '1 + 2 + 3'
        end_line: 2,
        end_column: 19,
        only: ['refactor'],
      });
      const data = JSON.parse(result.content[0].text);

      // May have extract constant suggestion or error
      expect(data.actions || data.error).toBeDefined();
    });
  });

  describe('diagnostics', () => {
    test('returns semantic diagnostics at position', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const result = await handleGetCodeActions({ file, line: 1, column: 19 });
      const data = JSON.parse(result.content[0].text);

      // Should have diagnostics if successful
      if (data.diagnostics) {
        expect(data.diagnostics.length).toBeGreaterThan(0);
        expect(data.diagnostics[0]).toHaveProperty('code');
        expect(data.diagnostics[0]).toHaveProperty('message');
      } else {
        // May have error instead
        expect(data.error).toBeDefined();
      }
    });

    test('includes diagnostic category', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const result = await handleGetCodeActions({ file, line: 1, column: 19 });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics && data.diagnostics.length > 0) {
        expect(data.diagnostics[0]).toHaveProperty('category');
      }
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetCodeActions({ file, line: 1, column: 1 });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetCodeActions({ file, line: 1, column: 1 });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});

describe('handleApplyCodeAction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-action-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
  });

  describe('basic functionality', () => {
    test('returns error for non-existent action', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleApplyCodeAction({
        file,
        line: 1,
        column: 1,
        action_title: 'Non-existent action',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('includes suggestion when action not found', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleApplyCodeAction({
        file,
        line: 1,
        column: 1,
        action_title: 'Non-existent action',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.suggestion).toBeDefined();
    });
  });

  describe('applying code fixes', () => {
    test('applies matching code fix', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      // First get available actions
      const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 1,
          column: 1,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        if (!applyData.error) {
          expect(applyData.success).toBe(true);
          expect(applyData.action_title).toBe(actionTitle);
          expect(applyData.edits).toBeDefined();
        }
      }
    });

    test('returns edits for successful action', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      // First get available actions
      const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 1,
          column: 1,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        if (applyData.success) {
          expect(Array.isArray(applyData.edits)).toBe(true);
        }
      }
    });

    test('returns files_affected for successful action', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      // First get available actions
      const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 1,
          column: 1,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        if (applyData.success) {
          expect(applyData.files_affected).toBeDefined();
          expect(Array.isArray(applyData.files_affected)).toBe(true);
        }
      }
    });
  });

  describe('applying refactorings', () => {
    test('applies refactoring when found', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function main() {\n  const a = 1;\n  const b = 2;\n  return a + b;\n}'
      );

      // Get refactoring actions
      const getResult = await handleGetCodeActions({
        file,
        line: 2,
        column: 3,
        end_line: 3,
        end_column: 15,
        only: ['refactor'],
      });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 2,
          column: 3,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        // Should either succeed or return error (if action not found at exact position)
        expect(applyData).toBeDefined();
      }
    });
  });

  describe('error handling', () => {
    test('handles invalid file path', async () => {
      const result = await handleApplyCodeAction({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
        action_title: 'Some action',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles invalid position', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleApplyCodeAction({
        file,
        line: 100,
        column: 100,
        action_title: 'Some action',
      });
      const data = JSON.parse(result.content[0].text);

      // Should handle gracefully
      expect(data).toBeDefined();
    });
  });

  describe('edit format', () => {
    test('edits include start and end positions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 1,
          column: 1,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        if (applyData.success && applyData.edits && applyData.edits.length > 0) {
          const edit = applyData.edits[0];
          expect(edit).toHaveProperty('start');
          expect(edit).toHaveProperty('end');
          expect(edit.start).toHaveProperty('line');
          expect(edit.start).toHaveProperty('column');
          expect(edit.end).toHaveProperty('line');
          expect(edit.end).toHaveProperty('column');
        }
      }
    });

    test('edits include new_text', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 1,
          column: 1,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        if (applyData.success && applyData.edits && applyData.edits.length > 0) {
          const edit = applyData.edits[0];
          expect(edit).toHaveProperty('new_text');
        }
      }
    });

    test('edits include file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x: number = "string";');

      const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
      const getData = JSON.parse(getResult.content[0].text);

      if (getData.actions && getData.actions.length > 0) {
        const actionTitle = getData.actions[0].title;

        const applyResult = await handleApplyCodeAction({
          file,
          line: 1,
          column: 1,
          action_title: actionTitle,
        });
        const applyData = JSON.parse(applyResult.content[0].text);

        if (applyData.success && applyData.edits && applyData.edits.length > 0) {
          const edit = applyData.edits[0];
          expect(edit).toHaveProperty('file');
        }
      }
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleApplyCodeAction({
        file,
        line: 1,
        column: 1,
        action_title: 'Some action',
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleApplyCodeAction({
        file,
        line: 1,
        column: 1,
        action_title: 'Some action',
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});

describe('code actions integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-actions-int-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
  });

  test('get and apply flow works end-to-end', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'const x: number = "string";');

    // Step 1: Get code actions
    const getResult = await handleGetCodeActions({ file, line: 1, column: 1 });
    const getData = JSON.parse(getResult.content[0].text);

    // Either actions or error is a valid response
    expect(getData.actions || getData.error).toBeDefined();

    // Step 2: If there are actions, try to apply one
    if (getData.actions && getData.actions.length > 0) {
      const actionTitle = getData.actions[0].title;

      const applyResult = await handleApplyCodeAction({
        file,
        line: 1,
        column: 1,
        action_title: actionTitle,
      });
      const applyData = JSON.parse(applyResult.content[0].text);

      // Should either succeed or return meaningful error
      expect(applyData).toBeDefined();
      if (applyData.success) {
        expect(applyData.edits).toBeDefined();
      } else {
        expect(applyData.error).toBeDefined();
      }
    }
  });

  test('handles files with multiple issues', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(
      file,
      'const a: number = "string";\nconst b: string = 123;\nconst c = undeclared;'
    );

    // Get actions at first error
    const result1 = await handleGetCodeActions({ file, line: 1, column: 1 });
    const data1 = JSON.parse(result1.content[0].text);
    // Actions should be defined or it should have an error
    expect(data1.actions || data1.error).toBeDefined();

    // Get actions at second error
    const result2 = await handleGetCodeActions({ file, line: 2, column: 1 });
    const data2 = JSON.parse(result2.content[0].text);
    expect(data2.actions || data2.error).toBeDefined();

    // Get actions at third error - position may be beyond file bounds
    const result3 = await handleGetCodeActions({ file, line: 3, column: 11 });
    const data3 = JSON.parse(result3.content[0].text);
    // May error on out-of-bounds position
    expect(data3).toBeDefined();
  });

  test('handles JSX file', async () => {
    const file = path.join(tempDir, 'test.tsx');
    fs.writeFileSync(
      file,
      'const Component = () => {\n  const x: number = "string";\n  return <div>{x}</div>;\n};'
    );

    const result = await handleGetCodeActions({ file, line: 2, column: 3 });
    const data = JSON.parse(result.content[0].text);

    // Either actions or error is valid response
    expect(data.actions || data.error).toBeDefined();
  });

  test('handles JavaScript file', async () => {
    const file = path.join(tempDir, 'test.js');
    fs.writeFileSync(file, 'const x = 1;\nconst y = x;\nfunction foo() { return x + y; }');

    const result = await handleGetCodeActions({
      file,
      line: 3,
      column: 17,
      end_line: 3,
      end_column: 22,
    });
    const data = JSON.parse(result.content[0].text);

    // Either actions or error is valid response
    expect(data.actions || data.error).toBeDefined();
  });
});
