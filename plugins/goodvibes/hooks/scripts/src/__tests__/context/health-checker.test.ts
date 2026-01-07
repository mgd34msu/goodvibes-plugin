/**
 * Unit tests for health-checker.ts
 *
 * Tests all exported functions with 100% coverage including:
 * - checkProjectHealth
 * - formatHealthStatus
 * - All edge cases and error paths
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  checkProjectHealth,
  formatHealthStatus,
  HealthStatus,
  HealthCheck,
} from '../../context/health-checker.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));
vi.mock('../../shared/index.js', () => ({
  LOCKFILES: ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb'],
  fileExists: vi.fn(),
}));

const mockedFs = vi.mocked(fs);
const mockedFileExists = vi.mocked(
  (await import('../../shared/index.js')).fileExists
);
const mockedDebug = vi.mocked((await import('../../shared/logging.js')).debug);

describe('health-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    mockedFileExists.mockResolvedValue(false);
  });

  describe('checkProjectHealth', () => {
    it('should return empty checks when all is healthy', async () => {
      // No package.json and no node_modules means no warning
      // No multiple lockfiles
      // No tsconfig.json
      const result = await checkProjectHealth('/test/empty');

      expect(result.checks).toEqual([]);
    });

    it('should warn when package.json exists but node_modules is missing', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.checks).toContainEqual({
        check: 'dependencies',
        status: 'warning',
        message: 'node_modules missing - run install',
      });
    });

    it('should not warn when both package.json and node_modules exist', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json') || p.includes('node_modules');
      });

      const result = await checkProjectHealth('/test/project');

      const dependencyChecks = result.checks.filter(
        (c) => c.check === 'dependencies'
      );
      expect(dependencyChecks).toHaveLength(0);
    });

    it('should not warn when node_modules exists without package.json', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('node_modules');
      });

      const result = await checkProjectHealth('/test/project');

      const dependencyChecks = result.checks.filter(
        (c) => c.check === 'dependencies'
      );
      expect(dependencyChecks).toHaveLength(0);
    });

    it('should detect single lockfile without warning', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package-lock.json');
      });

      const result = await checkProjectHealth('/test/project');

      const lockfileChecks = result.checks.filter(
        (c) => c.check === 'lockfiles'
      );
      expect(lockfileChecks).toHaveLength(0);
    });

    it('should warn when multiple lockfiles exist', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package-lock.json') || p.includes('yarn.lock');
      });

      const result = await checkProjectHealth('/test/project');

      const lockfileCheck = result.checks.find((c) => c.check === 'lockfiles');
      expect(lockfileCheck).toBeDefined();
      expect(lockfileCheck!.status).toBe('warning');
      expect(lockfileCheck!.message).toContain('Multiple lockfiles found');
      expect(lockfileCheck!.message).toContain('package-lock.json');
      expect(lockfileCheck!.message).toContain('yarn.lock');
    });

    it('should warn with all lockfiles when more than two exist', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return (
          p.includes('package-lock.json') ||
          p.includes('yarn.lock') ||
          p.includes('pnpm-lock.yaml')
        );
      });

      const result = await checkProjectHealth('/test/project');

      const lockfileCheck = result.checks.find((c) => c.check === 'lockfiles');
      expect(lockfileCheck).toBeDefined();
      expect(lockfileCheck!.message).toContain('pnpm-lock.yaml');
      expect(lockfileCheck!.message).toContain('yarn.lock');
      expect(lockfileCheck!.message).toContain('package-lock.json');
    });

    it('should add info check when TypeScript strict mode is disabled', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strict: false,
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.checks).toContainEqual({
        check: 'typescript',
        status: 'info',
        message: 'TypeScript strict mode is off',
      });
    });

    it('should add info check when TypeScript compilerOptions is missing', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          extends: './base.json',
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.checks).toContainEqual({
        check: 'typescript',
        status: 'info',
        message: 'TypeScript strict mode is off',
      });
    });

    it('should add info check when strict is undefined in compilerOptions', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.checks).toContainEqual({
        check: 'typescript',
        status: 'info',
        message: 'TypeScript strict mode is off',
      });
    });

    it('should not add info check when TypeScript strict mode is enabled', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strict: true,
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      const tsChecks = result.checks.filter((c) => c.check === 'typescript');
      expect(tsChecks).toHaveLength(0);
    });

    it('should handle invalid JSON in tsconfig.json gracefully', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue('{ invalid json');

      const result = await checkProjectHealth('/test/project');

      // Should not crash, should debug log
      expect(mockedDebug).toHaveBeenCalledWith(
        'health-checker: Failed to parse tsconfig.json',
        expect.any(SyntaxError)
      );
      // No typescript check should be added since parsing failed
      const tsChecks = result.checks.filter((c) => c.check === 'typescript');
      expect(tsChecks).toHaveLength(0);
    });

    it('should handle file read error for tsconfig.json gracefully', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await checkProjectHealth('/test/project');

      // Should not crash, should debug log
      expect(mockedDebug).toHaveBeenCalledWith(
        'health-checker: Failed to parse tsconfig.json',
        expect.any(Error)
      );
      const tsChecks = result.checks.filter((c) => c.check === 'typescript');
      expect(tsChecks).toHaveLength(0);
    });

    it('should return multiple checks when multiple issues exist', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return (
          p.includes('package.json') ||
          p.includes('package-lock.json') ||
          p.includes('yarn.lock') ||
          p.includes('tsconfig.json')
        );
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strict: false,
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      // Should have: dependencies warning, lockfiles warning, typescript info
      expect(result.checks.length).toBe(3);
      expect(
        result.checks.find((c) => c.check === 'dependencies')
      ).toBeDefined();
      expect(result.checks.find((c) => c.check === 'lockfiles')).toBeDefined();
      expect(result.checks.find((c) => c.check === 'typescript')).toBeDefined();
    });

    it('should return no checks for fully healthy project', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return (
          p.includes('package.json') ||
          p.includes('node_modules') ||
          p.includes('package-lock.json') ||
          p.includes('tsconfig.json')
        );
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strict: true,
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.checks).toEqual([]);
    });
  });

  describe('formatHealthStatus', () => {
    it('should return "Health: All good" when no checks exist', () => {
      const status: HealthStatus = { checks: [] };

      const result = formatHealthStatus(status);

      expect(result).toBe('Health: All good');
    });

    it('should format warning check with [!] icon', () => {
      const status: HealthStatus = {
        checks: [
          {
            check: 'dependencies',
            status: 'warning',
            message: 'node_modules missing - run install',
          },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toBe('Health:\n[!] node_modules missing - run install');
    });

    it('should format error check with [X] icon', () => {
      const status: HealthStatus = {
        checks: [
          {
            check: 'critical',
            status: 'error',
            message: 'Critical error occurred',
          },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toBe('Health:\n[X] Critical error occurred');
    });

    it('should format info check with [i] icon', () => {
      const status: HealthStatus = {
        checks: [
          {
            check: 'typescript',
            status: 'info',
            message: 'TypeScript strict mode is off',
          },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toBe('Health:\n[i] TypeScript strict mode is off');
    });

    it('should format ok check with [i] icon', () => {
      const status: HealthStatus = {
        checks: [
          {
            check: 'test',
            status: 'ok',
            message: 'Everything is fine',
          },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toBe('Health:\n[i] Everything is fine');
    });

    it('should format multiple checks on separate lines', () => {
      const status: HealthStatus = {
        checks: [
          {
            check: 'dependencies',
            status: 'warning',
            message: 'node_modules missing',
          },
          {
            check: 'lockfiles',
            status: 'warning',
            message: 'Multiple lockfiles found',
          },
          {
            check: 'typescript',
            status: 'info',
            message: 'TypeScript strict mode is off',
          },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toBe(
        'Health:\n' +
          '[!] node_modules missing\n' +
          '[!] Multiple lockfiles found\n' +
          '[i] TypeScript strict mode is off'
      );
    });

    it('should handle mixed status types correctly', () => {
      const status: HealthStatus = {
        checks: [
          { check: 'a', status: 'error', message: 'Error message' },
          { check: 'b', status: 'warning', message: 'Warning message' },
          { check: 'c', status: 'info', message: 'Info message' },
          { check: 'd', status: 'ok', message: 'OK message' },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toContain('[X] Error message');
      expect(result).toContain('[!] Warning message');
      expect(result).toContain('[i] Info message');
      expect(result).toContain('[i] OK message');
    });
  });
});
