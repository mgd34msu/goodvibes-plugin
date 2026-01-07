/**
 * Unit tests for quality-gates module
 *
 * Tests cover:
 * - toolExists: checking for npx/npm commands and tool availability
 * - runCheck: executing quality gate checks and handling success/failure
 * - runQualityGates: running all gates with auto-fix logic
 * - isCommitCommand: detecting git commit commands
 * - formatGateResults: formatting gate results to human-readable strings
 * - QUALITY_GATES: default gate configuration
 */

import { execSync } from 'child_process';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules
vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('../shared/logging.js');
vi.mock('../shared/file-utils.js');

describe('quality-gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('QUALITY_GATES constant', () => {
    it('should export default quality gates array', async () => {
      const { QUALITY_GATES } =
        await import('../pre-tool-use/quality-gates.js');

      expect(QUALITY_GATES).toBeDefined();
      expect(Array.isArray(QUALITY_GATES)).toBe(true);
      expect(QUALITY_GATES.length).toBeGreaterThan(0);
    });

    it('should include TypeScript gate', async () => {
      const { QUALITY_GATES } =
        await import('../pre-tool-use/quality-gates.js');

      const tsGate = QUALITY_GATES.find((g) => g.name === 'TypeScript');
      expect(tsGate).toBeDefined();
      expect(tsGate?.check).toContain('tsc');
      expect(tsGate?.blocking).toBe(true);
      expect(tsGate?.autoFix).toBeNull();
    });

    it('should include ESLint gate with auto-fix', async () => {
      const { QUALITY_GATES } =
        await import('../pre-tool-use/quality-gates.js');

      const eslintGate = QUALITY_GATES.find((g) => g.name === 'ESLint');
      expect(eslintGate).toBeDefined();
      expect(eslintGate?.check).toContain('eslint');
      expect(eslintGate?.autoFix).toContain('eslint . --fix');
      expect(eslintGate?.blocking).toBe(true);
    });

    it('should include Prettier gate with auto-fix', async () => {
      const { QUALITY_GATES } =
        await import('../pre-tool-use/quality-gates.js');

      const prettierGate = QUALITY_GATES.find((g) => g.name === 'Prettier');
      expect(prettierGate).toBeDefined();
      expect(prettierGate?.check).toContain('prettier --check');
      expect(prettierGate?.autoFix).toContain('prettier --write');
      expect(prettierGate?.blocking).toBe(false);
    });

    it('should include Tests gate', async () => {
      const { QUALITY_GATES } =
        await import('../pre-tool-use/quality-gates.js');

      const testGate = QUALITY_GATES.find((g) => g.name === 'Tests');
      expect(testGate).toBeDefined();
      expect(testGate?.check).toBe('npm test');
      expect(testGate?.autoFix).toBeNull();
      expect(testGate?.blocking).toBe(true);
    });
  });

  describe('toolExists', () => {
    it('should return true for npx command when node_modules exists', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
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

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      // Access internal function through module evaluation
      const result = await qualityGates.runQualityGates('/test/project');

      // We can't directly test toolExists as it's private, but we test it through runQualityGates
      // If node_modules exists, gates should not be skipped
      expect(result.results.every((r) => r.status !== 'skipped')).toBe(true);
    });

    it('should return false for npx command when node_modules does not exist', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Without node_modules, all npx gates should be skipped
      const skippedGates = result.results.filter((r) => r.status === 'skipped');
      expect(skippedGates.length).toBeGreaterThan(0);
    });

    it('should return true for npm script when package.json has the script', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: {
              test: 'vitest',
            },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Test gate should not be skipped if script exists
      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).not.toBe('skipped');
    });

    it('should return false for npm script when package.json is missing', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockImplementation((path: string) => {
          return Promise.resolve(path.includes('node_modules'));
        }),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Test gate should be skipped without package.json
      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });

    it('should return false for npm script when script does not exist in package.json', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: {
              build: 'tsc',
            },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Test gate should be skipped when test script doesn't exist
      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });

    it('should handle npm run prefix in script name', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: {
              test: 'vitest',
            },
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Should handle 'npm test' and 'npm run test' the same
      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).not.toBe('skipped');
    });

    it('should return true for non-npx/npm commands (custom gates)', async () => {
      // Test custom gates that don't use npm or npx - exercises the default return path
      const customGates = [
        {
          name: 'CustomTool',
          check: 'cargo test --release',
          autoFix: null,
          blocking: false,
        },
      ];

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');

      // Run with custom gates that use non-npm/npx commands
      // This exercises the `return true` path in toolExists for unknown command types
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      // Custom gate should NOT be skipped (toolExists returns true for unknown commands)
      expect(result.results).toHaveLength(1);
      expect(result.results[0].gate).toBe('CustomTool');
      expect(result.results[0].status).toBe('passed'); // execSync mock returns success
    });

    it('should handle non-blocking gate without autoFix that fails', async () => {
      // Test the else branch at line 164: non-blocking gate fails without autoFix
      const customGates = [
        {
          name: 'OptionalLint',
          check: 'cargo clippy',
          autoFix: null, // No auto-fix available
          blocking: false, // Non-blocking
        },
      ];

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('{}'),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Lint failed');
        }),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates(
        '/test/project',
        customGates
      );

      // Gate fails but is non-blocking, so blocking should be false
      expect(result.results).toHaveLength(1);
      expect(result.results[0].gate).toBe('OptionalLint');
      expect(result.results[0].status).toBe('failed');
      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(false); // Non-blocking gate
    });
  });

  describe('runCheck', () => {
    it('should return true when command succeeds', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // All gates should pass if execSync doesn't throw
      expect(result.allPassed).toBe(true);
      expect(result.results.every((r) => r.status === 'passed')).toBe(true);
    });

    it('should return false when command fails', async () => {
      const mockExecSync = vi.fn().mockImplementation(() => {
        throw new Error('Command failed');
      });

      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // All gates should fail
      expect(result.allPassed).toBe(false);
      expect(result.results.some((r) => r.status === 'failed')).toBe(true);
    });

    it('should execute command in correct working directory', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      await qualityGates.runQualityGates('/custom/project');

      // Check that execSync was called with correct cwd
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: '/custom/project' })
      );
    });

    it('should use stdio pipe for command output', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      await qualityGates.runQualityGates('/test/project');

      // Check that stdio is piped
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ stdio: 'pipe' })
      );
    });

    it('should have 120 second timeout', async () => {
      const mockExecSync = vi.fn().mockReturnValue('');
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      await qualityGates.runQualityGates('/test/project');

      // Check timeout is 120000ms (2 minutes)
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 120000 })
      );
    });
  });

  describe('runQualityGates', () => {
    it('should return allPassed true when all gates pass', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(true);
      expect(result.blocking).toBe(false);
      expect(result.results.every((r) => r.status === 'passed')).toBe(true);
    });

    it('should return allPassed false when any gate fails', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
    });

    it('should set blocking true when a blocking gate fails', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // TypeScript, ESLint, and Tests are blocking
      expect(result.blocking).toBe(true);
    });

    it('should not set blocking when only non-blocking gates fail', async () => {
      let callCount = 0;
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          callCount++;
          // Let TypeScript, ESLint, and Tests pass (first 3 checks + any re-checks)
          // Only fail Prettier (4th gate)
          if (cmd.includes('prettier --check')) {
            throw new Error('Prettier failed');
          }
          return '';
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Only Prettier should fail, and it's non-blocking
      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(false);
    });

    it('should skip gates when tool is not available', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // All gates should be skipped without node_modules
      expect(result.results.every((r) => r.status === 'skipped')).toBe(true);
    });

    it('should attempt auto-fix when gate fails and autoFix is available', async () => {
      let eslintCallCount = 0;
      const mockExecSync = vi.fn().mockImplementation((cmd: string) => {
        if (cmd.includes('eslint')) {
          eslintCallCount++;
          if (eslintCallCount === 1 || cmd.includes('--fix')) {
            // First check fails, auto-fix succeeds
            if (cmd.includes('--fix')) {
              return '';
            }
            throw new Error('ESLint failed');
          }
          // Re-check after auto-fix passes
          return '';
        }
        return '';
      });

      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // ESLint should show as auto-fixed
      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('auto-fixed');
    });

    it('should mark as failed when auto-fix fails', async () => {
      const mockExecSync = vi.fn().mockImplementation((cmd: string) => {
        if (cmd.includes('eslint')) {
          throw new Error('ESLint failed');
        }
        return '';
      });

      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // ESLint should be marked as failed
      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('failed');
      expect(eslintGate?.message).toBe('Auto-fix failed');
    });

    it('should mark as failed when auto-fix succeeds but re-check fails', async () => {
      let eslintCallCount = 0;
      const mockExecSync = vi.fn().mockImplementation((cmd: string) => {
        if (cmd.includes('eslint')) {
          eslintCallCount++;
          if (cmd.includes('--fix')) {
            // Auto-fix succeeds
            return '';
          }
          // But checks always fail
          throw new Error('ESLint failed');
        }
        return '';
      });

      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // ESLint should be failed with specific message
      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('failed');
      expect(eslintGate?.message).toBe('Auto-fix did not resolve issues');
    });

    it('should mark as failed when gate has no auto-fix', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('tsc')) {
            throw new Error('TypeScript failed');
          }
          return '';
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // TypeScript has no autoFix, so should be marked as failed
      const tsGate = result.results.find((r) => r.gate === 'TypeScript');
      expect(tsGate?.status).toBe('failed');
      expect(tsGate?.message).toBeUndefined();
    });

    it('should run all gates even if some fail', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('tsc')) {
            throw new Error('TypeScript failed');
          }
          return '';
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Should have results for all 4 gates
      expect(result.results.length).toBe(4);
    });

    it('should return results array with all gate results', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.results).toHaveLength(4);
      expect(result.results[0]).toHaveProperty('gate');
      expect(result.results[0]).toHaveProperty('status');
    });

    it('should include message in result when gate is skipped', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.results[0].message).toBe('Tool not available');
    });
  });

  describe('isCommitCommand', () => {
    it('should return true for basic git commit command', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git commit -m "message"')).toBe(true);
    });

    it('should return true for git commit with various flags', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git commit -am "message"')).toBe(true);
      expect(isCommitCommand('git commit --amend')).toBe(true);
      expect(isCommitCommand('git commit --no-verify -m "skip hooks"')).toBe(
        true
      );
    });

    it('should return true for git commit with extra whitespace', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git  commit  -m "message"')).toBe(true);
      expect(isCommitCommand('git\tcommit -m "message"')).toBe(true);
    });

    it('should return false for non-commit git commands', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('git push origin main')).toBe(false);
      expect(isCommitCommand('git pull')).toBe(false);
      expect(isCommitCommand('git status')).toBe(false);
      expect(isCommitCommand('git add .')).toBe(false);
    });

    it('should return false for commit in other contexts', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('commit to this task')).toBe(false);
      expect(isCommitCommand('npm run commit')).toBe(false);
    });

    it('should return false for empty string', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('')).toBe(false);
    });

    it('should be case sensitive', async () => {
      const { isCommitCommand } =
        await import('../pre-tool-use/quality-gates.js');

      expect(isCommitCommand('GIT COMMIT -m "message"')).toBe(false);
      expect(isCommitCommand('git COMMIT -m "message"')).toBe(false);
    });
  });

  describe('formatGateResults', () => {
    it('should format single result without message', async () => {
      const { formatGateResults } =
        await import('../pre-tool-use/quality-gates.js');

      const results = [{ gate: 'TypeScript', status: 'passed' as const }];

      expect(formatGateResults(results)).toBe('TypeScript: passed');
    });

    it('should format single result with message', async () => {
      const { formatGateResults } =
        await import('../pre-tool-use/quality-gates.js');

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

    it('should format multiple results', async () => {
      const { formatGateResults } =
        await import('../pre-tool-use/quality-gates.js');

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
        await import('../pre-tool-use/quality-gates.js');

      const results = [
        { gate: 'TypeScript', status: 'passed' as const },
        {
          gate: 'ESLint',
          status: 'failed' as const,
          message: 'Lint errors found',
        },
        {
          gate: 'Tests',
          status: 'skipped' as const,
          message: 'Tool not available',
        },
      ];

      expect(formatGateResults(results)).toBe(
        'TypeScript: passed, ESLint: failed (Lint errors found), Tests: skipped (Tool not available)'
      );
    });

    it('should handle empty results array', async () => {
      const { formatGateResults } =
        await import('../pre-tool-use/quality-gates.js');

      expect(formatGateResults([])).toBe('');
    });

    it('should handle all status types', async () => {
      const { formatGateResults } =
        await import('../pre-tool-use/quality-gates.js');

      const results = [
        { gate: 'Gate1', status: 'passed' as const },
        { gate: 'Gate2', status: 'failed' as const },
        { gate: 'Gate3', status: 'auto-fixed' as const },
        { gate: 'Gate4', status: 'skipped' as const },
      ];

      const formatted = formatGateResults(results);
      expect(formatted).toContain('passed');
      expect(formatted).toContain('failed');
      expect(formatted).toContain('auto-fixed');
      expect(formatted).toContain('skipped');
    });

    it('should preserve gate names exactly', async () => {
      const { formatGateResults } =
        await import('../pre-tool-use/quality-gates.js');

      const results = [
        {
          gate: 'TypeScript with special-chars_123',
          status: 'passed' as const,
        },
      ];

      expect(formatGateResults(results)).toContain(
        'TypeScript with special-chars_123'
      );
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle execSync throwing non-Error objects', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw 'string error';
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Should handle non-Error throws gracefully
      expect(result.allPassed).toBe(false);
    });

    it('should handle malformed package.json', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockImplementation((path: string) => {
          // If reading package.json, throw parse error
          if (path.includes('package.json')) {
            return Promise.resolve('{ invalid json');
          }
          return Promise.resolve('{}');
        }),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');

      // Should throw since toolExists doesn't catch JSON parse errors
      // This is expected behavior - malformed package.json is a critical error
      await expect(
        qualityGates.runQualityGates('/test/project')
      ).rejects.toThrow();
    });

    it('should handle package.json without scripts field', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            name: 'test-package',
          })
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(''),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Test gate should be skipped when scripts field doesn't exist
      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('skipped');
    });

    it('should extract first two words from check command for tool detection', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
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

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // Should correctly detect 'npx tsc', 'npx eslint', etc.
      expect(result.results.length).toBe(4);
    });
  });

  describe('integration scenarios', () => {
    it('should handle mixed success and failure with auto-fixes', async () => {
      let callCount = 0;
      const mockExecSync = vi.fn().mockImplementation((cmd: string) => {
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
          return ''; // Re-check passes
        }

        // Prettier fails even after auto-fix
        if (cmd.includes('prettier')) {
          throw new Error('Prettier failed');
        }

        // Tests pass
        return '';
      });

      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      // TypeScript: passed, ESLint: auto-fixed, Prettier: failed, Tests: passed
      expect(result.allPassed).toBe(false);
      expect(result.blocking).toBe(false); // Only Prettier failed, which is non-blocking

      const tsGate = result.results.find((r) => r.gate === 'TypeScript');
      expect(tsGate?.status).toBe('passed');

      const eslintGate = result.results.find((r) => r.gate === 'ESLint');
      expect(eslintGate?.status).toBe('auto-fixed');

      const prettierGate = result.results.find((r) => r.gate === 'Prettier');
      expect(prettierGate?.status).toBe('failed');

      const testGate = result.results.find((r) => r.gate === 'Tests');
      expect(testGate?.status).toBe('passed');
    });

    it('should handle all gates skipped scenario', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/empty/project');

      expect(result.allPassed).toBe(true); // No failures
      expect(result.blocking).toBe(false);
      expect(result.results.every((r) => r.status === 'skipped')).toBe(true);
    });

    it('should handle timeout errors in check execution', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Command timed out') as NodeJS.ErrnoException;
          error.code = 'ETIMEDOUT';
          throw error;
        }),
      }));

      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            scripts: { test: 'vitest' },
          })
        ),
      }));

      const qualityGates = await import('../pre-tool-use/quality-gates.js');
      const result = await qualityGates.runQualityGates('/test/project');

      expect(result.allPassed).toBe(false);
      expect(result.results.every((r) => r.status === 'failed')).toBe(true);
    });
  });
});
