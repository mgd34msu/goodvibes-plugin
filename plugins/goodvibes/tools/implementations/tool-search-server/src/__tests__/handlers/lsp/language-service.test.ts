/**
 * Unit tests for LanguageServiceManager
 *
 * Tests the TypeScript Language Service infrastructure that powers all LSP tools.
 * Tests cover service creation, caching, position conversion, and cleanup.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import ts from 'typescript';

// We need to test against the actual implementation
// Import the module to test the singleton behavior
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

describe('LanguageServiceManager', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-test-'));
    testFile = path.join(tempDir, 'test.ts');
  });

  afterEach(() => {
    // Clean up the temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Run cleanup to clear cached services
    languageServiceManager.cleanup();
  });

  describe('getServiceForFile', () => {
    test('creates service for TypeScript file', async () => {
      fs.writeFileSync(testFile, 'const x: number = 1;\nconst y = x + 1;\n');

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.service).toBeDefined();
      expect(result.program).toBeDefined();
      expect(typeof result.service.getSemanticDiagnostics).toBe('function');
    });

    test('reuses cached service for same directory', async () => {
      fs.writeFileSync(testFile, 'const x: number = 1;');
      const testFile2 = path.join(tempDir, 'test2.ts');
      fs.writeFileSync(testFile2, 'const y: string = "hello";');

      const result1 = await languageServiceManager.getServiceForFile(testFile);
      const result2 = await languageServiceManager.getServiceForFile(testFile2);

      // Both files in same directory should use same service
      expect(result1.service).toBe(result2.service);
    });

    test('handles missing tsconfig gracefully', async () => {
      fs.writeFileSync(testFile, 'const x: number = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);

      // Should still work with default options
      expect(result.service).toBeDefined();
      expect(result.configPath).toBeNull();
    });

    test('uses tsconfig when present', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            strict: true,
          },
        })
      );
      fs.writeFileSync(testFile, 'const x: number = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.configPath).not.toBeNull();
      expect(result.configPath).toContain('tsconfig.json');
    });

    test('handles JavaScript files', async () => {
      const jsFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(jsFile, 'const x = 1;\nconst y = x + 1;');

      const result = await languageServiceManager.getServiceForFile(jsFile);

      expect(result.service).toBeDefined();
      expect(result.program).toBeDefined();
    });

    test('handles file with syntax errors', async () => {
      fs.writeFileSync(testFile, 'const x: number = ;\n');

      const result = await languageServiceManager.getServiceForFile(testFile);

      // Should still create service despite syntax errors
      expect(result.service).toBeDefined();

      // Should be able to get diagnostics
      const diagnostics = result.service.getSyntacticDiagnostics(testFile);
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    test('updates file content when changed', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const result1 = await languageServiceManager.getServiceForFile(testFile);
      const program1 = result1.program;
      const sourceFile1 = program1.getSourceFile(testFile.replace(/\\/g, '/'));
      expect(sourceFile1?.text).toContain('const x = 1');

      // Update file content
      fs.writeFileSync(testFile, 'const y = 2;');

      // Get service again - should see updated content
      const result2 = await languageServiceManager.getServiceForFile(testFile);
      const program2 = result2.program;
      const sourceFile2 = program2.getSourceFile(testFile.replace(/\\/g, '/'));
      expect(sourceFile2?.text).toContain('const y = 2');
    });

    test('handles relative file paths', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      // Save current directory and change to tempDir
      const originalCwd = process.cwd();
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await languageServiceManager.getServiceForFile('test.ts');
        expect(result.service).toBeDefined();
      } finally {
        process.env.PROJECT_ROOT = originalCwd;
      }
    });
  });

  describe('getPositionOffset', () => {
    test('converts line/column to offset correctly', async () => {
      // 'const x' - x is at position 6 (0-indexed), which is line 1, column 7 (1-indexed)
      fs.writeFileSync(testFile, 'const x: number = 1;\nconst y = x + 1;\n');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Line 1, column 7 should be at 'x' in 'const x'
      const offset = languageServiceManager.getPositionOffset(
        service,
        testFile,
        1,
        7
      );
      expect(offset).toBe(6); // 'const ' is 6 chars (0-5), 'x' is at index 6
    });

    test('converts first position correctly', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);
      const offset = languageServiceManager.getPositionOffset(service, testFile, 1, 1);

      expect(offset).toBe(0);
    });

    test('handles second line position', async () => {
      fs.writeFileSync(testFile, 'const x = 1;\nconst y = 2;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);
      const offset = languageServiceManager.getPositionOffset(service, testFile, 2, 1);

      // First line is 12 chars + newline = 13
      expect(offset).toBe(13);
    });

    test('throws for non-existent file in service', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      expect(() => {
        languageServiceManager.getPositionOffset(
          service,
          path.join(tempDir, 'nonexistent.ts'),
          1,
          1
        );
      }).toThrow();
    });
  });

  describe('getLineAndColumn', () => {
    test('converts offset to line/column correctly', async () => {
      fs.writeFileSync(testFile, 'const x: number = 1;\nconst y = x + 1;\n');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Offset 6 should be 'x' in 'const x' - line 1, column 7
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        testFile,
        6
      );

      expect(line).toBe(1);
      expect(column).toBe(7);
    });

    test('converts offset 0 to line 1, column 1', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        testFile,
        0
      );

      expect(line).toBe(1);
      expect(column).toBe(1);
    });

    test('handles position on second line', async () => {
      fs.writeFileSync(testFile, 'const x = 1;\nconst y = 2;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);
      // Offset 13 is start of second line
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        testFile,
        13
      );

      expect(line).toBe(2);
      expect(column).toBe(1);
    });

    test('throws for non-existent file in service', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      expect(() => {
        languageServiceManager.getLineAndColumn(
          service,
          path.join(tempDir, 'nonexistent.ts'),
          0
        );
      }).toThrow();
    });
  });

  describe('cleanup', () => {
    test('cleans up without throwing', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');
      await languageServiceManager.getServiceForFile(testFile);

      // Cleanup should not throw
      expect(() => languageServiceManager.cleanup()).not.toThrow();
    });

    test('can create new service after cleanup', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      await languageServiceManager.getServiceForFile(testFile);
      languageServiceManager.cleanup();

      // Should be able to create new service
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });
  });

  describe('position conversion round-trip', () => {
    test('offset to position to offset is consistent', async () => {
      fs.writeFileSync(
        testFile,
        'const x = 1;\nconst y = 2;\nconst z = 3;'
      );

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Test various offsets
      const testOffsets = [0, 5, 13, 20, 26];

      for (const originalOffset of testOffsets) {
        const { line, column } = languageServiceManager.getLineAndColumn(
          service,
          testFile,
          originalOffset
        );
        const roundTripOffset = languageServiceManager.getPositionOffset(
          service,
          testFile,
          line,
          column
        );

        expect(roundTripOffset).toBe(originalOffset);
      }
    });

    test('position to offset to position is consistent', async () => {
      fs.writeFileSync(
        testFile,
        'const x = 1;\nconst y = 2;\nconst z = 3;'
      );

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Test various positions
      const testPositions = [
        { line: 1, column: 1 },
        { line: 1, column: 7 },
        { line: 2, column: 1 },
        { line: 2, column: 5 },
        { line: 3, column: 1 },
      ];

      for (const { line: origLine, column: origColumn } of testPositions) {
        const offset = languageServiceManager.getPositionOffset(
          service,
          testFile,
          origLine,
          origColumn
        );
        const { line, column } = languageServiceManager.getLineAndColumn(
          service,
          testFile,
          offset
        );

        expect(line).toBe(origLine);
        expect(column).toBe(origColumn);
      }
    });
  });

  describe('tsconfig handling', () => {
    test('reads tsconfig with extends', async () => {
      // Create a base config
      const baseConfigPath = path.join(tempDir, 'tsconfig.base.json');
      fs.writeFileSync(
        baseConfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            strict: true,
          },
        })
      );

      // Create main config that extends base
      const mainConfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        mainConfigPath,
        JSON.stringify({
          extends: './tsconfig.base.json',
          compilerOptions: {
            module: 'ESNext',
          },
        })
      );

      fs.writeFileSync(testFile, 'const x: number = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.configPath).not.toBeNull();
      expect(result.service).toBeDefined();
    });

    test('handles invalid tsconfig gracefully', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ invalid json }');
      fs.writeFileSync(testFile, 'const x: number = 1;');

      // Should not throw, should fall back to defaults
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });
  });

  describe('multi-file scenarios', () => {
    test('handles imports between files', async () => {
      const moduleFile = path.join(tempDir, 'module.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(moduleFile, 'export const foo = 42;');
      fs.writeFileSync(
        mainFile,
        'import { foo } from "./module";\nconsole.log(foo);'
      );

      const { service } = await languageServiceManager.getServiceForFile(mainFile);

      // Should be able to get diagnostics without import errors
      const diagnostics = service.getSemanticDiagnostics(mainFile);
      const importErrors = diagnostics.filter(
        (d) => ts.flattenDiagnosticMessageText(d.messageText, '\n').includes('Cannot find module')
      );

      expect(importErrors.length).toBe(0);
    });

    test('handles type imports', async () => {
      const typesFile = path.join(tempDir, 'types.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(
        typesFile,
        'export interface User { id: string; name: string; }'
      );
      fs.writeFileSync(
        mainFile,
        'import type { User } from "./types";\nconst user: User = { id: "1", name: "Test" };'
      );

      const { service } = await languageServiceManager.getServiceForFile(mainFile);

      // Should resolve types correctly
      const diagnostics = service.getSemanticDiagnostics(mainFile);
      const typeErrors = diagnostics.filter(
        (d) =>
          ts.flattenDiagnosticMessageText(d.messageText, '\n').includes('Cannot find') ||
          ts.flattenDiagnosticMessageText(d.messageText, '\n').includes('Type')
      );

      expect(typeErrors.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      fs.writeFileSync(testFile, '');

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.service).toBeDefined();
      expect(result.program).toBeDefined();
    });

    test('handles file with only whitespace', async () => {
      fs.writeFileSync(testFile, '   \n   \n   ');

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.service).toBeDefined();
    });

    test('handles file with unicode characters', async () => {
      fs.writeFileSync(
        testFile,
        'const greeting = "Hello, \u4e16\u754c";\nconst emoji = "\ud83d\ude00";'
      );

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.service).toBeDefined();

      // Position conversion should still work
      const offset = languageServiceManager.getPositionOffset(
        result.service,
        testFile,
        1,
        7
      );
      expect(offset).toBe(6);
    });

    test('handles file with CRLF line endings', async () => {
      fs.writeFileSync(testFile, 'const x = 1;\r\nconst y = 2;\r\n');

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.service).toBeDefined();

      // Second line should start after CRLF
      const { line, column } = languageServiceManager.getLineAndColumn(
        result.service,
        testFile,
        14 // 'const x = 1;' (12) + '\r\n' (2) = 14
      );

      expect(line).toBe(2);
      expect(column).toBe(1);
    });

    test('handles very long lines', async () => {
      const longLine = 'const x = ' + '"a"'.repeat(1000) + ';';
      fs.writeFileSync(testFile, longLine);

      const result = await languageServiceManager.getServiceForFile(testFile);

      expect(result.service).toBeDefined();

      // Should be able to get position at end of long line
      const offset = languageServiceManager.getPositionOffset(
        result.service,
        testFile,
        1,
        longLine.length
      );
      expect(offset).toBe(longLine.length - 1);
    });
  });
});
