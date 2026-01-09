/**
 * Tests for checkpoint-manager module
 *
 * Tests for checkpoint creation logic based on file modification thresholds,
 * git integration, and state management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createMockHooksState,
  createMockFileState,
} from '../test-utils/mock-factories.js';

import type * as SharedIndex from '../../shared/index.js';
import type { HooksState } from '../../types/state.js';

// Mock dependencies - must be defined before vi.mock calls
const mockCreateCheckpoint = vi.fn();
const mockHasUncommittedChanges = vi.fn();
const mockGetModifiedFileCount = vi.fn();
const mockClearCheckpointTracking = vi.fn();

// Mock git-operations module
vi.mock('../../automation/git-operations.js', () => ({
  createCheckpoint: (...args: unknown[]) => mockCreateCheckpoint(...args),
  hasUncommittedChanges: (...args: unknown[]) =>
    mockHasUncommittedChanges(...args),
}));

// Mock file-tracker module
vi.mock('../../post-tool-use/file-tracker.js', () => ({
  getModifiedFileCount: (...args: unknown[]) =>
    mockGetModifiedFileCount(...args),
  clearCheckpointTracking: (...args: unknown[]) =>
    mockClearCheckpointTracking(...args),
}));

// Mock CHECKPOINT_TRIGGERS constant
vi.mock('../../shared/index.js', async () => {
  const actual = await vi.importActual<typeof SharedIndex>(
    '../../shared/index.js'
  );
  return {
    ...actual,
    CHECKPOINT_TRIGGERS: {
      fileCountThreshold: 5,
      afterAgentComplete: true,
      afterMajorChange: true,
    },
  };
});

describe('checkpoint-manager', () => {
  let mockState: HooksState;
  const testCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create a fresh mock state for each test
    mockState = createMockHooksState({
      files: createMockFileState({
        modifiedSinceCheckpoint: ['file1.ts', 'file2.ts', 'file3.ts'],
        modifiedThisSession: ['file1.ts', 'file2.ts', 'file3.ts'],
        createdThisSession: [],
      }),
      git: {
        mainBranch: 'main',
        currentBranch: 'feature/test',
        featureBranch: 'feature/test',
        featureStartedAt: '2025-01-01T00:00:00Z',
        featureDescription: 'Test feature',
        checkpoints: [],
        pendingMerge: false,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // shouldCheckpoint tests
  // ==========================================================================
  describe('shouldCheckpoint', () => {
    it('should trigger checkpoint when file count reaches threshold', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);

      const { shouldCheckpoint } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = shouldCheckpoint(mockState, testCwd);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('5 files modified');
      expect(mockGetModifiedFileCount).toHaveBeenCalledWith(mockState);
    });

    it('should trigger checkpoint when file count exceeds threshold', async () => {
      mockGetModifiedFileCount.mockReturnValue(10);

      const { shouldCheckpoint } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = shouldCheckpoint(mockState, testCwd);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('10 files modified');
    });

    it('should not trigger checkpoint when file count is below threshold', async () => {
      mockGetModifiedFileCount.mockReturnValue(4);

      const { shouldCheckpoint } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = shouldCheckpoint(mockState, testCwd);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('');
    });

    it('should not trigger checkpoint when file count is zero', async () => {
      mockGetModifiedFileCount.mockReturnValue(0);

      const { shouldCheckpoint } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = shouldCheckpoint(mockState, testCwd);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('');
    });

    it('should not trigger checkpoint when file count is exactly one below threshold', async () => {
      mockGetModifiedFileCount.mockReturnValue(4); // Threshold is 5

      const { shouldCheckpoint } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = shouldCheckpoint(mockState, testCwd);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('');
    });

    it('should handle large file counts', async () => {
      mockGetModifiedFileCount.mockReturnValue(1000);

      const { shouldCheckpoint } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = shouldCheckpoint(mockState, testCwd);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('1000 files modified');
    });
  });

  // ==========================================================================
  // createCheckpointIfNeeded tests - trigger logic
  // ==========================================================================
  describe('createCheckpointIfNeeded - trigger logic', () => {
    it('should not create checkpoint when threshold not met', async () => {
      mockGetModifiedFileCount.mockReturnValue(3); // Below threshold

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      expect(result.created).toBe(false);
      expect(result.message).toBe('');
      expect(result.state).toEqual(mockState);
      expect(mockHasUncommittedChanges).not.toHaveBeenCalled();
      expect(mockCreateCheckpoint).not.toHaveBeenCalled();
    });

    it('should check for uncommitted changes when threshold is met', async () => {
      mockGetModifiedFileCount.mockReturnValue(5); // Meets threshold
      mockHasUncommittedChanges.mockResolvedValue(false);

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      expect(mockHasUncommittedChanges).toHaveBeenCalledWith(testCwd);
      expect(result.created).toBe(false);
      expect(result.message).toBe('No changes to checkpoint');
    });

    it('should use forced reason when provided', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        mockState,
        testCwd,
        'pre-refactor backup'
      );

      expect(result.created).toBe(true);
      expect(result.message).toBe('Checkpoint: pre-refactor backup');
      expect(mockCreateCheckpoint).toHaveBeenCalledWith(
        testCwd,
        'pre-refactor backup'
      );
    });

    it('should bypass threshold check with forced reason', async () => {
      mockGetModifiedFileCount.mockReturnValue(0); // Would normally not trigger
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        mockState,
        testCwd,
        'manual checkpoint'
      );

      expect(result.created).toBe(true);
      expect(result.message).toBe('Checkpoint: manual checkpoint');
      // Should not call getModifiedFileCount when forced reason is provided
      expect(mockGetModifiedFileCount).not.toHaveBeenCalled();
    });

    it('should not create checkpoint when forced but no uncommitted changes', async () => {
      mockHasUncommittedChanges.mockResolvedValue(false);

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        mockState,
        testCwd,
        'forced but no changes'
      );

      expect(result.created).toBe(false);
      expect(result.message).toBe('No changes to checkpoint');
      expect(mockCreateCheckpoint).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // createCheckpointIfNeeded tests - git operations
  // ==========================================================================
  describe('createCheckpointIfNeeded - git operations', () => {
    it('should create checkpoint successfully when conditions are met', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      expect(result.created).toBe(true);
      expect(result.message).toBe('Checkpoint: 5 files modified');
      expect(mockCreateCheckpoint).toHaveBeenCalledWith(
        testCwd,
        '5 files modified'
      );
      expect(mockClearCheckpointTracking).toHaveBeenCalledWith(mockState);
    });

    it('should handle checkpoint creation failure', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(false); // Checkpoint fails

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      expect(result.created).toBe(false);
      expect(result.message).toBe('Checkpoint failed');
      expect(result.state).toEqual(mockState); // State should be unchanged
      expect(mockClearCheckpointTracking).not.toHaveBeenCalled();
    });

    it('should handle git errors from hasUncommittedChanges', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockRejectedValue(new Error('git error'));

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      await expect(
        createCheckpointIfNeeded(mockState, testCwd)
      ).rejects.toThrow('git error');
      expect(mockCreateCheckpoint).not.toHaveBeenCalled();
    });

    it('should handle git errors from createCheckpoint', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockRejectedValue(new Error('git commit failed'));

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      await expect(
        createCheckpointIfNeeded(mockState, testCwd)
      ).rejects.toThrow('git commit failed');
      expect(mockClearCheckpointTracking).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // createCheckpointIfNeeded tests - state management
  // ==========================================================================
  describe('createCheckpointIfNeeded - state management', () => {
    it('should update state immutably with checkpoint info', async () => {
      const originalState = createMockHooksState({
        files: createMockFileState({
          modifiedSinceCheckpoint: [
            'file1.ts',
            'file2.ts',
            'file3.ts',
            'file4.ts',
            'file5.ts',
          ],
        }),
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: '2025-01-01T00:00:00Z',
          featureDescription: 'Test feature',
          checkpoints: [
            {
              hash: 'old123',
              message: 'Previous checkpoint',
              timestamp: '2025-01-01T10:00:00Z',
            },
          ],
          pendingMerge: false,
        },
      });

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...originalState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(originalState, testCwd);

      expect(result.created).toBe(true);
      expect(result.state).not.toBe(originalState); // Should be a new object
      expect(result.state.git.checkpoints).toHaveLength(2); // Old + new
      expect(result.state.git.checkpoints[0].message).toBe('5 files modified'); // New one first
      expect(result.state.git.checkpoints[1].message).toBe(
        'Previous checkpoint'
      ); // Old one preserved
    });

    it('should preserve existing checkpoints when adding new one', async () => {
      const existingCheckpoints = [
        {
          hash: 'abc123',
          message: 'Checkpoint 1',
          timestamp: '2025-01-01T10:00:00Z',
        },
        {
          hash: 'def456',
          message: 'Checkpoint 2',
          timestamp: '2025-01-01T11:00:00Z',
        },
        {
          hash: 'ghi789',
          message: 'Checkpoint 3',
          timestamp: '2025-01-01T12:00:00Z',
        },
      ];

      const stateWithCheckpoints = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: '2025-01-01T00:00:00Z',
          featureDescription: 'Test feature',
          checkpoints: existingCheckpoints,
          pendingMerge: false,
        },
      });

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...stateWithCheckpoints,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        stateWithCheckpoints,
        testCwd
      );

      expect(result.state.git.checkpoints).toHaveLength(4);
      expect(result.state.git.checkpoints[0].message).toBe('5 files modified');
      expect(result.state.git.checkpoints[1]).toEqual(existingCheckpoints[0]);
      expect(result.state.git.checkpoints[2]).toEqual(existingCheckpoints[1]);
      expect(result.state.git.checkpoints[3]).toEqual(existingCheckpoints[2]);
    });

    it('should clear file tracking after successful checkpoint', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);

      const clearedState = createMockHooksState({
        files: createMockFileState({
          modifiedSinceCheckpoint: [], // Cleared
          modifiedThisSession: ['file1.ts', 'file2.ts', 'file3.ts'], // Preserved
          createdThisSession: [],
        }),
      });

      mockClearCheckpointTracking.mockReturnValue(clearedState);

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      expect(result.created).toBe(true);
      expect(mockClearCheckpointTracking).toHaveBeenCalledWith(mockState);
      expect(result.state.files.modifiedSinceCheckpoint).toEqual([]);
    });

    it('should add timestamp to checkpoint in ISO format', async () => {
      const beforeTime = new Date().toISOString();

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      const afterTime = new Date().toISOString();

      expect(result.state.git.checkpoints[0].timestamp).toBeDefined();
      expect(result.state.git.checkpoints[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      // Timestamp should be between before and after
      expect(result.state.git.checkpoints[0].timestamp >= beforeTime).toBe(
        true
      );
      expect(result.state.git.checkpoints[0].timestamp <= afterTime).toBe(true);
    });

    it('should set hash to empty string in checkpoint', async () => {
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd);

      expect(result.state.git.checkpoints[0].hash).toBe('');
    });

    it('should not modify original state object', async () => {
      const originalCheckpoints = mockState.git.checkpoints;
      const originalFiles = mockState.files;

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      await createCheckpointIfNeeded(mockState, testCwd);

      // Original state should be unchanged
      expect(mockState.git.checkpoints).toBe(originalCheckpoints);
      expect(mockState.files).toBe(originalFiles);
    });
  });

  // ==========================================================================
  // createCheckpointIfNeeded tests - edge cases
  // ==========================================================================
  describe('createCheckpointIfNeeded - edge cases', () => {
    it('should handle empty checkpoint list', async () => {
      const stateWithNoCheckpoints = createMockHooksState({
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: '2025-01-01T00:00:00Z',
          featureDescription: 'Test feature',
          checkpoints: [],
          pendingMerge: false,
        },
      });

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...stateWithNoCheckpoints,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        stateWithNoCheckpoints,
        testCwd
      );

      expect(result.created).toBe(true);
      expect(result.state.git.checkpoints).toHaveLength(1);
      expect(result.state.git.checkpoints[0].message).toBe('5 files modified');
    });

    it('should handle empty forced reason string (falls back to threshold check)', async () => {
      // Empty string is falsy, so it falls back to shouldCheckpoint
      mockGetModifiedFileCount.mockReturnValue(5); // Meets threshold
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(mockState, testCwd, '');

      expect(result.created).toBe(true);
      // Since empty string is falsy, it uses the threshold reason instead
      expect(result.message).toBe('Checkpoint: 5 files modified');
      expect(result.state.git.checkpoints[0].message).toBe('5 files modified');
      expect(mockGetModifiedFileCount).toHaveBeenCalledWith(mockState);
    });

    it('should handle special characters in reason', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const specialReason =
        'Fix: "quotes" & <tags> | pipes / slashes \\ backslashes';

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        mockState,
        testCwd,
        specialReason
      );

      expect(result.created).toBe(true);
      expect(result.state.git.checkpoints[0].message).toBe(specialReason);
      expect(mockCreateCheckpoint).toHaveBeenCalledWith(testCwd, specialReason);
    });

    it('should handle very long reason strings', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const longReason = 'A'.repeat(1000);

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(
        mockState,
        testCwd,
        longReason
      );

      expect(result.created).toBe(true);
      expect(result.state.git.checkpoints[0].message).toBe(longReason);
    });

    it('should handle different cwd paths', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...mockState,
        files: createMockFileState(),
      });

      const differentPaths = [
        '/home/user/project',
        'C:\\Users\\test\\project',
        '/var/www/app',
        '.',
        '..',
        '/root',
      ];

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      for (const path of differentPaths) {
        vi.clearAllMocks();
        mockHasUncommittedChanges.mockResolvedValue(true);
        mockCreateCheckpoint.mockResolvedValue(true);
        mockClearCheckpointTracking.mockReturnValue({
          ...mockState,
          files: createMockFileState(),
        });

        await createCheckpointIfNeeded(mockState, path, 'test');

        expect(mockHasUncommittedChanges).toHaveBeenCalledWith(path);
        expect(mockCreateCheckpoint).toHaveBeenCalledWith(path, 'test');
      }
    });

    it('should preserve other git state properties', async () => {
      const complexGitState = createMockHooksState({
        git: {
          mainBranch: 'develop',
          currentBranch: 'feature/complex',
          featureBranch: 'feature/complex',
          featureStartedAt: '2025-01-01T10:00:00Z',
          featureDescription: 'Complex feature with many changes',
          checkpoints: [
            {
              hash: 'abc123',
              message: 'First checkpoint',
              timestamp: '2025-01-01T11:00:00Z',
            },
          ],
          pendingMerge: true,
        },
      });

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...complexGitState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(complexGitState, testCwd);

      expect(result.state.git.mainBranch).toBe('develop');
      expect(result.state.git.currentBranch).toBe('feature/complex');
      expect(result.state.git.featureBranch).toBe('feature/complex');
      expect(result.state.git.featureStartedAt).toBe('2025-01-01T10:00:00Z');
      expect(result.state.git.featureDescription).toBe(
        'Complex feature with many changes'
      );
      expect(result.state.git.pendingMerge).toBe(true);
    });
  });

  // ==========================================================================
  // Integration tests
  // ==========================================================================
  describe('integration tests', () => {
    it('should complete full checkpoint workflow', async () => {
      // Setup: State with 5 modified files
      const initialState = createMockHooksState({
        files: createMockFileState({
          modifiedSinceCheckpoint: [
            'file1.ts',
            'file2.ts',
            'file3.ts',
            'file4.ts',
            'file5.ts',
          ],
          modifiedThisSession: [
            'file1.ts',
            'file2.ts',
            'file3.ts',
            'file4.ts',
            'file5.ts',
          ],
        }),
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/workflow',
          featureBranch: 'feature/workflow',
          featureStartedAt: '2025-01-01T00:00:00Z',
          featureDescription: 'Workflow test',
          checkpoints: [],
          pendingMerge: false,
        },
      });

      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...initialState,
        files: createMockFileState({
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [
            'file1.ts',
            'file2.ts',
            'file3.ts',
            'file4.ts',
            'file5.ts',
          ],
        }),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result = await createCheckpointIfNeeded(initialState, testCwd);

      // Verify complete workflow
      expect(mockGetModifiedFileCount).toHaveBeenCalledWith(initialState);
      expect(mockHasUncommittedChanges).toHaveBeenCalledWith(testCwd);
      expect(mockCreateCheckpoint).toHaveBeenCalledWith(
        testCwd,
        '5 files modified'
      );
      expect(mockClearCheckpointTracking).toHaveBeenCalledWith(initialState);

      expect(result.created).toBe(true);
      expect(result.message).toBe('Checkpoint: 5 files modified');
      expect(result.state.git.checkpoints).toHaveLength(1);
      expect(result.state.files.modifiedSinceCheckpoint).toEqual([]);
      expect(result.state.files.modifiedThisSession).toEqual([
        'file1.ts',
        'file2.ts',
        'file3.ts',
        'file4.ts',
        'file5.ts',
      ]);
    });

    it('should handle multiple checkpoint cycles', async () => {
      let currentState = createMockHooksState();

      // First checkpoint
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...currentState,
        files: createMockFileState(),
      });

      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');
      const result1 = await createCheckpointIfNeeded(currentState, testCwd);

      expect(result1.created).toBe(true);
      expect(result1.state.git.checkpoints).toHaveLength(1);

      // Second checkpoint
      currentState = result1.state;
      vi.clearAllMocks();
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...currentState,
        files: createMockFileState(),
      });

      const result2 = await createCheckpointIfNeeded(currentState, testCwd);

      expect(result2.created).toBe(true);
      expect(result2.state.git.checkpoints).toHaveLength(2);

      // Third checkpoint
      currentState = result2.state;
      vi.clearAllMocks();
      mockGetModifiedFileCount.mockReturnValue(5);
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockCreateCheckpoint.mockResolvedValue(true);
      mockClearCheckpointTracking.mockReturnValue({
        ...currentState,
        files: createMockFileState(),
      });

      const result3 = await createCheckpointIfNeeded(currentState, testCwd);

      expect(result3.created).toBe(true);
      expect(result3.state.git.checkpoints).toHaveLength(3);
    });
  });
});
