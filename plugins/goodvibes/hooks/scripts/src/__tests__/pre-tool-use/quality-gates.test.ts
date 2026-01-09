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
import {
  createChildProcessMock,
  createChildProcessFailureMock,
} from '../helpers/test-utils.js';

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

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
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

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });

    it('should return true for non-npx/npm commands (custom tools)', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
  });

  describe('runCheck (via runQualityGates)', () => {
    it('should return passed status when command succeeds', async () => {
      vi.doMock('child_process', () => createChildProcessMock());

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

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(true);
      expect(result.results.every((r) => r.status === 'passed')).toBe(true);
    });

    it('should return failed status when command throws', async () => {
      vi.doMock('child_process', () =>
        createChildProcessFailureMock('Command failed')
      );

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

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.results.some((r) => r.status === 'failed')).toBe(true);
    });

    it('should call exec with correct cwd parameter', async () => {
      const mockExec = vi.fn((cmd, options, callback) => {
        callback(null, '', '');
      });
      vi.doMock('child_process', () => ({
        exec: mockExec,
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

      expect(mockExec).toHaveBeenCalled();
      const firstCall = mockExec.mock.calls[0];
      expect(firstCall[1]).toMatchObject({ cwd: '/custom/path' });
    });

    it('should set 120 second timeout', async () => {
      const mockExec = vi.fn((cmd, options, callback) => {
        callback(null, '', '');
      });
      vi.doMock('child_process', () => ({
        exec: mockExec,
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

      expect(mockExec).toHaveBeenCalled();
      const firstCall = mockExec.mock.calls[0];
      expect(firstCall[1]).toMatchObject({ timeout: 120000 });
    });
  });

  describe('runQualityGates', () => {
    it('should return allPassed true and blocking false when all gates pass', async () => {
      vi.doMock('child_process', () => createChildProcessMock());

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

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(true);
      expect(result.blocking).toBe(false);
    });

    it('should return blocking true when a blocking gate fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('tsc')) {
            callback(new Error('TypeScript error'), '', '');
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('prettier --check')) {
            callback(new Error('Prettier failed'), '', '');
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('eslint')) {
            if (cmd.includes('--fix')) {
              callback(null, '', ''); // auto-fix succeeds
            } else {
              eslintCheckCount++;
              if (eslintCheckCount === 1) {
                callback(new Error('ESLint failed'), '', ''); // first check fails
              } else {
                callback(null, '', ''); // re-check passes
              }
            }
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('eslint')) {
            callback(new Error('ESLint error'), '', '');
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('eslint')) {
            if (cmd.includes('--fix')) {
              callback(null, '', ''); // auto-fix succeeds
            } else {
              callback(new Error('ESLint check failed'), '', ''); // checks always fail
            }
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('tsc')) {
            callback(new Error('TypeScript error'), '', '');
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('tsc')) {
            callback(new Error('TypeScript error'), '', '');
          } else {
            callback(null, '', '');
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
      vi.doMock('child_process', () => createChildProcessMock());

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

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
      vi.doMock('child_process', () => createChildProcessMock());

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

    it('should handle blocking gate failure after autoFix re-check fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          if (cmd.includes('--fix')) {
            callback(null, '', ''); // auto-fix succeeds
          } else {
            callback(new Error('Check failed'), '', ''); // checks always fail
          }
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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
        exec: vi.fn((cmd: string, options: any, callback: Function) => {
          callback(new Error('All commands fail'), '', '');
        }),
      }));

      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
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

    it('should handle all gates being skipped', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => createChildProcessMock());
      vi.doMock('../../shared/logging.js', () => ({
        debug: vi.fn(),
        logError: vi.fn(),
      }));

      const qualityGates = await import('../../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/empty/project');

      expect(result.allPassed).toBe(true);
      expect(result.blocking).toBe(false);
      expect(result.results.every((r) => r.status === 'skipped')).toBe(true);
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
  });
});
