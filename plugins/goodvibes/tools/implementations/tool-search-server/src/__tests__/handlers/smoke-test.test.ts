/**
 * Unit tests for smoke-test handler
 *
 * Tests cover:
 * - handleRunSmokeTest
 * - Different test types (typecheck, lint, build)
 * - Timeout handling
 * - Package manager detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import { handleRunSmokeTest } from '../../handlers/smoke-test.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    safeExec: vi.fn(),
    detectPackageManager: vi.fn().mockReturnValue('npm'),
  };
});

describe('smoke-test handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleRunSmokeTest', () => {
    describe('typecheck test', () => {
      it('should run TypeScript type checking', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: '',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'typecheck' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests.some((t: any) => t.name === 'typecheck')).toBe(true);
        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('tsc'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should detect typecheck errors', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: 'error TS2322: Type string is not assignable to number',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'typecheck' });
        const data = JSON.parse(result.content[0].text);
        const typecheck = data.tests.find((t: any) => t.name === 'typecheck');

        expect(typecheck.passed).toBe(false);
      });

      it('should pass when no errors', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: '',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'typecheck' });
        const data = JSON.parse(result.content[0].text);
        const typecheck = data.tests.find((t: any) => t.name === 'typecheck');

        expect(typecheck.passed).toBe(true);
      });
    });

    describe('lint test', () => {
      it('should run linting', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: '',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'lint' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests.some((t: any) => t.name === 'lint')).toBe(true);
        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('lint'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should detect lint errors', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: 'error: Unexpected console statement',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'lint' });
        const data = JSON.parse(result.content[0].text);
        const lint = data.tests.find((t: any) => t.name === 'lint');

        expect(lint.passed).toBe(false);
      });
    });

    describe('build test', () => {
      it('should run build', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: 'Build completed successfully',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'build' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests.some((t: any) => t.name === 'build')).toBe(true);
        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('build'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should detect build errors', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: 'error: Build failed',
          stderr: '',
          error: 'Build failed',
        });

        const result = await handleRunSmokeTest({ type: 'build' });
        const data = JSON.parse(result.content[0].text);
        const build = data.tests.find((t: any) => t.name === 'build');

        expect(build.passed).toBe(false);
      });
    });

    describe('all tests', () => {
      it('should run all tests when type is all', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: '',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'all' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests.some((t: any) => t.name === 'typecheck')).toBe(true);
        expect(data.tests.some((t: any) => t.name === 'lint')).toBe(true);
        expect(data.tests.some((t: any) => t.name === 'build')).toBe(true);
      });

      it('should default to all when type not specified', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: '',
          stderr: '',
        });

        const result = await handleRunSmokeTest({});
        const data = JSON.parse(result.content[0].text);

        expect(data.tests.length).toBe(3);
      });
    });

    describe('package manager detection', () => {
      it('should use npm run for npm', async () => {
        const { safeExec, detectPackageManager } = await import('../../utils.js');
        vi.mocked(detectPackageManager).mockReturnValue('npm');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        await handleRunSmokeTest({ type: 'lint' });

        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('npm run'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should use pnpm for pnpm', async () => {
        const { safeExec, detectPackageManager } = await import('../../utils.js');
        vi.mocked(detectPackageManager).mockReturnValue('pnpm');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        await handleRunSmokeTest({ type: 'lint' });

        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('pnpm'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should use yarn for yarn', async () => {
        const { safeExec, detectPackageManager } = await import('../../utils.js');
        vi.mocked(detectPackageManager).mockReturnValue('yarn');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        await handleRunSmokeTest({ type: 'lint' });

        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('yarn'),
          expect.any(String),
          expect.any(Number)
        );
      });
    });

    describe('timeout handling', () => {
      it('should use default timeout of 30 seconds', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        await handleRunSmokeTest({ type: 'typecheck' });

        expect(safeExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          30000
        );
      });

      it('should use custom timeout when provided', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        await handleRunSmokeTest({ type: 'build', timeout: 60 });

        expect(safeExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          60000
        );
      });
    });

    describe('test results', () => {
      it('should include duration_ms for each test', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({ type: 'typecheck' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests[0].duration_ms).toBeDefined();
        expect(typeof data.tests[0].duration_ms).toBe('number');
      });

      it('should include output for each test', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: 'Test output here',
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'lint' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests[0].output).toBeDefined();
      });

      it('should truncate long output', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: 'x'.repeat(1000),
          stderr: '',
        });

        const result = await handleRunSmokeTest({ type: 'build' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests[0].output.length).toBeLessThanOrEqual(500);
      });

      it('should include error when test fails', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: '',
          stderr: '',
          error: 'Command timed out',
        });

        const result = await handleRunSmokeTest({ type: 'typecheck' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tests[0].error).toBe('Command timed out');
      });
    });

    describe('summary', () => {
      it('should include summary with totals', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({ type: 'all' });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.total).toBe(3);
        expect(data.summary.passed).toBeDefined();
        expect(data.summary.failed).toBeDefined();
        expect(data.summary.duration_ms).toBeDefined();
      });

      it('should report passed as false when any test fails', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec)
          .mockResolvedValueOnce({ stdout: '', stderr: '' })
          .mockResolvedValueOnce({ stdout: 'error: lint failed', stderr: '' })
          .mockResolvedValueOnce({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({ type: 'all' });
        const data = JSON.parse(result.content[0].text);

        expect(data.passed).toBe(false);
        expect(data.summary.failed).toBeGreaterThan(0);
      });

      it('should report passed as true when all tests pass', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({ type: 'all' });
        const data = JSON.parse(result.content[0].text);

        expect(data.passed).toBe(true);
        expect(data.summary.failed).toBe(0);
      });

      it('should calculate total duration', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({ type: 'all' });
        const data = JSON.parse(result.content[0].text);

        const totalDuration = data.tests.reduce(
          (sum: number, t: any) => sum + t.duration_ms,
          0
        );
        expect(data.summary.duration_ms).toBe(totalDuration);
      });
    });

    describe('response format', () => {
      it('should return properly formatted response', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({});

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleRunSmokeTest({ type: 'all' });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});
