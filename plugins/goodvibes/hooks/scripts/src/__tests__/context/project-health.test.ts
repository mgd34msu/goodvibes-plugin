/**
 * Unit tests for project-health.ts
 *
 * Tests all exported functions with 100% coverage including:
 * - checkProjectHealth
 * - formatProjectHealth
 * - All internal helper functions via integration
 * - All edge cases and error paths
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  checkProjectHealth,
  formatProjectHealth,
  TypeScriptHealth,
  HealthWarning,
} from '../../context/project-health.js';

import type { ProjectHealth } from '../../context/project-health.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));
vi.mock('../../shared/file-utils.js', () => ({
  fileExists: vi.fn(),
}));

const mockedFs = vi.mocked(fs);
const mockedFileExists = vi.mocked(
  (await import('../../shared/file-utils.js')).fileExists
);
const mockedDebug = vi.mocked((await import('../../shared/logging.js')).debug);

describe('project-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    mockedFileExists.mockResolvedValue(false);
  });

  describe('checkProjectHealth', () => {
    it('should return empty health status when no files exist', async () => {
      const result = await checkProjectHealth('/test/empty');

      expect(result).toEqual({
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: expect.arrayContaining([
          expect.stringContaining('lint'),
          expect.stringContaining('test'),
        ]),
      });
    });

    it('should detect node_modules when it exists', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('node_modules');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.hasNodeModules).toBe(true);
    });

    it('should detect npm lockfile and package manager', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package-lock.json');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.lockfiles).toEqual(['package-lock.json']);
      expect(result.packageManager).toBe('npm');
      expect(result.hasMultipleLockfiles).toBe(false);
    });

    it('should detect yarn lockfile and package manager', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('yarn.lock');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.lockfiles).toEqual(['yarn.lock']);
      expect(result.packageManager).toBe('yarn');
    });

    it('should detect pnpm lockfile and package manager', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('pnpm-lock.yaml');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.lockfiles).toEqual(['pnpm-lock.yaml']);
      expect(result.packageManager).toBe('pnpm');
    });

    it('should detect bun lockfile and package manager', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('bun.lockb');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.lockfiles).toEqual(['bun.lockb']);
      expect(result.packageManager).toBe('bun');
    });

    it('should detect multiple lockfiles and set first as package manager', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return (
          p.includes('package-lock.json') ||
          p.includes('yarn.lock') ||
          p.includes('pnpm-lock.yaml')
        );
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.lockfiles).toHaveLength(3);
      expect(result.lockfiles).toContain('package-lock.json');
      expect(result.lockfiles).toContain('yarn.lock');
      expect(result.lockfiles).toContain('pnpm-lock.yaml');
      expect(result.hasMultipleLockfiles).toBe(true);
      expect(result.packageManager).toBe('npm'); // First one found
    });

    it('should warn when lockfiles exist but node_modules does not', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package-lock.json');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.hasNodeModules).toBe(false);
      expect(result.lockfiles).toEqual(['package-lock.json']);
      expect(result.warnings).toContainEqual({
        type: 'warning',
        message: expect.stringContaining('node_modules not found'),
      });
    });

    it('should warn when multiple lockfiles exist', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package-lock.json') || p.includes('yarn.lock');
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.warnings).toContainEqual({
        type: 'warning',
        message: expect.stringContaining('Multiple lockfiles found'),
      });
    });

    it('should parse TypeScript config with strict mode enabled', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: true,
        strictNullChecks: true,
        noImplicitAny: true,
        target: 'ES2020',
      });
    });

    it('should parse TypeScript config without strict mode', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strict: false,
            target: 'ES2015',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: 'ES2015',
      });
    });

    it('should parse TypeScript config with explicit strictNullChecks', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            strictNullChecks: true,
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: true,
        noImplicitAny: false,
        target: null,
      });
    });

    it('should parse TypeScript config with explicit noImplicitAny', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: {
            noImplicitAny: true,
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: true,
        target: null,
      });
    });

    it('should parse TypeScript config with comments', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(`{
        // This is a comment
        "compilerOptions": {
          /* Block comment */
          "strict": true,
          // Another comment
          "target": "ES2020"
        }
      }`);

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: true,
        strictNullChecks: true,
        noImplicitAny: true,
        target: 'ES2020',
      });
    });

    it('should handle TypeScript config without compilerOptions', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          extends: './base.json',
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: null,
      });
    });

    it('should handle TypeScript config with null compilerOptions (line 113 branch)', async () => {
      // Test the ?? {} operator on line 113 when compilerOptions is explicitly null
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: null,
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: null,
      });
    });

    it('should handle TypeScript config with undefined compilerOptions (line 113 branch)', async () => {
      // Test the ?? {} operator on line 113 when compilerOptions is undefined
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: undefined,
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: null,
      });
    });

    it('should handle invalid TypeScript config JSON', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockResolvedValue('{ invalid json');

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: null,
      });
      expect(mockedDebug).toHaveBeenCalledWith(
        'project-health failed',
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should handle TypeScript config read error', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json');
      });
      mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await checkProjectHealth('/test/project');

      expect(result.typescript).toEqual({
        hasConfig: true,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: null,
      });
      expect(mockedDebug).toHaveBeenCalled();
    });

    it('should warn when TypeScript is not in strict mode', async () => {
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

      expect(result.warnings).toContainEqual({
        type: 'info',
        message: expect.stringContaining('strict mode is not enabled'),
      });
    });

    it('should not warn when TypeScript is in strict mode', async () => {
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

      const strictWarnings = result.warnings.filter((w) =>
        w.message.includes('strict mode')
      );
      expect(strictWarnings).toHaveLength(0);
    });

    it('should read package.json scripts', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
            test: 'vitest',
            lint: 'eslint .',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.scripts).toEqual(['dev', 'build', 'test', 'lint']);
    });

    it('should handle package.json without scripts', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          name: 'my-package',
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.scripts).toEqual([]);
    });

    it('should handle package.json with null scripts (line 158 branch)', async () => {
      // Test the ?? {} operator on line 158 when scripts is explicitly null
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          name: 'my-package',
          scripts: null,
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.scripts).toEqual([]);
    });

    it('should handle package.json with undefined scripts (line 158 branch)', async () => {
      // Test the ?? {} operator on line 158 when scripts is undefined
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          name: 'my-package',
          scripts: undefined,
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.scripts).toEqual([]);
    });

    it('should handle invalid package.json', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue('{ invalid json');

      const result = await checkProjectHealth('/test/project');

      expect(result.scripts).toEqual([]);
      expect(mockedDebug).toHaveBeenCalled();
    });

    it('should handle package.json read error', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await checkProjectHealth('/test/project');

      expect(result.scripts).toEqual([]);
      expect(mockedDebug).toHaveBeenCalled();
    });

    it('should suggest adding lint script when missing', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            dev: 'vite',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.suggestions).toContainEqual(
        expect.stringContaining('lint')
      );
    });

    it('should not suggest lint script when eslint script exists', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            eslint: 'eslint .',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      const lintSuggestions = result.suggestions.filter((s) =>
        s.includes('lint')
      );
      expect(lintSuggestions).toHaveLength(0);
    });

    it('should suggest adding test script when missing', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            dev: 'vite',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      expect(result.suggestions).toContainEqual(
        expect.stringContaining('test')
      );
    });

    it('should not suggest test script when jest script exists', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            jest: 'jest',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      const testSuggestions = result.suggestions.filter((s) =>
        s.includes('test')
      );
      expect(testSuggestions).toHaveLength(0);
    });

    it('should not suggest test script when vitest script exists', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            vitest: 'vitest',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      const testSuggestions = result.suggestions.filter((s) =>
        s.includes('test')
      );
      expect(testSuggestions).toHaveLength(0);
    });

    it('should suggest typecheck script when TypeScript exists but no typecheck script', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json') || p.includes('package.json');
      });
      mockedFs.readFile.mockImplementation(async (p: string) => {
        if (p.toString().includes('tsconfig.json')) {
          return JSON.stringify({ compilerOptions: { strict: true } });
        }
        return JSON.stringify({ scripts: { dev: 'vite' } });
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.suggestions).toContainEqual(
        expect.stringContaining('typecheck')
      );
    });

    it('should not suggest typecheck when tsc script exists', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json') || p.includes('package.json');
      });
      mockedFs.readFile.mockImplementation(async (p: string) => {
        if (p.toString().includes('tsconfig.json')) {
          return JSON.stringify({ compilerOptions: { strict: true } });
        }
        return JSON.stringify({ scripts: { tsc: 'tsc --noEmit' } });
      });

      const result = await checkProjectHealth('/test/project');

      const typecheckSuggestions = result.suggestions.filter((s) =>
        s.includes('typecheck')
      );
      expect(typecheckSuggestions).toHaveLength(0);
    });

    it('should not suggest typecheck when no TypeScript', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('package.json');
      });
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            dev: 'vite',
          },
        })
      );

      const result = await checkProjectHealth('/test/project');

      const typecheckSuggestions = result.suggestions.filter((s) =>
        s.includes('typecheck')
      );
      expect(typecheckSuggestions).toHaveLength(0);
    });

    it('should limit suggestions to maximum of 3', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return p.includes('tsconfig.json') || p.includes('package.json');
      });
      mockedFs.readFile.mockImplementation(async (p: string) => {
        if (p.toString().includes('tsconfig.json')) {
          return JSON.stringify({ compilerOptions: { strict: true } });
        }
        return JSON.stringify({ scripts: {} });
      });

      const result = await checkProjectHealth('/test/project');

      expect(result.suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should handle comprehensive project with all features', async () => {
      mockedFileExists.mockImplementation(async (p: string) => {
        return (
          p.includes('node_modules') ||
          p.includes('package-lock.json') ||
          p.includes('tsconfig.json') ||
          p.includes('package.json')
        );
      });
      mockedFs.readFile.mockImplementation(async (p: string) => {
        if (p.toString().includes('tsconfig.json')) {
          return JSON.stringify({
            compilerOptions: {
              strict: true,
              target: 'ES2022',
            },
          });
        }
        return JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
            test: 'vitest',
            lint: 'eslint .',
            typecheck: 'tsc --noEmit',
          },
        });
      });

      const result = await checkProjectHealth('/test/project');

      expect(result).toEqual({
        hasNodeModules: true,
        lockfiles: ['package-lock.json'],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: true,
          strictNullChecks: true,
          noImplicitAny: true,
          target: 'ES2022',
        },
        packageManager: 'npm',
        scripts: ['dev', 'build', 'test', 'lint', 'typecheck'],
        warnings: [],
        suggestions: [],
      });
    });
  });

  describe('formatProjectHealth', () => {
    it('should return null when no sections to display', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBeNull();
    });

    it('should format package manager with dependencies installed', () => {
      const health: ProjectHealth = {
        hasNodeModules: true,
        lockfiles: ['package-lock.json'],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: 'npm',
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**Package Manager:** npm');
    });

    it('should format package manager without dependencies installed', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: ['package-lock.json'],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: 'npm',
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe(
        '**Package Manager:** npm (dependencies not installed)'
      );
    });

    it('should format TypeScript with strict mode enabled', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: true,
          strictNullChecks: true,
          noImplicitAny: true,
          target: 'ES2020',
        },
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe(
        '**TypeScript:** strict mode enabled, target: ES2020'
      );
    });

    it('should format TypeScript with strict mode enabled and no target', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: true,
          strictNullChecks: true,
          noImplicitAny: true,
          target: null,
        },
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**TypeScript:** strict mode enabled');
    });

    it('should format TypeScript with partial strict flags', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: false,
          strictNullChecks: true,
          noImplicitAny: true,
          target: 'ES2015',
        },
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe(
        '**TypeScript:** partial (strictNullChecks, noImplicitAny), target: ES2015'
      );
    });

    it('should format TypeScript with only strictNullChecks', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: false,
          strictNullChecks: true,
          noImplicitAny: false,
          target: null,
        },
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**TypeScript:** partial (strictNullChecks)');
    });

    it('should format TypeScript with only noImplicitAny', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: false,
          strictNullChecks: false,
          noImplicitAny: true,
          target: null,
        },
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**TypeScript:** partial (noImplicitAny)');
    });

    it('should format TypeScript as not strict when no flags enabled', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: false,
          strictNullChecks: false,
          noImplicitAny: false,
          target: null,
        },
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**TypeScript:** not strict');
    });

    it('should format important scripts only', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: ['dev', 'build', 'test', 'custom-script', 'another-script'],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**Scripts:** dev, build, test');
    });

    it('should format all important scripts', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: ['dev', 'build', 'start', 'test', 'lint', 'typecheck'],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe(
        '**Scripts:** dev, build, start, test, lint, typecheck'
      );
    });

    it('should not format scripts section when no important scripts', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: ['custom1', 'custom2', 'custom3'],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBeNull();
    });

    it('should format error warning with [!] icon', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [
          {
            type: 'error',
            message: 'Critical error',
          },
        ],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toContain('[!] Critical error');
    });

    it('should format warning with [*] icon', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [
          {
            type: 'warning',
            message: 'Warning message',
          },
        ],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toContain('[*] Warning message');
    });

    it('should format info warning with [i] icon', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [
          {
            type: 'info',
            message: 'Info message',
          },
        ],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toContain('[i] Info message');
    });

    it('should format multiple warnings', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [
          { type: 'error', message: 'Error 1' },
          { type: 'warning', message: 'Warning 1' },
          { type: 'info', message: 'Info 1' },
        ],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toContain('**Health Issues:**');
      expect(result).toContain('[!] Error 1');
      expect(result).toContain('[*] Warning 1');
      expect(result).toContain('[i] Info 1');
    });

    it('should format suggestions', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: ['Add a lint script', 'Add a test script'],
      };

      const result = formatProjectHealth(health);

      expect(result).toContain('**Suggestions:**');
      expect(result).toContain('- Add a lint script');
      expect(result).toContain('- Add a test script');
    });

    it('should format complete health status with all sections', () => {
      const health: ProjectHealth = {
        hasNodeModules: true,
        lockfiles: ['package-lock.json'],
        hasMultipleLockfiles: false,
        typescript: {
          hasConfig: true,
          strict: true,
          strictNullChecks: true,
          noImplicitAny: true,
          target: 'ES2020',
        },
        packageManager: 'npm',
        scripts: ['dev', 'build', 'test', 'lint'],
        warnings: [{ type: 'info', message: 'Consider upgrading Node.js' }],
        suggestions: ['Add a typecheck script'],
      };

      const result = formatProjectHealth(health);

      expect(result).toContain('**Package Manager:** npm');
      expect(result).toContain(
        '**TypeScript:** strict mode enabled, target: ES2020'
      );
      expect(result).toContain('**Scripts:** dev, build, test, lint');
      expect(result).toContain('**Health Issues:**');
      expect(result).toContain('[i] Consider upgrading Node.js');
      expect(result).toContain('**Suggestions:**');
      expect(result).toContain('- Add a typecheck script');
    });

    it('should join sections with newlines', () => {
      const health: ProjectHealth = {
        hasNodeModules: true,
        lockfiles: ['package-lock.json'],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: 'npm',
        scripts: ['dev', 'build'],
        warnings: [],
        suggestions: [],
      };

      const result = formatProjectHealth(health);

      expect(result).toBe('**Package Manager:** npm\n**Scripts:** dev, build');
    });
  });
});
