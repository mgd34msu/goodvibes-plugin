/**
 * Unit tests for crash-recovery module
 *
 * Tests cover:
 * - Crash detection based on state file existence
 * - Recovery information extraction from state
 * - Detection of uncommitted changes, feature branches, pending fixes
 * - Formatting recovery context messages
 * - Edge cases: missing state, clean state, various recovery scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { HooksState } from '../types/state.js';

// Mock dependencies
const mockFileExistsAsync = vi.fn();
const mockLoadState = vi.fn();
const mockHasUncommittedChanges = vi.fn();
const mockGetUncommittedFiles = vi.fn();

vi.mock('../shared/index.js', () => ({
  fileExists: mockFileExistsAsync,
  isTestEnvironment: () => true,
}));

vi.mock('../state/index.js', () => ({
  loadState: mockLoadState,
}));

vi.mock('../automation/git-operations.js', () => ({
  hasUncommittedChanges: mockHasUncommittedChanges,
  getUncommittedFiles: mockGetUncommittedFiles,
}));

describe('crash-recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('checkCrashRecovery', () => {
    const cwd = '/test/project';

    it('should return no recovery needed when state file does not exist', async () => {
      mockFileExistsAsync.mockResolvedValue(false);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(false);
      expect(result.previousFeature).toBeNull();
      expect(result.onBranch).toBeNull();
      expect(result.uncommittedFiles).toEqual([]);
      expect(result.pendingIssues).toEqual([]);
      expect(result.lastCheckpoint).toBeNull();
    });

    it('should return no recovery needed when no signs of incomplete work', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(false);
      expect(result.previousFeature).toBeNull();
      expect(result.onBranch).toBeNull();
      expect(result.uncommittedFiles).toEqual([]);
      expect(result.pendingIssues).toEqual([]);
      expect(result.lastCheckpoint).toBeNull();
    });

    it('should detect recovery needed from uncommitted changes', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockGetUncommittedFiles.mockResolvedValue([
        'src/index.ts',
        'src/utils.ts',
      ]);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.uncommittedFiles).toEqual(['src/index.ts', 'src/utils.ts']);
    });

    it('should detect recovery needed from feature branch', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: 'feature/new-login',
          currentBranch: 'feature/new-login',
          featureDescription: 'Add new login flow',
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.onBranch).toBe('feature/new-login');
      expect(result.previousFeature).toBe('Add new login flow');
    });

    it('should detect recovery needed from pending test fixes', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [
            {
              testFile: 'src/__tests__/auth.test.ts',
              error: 'Expected true but got false',
              fixAttempts: 1,
            },
            {
              testFile: 'src/__tests__/api.test.ts',
              error: 'Timeout exceeded',
              fixAttempts: 0,
            },
          ],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.pendingIssues).toContain('2 tests need fixes');
    });

    it('should detect recovery needed from failing build', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'failing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.pendingIssues).toContain('Build is failing');
    });

    it('should detect recovery needed from modified files since checkpoint', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: ['src/app.ts'],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
    });

    it('should include last checkpoint in recovery info', async () => {
      const checkpoint = {
        hash: 'abc123',
        message: 'checkpoint: WIP on login feature',
        timestamp: '2025-01-05T10:00:00Z',
      };

      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockGetUncommittedFiles.mockResolvedValue(['src/index.ts']);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: 'feature/login',
          currentBranch: 'feature/login',
          featureDescription: 'Login implementation',
          checkpoints: [checkpoint],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.lastCheckpoint).toEqual(checkpoint);
    });

    it('should handle empty checkpoints array', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockGetUncommittedFiles.mockResolvedValue(['src/index.ts']);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: 'feature/login',
          currentBranch: 'feature/login',
          featureDescription: 'Login implementation',
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.lastCheckpoint).toBeNull();
    });

    it('should include failing test files in pending issues', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: ['test1.test.ts', 'test2.test.ts', 'test3.test.ts'],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: ['src/app.ts'],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.pendingIssues).toContain('3 test files failing');
    });

    it('should combine multiple pending issues', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockGetUncommittedFiles.mockResolvedValue(['src/index.ts']);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: 'feature/auth',
          currentBranch: 'feature/auth',
          featureDescription: 'Authentication',
          checkpoints: [],
        },
        tests: {
          pendingFixes: [
            {
              testFile: 'src/__tests__/auth.test.ts',
              error: 'Test failed',
              fixAttempts: 0,
            },
          ],
          failingFiles: ['test1.test.ts', 'test2.test.ts'],
        },
        build: {
          status: 'failing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      const result = await checkCrashRecovery(cwd);

      expect(result.needsRecovery).toBe(true);
      expect(result.pendingIssues).toHaveLength(3);
      expect(result.pendingIssues).toContain('1 tests need fixes');
      expect(result.pendingIssues).toContain('Build is failing');
      expect(result.pendingIssues).toContain('2 test files failing');
    });

    it('should not call getUncommittedFiles when no uncommitted changes', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(false);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      await checkCrashRecovery(cwd);

      expect(mockGetUncommittedFiles).not.toHaveBeenCalled();
    });

    it('should call getUncommittedFiles when uncommitted changes exist', async () => {
      mockFileExistsAsync.mockResolvedValue(true);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockGetUncommittedFiles.mockResolvedValue(['file1.ts', 'file2.ts']);
      mockLoadState.mockResolvedValue({
        git: {
          featureBranch: null,
          currentBranch: 'main',
          featureDescription: null,
          checkpoints: [],
        },
        tests: {
          pendingFixes: [],
          failingFiles: [],
        },
        build: {
          status: 'passing',
        },
        files: {
          modifiedSinceCheckpoint: [],
        },
      } as HooksState);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      await checkCrashRecovery(cwd);

      expect(mockGetUncommittedFiles).toHaveBeenCalledWith(cwd);
    });

    it('should use correct path for state file', async () => {
      mockFileExistsAsync.mockResolvedValue(false);

      const { checkCrashRecovery } =
        await import('../session-start/crash-recovery.js');
      await checkCrashRecovery(cwd);

      expect(mockFileExistsAsync).toHaveBeenCalled();
      const callArg = mockFileExistsAsync.mock.calls[0][0];
      expect(callArg).toContain('.goodvibes');
      expect(callArg).toContain('state');
      expect(callArg).toContain('hooks-state.json');
    });
  });

  describe('formatRecoveryContext', () => {
    it('should return empty string when no recovery needed', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toBe('');
    });

    it('should format basic recovery message', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('[GoodVibes Recovery]');
      expect(result).toContain('Previous session ended unexpectedly.');
      expect(result).toContain('Continuing where you left off...');
    });

    it('should include branch information', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: 'feature/authentication',
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Branch: feature/authentication');
    });

    it('should include feature description', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: 'Implementing user authentication',
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Feature: Implementing user authentication');
    });

    it('should include last checkpoint', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: {
          hash: 'abc123',
          message: 'checkpoint: WIP on auth',
          timestamp: '2025-01-05T10:00:00Z',
        },
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Last checkpoint: "checkpoint: WIP on auth"');
    });

    it('should include uncommitted files count', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: ['file1.ts', 'file2.ts', 'file3.ts'],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Uncommitted files: 3');
    });

    it('should include pending issues list', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: ['2 tests need fixes', 'Build is failing'],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Pending issues:');
      expect(result).toContain('  - 2 tests need fixes');
      expect(result).toContain('  - Build is failing');
    });

    it('should format complete recovery context with all information', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: 'Authentication system',
        onBranch: 'feature/auth',
        uncommittedFiles: ['src/auth.ts', 'src/login.ts'],
        pendingIssues: ['3 tests need fixes', 'Build is failing'],
        lastCheckpoint: {
          hash: 'def456',
          message: 'checkpoint: auth progress',
          timestamp: '2025-01-05T11:30:00Z',
        },
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('[GoodVibes Recovery]');
      expect(result).toContain('Previous session ended unexpectedly.');
      expect(result).toContain('Branch: feature/auth');
      expect(result).toContain('Feature: Authentication system');
      expect(result).toContain('Last checkpoint: "checkpoint: auth progress"');
      expect(result).toContain('Uncommitted files: 2');
      expect(result).toContain('Pending issues:');
      expect(result).toContain('  - 3 tests need fixes');
      expect(result).toContain('  - Build is failing');
      expect(result).toContain('Continuing where you left off...');
    });

    it('should not include branch section when onBranch is null', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: 'Some feature',
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).not.toContain('Branch:');
    });

    it('should not include feature section when previousFeature is null', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: 'feature/test',
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).not.toContain('Feature:');
    });

    it('should not include checkpoint section when lastCheckpoint is null', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: 'Some feature',
        onBranch: 'feature/test',
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).not.toContain('Last checkpoint:');
    });

    it('should not include uncommitted files when array is empty', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: 'Some feature',
        onBranch: 'feature/test',
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).not.toContain('Uncommitted files:');
    });

    it('should not include pending issues section when array is empty', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: 'Some feature',
        onBranch: 'feature/test',
        uncommittedFiles: ['file.ts'],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).not.toContain('Pending issues:');
    });

    it('should handle single uncommitted file', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: ['single-file.ts'],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Uncommitted files: 1');
    });

    it('should handle single pending issue', async () => {
      const { formatRecoveryContext } =
        await import('../session-start/crash-recovery.js');
      const info = {
        needsRecovery: true,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: ['1 test needs fix'],
        lastCheckpoint: null,
      };

      const result = formatRecoveryContext(info);

      expect(result).toContain('Pending issues:');
      expect(result).toContain('  - 1 test needs fix');
    });
  });
});
