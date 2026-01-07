/**
 * Unit tests for git-guards module
 *
 * Tests cover:
 * - checkBranchGuard: Preventing dangerous operations on main/master branches
 * - checkMergeReadiness: Validating merge prerequisites (tests, build, fixes)
 * - isGitCommand: Detecting git commands
 * - isMergeCommand: Detecting git merge commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HooksState } from '../types/state.js';

// Mock modules
vi.mock('../automation/git-operations.js');

describe('git-guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to create a minimal valid state
  function createMockState(overrides?: Partial<HooksState>): HooksState {
    return {
      session: {
        id: 'test-session',
        startedAt: new Date().toISOString(),
        mode: 'default',
        featureDescription: null,
      },
      errors: {},
      tests: {
        lastFullRun: null,
        lastQuickRun: null,
        passingFiles: [],
        failingFiles: [],
        pendingFixes: [],
      },
      build: {
        lastRun: null,
        status: 'passing',
        errors: [],
        fixAttempts: 0,
      },
      git: {
        mainBranch: 'main',
        currentBranch: 'feature-branch',
        featureBranch: null,
        featureStartedAt: null,
        featureDescription: null,
        checkpoints: [],
        pendingMerge: false,
      },
      files: {
        modifiedSinceCheckpoint: [],
        modifiedThisSession: [],
        createdThisSession: [],
      },
      devServers: {},
      ...overrides,
    };
  }

  describe('checkBranchGuard', () => {
    it('should block force push to main branch', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git push --force origin main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Force push to main is not allowed');
    });

    it('should block force push with -f flag to main branch', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git push -f origin main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Force push to main is not allowed');
    });

    it('should allow force push to non-main branch with warning', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature-branch'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'feature-branch';

      const result = await checkBranchGuard(
        'git push --force origin feature-branch',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(
        'Force push detected - ensure this is intentional'
      );
    });

    it('should block hard reset on main branch', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git reset --hard HEAD~1',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Hard reset on main is not allowed');
    });

    it('should allow hard reset on non-main branch', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature-branch'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'feature-branch';

      const result = await checkBranchGuard(
        'git reset --hard HEAD~1',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should warn about rebasing main branch', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git rebase origin/main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toBe('Rebasing main - ensure this is intentional');
    });

    it('should allow rebase on non-main branch without warning', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature-branch'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'feature-branch';

      const result = await checkBranchGuard(
        'git rebase main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should respect custom main branch name', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('master'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.mainBranch = 'master';
      state.git.currentBranch = 'master';

      const result = await checkBranchGuard(
        'git push --force origin master',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Force push to master is not allowed');
    });

    it('should allow safe git commands', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();

      const result = await checkBranchGuard('git status', '/test/repo', state);

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });

    it('should allow normal push to main branch', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git push origin main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should handle force push with multiple spaces', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git  push  --force  origin  main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Force push to main');
    });

    it('should handle reset --hard with no target', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git reset --hard',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Hard reset on main is not allowed');
    });

    it('should not block soft reset on main', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git reset --soft HEAD~1',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
    });

    it('should handle commands with extra flags and options', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git push --force --verbose --tags origin main',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Force push to main');
    });
  });

  describe('checkMergeReadiness', () => {
    it('should block merge when tests are failing', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = ['test1.test.ts', 'test2.test.ts'];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: 2 test files failing');
    });

    it('should block merge when build is failing', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.build.status = 'failing';

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: build is failing');
    });

    it('should block merge when there are pending fixes', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.pendingFixes = [
        { testFile: 'test1.test.ts', error: 'Error 1', fixAttempts: 1 },
        { testFile: 'test2.test.ts', error: 'Error 2', fixAttempts: 0 },
      ];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: 2 pending test fixes');
    });

    it('should allow merge when all checks pass', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = [];
      state.build.status = 'passing';
      state.tests.pendingFixes = [];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('should allow merge when build status is unknown', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = [];
      state.build.status = 'unknown';
      state.tests.pendingFixes = [];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(true);
    });

    it('should prioritize test failures over build failures', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = ['test.test.ts'];
      state.build.status = 'failing';

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: 1 test files failing');
    });

    it('should prioritize build failures over pending fixes', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = [];
      state.build.status = 'failing';
      state.tests.pendingFixes = [
        { testFile: 'test.test.ts', error: 'Error', fixAttempts: 1 },
      ];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: build is failing');
    });

    it('should handle single failing test file', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = ['single.test.ts'];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: 1 test files failing');
    });

    it('should handle single pending fix', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.pendingFixes = [
        { testFile: 'test.test.ts', error: 'Error', fixAttempts: 0 },
      ];

      const result = checkMergeReadiness('/test/repo', state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: 1 pending test fixes');
    });

    it('should not use cwd parameter (unused parameter)', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();

      // Should work regardless of cwd value
      const result1 = checkMergeReadiness('/any/path', state);
      const result2 = checkMergeReadiness('', state);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('isGitCommand', () => {
    it('should return true for basic git commands', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('git status')).toBe(true);
      expect(isGitCommand('git add .')).toBe(true);
      expect(isGitCommand('git commit -m "message"')).toBe(true);
      expect(isGitCommand('git push origin main')).toBe(true);
      expect(isGitCommand('git pull')).toBe(true);
    });

    it('should return true for git commands with leading whitespace', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('  git status')).toBe(true);
      expect(isGitCommand('\tgit status')).toBe(true);
      expect(isGitCommand('   \t  git status')).toBe(true);
    });

    it('should return false for non-git commands', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('npm install')).toBe(false);
      expect(isGitCommand('ls -la')).toBe(false);
      expect(isGitCommand('cd /some/path')).toBe(false);
      expect(isGitCommand('echo "git"')).toBe(false);
    });

    it('should return false for strings containing git but not as command', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('I use git for version control')).toBe(false);
      expect(isGitCommand('gitignore file')).toBe(false);
      expect(isGitCommand('github.com')).toBe(false);
    });

    it('should return false for empty string', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('')).toBe(false);
    });

    it('should return false for whitespace-only string', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('   ')).toBe(false);
      expect(isGitCommand('\t\t')).toBe(false);
    });

    it('should be case sensitive', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('GIT status')).toBe(false);
      expect(isGitCommand('Git status')).toBe(false);
      expect(isGitCommand('git STATUS')).toBe(true); // git is lowercase, rest doesn't matter
    });

    it('should handle complex git commands', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isGitCommand('git commit --amend --no-edit')).toBe(true);
      expect(isGitCommand('git log --oneline --graph --all')).toBe(true);
      expect(isGitCommand('git rebase -i HEAD~5')).toBe(true);
    });
  });

  describe('isMergeCommand', () => {
    it('should return true for basic git merge commands', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('git merge feature-branch')).toBe(true);
      expect(isMergeCommand('git merge origin/main')).toBe(true);
      expect(isMergeCommand('git merge --no-ff branch-name')).toBe(true);
    });

    it('should return true for merge with various flags', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('git merge --squash feature')).toBe(true);
      expect(isMergeCommand('git merge --no-commit branch')).toBe(true);
      expect(isMergeCommand('git merge -m "message" branch')).toBe(true);
    });

    it('should return true regardless of whitespace', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('git  merge  branch')).toBe(true);
      expect(isMergeCommand('git\tmerge branch')).toBe(true);
      expect(isMergeCommand('  git merge branch')).toBe(true);
    });

    it('should return false for non-merge git commands', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('git status')).toBe(false);
      expect(isMergeCommand('git commit -m "merge this"')).toBe(false);
      expect(isMergeCommand('git push')).toBe(false);
      expect(isMergeCommand('git rebase')).toBe(false);
    });

    it('should return false for non-git commands containing merge', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('npm run merge-scripts')).toBe(false);
      expect(isMergeCommand('merge these files')).toBe(false);
      expect(isMergeCommand('git-merge tool')).toBe(false);
    });

    it('should return false for empty string', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('')).toBe(false);
    });

    it('should be case sensitive', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      expect(isMergeCommand('GIT merge branch')).toBe(false);
      expect(isMergeCommand('git MERGE branch')).toBe(false);
      expect(isMergeCommand('Git Merge branch')).toBe(false);
    });

    it('should handle merge in commit messages', async () => {
      const { isMergeCommand } = await import('../pre-tool-use/git-guards.js');

      // This contains "merge" in the message but is not a merge command
      // The regex /git\s+merge/ only matches when "git merge" are consecutive words
      expect(isMergeCommand('git commit -m "Merge branch feature"')).toBe(
        false
      );
    });
  });

  describe('GitGuardResult interface', () => {
    it('should have correct structure for blocked operation', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      const result = await checkBranchGuard(
        'git push --force origin main',
        '/test/repo',
        state
      );

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('reason');
      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.reason).toBe('string');
    });

    it('should have correct structure for allowed operation with warning', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature-branch'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'feature-branch';

      const result = await checkBranchGuard(
        'git push --force origin feature',
        '/test/repo',
        state
      );

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('warning');
      expect(result.allowed).toBe(true);
      expect(typeof result.warning).toBe('string');
    });

    it('should have correct structure for allowed operation without warning', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature-branch'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();

      const result = await checkBranchGuard('git status', '/test/repo', state);

      expect(result).toHaveProperty('allowed');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });
  });

  describe('edge cases and integration', () => {
    it('should handle multiple dangerous operations in checkBranchGuard', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'main';

      // Force push is checked first, so it should match that
      const result = await checkBranchGuard(
        'git push --force && git reset --hard',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Force push');
    });

    it('should handle branch name with special characters', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature/test-123'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'feature/test-123';

      const result = await checkBranchGuard('git status', '/test/repo', state);

      expect(result.allowed).toBe(true);
    });

    it('should handle all failure conditions in merge readiness', async () => {
      const { checkMergeReadiness } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.tests.failingFiles = ['test1.test.ts', 'test2.test.ts'];
      state.build.status = 'failing';
      state.tests.pendingFixes = [
        { testFile: 'test3.test.ts', error: 'Error', fixAttempts: 1 },
      ];

      const result = checkMergeReadiness('/test/repo', state);

      // Should return the first check that fails (test failures)
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot merge: 2 test files failing');
    });

    it('should handle regex special characters in git commands', async () => {
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: vi.fn().mockResolvedValue('feature-branch'),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();

      const result = await checkBranchGuard(
        'git commit -m "feat(user): add feature"',
        '/test/repo',
        state
      );

      expect(result.allowed).toBe(true);
    });

    it('should handle commands with newlines and tabs', async () => {
      const { isGitCommand } = await import('../pre-tool-use/git-guards.js');

      // Regex \s matches newlines, so these are actually valid
      expect(isGitCommand('\n\ngit status')).toBe(true); // newlines count as whitespace
      expect(isGitCommand('git\nstatus')).toBe(true); // git followed by newline counts as git command
    });

    it('should check current branch from git-operations, not state', async () => {
      // This tests that getCurrentBranch is actually called, not just using state.git.currentBranch
      const mockGetCurrentBranch = vi.fn().mockResolvedValue('actual-branch');
      vi.doMock('../automation/git-operations.js', () => ({
        getCurrentBranch: mockGetCurrentBranch,
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      }));

      const { checkBranchGuard } =
        await import('../pre-tool-use/git-guards.js');
      const state = createMockState();
      state.git.currentBranch = 'stale-branch-in-state';
      state.git.mainBranch = 'actual-branch';

      await checkBranchGuard(
        'git push --force origin branch',
        '/test/repo',
        state
      );

      expect(mockGetCurrentBranch).toHaveBeenCalledWith('/test/repo');
    });
  });
});
