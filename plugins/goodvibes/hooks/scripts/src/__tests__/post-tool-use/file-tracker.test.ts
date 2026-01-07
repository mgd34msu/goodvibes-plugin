/**
 * Unit tests for file-tracker
 *
 * Tests cover:
 * - trackFileModification: adds files to both session and checkpoint tracking
 * - trackFileCreation: adds files to created list and delegates to trackFileModification
 * - clearCheckpointTracking: clears the modifiedSinceCheckpoint list
 * - getModifiedFileCount: returns count of files modified since checkpoint
 * - Deduplication behavior with Sets
 * - Immutability of returned state
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  trackFileModification,
  trackFileCreation,
  clearCheckpointTracking,
  getModifiedFileCount,
} from '../../post-tool-use/file-tracker.js';

import type { HooksState } from '../../types/state.js';

describe('file-tracker', () => {
  let mockState: HooksState;

  beforeEach(() => {
    mockState = {
      session: {
        id: 'test-session',
        startedAt: '2025-01-01T00:00:00Z',
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
        status: 'unknown',
        errors: [],
        fixAttempts: 0,
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
        createdThisSession: [],
      },
      devServers: {},
    };
  });

  describe('trackFileModification', () => {
    it('should add file path to modifiedThisSession', () => {
      const result = trackFileModification(mockState, '/project/src/utils.ts');

      expect(result.files.modifiedThisSession).toContain(
        '/project/src/utils.ts'
      );
    });

    it('should add file path to modifiedSinceCheckpoint', () => {
      const result = trackFileModification(mockState, '/project/src/utils.ts');

      expect(result.files.modifiedSinceCheckpoint).toContain(
        '/project/src/utils.ts'
      );
    });

    it('should preserve existing modified files in modifiedThisSession', () => {
      mockState.files.modifiedThisSession = [
        '/existing/file1.ts',
        '/existing/file2.ts',
      ];

      const result = trackFileModification(mockState, '/project/src/new.ts');

      expect(result.files.modifiedThisSession).toContain('/existing/file1.ts');
      expect(result.files.modifiedThisSession).toContain('/existing/file2.ts');
      expect(result.files.modifiedThisSession).toContain('/project/src/new.ts');
    });

    it('should preserve existing modified files in modifiedSinceCheckpoint', () => {
      mockState.files.modifiedSinceCheckpoint = ['/existing/file1.ts'];

      const result = trackFileModification(mockState, '/project/src/new.ts');

      expect(result.files.modifiedSinceCheckpoint).toContain(
        '/existing/file1.ts'
      );
      expect(result.files.modifiedSinceCheckpoint).toContain(
        '/project/src/new.ts'
      );
    });

    it('should deduplicate files in modifiedThisSession', () => {
      mockState.files.modifiedThisSession = ['/project/src/utils.ts'];

      const result = trackFileModification(mockState, '/project/src/utils.ts');

      const count = result.files.modifiedThisSession.filter(
        (f) => f === '/project/src/utils.ts'
      ).length;
      expect(count).toBe(1);
    });

    it('should deduplicate files in modifiedSinceCheckpoint', () => {
      mockState.files.modifiedSinceCheckpoint = ['/project/src/utils.ts'];

      const result = trackFileModification(mockState, '/project/src/utils.ts');

      const count = result.files.modifiedSinceCheckpoint.filter(
        (f) => f === '/project/src/utils.ts'
      ).length;
      expect(count).toBe(1);
    });

    it('should return a new state object (immutability)', () => {
      const result = trackFileModification(mockState, '/project/src/utils.ts');

      expect(result).not.toBe(mockState);
      expect(result.files).not.toBe(mockState.files);
    });

    it('should not mutate the original state', () => {
      const originalModifiedSession = [...mockState.files.modifiedThisSession];
      const originalModifiedCheckpoint = [
        ...mockState.files.modifiedSinceCheckpoint,
      ];

      trackFileModification(mockState, '/project/src/utils.ts');

      expect(mockState.files.modifiedThisSession).toEqual(
        originalModifiedSession
      );
      expect(mockState.files.modifiedSinceCheckpoint).toEqual(
        originalModifiedCheckpoint
      );
    });

    it('should preserve createdThisSession unchanged', () => {
      mockState.files.createdThisSession = ['/created/file.ts'];

      const result = trackFileModification(mockState, '/project/src/utils.ts');

      expect(result.files.createdThisSession).toEqual(['/created/file.ts']);
    });

    it('should preserve other state properties', () => {
      mockState.session.id = 'preserve-me';
      mockState.build.status = 'passing';

      const result = trackFileModification(mockState, '/project/src/utils.ts');

      expect(result.session.id).toBe('preserve-me');
      expect(result.build.status).toBe('passing');
    });

    it('should handle multiple sequential modifications', () => {
      let state = trackFileModification(mockState, '/file1.ts');
      state = trackFileModification(state, '/file2.ts');
      state = trackFileModification(state, '/file3.ts');

      expect(state.files.modifiedThisSession).toHaveLength(3);
      expect(state.files.modifiedSinceCheckpoint).toHaveLength(3);
    });

    it('should handle file paths with special characters', () => {
      const result = trackFileModification(
        mockState,
        '/project/src/components/MyComponent (1).tsx'
      );

      expect(result.files.modifiedThisSession).toContain(
        '/project/src/components/MyComponent (1).tsx'
      );
    });

    it('should handle Windows-style paths', () => {
      const result = trackFileModification(
        mockState,
        'C:\\Users\\dev\\project\\src\\utils.ts'
      );

      expect(result.files.modifiedThisSession).toContain(
        'C:\\Users\\dev\\project\\src\\utils.ts'
      );
    });
  });

  describe('trackFileCreation', () => {
    it('should add file path to createdThisSession', () => {
      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(result.files.createdThisSession).toContain(
        '/project/src/newFile.ts'
      );
    });

    it('should also add file path to modifiedThisSession', () => {
      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(result.files.modifiedThisSession).toContain(
        '/project/src/newFile.ts'
      );
    });

    it('should also add file path to modifiedSinceCheckpoint', () => {
      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(result.files.modifiedSinceCheckpoint).toContain(
        '/project/src/newFile.ts'
      );
    });

    it('should preserve existing created files', () => {
      mockState.files.createdThisSession = ['/existing/created.ts'];

      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(result.files.createdThisSession).toContain('/existing/created.ts');
      expect(result.files.createdThisSession).toContain(
        '/project/src/newFile.ts'
      );
    });

    it('should deduplicate files in createdThisSession', () => {
      mockState.files.createdThisSession = ['/project/src/newFile.ts'];

      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      const count = result.files.createdThisSession.filter(
        (f) => f === '/project/src/newFile.ts'
      ).length;
      expect(count).toBe(1);
    });

    it('should return a new state object (immutability)', () => {
      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(result).not.toBe(mockState);
      expect(result.files).not.toBe(mockState.files);
    });

    it('should not mutate the original state', () => {
      const originalCreated = [...mockState.files.createdThisSession];
      const originalModifiedSession = [...mockState.files.modifiedThisSession];

      trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(mockState.files.createdThisSession).toEqual(originalCreated);
      expect(mockState.files.modifiedThisSession).toEqual(
        originalModifiedSession
      );
    });

    it('should handle file paths with spaces', () => {
      const result = trackFileCreation(
        mockState,
        '/project/My Documents/file.ts'
      );

      expect(result.files.createdThisSession).toContain(
        '/project/My Documents/file.ts'
      );
    });

    it('should handle multiple sequential creations', () => {
      let state = trackFileCreation(mockState, '/file1.ts');
      state = trackFileCreation(state, '/file2.ts');
      state = trackFileCreation(state, '/file3.ts');

      expect(state.files.createdThisSession).toHaveLength(3);
      expect(state.files.modifiedThisSession).toHaveLength(3);
      expect(state.files.modifiedSinceCheckpoint).toHaveLength(3);
    });

    it('should preserve other state properties', () => {
      mockState.git.currentBranch = 'feature-branch';
      mockState.tests.failingFiles = ['test.ts'];

      const result = trackFileCreation(mockState, '/project/src/newFile.ts');

      expect(result.git.currentBranch).toBe('feature-branch');
      expect(result.tests.failingFiles).toEqual(['test.ts']);
    });
  });

  describe('clearCheckpointTracking', () => {
    it('should clear modifiedSinceCheckpoint', () => {
      mockState.files.modifiedSinceCheckpoint = [
        '/file1.ts',
        '/file2.ts',
        '/file3.ts',
      ];

      const result = clearCheckpointTracking(mockState);

      expect(result.files.modifiedSinceCheckpoint).toEqual([]);
    });

    it('should preserve modifiedThisSession', () => {
      mockState.files.modifiedThisSession = ['/file1.ts', '/file2.ts'];
      mockState.files.modifiedSinceCheckpoint = ['/file3.ts'];

      const result = clearCheckpointTracking(mockState);

      expect(result.files.modifiedThisSession).toEqual([
        '/file1.ts',
        '/file2.ts',
      ]);
    });

    it('should preserve createdThisSession', () => {
      mockState.files.createdThisSession = ['/created.ts'];
      mockState.files.modifiedSinceCheckpoint = ['/modified.ts'];

      const result = clearCheckpointTracking(mockState);

      expect(result.files.createdThisSession).toEqual(['/created.ts']);
    });

    it('should return a new state object (immutability)', () => {
      mockState.files.modifiedSinceCheckpoint = ['/file.ts'];

      const result = clearCheckpointTracking(mockState);

      expect(result).not.toBe(mockState);
      expect(result.files).not.toBe(mockState.files);
    });

    it('should not mutate the original state', () => {
      mockState.files.modifiedSinceCheckpoint = ['/file.ts'];
      const originalCheckpoint = [...mockState.files.modifiedSinceCheckpoint];

      clearCheckpointTracking(mockState);

      expect(mockState.files.modifiedSinceCheckpoint).toEqual(
        originalCheckpoint
      );
    });

    it('should handle already empty modifiedSinceCheckpoint', () => {
      mockState.files.modifiedSinceCheckpoint = [];

      const result = clearCheckpointTracking(mockState);

      expect(result.files.modifiedSinceCheckpoint).toEqual([]);
    });

    it('should preserve other state properties', () => {
      mockState.session.mode = 'vibecoding';
      mockState.build.fixAttempts = 3;
      mockState.files.modifiedSinceCheckpoint = ['/file.ts'];

      const result = clearCheckpointTracking(mockState);

      expect(result.session.mode).toBe('vibecoding');
      expect(result.build.fixAttempts).toBe(3);
    });
  });

  describe('getModifiedFileCount', () => {
    it('should return 0 for empty modifiedSinceCheckpoint', () => {
      mockState.files.modifiedSinceCheckpoint = [];

      const count = getModifiedFileCount(mockState);

      expect(count).toBe(0);
    });

    it('should return correct count for single file', () => {
      mockState.files.modifiedSinceCheckpoint = ['/file.ts'];

      const count = getModifiedFileCount(mockState);

      expect(count).toBe(1);
    });

    it('should return correct count for multiple files', () => {
      mockState.files.modifiedSinceCheckpoint = [
        '/file1.ts',
        '/file2.ts',
        '/file3.ts',
        '/file4.ts',
        '/file5.ts',
      ];

      const count = getModifiedFileCount(mockState);

      expect(count).toBe(5);
    });

    it('should not count files in modifiedThisSession', () => {
      mockState.files.modifiedThisSession = ['/session1.ts', '/session2.ts'];
      mockState.files.modifiedSinceCheckpoint = ['/checkpoint.ts'];

      const count = getModifiedFileCount(mockState);

      expect(count).toBe(1);
    });

    it('should not count files in createdThisSession', () => {
      mockState.files.createdThisSession = ['/created1.ts', '/created2.ts'];
      mockState.files.modifiedSinceCheckpoint = [];

      const count = getModifiedFileCount(mockState);

      expect(count).toBe(0);
    });

    it('should work correctly after trackFileModification', () => {
      let state = trackFileModification(mockState, '/file1.ts');
      state = trackFileModification(state, '/file2.ts');
      state = trackFileModification(state, '/file3.ts');

      const count = getModifiedFileCount(state);

      expect(count).toBe(3);
    });

    it('should work correctly after clearCheckpointTracking', () => {
      mockState.files.modifiedSinceCheckpoint = ['/file1.ts', '/file2.ts'];

      const clearedState = clearCheckpointTracking(mockState);
      const count = getModifiedFileCount(clearedState);

      expect(count).toBe(0);
    });

    it('should reflect files added after clearing checkpoint', () => {
      mockState.files.modifiedSinceCheckpoint = ['/old.ts'];

      let state = clearCheckpointTracking(mockState);
      state = trackFileModification(state, '/new.ts');

      const count = getModifiedFileCount(state);

      expect(count).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical workflow: create, modify, checkpoint, modify', () => {
      // Create a new file
      let state = trackFileCreation(mockState, '/new-feature.ts');
      expect(getModifiedFileCount(state)).toBe(1);

      // Modify an existing file
      state = trackFileModification(state, '/existing.ts');
      expect(getModifiedFileCount(state)).toBe(2);

      // Create checkpoint
      state = clearCheckpointTracking(state);
      expect(getModifiedFileCount(state)).toBe(0);

      // Modify after checkpoint
      state = trackFileModification(state, '/another.ts');
      expect(getModifiedFileCount(state)).toBe(1);

      // Session tracking should still have all files
      expect(state.files.modifiedThisSession).toHaveLength(3);
      expect(state.files.createdThisSession).toHaveLength(1);
    });

    it('should handle modifying the same file multiple times', () => {
      let state = trackFileModification(mockState, '/file.ts');
      state = trackFileModification(state, '/file.ts');
      state = trackFileModification(state, '/file.ts');

      expect(getModifiedFileCount(state)).toBe(1);
      expect(state.files.modifiedThisSession).toHaveLength(1);
    });

    it('should handle creating the same file multiple times', () => {
      let state = trackFileCreation(mockState, '/file.ts');
      state = trackFileCreation(state, '/file.ts');

      expect(state.files.createdThisSession).toHaveLength(1);
      expect(state.files.modifiedThisSession).toHaveLength(1);
      expect(getModifiedFileCount(state)).toBe(1);
    });

    it('should handle threshold check for checkpoint creation', () => {
      const threshold = 5;
      let state = mockState;

      for (let i = 1; i <= 6; i++) {
        state = trackFileModification(state, `/file${i}.ts`);
      }

      const count = getModifiedFileCount(state);
      expect(count).toBeGreaterThanOrEqual(threshold);
    });
  });
});
