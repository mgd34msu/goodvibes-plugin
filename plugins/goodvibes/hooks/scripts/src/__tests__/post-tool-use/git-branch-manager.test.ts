/**
 * Tests for git-branch-manager.ts
 *
 * This test suite achieves 100% coverage of all functions and branches:
 * - shouldCreateFeatureBranch()
 * - maybeCreateFeatureBranch()
 * - shouldMergeFeature()
 * - maybeMergeFeature()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HooksState } from '../../types/state.js';
import { createMockHooksState } from '../test-utils/mock-factories.js';

// Mock git-operations module
vi.mock('../../automation/git-operations.js', () => ({
  detectMainBranch: vi.fn(),
  getCurrentBranch: vi.fn(),
  createFeatureBranch: vi.fn(),
  mergeFeatureBranch: vi.fn(),
  hasUncommittedChanges: vi.fn(),
}));

const mockGitOps = await import('../../automation/git-operations.js');

describe('git-branch-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldCreateFeatureBranch', () => {
    it('should return true when conditions are met', async () => {
      const { shouldCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = shouldCreateFeatureBranch(state, '/project');

      expect(result).toBe(true);
    });

    it('should return false when already on a feature branch', async () => {
      const { shouldCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = shouldCreateFeatureBranch(state, '/project');

      expect(result).toBe(false);
    });

    it('should return false when not on main branch', async () => {
      const { shouldCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'develop',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = shouldCreateFeatureBranch(state, '/project');

      expect(result).toBe(false);
    });

    it('should return false when no files created this session', async () => {
      const { shouldCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
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
      });

      const result = shouldCreateFeatureBranch(state, '/project');

      expect(result).toBe(false);
    });

    it('should return false when multiple files created this session', async () => {
      const { shouldCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/file1.ts', 'src/file2.ts'],
        },
      });

      const result = shouldCreateFeatureBranch(state, '/project');

      expect(result).toBe(false);
    });
  });

  describe('maybeCreateFeatureBranch', () => {
    it('should return false when conditions not met', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: [], // No files created
        },
      });

      const result = await maybeCreateFeatureBranch(state, '/project');

      expect(result.created).toBe(false);
      expect(result.branchName).toBe(null);
    });

    it('should create feature branch with custom name when provided', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(state, '/project', 'user-auth');

      expect(result.created).toBe(true);
      expect(result.branchName).toBe('feature/user-auth');
      expect(state.git.featureBranch).toBe('feature/user-auth');
      expect(state.git.currentBranch).toBe('feature/user-auth');
      expect(state.git.featureStartedAt).toBeTruthy();
      expect(state.git.featureDescription).toBe('user-auth');
      expect(mockGitOps.createFeatureBranch).toHaveBeenCalledWith('/project', 'user-auth');
    });

    it('should create feature branch with state featureDescription when no custom name', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        session: {
          id: 'test-session',
          startedAt: new Date().toISOString(),
          mode: 'default',
          featureDescription: 'api-integration',
        },
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(state, '/project');

      expect(result.created).toBe(true);
      expect(result.branchName).toBe('feature/api-integration');
      expect(state.git.featureDescription).toBe('api-integration');
      expect(mockGitOps.createFeatureBranch).toHaveBeenCalledWith('/project', 'api-integration');
    });

    it('should create feature branch with default name when no description available', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        session: {
          id: 'test-session',
          startedAt: new Date().toISOString(),
          mode: 'default',
          featureDescription: null,
        },
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(state, '/project');

      expect(result.created).toBe(true);
      expect(result.branchName).toBe('feature/feature');
      expect(state.git.featureDescription).toBe('feature');
      expect(mockGitOps.createFeatureBranch).toHaveBeenCalledWith('/project', 'feature');
    });

    it('should sanitize branch name to lowercase and replace non-alphanumeric', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(
        state,
        '/project',
        'User Authentication & Authorization'
      );

      expect(result.created).toBe(true);
      expect(result.branchName).toBe('feature/user-authentication-authorization');
      expect(state.git.featureBranch).toBe('feature/user-authentication-authorization');
    });

    it('should truncate branch name to max length (50 chars)', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const longName = 'a'.repeat(100);
      const result = await maybeCreateFeatureBranch(state, '/project', longName);

      expect(result.created).toBe(true);
      expect(result.branchName).toBe(`feature/${'a'.repeat(50)}`);
      expect(result.branchName?.length).toBe(58); // 'feature/' + 50 chars
    });

    it('should return false when git createFeatureBranch fails', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(false);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(state, '/project', 'test-feature');

      expect(result.created).toBe(false);
      expect(result.branchName).toBe(null);
      expect(state.git.featureBranch).toBe(null);
      expect(state.git.currentBranch).toBe('main');
      expect(mockGitOps.createFeatureBranch).toHaveBeenCalledWith('/project', 'test-feature');
    });

    it('should handle special characters and spaces in branch name', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(
        state,
        '/project',
        'Fix: Issue #123 - API Errors!'
      );

      expect(result.created).toBe(true);
      // The sanitization regex replaces non-alphanumeric with '-', so trailing punctuation becomes trailing '-'
      expect(result.branchName).toBe('feature/fix-issue-123-api-errors-');
      expect(state.git.featureBranch).toBe('feature/fix-issue-123-api-errors-');
    });

    it('should handle multiple consecutive non-alphanumeric characters', async () => {
      const { maybeCreateFeatureBranch } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.createFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: ['src/new-file.ts'],
        },
      });

      const result = await maybeCreateFeatureBranch(state, '/project', 'test---feature___name');

      expect(result.created).toBe(true);
      expect(result.branchName).toBe('feature/test-feature-name');
    });
  });

  describe('shouldMergeFeature', () => {
    it('should return true when all conditions are met', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(true);
    });

    it('should return false when not on a feature branch', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });

    it('should return false when tests are failing', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts'],
          failingFiles: ['test2.ts'],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });

    it('should return false when build is not passing', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'failing',
          errors: [{ file: 'src/app.ts', line: 10, message: 'Type error' }],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });

    it('should return false when build status is unknown', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: null,
          status: 'unknown',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });

    it('should return false when there are pending test fixes', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [
            {
              testFile: 'test3.ts',
              error: 'Expected true to be false',
              fixAttempts: 1,
            },
          ],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });

    it('should return false when pendingMerge is false', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test',
          checkpoints: [],
          pendingMerge: false,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });

    it('should return false when all conditions fail', async () => {
      const { shouldMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: [],
          failingFiles: ['test1.ts'],
          pendingFixes: [
            {
              testFile: 'test2.ts',
              error: 'Test error',
              fixAttempts: 1,
            },
          ],
        },
        build: {
          lastRun: null,
          status: 'failing',
          errors: [{ file: 'src/app.ts', line: 10, message: 'Error' }],
          fixAttempts: 0,
        },
      });

      const result = shouldMergeFeature(state);

      expect(result).toBe(false);
    });
  });

  describe('maybeMergeFeature', () => {
    it('should return false when conditions not met', async () => {
      const { maybeMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
      });

      const result = await maybeMergeFeature(state, '/project');

      expect(result.merged).toBe(false);
      expect(result.message).toBe('');
    });

    it('should merge feature branch successfully', async () => {
      const { maybeMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.mergeFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test-feature',
          featureBranch: 'feature/test-feature',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test-feature',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = await maybeMergeFeature(state, '/project');

      expect(result.merged).toBe(true);
      expect(result.message).toBe('Merged feature/test-feature to main');
      expect(state.git.currentBranch).toBe('main');
      expect(state.git.featureBranch).toBe(null);
      expect(state.git.featureStartedAt).toBe(null);
      expect(state.git.pendingMerge).toBe(false);
      expect(mockGitOps.mergeFeatureBranch).toHaveBeenCalledWith(
        '/project',
        'feature/test-feature',
        'main'
      );
    });

    it('should handle merge failure', async () => {
      const { maybeMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.mergeFeatureBranch).mockResolvedValue(false);

      const state = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test-feature',
          featureBranch: 'feature/test-feature',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test-feature',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = await maybeMergeFeature(state, '/project');

      expect(result.merged).toBe(false);
      expect(result.message).toBe('Merge failed - may have conflicts');
      // State should remain unchanged
      expect(state.git.currentBranch).toBe('feature/test-feature');
      expect(state.git.featureBranch).toBe('feature/test-feature');
      expect(state.git.featureStartedAt).toBeTruthy();
      expect(state.git.pendingMerge).toBe(true);
      expect(mockGitOps.mergeFeatureBranch).toHaveBeenCalledWith(
        '/project',
        'feature/test-feature',
        'main'
      );
    });

    it('should merge with custom main branch name', async () => {
      const { maybeMergeFeature } = await import(
        '../../post-tool-use/git-branch-manager.js'
      );

      vi.mocked(mockGitOps.mergeFeatureBranch).mockResolvedValue(true);

      const state = createMockHooksState({
        git: {
          mainBranch: 'master',
          currentBranch: 'feature/test-feature',
          featureBranch: 'feature/test-feature',
          featureStartedAt: new Date().toISOString(),
          featureDescription: 'test-feature',
          checkpoints: [],
          pendingMerge: true,
        },
        tests: {
          lastFullRun: new Date().toISOString(),
          lastQuickRun: new Date().toISOString(),
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: new Date().toISOString(),
          status: 'passing',
          errors: [],
          fixAttempts: 0,
        },
      });

      const result = await maybeMergeFeature(state, '/project');

      expect(result.merged).toBe(true);
      expect(result.message).toBe('Merged feature/test-feature to master');
      expect(state.git.currentBranch).toBe('master');
      expect(mockGitOps.mergeFeatureBranch).toHaveBeenCalledWith(
        '/project',
        'feature/test-feature',
        'master'
      );
    });
  });
});
