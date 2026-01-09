/**
 * Unit tests for context injection modules.
 */

import { exec, execSync } from 'child_process';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

// Mock fs, fs/promises, and child_process
vi.mock('fs');
vi.mock('fs/promises', async () => {
  return {
    readdir: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
  };
});
// Create a handler that will be used by the exec mock - must be at module level
let execHandler: (cmd: string) => { error: Error | null; stdout: string; stderr: string } = () => ({
  error: new Error('Command not found'),
  stdout: '',
  stderr: '',
});

vi.mock('child_process', async () => {
  const { promisify } = await import('util');

  // Create the mock exec function with callback support
  const mockExec = vi.fn((cmd: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback;
    const result = execHandler(cmd);
    setImmediate(() => {
      cb(result.error, result.stdout, result.stderr);
    });
    return {} as any;
  });

  // Add custom promisify support - this is required for promisify(exec) to work
  (mockExec as any)[promisify.custom] = (cmd: string, options?: any) => {
    return new Promise((resolve, reject) => {
      const result = execHandler(cmd);
      if (result.error) {
        reject(result.error);
      } else {
        resolve({ stdout: result.stdout, stderr: result.stderr });
      }
    });
  };

  return {
    exec: mockExec,
    execSync: vi.fn(),
  };
});

// Import modules under test
import {
  isEmptyProject,
  formatEmptyProjectContext,
} from '../context/empty-project';
import {
  checkEnvStatus as checkEnvironment,
  formatEnvStatus,
} from '../context/environment';
import { getGitContext, formatGitContext } from '../context/git-context';
import {
  checkProjectHealth,
  formatHealthStatus,
} from '../context/health-checker';
import {
  detectStack,
  formatStackInfo,
  clearStackCache,
} from '../context/stack-detector';

import { createMockReaddirStrings } from './test-utils/mock-factories.js';

import type { EnvStatus } from '../context/environment';
import type { GitContext } from '../context/git-context';
import type { HealthStatus } from '../context/health-checker';
import type { StackInfo } from '../context/stack-detector';

// Type the mocked modules
const mockedFs = vi.mocked(fs);
const mockedFsPromises = vi.mocked(fsPromises);
const mockedExec = vi.mocked(exec);
const mockedExecSync = vi.mocked(execSync);

describe('stack-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behavior for fs functions
    // By default, files don't exist and reading files throws
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    // Set up default behavior for fs/promises
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));
  });

  describe('detectStack', () => {
    it('should detect Next.js framework from next.config.js', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('next.config.js')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-nextjs-js');

      expect(result.frameworks).toContain('Next.js');
    });

    it('should detect Next.js framework from next.config.ts', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('next.config.ts')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-nextjs-ts');

      expect(result.frameworks).toContain('Next.js');
    });

    it('should detect TypeScript from tsconfig.json', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: { strict: false },
        })
      );

      const result = await detectStack('/test/project');

      expect(result.frameworks).toContain('TypeScript');
      expect(result.hasTypeScript).toBe(true);
      expect(result.isStrict).toBe(false);
    });

    it('should detect TypeScript strict mode', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: { strict: true },
        })
      );

      const result = await detectStack('/test/project-ts-strict');

      expect(result.hasTypeScript).toBe(true);
      expect(result.isStrict).toBe(true);
    });

    it('should detect pnpm from pnpm-lock.yaml', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('pnpm-lock.yaml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-pnpm');

      expect(result.packageManager).toBe('pnpm');
    });

    it('should detect yarn from yarn.lock', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('yarn.lock')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-yarn');

      expect(result.packageManager).toBe('yarn');
    });

    it('should detect npm from package-lock.json', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('package-lock.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-npm');

      expect(result.packageManager).toBe('npm');
    });

    it('should detect bun from bun.lockb', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('bun.lockb')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-bun');

      expect(result.packageManager).toBe('bun');
    });

    it('should detect multiple frameworks', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('next.config.js') ||
          pathStr.endsWith('tailwind.config.js') ||
          pathStr.endsWith('tsconfig.json')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: { strict: true },
        })
      );

      const result = await detectStack('/test/project-multi-framework');

      expect(result.frameworks).toContain('Next.js');
      expect(result.frameworks).toContain('Tailwind CSS');
      expect(result.frameworks).toContain('TypeScript');
    });

    it('should return empty values for empty directory', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await detectStack('/test/empty-dir');

      expect(result.frameworks).toEqual([]);
      expect(result.packageManager).toBeNull();
      expect(result.hasTypeScript).toBe(false);
      expect(result.isStrict).toBe(false);
    });

    it('should handle malformed tsconfig.json', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue('{ invalid json }');

      const result = await detectStack('/test/project');

      // Should still detect TypeScript but isStrict should be false
      expect(result.hasTypeScript).toBe(true);
      expect(result.isStrict).toBe(false);
    });

    it('should detect Vite from vite.config.mjs', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('vite.config.mjs')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await detectStack('/test/project-vite');

      expect(result.frameworks).toContain('Vite');
    });
  });

  describe('cache pruning optimization', () => {
    beforeEach(() => {
      // Clear cache before each test
      vi.clearAllMocks();
      clearStackCache();
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));
    });

    it('should cache detection results', async () => {
      let callCount = 0;
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        callCount++;
        const pathStr = p.toString();
        if (pathStr.endsWith('next.config.js')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      // First call - should hit filesystem
      const result1 = await detectStack('/test/project-cache-1');
      const firstCallCount = callCount;

      // Second call with same path - should use cache
      const result2 = await detectStack('/test/project-cache-1');
      const secondCallCount = callCount;

      expect(result1).toEqual(result2);
      expect(secondCallCount).toBe(firstCallCount); // No additional filesystem calls
    });

    it('should not prune cache when below threshold and within interval', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      // Add 20 entries (below PRUNE_THRESHOLD of 40)
      for (let i = 0; i < 20; i++) {
        await detectStack(`/test/project-${i}`);
      }

      // All 20 entries should still be in cache (no pruning occurred)
      // Verify by checking cache hits
      const callCount1 = mockedFsPromises.access.mock.calls.length;
      await detectStack('/test/project-0'); // Should hit cache
      const callCount2 = mockedFsPromises.access.mock.calls.length;

      expect(callCount2).toBe(callCount1); // No new filesystem calls
    });

    it('should prune cache when exceeding threshold', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      // Add 45 entries (exceeds PRUNE_THRESHOLD of 40 and approaches MAX of 50)
      for (let i = 0; i < 45; i++) {
        await detectStack(`/test/project-threshold-${i}`);
      }

      // Cache should have been pruned when it hit the threshold
      // Verify cache is still functional
      const callCount1 = mockedFsPromises.access.mock.calls.length;
      await detectStack('/test/project-threshold-44'); // Recent entry should still be cached
      const callCount2 = mockedFsPromises.access.mock.calls.length;

      expect(callCount2).toBe(callCount1); // No new filesystem calls for recent entry
    });

    it('should prune cache when exceeding maximum size', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      // Add more than MAX_CACHE_ENTRIES (50)
      for (let i = 0; i < 55; i++) {
        await detectStack(`/test/project-max-${i}`);
      }

      // Cache should have been pruned to stay under max
      // Most recent entries should still be cached
      const callCount1 = mockedFsPromises.access.mock.calls.length;
      await detectStack('/test/project-max-54'); // Last entry should be cached
      const callCount2 = mockedFsPromises.access.mock.calls.length;

      expect(callCount2).toBe(callCount1); // No new filesystem calls
    });

    it('should clear cache when clearStackCache is called', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('next.config.js')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      // Add entry to cache
      await detectStack('/test/project-clear');

      // Clear cache
      clearStackCache();

      // Should not use cache after clearing
      const callCount1 = mockedFsPromises.access.mock.calls.length;
      await detectStack('/test/project-clear');
      const callCount2 = mockedFsPromises.access.mock.calls.length;

      expect(callCount2).toBeGreaterThan(callCount1); // New filesystem calls
    });
  });

  describe('formatStackInfo', () => {
    it('should format complete stack info', () => {
      const info: StackInfo = {
        frameworks: ['Next.js', 'Tailwind CSS', 'TypeScript'],
        packageManager: 'pnpm',
        hasTypeScript: true,
        isStrict: true,
      };

      const result = formatStackInfo(info);

      expect(result).toContain('Stack: Next.js, Tailwind CSS, TypeScript');
      expect(result).toContain('TypeScript: strict');
      expect(result).toContain('Package Manager: pnpm');
    });

    it('should format stack info without TypeScript', () => {
      const info: StackInfo = {
        frameworks: ['Vite'],
        packageManager: 'npm',
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toContain('Stack: Vite');
      expect(result).toContain('Package Manager: npm');
      expect(result).not.toContain('TypeScript:');
    });

    it('should format TypeScript non-strict mode', () => {
      const info: StackInfo = {
        frameworks: ['TypeScript'],
        packageManager: null,
        hasTypeScript: true,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toContain('TypeScript: not strict');
    });

    it('should return empty string for empty stack', () => {
      const info: StackInfo = {
        frameworks: [],
        packageManager: null,
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      // Test runtime handling of invalid input (e.g., from external sources)
      // @ts-expect-error - Testing null input handling for runtime safety
      expect(formatStackInfo(null)).toBe('');
      // @ts-expect-error - Testing undefined input handling for runtime safety
      expect(formatStackInfo(undefined)).toBe('');
    });

    it('should handle partial stack info', () => {
      const info: StackInfo = {
        frameworks: [],
        packageManager: 'yarn',
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toBe('Package Manager: yarn');
    });
  });
});

describe('git-context', () => {
  beforeEach(() => {
    // Reset only specific mocks
    mockedFsPromises.access.mockReset();
    mockedExecSync.mockReset();

    // Set up default mock behavior for fs/promises
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

    // Set up default mock behavior for execSync
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command not found');
    });

    // Reset exec handler to default - tests will override this
    execHandler = () => ({
      error: new Error('Command not found'),
      stdout: '',
      stderr: '',
    });
  });

  describe('getGitContext', () => {
    it('should return not-a-repo context when .git is missing', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await getGitContext('/test/project-no-git');

      expect(result.isRepo).toBe(false);
      expect(result.branch).toBeNull();
      expect(result.hasUncommittedChanges).toBe(false);
      expect(result.uncommittedFileCount).toBe(0);
      expect(result.lastCommit).toBeNull();
      expect(result.recentCommits).toEqual([]);
      expect(result.aheadBehind).toBeNull();
    });

    it('should return full git context for a repo', async () => {
      mockedFsPromises.access.mockResolvedValue(undefined);

      execHandler = (cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return { error: null, stdout: 'main\n', stderr: '' };
        } else if (cmd.includes('status --porcelain')) {
          return { error: null, stdout: 'M file1.ts\nA file2.ts\n', stderr: '' };
        } else if (cmd.includes('log -1')) {
          return { error: null, stdout: 'Fix bug (2 hours ago)\n', stderr: '' };
        } else if (cmd.includes('log -5')) {
          return { error: null, stdout: '- Fix bug\n- Add feature\n- Initial commit\n', stderr: '' };
        } else if (cmd.includes('rev-list')) {
          return { error: null, stdout: '2\t1\n', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      };

      const result = await getGitContext('/test/project-git-full');

      expect(result.isRepo).toBe(true);
      expect(result.branch).toBe('main');
      expect(result.hasUncommittedChanges).toBe(true);
      expect(result.uncommittedFileCount).toBe(2);
      expect(result.lastCommit).toBe('Fix bug (2 hours ago)');
      expect(result.recentCommits).toHaveLength(3);
      expect(result.aheadBehind).toEqual({ ahead: 2, behind: 1 });
    });

    it('should handle clean repo with no changes', async () => {
      mockedFsPromises.access.mockResolvedValue(undefined);

      execHandler = (cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return { error: null, stdout: 'develop\n', stderr: '' };
        } else if (cmd.includes('status --porcelain')) {
          return { error: null, stdout: '', stderr: '' };
        } else if (cmd.includes('log -1')) {
          return { error: null, stdout: 'Last commit (1 day ago)\n', stderr: '' };
        } else if (cmd.includes('log -5')) {
          return { error: null, stdout: '- Last commit\n', stderr: '' };
        } else if (cmd.includes('rev-list')) {
          return { error: null, stdout: '0\t0\n', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      };

      const result = await getGitContext('/test/project-git-clean');

      expect(result.hasUncommittedChanges).toBe(false);
      expect(result.uncommittedFileCount).toBe(0);
      expect(result.aheadBehind).toEqual({ ahead: 0, behind: 0 });
    });

    it('should handle git command failures gracefully', async () => {
      mockedFsPromises.access.mockResolvedValue(undefined);

      execHandler = () => ({
        error: new Error('git error'),
        stdout: '',
        stderr: '',
      });

      const result = await getGitContext('/test/project-git-full');

      expect(result.isRepo).toBe(true);
      expect(result.branch).toBeNull();
      expect(result.hasUncommittedChanges).toBe(false);
      expect(result.lastCommit).toBeNull();
      expect(result.recentCommits).toEqual([]);
      expect(result.aheadBehind).toBeNull();
    });

    it('should handle missing upstream for ahead/behind', async () => {
      mockedFsPromises.access.mockResolvedValue(undefined);

      execHandler = (cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return { error: null, stdout: 'feature-branch\n', stderr: '' };
        } else if (cmd.includes('status --porcelain')) {
          return { error: null, stdout: '', stderr: '' };
        } else if (cmd.includes('log -1')) {
          return { error: null, stdout: 'Initial commit (5 mins ago)\n', stderr: '' };
        } else if (cmd.includes('log -5')) {
          return { error: null, stdout: '- Initial commit\n', stderr: '' };
        } else if (cmd.includes('rev-list')) {
          return { error: new Error('no upstream'), stdout: '', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      };

      const result = await getGitContext('/test/project');

      expect(result.branch).toBe('feature-branch');
      expect(result.aheadBehind).toBeNull();
    });
  });

  describe('formatGitContext', () => {
    it('should format non-repo context', () => {
      const ctx: GitContext = {
        isRepo: false,
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(ctx);

      expect(result).toBe('Git: Not a git repository');
    });

    it('should format complete git context', () => {
      const ctx: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: true,
        uncommittedFileCount: 3,
        lastCommit: 'Fix bug (2 hours ago)',
        recentCommits: ['- Fix bug'],
        aheadBehind: { ahead: 2, behind: 1 },
      };

      const result = formatGitContext(ctx);

      expect(result).toContain('Git: main branch');
      expect(result).toContain('3 uncommitted files');
      expect(result).toContain('2 ahead');
      expect(result).toContain('1 behind');
      expect(result).toContain('Last: "Fix bug (2 hours ago)"');
    });

    it('should format detached HEAD state', () => {
      const ctx: GitContext = {
        isRepo: true,
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: 'Some commit',
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(ctx);

      expect(result).toContain('Git: detached branch');
    });

    it('should format context with only ahead count', () => {
      const ctx: GitContext = {
        isRepo: true,
        branch: 'feature',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 5, behind: 0 },
      };

      const result = formatGitContext(ctx);

      expect(result).toContain('5 ahead');
      expect(result).not.toContain('behind');
    });

    it('should format context with only behind count', () => {
      const ctx: GitContext = {
        isRepo: true,
        branch: 'feature',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 0, behind: 3 },
      };

      const result = formatGitContext(ctx);

      expect(result).toContain('3 behind');
      expect(result).not.toContain('ahead');
    });
  });
});

describe('health-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behavior for fs/promises
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));

    // Set up default mock behavior
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  describe('checkProjectHealth', () => {
    it('should return no checks for healthy project', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('node_modules') ||
          pathStr.endsWith('package.json') ||
          pathStr.endsWith('pnpm-lock.yaml')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await checkProjectHealth('//test/project');

      expect(result.checks).toEqual([]);
    });

    it('should warn about missing node_modules', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('package.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await checkProjectHealth('//test/project');

      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].check).toBe('dependencies');
      expect(result.checks[0].status).toBe('warning');
      expect(result.checks[0].message).toContain('node_modules missing');
    });

    it('should warn about multiple lockfiles', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('node_modules') ||
          pathStr.endsWith('package.json') ||
          pathStr.endsWith('pnpm-lock.yaml') ||
          pathStr.endsWith('package-lock.json')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await checkProjectHealth('/test/project-multi-lockfiles');

      expect(result.checks.some((c) => c.check === 'lockfiles')).toBe(true);
      const lockfileCheck = result.checks.find((c) => c.check === 'lockfiles');
      expect(lockfileCheck?.status).toBe('warning');
      expect(lockfileCheck?.message).toContain('Multiple lockfiles');
    });

    it('should report non-strict TypeScript', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('node_modules') ||
          pathStr.endsWith('package.json') ||
          pathStr.endsWith('tsconfig.json')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: { strict: false },
        })
      );

      const result = await checkProjectHealth('//test/project');

      expect(result.checks.some((c) => c.check === 'typescript')).toBe(true);
      const tsCheck = result.checks.find((c) => c.check === 'typescript');
      expect(tsCheck?.status).toBe('info');
      expect(tsCheck?.message).toContain('strict mode is off');
    });

    it('should not report strict TypeScript', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('node_modules') ||
          pathStr.endsWith('package.json') ||
          pathStr.endsWith('tsconfig.json')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue(
        JSON.stringify({
          compilerOptions: { strict: true },
        })
      );

      const result = await checkProjectHealth('//test/project');

      expect(result.checks.some((c) => c.check === 'typescript')).toBe(false);
    });

    it('should handle malformed tsconfig.json', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('node_modules') ||
          pathStr.endsWith('package.json') ||
          pathStr.endsWith('tsconfig.json')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue('// comment\n{ invalid }');

      const result = await checkProjectHealth('//test/project');

      // Should not crash and should not add typescript check
      expect(result.checks.some((c) => c.check === 'typescript')).toBe(false);
    });

    it('should handle empty directory', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await checkProjectHealth('//test/empty');

      expect(result.checks).toEqual([]);
    });
  });

  describe('formatHealthStatus', () => {
    it('should format healthy status', () => {
      const status: HealthStatus = { checks: [] };

      const result = formatHealthStatus(status);

      expect(result).toBe('Health: All good');
    });

    it('should format warning status', () => {
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

      expect(result).toContain('Health:');
      expect(result).toContain('[!] node_modules missing');
    });

    it('should format error status', () => {
      const status: HealthStatus = {
        checks: [
          { check: 'critical', status: 'error', message: 'Build failed' },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toContain('[X] Build failed');
    });

    it('should format info status', () => {
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

      expect(result).toContain('[i] TypeScript strict mode is off');
    });

    it('should format multiple checks', () => {
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
            message: 'Multiple lockfiles',
          },
          {
            check: 'typescript',
            status: 'info',
            message: 'strict mode is off',
          },
        ],
      };

      const result = formatHealthStatus(status);

      expect(result).toContain('Health:');
      expect(result).toContain('[!] node_modules missing');
      expect(result).toContain('[!] Multiple lockfiles');
      expect(result).toContain('[i] strict mode is off');
    });
  });
});

describe('env-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behavior for fs/promises
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));

    // Set up default mock behavior
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  describe('checkEnvironment', () => {
    it('should detect .env file', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await checkEnvironment('//test/project');

      expect(result.hasEnvFile).toBe(true);
      expect(result.hasEnvExample).toBe(false);
    });

    it('should detect .env.local file', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.local')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await checkEnvironment('//test/project');

      expect(result.hasEnvFile).toBe(true);
    });

    it('should detect .env.example file', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockResolvedValue('');

      const result = await checkEnvironment('//test/project');

      expect(result.hasEnvExample).toBe(true);
      expect(result.hasEnvFile).toBe(false);
    });

    it('should detect missing env vars', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example') || pathStr.endsWith('.env')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=\nDATABASE_URL=\nSECRET=';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=abc123';
        }
        return '';
      });

      const result = await checkEnvironment('/test/project-missing-env');

      expect(result.missingVars).toContain('DATABASE_URL');
      expect(result.missingVars).toContain('SECRET');
      expect(result.missingVars).not.toContain('API_KEY');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Missing env vars');
    });

    it('should prefer .env.local over .env', async () => {
      mockedFsPromises.access.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (
          pathStr.endsWith('.env.example') ||
          pathStr.endsWith('.env') ||
          pathStr.endsWith('.env.local')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockedFsPromises.readFile.mockImplementation(async (p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=\nDATABASE_URL=';
        }
        if (pathStr.endsWith('.env.local')) {
          return 'API_KEY=local\nDATABASE_URL=local';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=base';
        }
        return '';
      });

      const result = await checkEnvironment('/test/project-prefer-local');

      expect(result.missingVars).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle env file with comments', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env.example') || pathStr.endsWith('.env');
      });
      mockedFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example')) {
          return '# Database config\nDATABASE_URL=\n\n# API Keys\nAPI_KEY=';
        }
        if (pathStr.endsWith('.env')) {
          return '# My config\nDATABASE_URL=postgres://localhost\nAPI_KEY=secret';
        }
        return '';
      });

      const result = await checkEnvironment('//test/project');

      expect(result.missingVars).toEqual([]);
    });

    it('should return empty values for no env files', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await checkEnvironment('//test/project');

      expect(result.hasEnvFile).toBe(false);
      expect(result.hasEnvExample).toBe(false);
      expect(result.missingVars).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle empty lines in env files', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env.example') || pathStr.endsWith('.env');
      });
      mockedFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example')) {
          return '\n\nVAR1=\n\n\nVAR2=\n';
        }
        if (pathStr.endsWith('.env')) {
          return '\nVAR1=value1\nVAR2=value2\n';
        }
        return '';
      });

      const result = await checkEnvironment('//test/project');

      expect(result.missingVars).toEqual([]);
    });
  });

  describe('formatEnvStatus', () => {
    it('should format env file present', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const result = formatEnvStatus(status);

      expect(result).toBe('Environment: .env present');
    });

    it('should format missing .env but example exists', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: true,
        missingVars: [],
        warnings: [],
      };

      const result = formatEnvStatus(status);

      expect(result).toContain('.env.example exists but no .env file');
    });

    it('should format warnings', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['API_KEY', 'SECRET'],
        warnings: ['Missing env vars: API_KEY, SECRET'],
      };

      const result = formatEnvStatus(status);

      expect(result).toContain('Environment: .env present');
      expect(result).toContain('Warning: Missing env vars: API_KEY, SECRET');
    });

    it('should return empty string for no env files', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const result = formatEnvStatus(status);

      expect(result).toBe('');
    });
  });
});

describe('empty-project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isEmptyProject', () => {
    it('should return true for empty directory', async () => {
      mockedFsPromises.readdir.mockResolvedValue([]);

      const result = await isEmptyProject('/test/empty');

      expect(result).toBe(true);
    });

    it('should return true for directory with only scaffolding files', async () => {
      mockedFsPromises.readdir.mockResolvedValue(
        createMockReaddirStrings(['README.md', 'LICENSE', '.gitignore', '.git'])
      );

      const result = await isEmptyProject('/test/scaffolding');

      expect(result).toBe(true);
    });

    it('should return false for directory with meaningful files', async () => {
      mockedFsPromises.readdir.mockResolvedValue(
        createMockReaddirStrings(['package.json', 'src', 'README.md'])
      );

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(false);
    });

    it('should return false for directory with only package.json', async () => {
      mockedFsPromises.readdir.mockResolvedValue(
        createMockReaddirStrings(['package.json'])
      );

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(false);
    });

    it('should ignore hidden files (starting with dot)', async () => {
      mockedFsPromises.readdir.mockResolvedValue(
        createMockReaddirStrings(['.env', '.eslintrc', '.prettierrc'])
      );

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(true);
    });

    it('should handle case-insensitive scaffolding file names', async () => {
      mockedFsPromises.readdir.mockResolvedValue(
        createMockReaddirStrings(['README.MD', 'License.md', 'license'])
      );

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(true);
    });

    it('should return true on fs error', async () => {
      mockedFsPromises.readdir.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await isEmptyProject('/nonexistent');

      expect(result).toBe(true);
    });

    it('should return false for directory with src folder', async () => {
      mockedFsPromises.readdir.mockResolvedValue(
        createMockReaddirStrings(['src', 'README.md'])
      );

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(false);
    });
  });

  describe('formatEmptyProjectContext', () => {
    it('should return scaffolding suggestions', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('[GoodVibes SessionStart]');
      expect(result).toContain('New project (empty directory)');
      expect(result).toContain('Ready to scaffold');
      expect(result).toContain('Next.js');
      expect(result).toContain('Node.js API');
      expect(result).toContain('React library');
    });

    it('should include detection promise', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('detect your stack automatically');
    });
  });
});
