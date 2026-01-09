/**
 * Unit tests for issues handler
 *
 * Tests cover:
 * - TODO scanning with priority classification
 * - Health warning detection
 * - Environment issue detection
 * - Output formatting
 * - Edge cases and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { handleProjectIssues } from '../../handlers/issues.js';

// Mock fs module
vi.mock('fs');

// Helper to check if path is the test directory root
function isTestPath(pathStr: string): boolean {
  return pathStr.endsWith('test') || pathStr.endsWith('test\\') || pathStr.endsWith('test/') || pathStr === 'C:\\test' || pathStr === '/test';
}

// Type-safe mock helpers for fs types
function createMockStats(options: { isDirectory: boolean }): fs.Stats {
  return {
    isDirectory: () => options.isDirectory,
    isFile: () => !options.isDirectory,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as fs.Stats;
}

/**
 * Create a properly typed mock Dirent object for testing.
 *
 * Note: fs.Dirent is a complex generic type from Node.js that varies based on encoding.
 * For testing purposes, we provide all required methods and use type assertion.
 * This is safe because vitest mocks don't require full type compatibility.
 */
function createMockDirent(name: string, options: { isDirectory: boolean }): fs.Dirent {
  return {
    name,
    isDirectory: () => options.isDirectory,
    isFile: () => !options.isDirectory,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: name,
    parentPath: '.',
  } as fs.Dirent;
}

/**
 * Type-safe helper to mock fs.readdirSync with an array of Dirent objects.
 *
 * This helper avoids `as any` by using a targeted type assertion that preserves
 * type safety while satisfying vitest's mock typing requirements.
 */
function mockReaddirSync(dirents: fs.Dirent[]): void {
  vi.mocked(fs.readdirSync).mockReturnValue(
    dirents as unknown as ReturnType<typeof fs.readdirSync>
  );
}

/**
 * Type-safe helper to mock fs.readdirSync with conditional logic.
 *
 * This helper avoids `as any` by using a targeted type assertion for the return type
 * while maintaining type safety for the implementation function.
 */
function mockReaddirSyncImpl(impl: (dir: fs.PathLike) => fs.Dirent[]): void {
  vi.mocked(fs.readdirSync).mockImplementation((dir) =>
    impl(dir) as unknown as ReturnType<typeof fs.readdirSync>
  );
}

describe('handleProjectIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: path exists and is a directory
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
    // Default: empty directory
    mockReaddirSync([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('TODO scanning', () => {
    it('should detect FIXME as high priority', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
      mockReaddirSync([
        createMockDirent('app.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Handle edge case\nconst x = 1;');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (1)');
      expect(output).toContain('**FIXME**');
      expect(output).toContain('Handle edge case');
    });

    it('should detect BUG as high priority', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('api.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// BUG: Race condition here\nconst x = 1;');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (1)');
      expect(output).toContain('**BUG**');
    });

    it('should detect TODO with urgent keyword as high priority', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('service.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// TODO: URGENT fix before release\n');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (1)');
    });

    it('should detect regular TODO as medium priority', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('utils.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// TODO: Refactor this later\n');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (0)');
      expect(output).toContain('Medium-Priority TODOs (1)');
    });

    it('should detect NOTE as low priority', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('config.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// NOTE: This is intentional\n');

      const result = handleProjectIssues({ path: '/test', include_low_priority: true });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (0)');
    });

    it('should include file:line location', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('handler.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('line1\nline2\n// FIXME: Fix this\nline4');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('handler.ts:3');
    });

    it('should skip node_modules directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSyncImpl((dir) => {
        if (String(dir) === '/test') {
          return [
            createMockDirent('node_modules', { isDirectory: true }),
            createMockDirent('src', { isDirectory: true }),
          ];
        }
        if (String(dir).includes('node_modules')) {
          return [
            createMockDirent('lib.ts', { isDirectory: false }),
          ];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Should not appear\n');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (0)');
    });

    it('should skip test files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('handler.test.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Test fixture\n');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('High-Priority TODOs (0)');
    });

    it('should skip __tests__ directory', () => {
      // Mock path validation to pass, but config files to not exist
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr); // Only pass path validation, no configs
      });
      // Mock to only allow scanning the root directory, which only contains __tests__
      let scanCount = 0;
      mockReaddirSyncImpl(() => {
        scanCount++;
        if (scanCount === 1) {
          // First call is the root - return only __tests__ directory
          return [
            createMockDirent('__tests__', { isDirectory: true }),
          ];
        }
        // Any subsequent call should not happen (since __tests__ should be skipped)
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Test\n');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      // __tests__ directory should be skipped, so no TODOs found
      expect(output).toContain('High-Priority TODOs (0)');
      // Verify we only scanned once (the root)
      expect(scanCount).toBe(1);
    });
  });

  describe('health checking', () => {
    it('should warn when node_modules missing but lockfile exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Return true for path validation (ends with /test or \test)
        if (pathStr.endsWith('test') || pathStr.endsWith('test\\') || pathStr.endsWith('test/')) return true;
        if (pathStr.includes('package-lock.json')) return true;
        if (pathStr.includes('node_modules')) return false;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('node_modules not found');
      expect(output).toContain('npm install');
    });

    it('should warn about multiple lockfiles', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Return true for path validation
        if (pathStr.endsWith('test') || pathStr.endsWith('test\\') || pathStr.endsWith('test/')) return true;
        return pathStr.includes('package-lock.json') || pathStr.includes('yarn.lock');
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('Multiple lockfiles');
    });

    it('should suggest strict mode for TypeScript', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Return true for path validation
        if (pathStr.endsWith('test') || pathStr.endsWith('test\\') || pathStr.endsWith('test/')) return true;
        return pathStr.includes('tsconfig.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{"compilerOptions": {"target": "ES2020"}}');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('strict mode is not enabled');
    });

    it('should not warn when strict mode is enabled', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr) || pathStr.includes('tsconfig.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{"compilerOptions": {"strict": true}}');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).not.toContain('strict mode is not enabled');
    });

    it('should suggest adding lint script', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr) || pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{"scripts": {"build": "tsc"}}');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('lint');
    });

    it('should suggest adding test script', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr) || pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{"scripts": {"lint": "eslint ."}}');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('test');
    });
  });

  describe('environment checking', () => {
    it('should detect missing env vars from .env.example', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr) || pathStr.includes('.env.example') || pathStr.endsWith('.env');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('.env.example')) {
          return 'DATABASE_URL=\nAPI_KEY=\n';
        }
        if (String(p).endsWith('.env')) {
          return 'DATABASE_URL=postgres://...\n';
        }
        return '';
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('Missing env var: API_KEY');
    });

    it('should warn about sensitive vars not gitignored', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr) || pathStr.endsWith('.env') || pathStr.includes('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).endsWith('.env')) {
          return 'API_KEY=secret123\n';
        }
        if (String(p).includes('.gitignore')) {
          return 'node_modules\n'; // .env not in gitignore
        }
        return '';
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('API_KEY');
      expect(output).toContain('may not be gitignored');
    });

    it('should not warn when .env is properly gitignored', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr) || pathStr.endsWith('.env') || pathStr.includes('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).endsWith('.env')) {
          return 'API_KEY=secret123\n';
        }
        if (String(p).includes('.gitignore')) {
          return 'node_modules\n.env\n';
        }
        return '';
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).not.toContain('may not be gitignored');
    });
  });

  describe('output formatting', () => {
    it('should return formatted markdown', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr); // Only pass path validation
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## Project Issues');
    });

    it('should show success message when no issues', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr); // Only pass path validation, no configs
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      expect(output).toContain('(0 total)');
      expect(output).toContain('No high-priority TODOs found');
      expect(output).toContain('No health warnings');
      expect(output).toContain('No environment issues');
    });

    it('should count total issues correctly', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Pass path validation + lockfile exists (triggers node_modules warning)
        return isTestPath(pathStr) || pathStr.includes('package-lock.json');
      });
      mockReaddirSync([
        createMockDirent('app.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Issue 1\n// FIXME: Issue 2\n');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      // 2 FIXMEs + 1 health warning (node_modules missing)
      expect(output).toContain('(3 total)');
    });
  });

  describe('edge cases', () => {
    it('should handle read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('broken.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => handleProjectIssues({ path: '/test' })).not.toThrow();
    });

    it('should handle empty directory', () => {
      // Empty directory - no files, no lockfiles, no configs
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return isTestPath(pathStr); // Only pass path validation, no configs
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({ path: '/test' });

      expect(result.content[0].text).toContain('(0 total)');
    });

    it('should use current directory when path not specified', () => {
      // When path is not specified, handler uses process.cwd()
      // Mock to pass path validation for any path (since cwd is dynamic)
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleProjectIssues({});

      expect(result.content[0].text).toContain('## Project Issues');
    });

    it('should limit medium-priority TODOs when include_low_priority is false', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockReaddirSync([
        createMockDirent('big.ts', { isDirectory: false }),
      ]);

      // Create content with 15 TODOs
      const todos = Array.from({ length: 15 }, (_, i) => `// TODO: Task ${i + 1}`).join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(todos);

      const result = handleProjectIssues({ path: '/test', include_low_priority: false });
      const output = result.content[0].text;

      expect(output).toContain('Medium-Priority TODOs');
      expect(output).toContain('more...');
    });

    it('should return error when path does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handleProjectIssues({ path: '/nonexistent' });
      const output = result.content[0].text;

      expect(output).toContain('Error: Path does not exist');
    });

    it('should return error when path is not a directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: false }));

      const result = handleProjectIssues({ path: '/test/file.ts' });
      const output = result.content[0].text;

      expect(output).toContain('Error: Path is not a directory');
    });

    it('should detect multi-line TODO comment', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
      mockReaddirSync([
        createMockDirent('code.ts', { isDirectory: false }),
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('/* FIXME: This spans\n   multiple lines */');

      const result = handleProjectIssues({ path: '/test' });
      const output = result.content[0].text;

      // The TODO pattern matches line by line, so it should find "FIXME: This spans"
      expect(output).toContain('High-Priority TODOs (1)');
      expect(output).toContain('FIXME');
    });
  });
});
