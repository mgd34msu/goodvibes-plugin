/**
 * Unit tests for pre-tool-use/quality-gates module
 *
 * Tests cover:
 * - QUALITY_GATES: default gate configuration
 * - toolExists: checking for npx/npm commands and tool availability
 * - runCheck: executing quality gate checks and handling success/failure
 * - runQualityGates: running all gates with auto-fix logic
 * - isCommitCommand: detecting git commit commands
 * - formatGateResults: formatting gate results to human-readable strings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before imports
vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('../../shared/logging.js');
vi.mock('../../shared/file-utils.js');

describe('quality-gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('QUALITY_GATES constant', () => {
    it('should export default quality gates array with 4 gates', async () => {
      const { QUALITY_GATES } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(QUALITY_GATES).toBeDefined();
      expect(Array.isArray(QUALITY_GATES)).toBe(true);
      expect(QUALITY_GATES.length).toBe(4);
    });

    it('should include TypeScript gate with correct properties', async () => {
      const { QUALITY_GATES } =
        await import('../../pre-tool-use/quality-gates.js');

      const tsGate = QUALITY_GATES.find((g) => g.name === 'TypeScript');
      expect(tsGate).toBeDefined();
      expect(tsGate?.check).toBe('npx tsc --noEmit');
      expect(tsGate?.autoFix).toBeNull();
      expect(tsGate?.blocking).toBe(true);
    });

    it('should include ESLint gate with auto-fix capability', async () => {
      const { QUALITY_GATES } =
        await import('../../pre-tool-use/quality-gates.js');

      const eslintGate = QUALITY_GATES.find((g) => g.name === 'ESLint');
      expect(eslintGate).toBeDefined();
      expect(eslintGate?.check).toBe('npx eslint . --max-warnings=0');
      expect(eslintGate?.autoFix).toBe('npx eslint . --fix');
      expect(eslintGate?.blocking).toBe(true);
    });

    it('should include Prettier gate as non-blocking with auto-fix', async () => {
      const { QUALITY_GATES } =
        await import('../../pre-tool-use/quality-gates.js');

      const prettierGate = QUALITY_GATES.find((g) => g.name === 'Prettier');
      expect(prettierGate).toBeDefined();
      expect(prettierGate?.check).toBe('npx prettier --check .');
      expect(prettierGate?.autoFix).toBe('npx prettier --write .');
      expect(prettierGate?.blocking).toBe(false);
    });

    it('should include Tests gate without auto-fix', async () => {
      const { QUALITY_GATES } =
        await import('../../pre-tool-use/quality-gates.js');

      const testGate = QUALITY_GATES.find((g) => g.name === 'Tests');
      expect(testGate).toBeDefined();
      expect(testGate?.check).toBe('npm test');
      expect(testGate?.autoFix).toBeNull();
      expect(testGate?.blocking).toBe(true);
    });
  });

  describe('toolExists (via runQualityGates)', () => {
    it('should detect npx command availability when node_modules exists', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // All gates should run (not skipped)
      expect(result.results.every((r) => r.status !== 'skipped')).toBe(true);
    });

    it('should skip npx gates when node_modules does not exist', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // All gates should be skipped
      expect(result.results.every((r) => r.status === 'skipped')).toBe(true);
      expect(result.results[0].message).toBe('Tool not available');
    });

    it('should detect npm script availability in package.json', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest run' },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('passed');
    });

    it('should skip npm script gate when package.json is missing', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockImplementation((path: string) => {
          return Promise.resolve(path.includes('node_modules'));
        }),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });

    it('should skip npm script when script does not exist in package.json', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { build: 'tsc' }, // no test script
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });

    it('should handle npm run prefix in script name', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        // The toolExists function extracts 'npm run' from 'npm run test'
        // then replaces 'npm ' with '' and 'run ' with '' leaving 'run'
        // So it looks for scripts.run, not scripts.test
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { run: 'some-script', test: 'vitest' },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');

      // The toolExists extracts first two words: 'npm run'
      // Then replaces 'npm ' -> '' and 'run ' -> '' = 'run'
      // So it checks for scripts.run in package.json
      const customGates = [
        {
          name: 'RunTest',
          check: 'npm run test',
          autoFix: null,
          blocking: true,
        },
      ];
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      expect(result.results[0].status).toBe('passed');
    });

    it('should return true for non-npx/npm commands (custom tools)', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');

      // Custom gate with cargo command (not npm/npx)
      const customGates = [
        {
          name: 'CargoTest',
          check: 'cargo test --release',
          autoFix: null,
          blocking: false,
        },
      ];
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      expect(result.results[0].status).toBe('passed');
      expect(result.results[0].gate).toBe('CargoTest');
    });

    it('should handle package.json without scripts field', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            name: 'test-package',
            version: '1.0.0',
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });
  });

  describe('runCheck (via runQualityGates)', () => {
    it('should return passed status when command succeeds', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(true);
      expect(result.results.every((r) => r.status === 'passed')).toBe(true);
    });

    it('should return failed status when command throws', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Command failed');
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.results.some((r) => r.status === 'failed')).toBe(true);
    });

    it('should call execSync with correct cwd parameter', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      await qualityGates.runQualityGates('/custom/path');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: '/custom/path' })
      );
    });

    it('should use stdio pipe option', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      await qualityGates.runQualityGates('/test/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ stdio: 'pipe' })
      );
    });

    it('should set 120 second timeout', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      await qualityGates.runQualityGates('/test/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 120000 })
      );
    });
  });

  describe('runQualityGates', () => {
    it('should return allPassed true and blocking false when all gates pass', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(true);
      expect(result.blocking).toBe(false);
    });

    it('should return blocking true when a blocking gate fails', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('tsc')) {
            throw new Error('TypeScript error');
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(true);
    });

    it('should return blocking false when only non-blocking gate fails', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('prettier --check')) {
            throw new Error('Prettier failed');
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(false);
    });

    it('should attempt auto-fix when gate fails and autoFix is available', async () => {
      let eslintCheckCount = 0;
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('eslint')) {
            if (cmd.includes('--fix')) {
              return ''; // auto-fix succeeds
            }
            eslintCheckCount++;
            if (eslintCheckCount === 1) {
              throw new Error('ESLint failed'); // first check fails
            }
            return ''; // re-check passes
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('auto-fixed');
    });

    it('should mark as failed with message when auto-fix command throws', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('eslint')) {
            throw new Error('ESLint error');
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('failed');
      expect(eslintGate?.message).toBe('Auto-fix failed');
    });

    it('should mark as failed when auto-fix succeeds but re-check fails', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('eslint')) {
            if (cmd.includes('--fix')) {
              return ''; // auto-fix succeeds
            }
            throw new Error('ESLint check failed'); // checks always fail
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('failed');
      expect(eslintGate?.message).toBe('Auto-fix did not resolve issues');
    });

    it('should mark as failed without message when gate has no autoFix', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('tsc')) {
            throw new Error('TypeScript error');
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const tsGate = result.results.find((r) => r.gate === 'TypeScript');
      expect(tsGate?.status).toBe('failed');
      expect(tsGate?.message).toBeUndefined();
    });

    it('should run all gates even if early ones fail', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('tsc')) {
            throw new Error('TypeScript error');
          }
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.results.length).toBe(4);
    });

    it('should use default QUALITY_GATES when no gates parameter provided', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.results.length).toBe(4);
      expect(result.results.map((r) => r.gate)).toEqual([
        'TypeScript',
        'ESLint',
        'Prettier',
        'Tests',
      ]);
    });

    it('should use custom gates when provided', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const customGates = [
        {
          name: 'CustomGate',
          check: 'custom-check',
          autoFix: null,
          blocking: true,
        },
      ];
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      expect(result.results.length).toBe(1);
      expect(result.results[0].gate).toBe('CustomGate');
    });

    it('should handle non-blocking gate failure without autoFix', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Check failed');
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const customGates = [
        {
          name: 'OptionalLint',
          check: 'optional-lint',
          autoFix: null,
          blocking: false,
        },
      ];
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      expect(result.results[0].status).toBe('failed');
      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(false);
    });

    it('should handle blocking gate failure after autoFix re-check fails', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('--fix')) {
            return ''; // auto-fix succeeds
          }
          throw new Error('Check failed'); // checks always fail
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const customGates = [
        {
          name: 'BlockingLint',
          check: 'blocking-lint',
          autoFix: 'blocking-lint --fix',
          blocking: true,
        },
      ];
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].message).toBe('Auto-fix did not resolve issues');
      expect(result.blocking).toBe(true);
    });

    it('should handle non-blocking gate with auto-fix failure', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('All commands fail');
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const customGates = [
        {
          name: 'OptionalFormat',
          check: 'format-check',
          autoFix: 'format-fix',
          blocking: false,
        },
      ];
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].message).toBe('Auto-fix failed');
      expect(result.blocking).toBe(false);
    });
  });

  describe('isCommitCommand', () => {
    it('should return true for basic git commit command', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git commit -m "message"')).toBe(true);
    });

    it('should return true for git commit with various flags', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git commit -am "message"')).toBe(true);
      expect(isCommitCommand('git commit --amend')).toBe(true);
      expect(isCommitCommand('git commit --no-verify -m "skip"')).toBe(true);
    });

    it('should return true for git commit with extra whitespace', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git  commit  -m "message"')).toBe(true);
      expect(isCommitCommand('git\tcommit -m "message"')).toBe(true);
    });

    it('should return false for non-commit git commands', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git push origin main')).toBe(false);
      expect(isCommitCommand('git pull')).toBe(false);
      expect(isCommitCommand('git status')).toBe(false);
      expect(isCommitCommand('git add .')).toBe(false);
    });

    it('should return false for commit word in other contexts', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('commit to this task')).toBe(false);
      expect(isCommitCommand('npm run commit')).toBe(false);
    });

    it('should return false for empty string', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('')).toBe(false);
    });

    it('should be case sensitive', async () => {
      const { isCommitCommand } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('GIT COMMIT -m "message"')).toBe(false);
      expect(isCommitCommand('git COMMIT -m "message"')).toBe(false);
    });
  });

  describe('formatGateResults', () => {
    it('should format single result without message', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      const results = [{ gate: 'TypeScript', status: 'passed' as const }];
      expect(formatGateResults(results)).toBe('TypeScript: passed');
    });

    it('should format single result with message', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      const results = [
        {
          gate: 'ESLint',
          status: 'failed' as const,
          message: 'Auto-fix failed',
        },
      ];
      expect(formatGateResults(results)).toBe(
        'ESLint: failed (Auto-fix failed)'
      );
    });

    it('should format multiple results separated by comma', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      const results = [
        { gate: 'TypeScript', status: 'passed' as const },
        { gate: 'ESLint', status: 'auto-fixed' as const },
        { gate: 'Prettier', status: 'failed' as const },
      ];

      expect(formatGateResults(results)).toBe(
        'TypeScript: passed, ESLint: auto-fixed, Prettier: failed'
      );
    });

    it('should format results with mixed messages', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      const results = [
        { gate: 'TypeScript', status: 'passed' as const },
        { gate: 'ESLint', status: 'failed' as const, message: 'Lint errors' },
        {
          gate: 'Tests',
          status: 'skipped' as const,
          message: 'Tool not available',
        },
      ];

      expect(formatGateResults(results)).toBe(
        'TypeScript: passed, ESLint: failed (Lint errors), Tests: skipped (Tool not available)'
      );
    });

    it('should return empty string for empty results array', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      expect(formatGateResults([])).toBe('');
    });

    it('should handle all status types', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      const results = [
        { gate: 'G1', status: 'passed' as const },
        { gate: 'G2', status: 'failed' as const },
        { gate: 'G3', status: 'auto-fixed' as const },
        { gate: 'G4', status: 'skipped' as const },
      ];

      const formatted = formatGateResults(results);
      expect(formatted).toContain('passed');
      expect(formatted).toContain('failed');
      expect(formatted).toContain('auto-fixed');
      expect(formatted).toContain('skipped');
    });

    it('should preserve gate names with special characters', async () => {
      const { formatGateResults } =
        await import('../../pre-tool-use/quality-gates.js');

      const results = [{ gate: 'Gate-123_special', status: 'passed' as const }];

      expect(formatGateResults(results)).toContain('Gate-123_special');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle execSync throwing non-Error objects', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw 'string error'; // non-Error throw
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
    });

    it('should throw when package.json contains invalid JSON', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{ invalid json'),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');

      await expect(
        qualityGates.runQualityGates('/test/project')
      ).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Command timed out') as NodeJS.ErrnoException;
          error.code = 'ETIMEDOUT';
          throw error;
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.results.some((r) => r.status === 'failed')).toBe(true);
    });

    it('should handle all gates being skipped', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/empty/project');

      expect(result.allPassed).toBe(true);
      expect(result.blocking).toBe(false);
      expect(result.results.every((r) => r.status === 'skipped')).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle mixed success, failure, and auto-fix across gates', async () => {
      let callCount = 0;
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          callCount++;

          // TypeScript passes
          if (cmd.includes('tsc')) {
            return '';
          }

          // ESLint fails then auto-fixes
          if (cmd.includes('eslint')) {
            if (cmd.includes('--fix')) {
              return '';
            }
            if (callCount <= 2) {
              throw new Error('ESLint failed');
            }
            return '';
          }

          // Prettier fails
          if (cmd.includes('prettier')) {
            throw new Error('Prettier failed');
          }

          // Tests pass
          return '';
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(false);

      const tsGate = result.results.find((r) => r.gate === 'TypeScript');
      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      const prettierGate = result.results.find((r) => r.gate === 'Prettier');
      const testGate = result.results.find((r) => r.gate === 'Tests');

      expect(tsGate?.status).toBe('passed');
      expect(eslintGate?.status).toBe('auto-fixed');
      expect(prettierGate?.status).toBe('failed');
      expect(testGate?.status).toBe('passed');
    });

    it('should correctly extract tool from check command for detection', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Verifies tool extraction works: 'npx tsc', 'npx eslint', etc.
      expect(result.results.length).toBe(4);
      expect(result.results.every((r) => r.status === 'passed')).toBe(true);
    });
  });
});
