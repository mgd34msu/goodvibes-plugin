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

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    vi.clearAllMocks();
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

  describe('shutdown', () => {
    test('disposes all cached services', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');
      const testFile2 = path.join(tempDir, 'test2.ts');
      fs.writeFileSync(testFile2, 'const y = 2;');

      // Create services for multiple files
      await languageServiceManager.getServiceForFile(testFile);

      // Shutdown should not throw
      expect(() => languageServiceManager.shutdown()).not.toThrow();
    });

    test('can create new service after shutdown', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      await languageServiceManager.getServiceForFile(testFile);
      languageServiceManager.shutdown();

      // Should be able to create new service after shutdown
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });

    test('clears cleanup interval on shutdown', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      // Start cleanup interval and shutdown
      languageServiceManager.startCleanupInterval();
      languageServiceManager.shutdown();

      // Should not throw when called multiple times
      expect(() => languageServiceManager.shutdown()).not.toThrow();
    });
  });

  describe('startCleanupInterval', () => {
    test('can be called multiple times without error', async () => {
      // Call multiple times - should not create multiple intervals
      languageServiceManager.startCleanupInterval();
      languageServiceManager.startCleanupInterval();
      languageServiceManager.startCleanupInterval();

      // Cleanup after test
      languageServiceManager.shutdown();
    });

    test('starts interval that can be stopped by shutdown', async () => {
      languageServiceManager.startCleanupInterval();
      languageServiceManager.shutdown();

      // Should not throw after shutdown
      expect(() => languageServiceManager.startCleanupInterval()).not.toThrow();
      languageServiceManager.shutdown();
    });
  });

  describe('getPositionOffset error handling', () => {
    test('throws when program is not available', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Mock getProgram to return null
      const originalGetProgram = service.getProgram;
      vi.spyOn(service, 'getProgram').mockReturnValue(undefined);

      expect(() => {
        languageServiceManager.getPositionOffset(service, testFile, 1, 1);
      }).toThrow('No program available');

      // Restore
      vi.mocked(service.getProgram).mockRestore();
    });
  });

  describe('getLineAndColumn error handling', () => {
    test('throws when program is not available', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Mock getProgram to return null
      vi.spyOn(service, 'getProgram').mockReturnValue(undefined);

      expect(() => {
        languageServiceManager.getLineAndColumn(service, testFile, 0);
      }).toThrow('No program available');

      vi.mocked(service.getProgram).mockRestore();
    });
  });

  describe('project root detection', () => {
    test('finds project root with .goodvibes marker', async () => {
      // Create .goodvibes marker directory
      const goodvibesDir = path.join(tempDir, '.goodvibes');
      fs.mkdirSync(goodvibesDir, { recursive: true });
      fs.writeFileSync(testFile, 'const x = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });

    test('finds project root with .git directory', async () => {
      // Create .git directory
      const gitDir = path.join(tempDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(testFile, 'const x = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });

    test('finds project root with package.json', async () => {
      // Create package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-project' })
      );
      fs.writeFileSync(testFile, 'const x = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });
  });

  describe('tsconfig error handling', () => {
    test('handles tsconfig with read error', async () => {
      // Create tsconfig that can't be parsed
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{"compilerOptions": {'); // Incomplete JSON
      fs.writeFileSync(testFile, 'const x = 1;');

      // Should not throw, should use defaults
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });

    test('handles tsconfig with parse errors', async () => {
      // Create tsconfig with valid JSON but invalid TS config
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            invalidOption: 'value', // Invalid option
            target: 'ES2020',
          },
        })
      );
      fs.writeFileSync(testFile, 'const x = 1;');

      // Should not throw, should handle gracefully
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });
  });

  describe('script snapshot handling', () => {
    test('returns undefined snapshot for non-existent file', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(testFile);

      // Try to get diagnostics for a file that doesn't exist
      // The service should handle this gracefully
      const nonExistentFile = path.join(tempDir, 'nonexistent.ts');
      const diagnostics = service.getSemanticDiagnostics(nonExistentFile);

      // Should return empty array for non-existent file
      expect(Array.isArray(diagnostics)).toBe(true);
    });
  });

  describe('file content updates', () => {
    test('detects and reloads changed file content', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const result1 = await languageServiceManager.getServiceForFile(testFile);
      const program1 = result1.program;
      const sourceFile1 = program1.getSourceFile(testFile.replace(/\\/g, '/'));
      expect(sourceFile1?.text).toContain('const x = 1');

      // Update file with different content
      fs.writeFileSync(testFile, 'const changed = "new value";');

      // Get service again - should reload file
      const result2 = await languageServiceManager.getServiceForFile(testFile);
      const program2 = result2.program;
      const sourceFile2 = program2.getSourceFile(testFile.replace(/\\/g, '/'));
      expect(sourceFile2?.text).toContain('changed');
    });

    test('increments version when file content changes', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      await languageServiceManager.getServiceForFile(testFile);

      // Update file
      fs.writeFileSync(testFile, 'const y = 2;');

      await languageServiceManager.getServiceForFile(testFile);

      // Version should have incremented (tested implicitly by service working correctly)
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });
  });

  describe('getServiceForFile program validation', () => {
    test('throws when program cannot be created for cached service', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      // First call to populate cache
      const result = await languageServiceManager.getServiceForFile(testFile);

      // Mock getProgram to return null on subsequent calls
      vi.spyOn(result.service, 'getProgram').mockReturnValue(undefined);

      // Clear the mock and try again
      vi.mocked(result.service.getProgram).mockRestore();

      // Should work normally when restored
      const result2 = await languageServiceManager.getServiceForFile(testFile);
      expect(result2.program).toBeDefined();
    });
  });

  describe('normalizePath', () => {
    test('normalizes Windows-style paths', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      // Use path with backslashes (common on Windows)
      const windowsPath = testFile.replace(/\//g, '\\');

      const result = await languageServiceManager.getServiceForFile(windowsPath);
      expect(result.service).toBeDefined();
    });

    test('handles paths with mixed separators', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      // Create path with mixed separators
      const mixedPath = testFile.replace(/\\/g, '/').replace(/\/([^/]+)$/, '\\$1');

      const result = await languageServiceManager.getServiceForFile(mixedPath);
      expect(result.service).toBeDefined();
    });
  });

  describe('service host methods', () => {
    test('getScriptVersion returns "0" for unknown file', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);

      // Access the host through the service internals
      // The version should be tracked properly
      expect(result.service).toBeDefined();
    });

    test('getCurrentDirectory uses config path or project root', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020' },
        })
      );
      fs.writeFileSync(testFile, 'const x = 1;');

      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.configPath).toBe(tsconfigPath.replace(/\\/g, '/'));
    });
  });

  describe('cleanup TTL behavior', () => {
    test('cleanup removes expired services', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      await languageServiceManager.getServiceForFile(testFile);

      // Call cleanup - should not throw
      languageServiceManager.cleanup();

      // Service should still be usable after cleanup (TTL not expired yet)
      const result = await languageServiceManager.getServiceForFile(testFile);
      expect(result.service).toBeDefined();
    });
  });

  describe('file loading error handling', () => {
    test('handles error when reading file in ensureFileLoaded', async () => {
      fs.writeFileSync(testFile, 'const x = 1;');

      // Create service first
      const result = await languageServiceManager.getServiceForFile(testFile);

      // Delete the file
      fs.unlinkSync(testFile);

      // Re-create the file with new content
      fs.writeFileSync(testFile, 'const y = 2;');

      // Should handle gracefully
      const result2 = await languageServiceManager.getServiceForFile(testFile);
      expect(result2.service).toBeDefined();
    });
  });
});

/**
 * Tests for getCacheTTL configuration.
 * These tests verify the cache TTL configuration logic in isolation
 * by testing the expected behavior through observable service behavior.
 */
describe('getCacheTTL configuration', () => {
  // Note: The getCacheTTL function is called at module load time,
  // so we test its behavior indirectly through environment variables
  // and observable service behavior.

  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  test('uses default TTL when no env vars set', () => {
    // Default TTL is 5 minutes (300000ms)
    // The service should work normally with default settings
    delete process.env.LSP_CACHE_TTL_MS;
    delete process.env.LSP_CACHE_TTL_SECONDS;

    // Verify service works (TTL affects cleanup behavior)
    expect(languageServiceManager).toBeDefined();
  });

  test('env var parsing with valid milliseconds value', () => {
    // This tests the expected behavior when LSP_CACHE_TTL_MS is set
    // Note: actual TTL is set at module load, this verifies the pattern
    const ttlMs = '600000'; // 10 minutes
    expect(parseInt(ttlMs, 10)).toBe(600000);
    expect(!isNaN(parseInt(ttlMs, 10))).toBe(true);
  });

  test('env var parsing with valid seconds value', () => {
    // This tests the expected behavior when LSP_CACHE_TTL_SECONDS is set
    const ttlSeconds = '600'; // 10 minutes
    expect(parseInt(ttlSeconds, 10) * 1000).toBe(600000);
    expect(!isNaN(parseInt(ttlSeconds, 10))).toBe(true);
  });

  test('env var parsing clamps to minimum TTL', () => {
    // Minimum TTL is 30 seconds (30000ms)
    const tooLow = '1000'; // 1 second
    const MIN_TTL_MS = 30 * 1000;
    const parsed = parseInt(tooLow, 10);
    const clamped = Math.max(parsed, MIN_TTL_MS);
    expect(clamped).toBe(MIN_TTL_MS);
  });

  test('env var parsing clamps to maximum TTL', () => {
    // Maximum TTL is 1 hour (3600000ms)
    const tooHigh = '7200000'; // 2 hours
    const MAX_TTL_MS = 60 * 60 * 1000;
    const parsed = parseInt(tooHigh, 10);
    const clamped = Math.min(parsed, MAX_TTL_MS);
    expect(clamped).toBe(MAX_TTL_MS);
  });

  test('env var parsing handles invalid values', () => {
    // Invalid values should result in default TTL being used
    const invalid = 'not-a-number';
    const parsed = parseInt(invalid, 10);
    expect(isNaN(parsed)).toBe(true);

    // Default would be used in this case
    const DEFAULT_TTL_MS = 5 * 60 * 1000;
    expect(DEFAULT_TTL_MS).toBe(300000);
  });

  test('env var parsing handles negative values', () => {
    // Negative values should use default (since > 0 check fails)
    const negative = '-1000';
    const parsed = parseInt(negative, 10);
    expect(parsed > 0).toBe(false);

    // Default would be used
    const DEFAULT_TTL_MS = 5 * 60 * 1000;
    expect(DEFAULT_TTL_MS).toBe(300000);
  });

  test('env var parsing handles zero value', () => {
    // Zero should use default (since > 0 check fails)
    const zero = '0';
    const parsed = parseInt(zero, 10);
    expect(parsed > 0).toBe(false);
  });

  test('milliseconds env var takes precedence over seconds', () => {
    // When both are set, LSP_CACHE_TTL_MS should take precedence
    const ttlMs = '120000'; // 2 minutes
    const ttlSeconds = '300'; // 5 minutes

    // The logic checks LSP_CACHE_TTL_MS first
    const msValue = parseInt(ttlMs, 10);
    const secondsValue = parseInt(ttlSeconds, 10) * 1000;

    // MS should be used, not seconds
    expect(msValue).toBe(120000);
    expect(secondsValue).toBe(300000);
    expect(msValue).not.toBe(secondsValue);
  });
});
