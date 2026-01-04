/**
 * Unit tests for context injection modules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Mock fs, fs/promises, and child_process
vi.mock('fs');
vi.mock('fs/promises', async () => {
  return {
    readdir: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
  };
});
vi.mock('child_process');

// Import modules under test
import { detectStack, formatStackInfo, StackInfo } from '../context/stack-detector';
import { getGitContext, formatGitContext, GitContext } from '../context/git-context';
import { checkProjectHealth, formatHealthStatus, HealthStatus } from '../context/health-checker';
import { checkEnvironment, formatEnvStatus, EnvStatus } from '../context/env-checker';
import { isEmptyProject, formatEmptyProjectContext } from '../context/empty-project';
import * as fsPromises from 'fs/promises';

// Type the mocked modules
const mockedFs = vi.mocked(fs);
const mockedFsPromises = vi.mocked(fsPromises);
const mockedExecSync = vi.mocked(execSync);

describe('stack-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behavior for fs functions
    // By default, files don't exist and reading files throws
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    // Set up default behavior for fs/promises
    mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    mockedFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));
  });

  describe('detectStack', () => {
    it('should detect Next.js framework from next.config.js', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('next.config.js');
      });

      const result = await detectStack('/test/project');

      expect(result.frameworks).toContain('Next.js');
    });

    it('should detect Next.js framework from next.config.ts', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('next.config.ts');
      });

      const result = await detectStack('/test/project');

      expect(result.frameworks).toContain('Next.js');
    });

    it('should detect TypeScript from tsconfig.json', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({
        compilerOptions: { strict: false }
      }));

      const result = await detectStack('/test/project');

      expect(result.frameworks).toContain('TypeScript');
      expect(result.hasTypeScript).toBe(true);
      expect(result.isStrict).toBe(false);
    });

    it('should detect TypeScript strict mode', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({
        compilerOptions: { strict: true }
      }));

      const result = await detectStack('/test/project');

      expect(result.hasTypeScript).toBe(true);
      expect(result.isStrict).toBe(true);
    });

    it('should detect pnpm from pnpm-lock.yaml', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('pnpm-lock.yaml');
      });

      const result = await detectStack('/test/project');

      expect(result.packageManager).toBe('pnpm');
    });

    it('should detect yarn from yarn.lock', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('yarn.lock');
      });

      const result = await detectStack('/test/project');

      expect(result.packageManager).toBe('yarn');
    });

    it('should detect npm from package-lock.json', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('package-lock.json');
      });

      const result = await detectStack('/test/project');

      expect(result.packageManager).toBe('npm');
    });

    it('should detect bun from bun.lockb', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('bun.lockb');
      });

      const result = await detectStack('/test/project');

      expect(result.packageManager).toBe('bun');
    });

    it('should detect multiple frameworks', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('next.config.js') ||
               pathStr.endsWith('tailwind.config.js') ||
               pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({
        compilerOptions: { strict: true }
      }));

      const result = await detectStack('/test/project');

      expect(result.frameworks).toContain('Next.js');
      expect(result.frameworks).toContain('Tailwind CSS');
      expect(result.frameworks).toContain('TypeScript');
    });

    it('should return empty values for empty directory', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = await detectStack('/test/empty');

      expect(result.frameworks).toEqual([]);
      expect(result.packageManager).toBeNull();
      expect(result.hasTypeScript).toBe(false);
      expect(result.isStrict).toBe(false);
    });

    it('should handle malformed tsconfig.json', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue('{ invalid json }');

      const result = await detectStack('/test/project');

      // Should still detect TypeScript but isStrict should be false
      expect(result.hasTypeScript).toBe(true);
      expect(result.isStrict).toBe(false);
    });

    it('should detect Vite from vite.config.mjs', async () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('vite.config.mjs');
      });

      const result = await detectStack('/test/project');

      expect(result.frameworks).toContain('Vite');
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
      expect(formatStackInfo(null as unknown as StackInfo)).toBe('');
      expect(formatStackInfo(undefined as unknown as StackInfo)).toBe('');
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
    vi.clearAllMocks();

    // Set up default mock behavior
    mockedFs.existsSync.mockReturnValue(false);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command not found');
    });
  });

  describe('getGitContext', () => {
    it('should return not-a-repo context when .git is missing', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = await getGitContext('/test/project');

      expect(result.isRepo).toBe(false);
      expect(result.branch).toBeNull();
      expect(result.hasUncommittedChanges).toBe(false);
      expect(result.uncommittedFileCount).toBe(0);
      expect(result.lastCommit).toBeNull();
      expect(result.recentCommits).toEqual([]);
      expect(result.aheadBehind).toBeNull();
    });

    it('should return full git context for a repo', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) return 'main\n';
        if (cmd.includes('status --porcelain')) return 'M file1.ts\nA file2.ts\n';
        if (cmd.includes('log -1')) return 'Fix bug (2 hours ago)\n';
        if (cmd.includes('log -5')) return '- Fix bug\n- Add feature\n- Initial commit\n';
        if (cmd.includes('rev-list')) return '2\t1\n';
        return '';
      });

      const result = await getGitContext('/test/project');

      expect(result.isRepo).toBe(true);
      expect(result.branch).toBe('main');
      expect(result.hasUncommittedChanges).toBe(true);
      expect(result.uncommittedFileCount).toBe(2);
      expect(result.lastCommit).toBe('Fix bug (2 hours ago)');
      expect(result.recentCommits).toHaveLength(3);
      expect(result.aheadBehind).toEqual({ ahead: 2, behind: 1 });
    });

    it('should handle clean repo with no changes', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) return 'develop\n';
        if (cmd.includes('status --porcelain')) return '';
        if (cmd.includes('log -1')) return 'Last commit (1 day ago)\n';
        if (cmd.includes('log -5')) return '- Last commit\n';
        if (cmd.includes('rev-list')) return '0\t0\n';
        return '';
      });

      const result = await getGitContext('/test/project');

      expect(result.hasUncommittedChanges).toBe(false);
      expect(result.uncommittedFileCount).toBe(0);
      expect(result.aheadBehind).toEqual({ ahead: 0, behind: 0 });
    });

    it('should handle git command failures gracefully', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) throw new Error('git error');
        if (cmd.includes('status --porcelain')) throw new Error('git error');
        if (cmd.includes('log')) throw new Error('git error');
        if (cmd.includes('rev-list')) throw new Error('git error');
        throw new Error('git error');
      });

      const result = await getGitContext('/test/project');

      expect(result.isRepo).toBe(true);
      expect(result.branch).toBeNull();
      expect(result.hasUncommittedChanges).toBe(false);
      expect(result.lastCommit).toBeNull();
      expect(result.recentCommits).toEqual([]);
      expect(result.aheadBehind).toBeNull();
    });

    it('should handle missing upstream for ahead/behind', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) return 'feature-branch\n';
        if (cmd.includes('status --porcelain')) return '';
        if (cmd.includes('log -1')) return 'Initial commit (5 mins ago)\n';
        if (cmd.includes('log -5')) return '- Initial commit\n';
        if (cmd.includes('rev-list')) throw new Error('no upstream');
        return '';
      });

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

    // Set up default mock behavior
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  describe('checkProjectHealth', () => {
    it('should return no checks for healthy project', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('node_modules') ||
               pathStr.endsWith('package.json') ||
               pathStr.endsWith('pnpm-lock.yaml');
      });

      const result = checkProjectHealth('/test/project');

      expect(result.checks).toEqual([]);
    });

    it('should warn about missing node_modules', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('package.json');
      });

      const result = checkProjectHealth('/test/project');

      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].check).toBe('dependencies');
      expect(result.checks[0].status).toBe('warning');
      expect(result.checks[0].message).toContain('node_modules missing');
    });

    it('should warn about multiple lockfiles', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('node_modules') ||
               pathStr.endsWith('package.json') ||
               pathStr.endsWith('pnpm-lock.yaml') ||
               pathStr.endsWith('package-lock.json');
      });

      const result = checkProjectHealth('/test/project');

      expect(result.checks.some(c => c.check === 'lockfiles')).toBe(true);
      const lockfileCheck = result.checks.find(c => c.check === 'lockfiles');
      expect(lockfileCheck?.status).toBe('warning');
      expect(lockfileCheck?.message).toContain('Multiple lockfiles');
    });

    it('should report non-strict TypeScript', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('node_modules') ||
               pathStr.endsWith('package.json') ||
               pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({
        compilerOptions: { strict: false }
      }));

      const result = checkProjectHealth('/test/project');

      expect(result.checks.some(c => c.check === 'typescript')).toBe(true);
      const tsCheck = result.checks.find(c => c.check === 'typescript');
      expect(tsCheck?.status).toBe('info');
      expect(tsCheck?.message).toContain('strict mode is off');
    });

    it('should not report strict TypeScript', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('node_modules') ||
               pathStr.endsWith('package.json') ||
               pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({
        compilerOptions: { strict: true }
      }));

      const result = checkProjectHealth('/test/project');

      expect(result.checks.some(c => c.check === 'typescript')).toBe(false);
    });

    it('should handle malformed tsconfig.json', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('node_modules') ||
               pathStr.endsWith('package.json') ||
               pathStr.endsWith('tsconfig.json');
      });
      mockedFs.readFileSync.mockReturnValue('// comment\n{ invalid }');

      const result = checkProjectHealth('/test/project');

      // Should not crash and should not add typescript check
      expect(result.checks.some(c => c.check === 'typescript')).toBe(false);
    });

    it('should handle empty directory', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = checkProjectHealth('/test/empty');

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
          { check: 'dependencies', status: 'warning', message: 'node_modules missing - run install' }
        ]
      };

      const result = formatHealthStatus(status);

      expect(result).toContain('Health:');
      expect(result).toContain('[!] node_modules missing');
    });

    it('should format error status', () => {
      const status: HealthStatus = {
        checks: [
          { check: 'critical', status: 'error', message: 'Build failed' }
        ]
      };

      const result = formatHealthStatus(status);

      expect(result).toContain('[X] Build failed');
    });

    it('should format info status', () => {
      const status: HealthStatus = {
        checks: [
          { check: 'typescript', status: 'info', message: 'TypeScript strict mode is off' }
        ]
      };

      const result = formatHealthStatus(status);

      expect(result).toContain('[i] TypeScript strict mode is off');
    });

    it('should format multiple checks', () => {
      const status: HealthStatus = {
        checks: [
          { check: 'dependencies', status: 'warning', message: 'node_modules missing' },
          { check: 'lockfiles', status: 'warning', message: 'Multiple lockfiles' },
          { check: 'typescript', status: 'info', message: 'strict mode is off' }
        ]
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

    // Set up default mock behavior
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  describe('checkEnvironment', () => {
    it('should detect .env file', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env');
      });

      const result = checkEnvironment('/test/project');

      expect(result.hasEnvFile).toBe(true);
      expect(result.hasEnvExample).toBe(false);
    });

    it('should detect .env.local file', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env.local');
      });

      const result = checkEnvironment('/test/project');

      expect(result.hasEnvFile).toBe(true);
    });

    it('should detect .env.example file', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env.example');
      });
      mockedFs.readFileSync.mockReturnValue('');

      const result = checkEnvironment('/test/project');

      expect(result.hasEnvExample).toBe(true);
      expect(result.hasEnvFile).toBe(false);
    });

    it('should detect missing env vars', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env.example') || pathStr.endsWith('.env');
      });
      mockedFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=\nDATABASE_URL=\nSECRET=';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=abc123';
        }
        return '';
      });

      const result = checkEnvironment('/test/project');

      expect(result.missingVars).toContain('DATABASE_URL');
      expect(result.missingVars).toContain('SECRET');
      expect(result.missingVars).not.toContain('API_KEY');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Missing env vars');
    });

    it('should prefer .env.local over .env', () => {
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.env.example') ||
               pathStr.endsWith('.env') ||
               pathStr.endsWith('.env.local');
      });
      mockedFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
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

      const result = checkEnvironment('/test/project');

      expect(result.missingVars).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle env file with comments', () => {
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

      const result = checkEnvironment('/test/project');

      expect(result.missingVars).toEqual([]);
    });

    it('should return empty values for no env files', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = checkEnvironment('/test/project');

      expect(result.hasEnvFile).toBe(false);
      expect(result.hasEnvExample).toBe(false);
      expect(result.missingVars).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle empty lines in env files', () => {
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

      const result = checkEnvironment('/test/project');

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
      mockedFsPromises.readdir.mockResolvedValue([
        'README.md',
        'LICENSE',
        '.gitignore',
        '.git',
      ] as any);

      const result = await isEmptyProject('/test/scaffolding');

      expect(result).toBe(true);
    });

    it('should return false for directory with meaningful files', async () => {
      mockedFsPromises.readdir.mockResolvedValue([
        'package.json',
        'src',
        'README.md',
      ] as any);

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(false);
    });

    it('should return false for directory with only package.json', async () => {
      mockedFsPromises.readdir.mockResolvedValue([
        'package.json',
      ] as any);

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(false);
    });

    it('should ignore hidden files (starting with dot)', async () => {
      mockedFsPromises.readdir.mockResolvedValue([
        '.env',
        '.eslintrc',
        '.prettierrc',
      ] as any);

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(true);
    });

    it('should handle case-insensitive scaffolding file names', async () => {
      mockedFsPromises.readdir.mockResolvedValue([
        'README.MD',
        'License.md',
        'license',
      ] as any);

      const result = await isEmptyProject('/test/project');

      expect(result).toBe(true);
    });

    it('should return true on fs error', async () => {
      mockedFsPromises.readdir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await isEmptyProject('/nonexistent');

      expect(result).toBe(true);
    });

    it('should return false for directory with src folder', async () => {
      mockedFsPromises.readdir.mockResolvedValue([
        'src',
        'README.md',
      ] as any);

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
