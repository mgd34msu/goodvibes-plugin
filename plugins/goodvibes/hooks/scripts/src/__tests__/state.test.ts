/**
 * Tests for state management module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
vi.mock('fs');

describe('state management', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a mock temp directory path
    tempDir = path.join(os.tmpdir(), `state-test-${Date.now()}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadState', () => {
    it('should return default state when no file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { loadState } = await import('../state.js');
      const state = await loadState(tempDir);

      expect(state.session.id).toBe('');
      expect(state.session.mode).toBe('default');
      expect(state.errors).toEqual({});
      expect(state.tests.passingFiles).toEqual([]);
      expect(state.tests.failingFiles).toEqual([]);
      expect(state.build.status).toBe('unknown');
      expect(state.git.mainBranch).toBe('main');
      expect(state.files.modifiedThisSession).toEqual([]);
      expect(state.files.createdThisSession).toEqual([]);
    });

    it('should load state from existing file', async () => {
      const existingState = {
        session: {
          id: 'test-session-123',
          startedAt: '2025-01-01T00:00:00Z',
          mode: 'vibecoding',
          featureDescription: 'Test feature',
        },
        errors: {},
        tests: {
          lastFullRun: '2025-01-01T00:00:00Z',
          lastQuickRun: null,
          passingFiles: ['test1.ts'],
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
          currentBranch: 'feature/test',
          featureBranch: 'feature/test',
          featureStartedAt: '2025-01-01T00:00:00Z',
          featureDescription: 'Test feature',
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: ['file1.ts'],
          modifiedThisSession: ['file1.ts'],
          createdThisSession: [],
        },
        devServers: {},
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingState));

      const { loadState } = await import('../state.js');
      const state = await loadState(tempDir);

      expect(state.session.id).toBe('test-session-123');
      expect(state.session.mode).toBe('vibecoding');
      expect(state.tests.passingFiles).toEqual(['test1.ts']);
      expect(state.git.currentBranch).toBe('feature/test');
    });

    it('should return default state when file contains invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json content');

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { loadState } = await import('../state.js');
      const state = await loadState(tempDir);

      expect(state.session.id).toBe('');
      expect(state.session.mode).toBe('default');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return default state when readFileSync throws', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { loadState } = await import('../state.js');
      const state = await loadState(tempDir);

      expect(state.session.id).toBe('');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('saveState', () => {
    it('should save state to file with atomic write', async () => {
      const stateToSave = {
        session: {
          id: 'save-test-session',
          startedAt: '2025-01-02T00:00:00Z',
          mode: 'default' as const,
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
          status: 'unknown' as const,
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

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);

      const { saveState } = await import('../state.js');
      await saveState(tempDir, stateToSave);

      // Should write to temp file first
      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(String(writeCall[0])).toContain('.tmp');

      // Should rename temp file to final
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should create state directory if it does not exist', async () => {
      const stateToSave = {
        session: {
          id: 'test',
          startedAt: '2025-01-01T00:00:00Z',
          mode: 'default' as const,
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
          status: 'unknown' as const,
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

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);

      const { saveState } = await import('../state.js');
      await saveState(tempDir, stateToSave);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.goodvibes'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should handle write errors gracefully', async () => {
      const stateToSave = {
        session: {
          id: 'test',
          startedAt: '2025-01-01T00:00:00Z',
          mode: 'default' as const,
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
          status: 'unknown' as const,
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

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { saveState } = await import('../state.js');
      // Should not throw
      await expect(saveState(tempDir, stateToSave)).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('round-trip save/load', () => {
    it('should preserve state through save and load cycle', async () => {
      let savedContent: string | null = null;

      const originalState = {
        session: {
          id: 'roundtrip-session',
          startedAt: '2025-01-03T12:00:00Z',
          mode: 'vibecoding' as const,
          featureDescription: 'Test roundtrip',
        },
        errors: {
          'error-sig-1': {
            signature: 'error-sig-1',
            category: 'typescript_error',
            phase: 2 as const,
            attemptsThisPhase: 1,
            totalAttempts: 3,
            officialDocsSearched: ['https://docs.example.com'],
            officialDocsContent: 'Some docs',
            unofficialDocsSearched: [],
            unofficialDocsContent: '',
            fixStrategiesAttempted: [
              {
                phase: 1,
                strategy: 'retry',
                succeeded: false,
                timestamp: '2025-01-03T11:00:00Z',
              },
            ],
          },
        },
        tests: {
          lastFullRun: '2025-01-03T10:00:00Z',
          lastQuickRun: '2025-01-03T11:00:00Z',
          passingFiles: ['test1.ts', 'test2.ts'],
          failingFiles: ['test3.ts'],
          pendingFixes: [
            {
              testFile: 'test3.ts',
              error: 'Assertion failed',
              fixAttempts: 2,
            },
          ],
        },
        build: {
          lastRun: '2025-01-03T09:00:00Z',
          status: 'passing' as const,
          errors: [],
          fixAttempts: 0,
        },
        git: {
          mainBranch: 'main',
          currentBranch: 'feature/roundtrip',
          featureBranch: 'feature/roundtrip',
          featureStartedAt: '2025-01-03T08:00:00Z',
          featureDescription: 'Roundtrip test',
          checkpoints: [
            {
              hash: 'abc123',
              message: 'Initial commit',
              timestamp: '2025-01-03T08:30:00Z',
            },
          ],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: ['file1.ts', 'file2.ts'],
          modifiedThisSession: ['file1.ts', 'file2.ts', 'file3.ts'],
          createdThisSession: ['file3.ts'],
        },
        devServers: {
          '1234': {
            command: 'npm run dev',
            port: 3000,
            startedAt: '2025-01-03T09:00:00Z',
            lastError: null,
          },
        },
      };

      // Mock save to capture content
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockImplementation((_, content) => {
        savedContent = String(content);
      });
      vi.mocked(fs.renameSync).mockReturnValue(undefined);

      const { saveState, loadState } = await import('../state.js');
      await saveState(tempDir, originalState);

      expect(savedContent).not.toBeNull();

      // Now mock load to return saved content
      vi.mocked(fs.readFileSync).mockReturnValue(savedContent!);

      const loadedState = await loadState(tempDir);

      expect(loadedState.session.id).toBe(originalState.session.id);
      expect(loadedState.session.mode).toBe(originalState.session.mode);
      expect(loadedState.errors['error-sig-1']).toBeDefined();
      expect(loadedState.errors['error-sig-1'].phase).toBe(2);
      expect(loadedState.tests.passingFiles).toEqual(['test1.ts', 'test2.ts']);
      expect(loadedState.git.currentBranch).toBe('feature/roundtrip');
      expect(loadedState.files.createdThisSession).toEqual(['file3.ts']);
      expect(loadedState.devServers['1234'].port).toBe(3000);
    });
  });

  describe('trackError', () => {
    it('should add error state by signature', async () => {
      const { trackError } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      const errorState = {
        signature: 'test-error-sig',
        category: 'typescript_error',
        phase: 1 as const,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      trackError(state, 'test-error-sig', errorState);

      expect(state.errors['test-error-sig']).toBeDefined();
      expect(state.errors['test-error-sig'].signature).toBe('test-error-sig');
      expect(state.errors['test-error-sig'].phase).toBe(1);
    });

    it('should update existing error state', async () => {
      const { trackError } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      // First error
      trackError(state, 'error-1', {
        signature: 'error-1',
        category: 'build_failure',
        phase: 1,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      });

      // Update with escalated phase
      trackError(state, 'error-1', {
        signature: 'error-1',
        category: 'build_failure',
        phase: 2,
        attemptsThisPhase: 1,
        totalAttempts: 4,
        officialDocsSearched: ['https://docs.example.com'],
        officialDocsContent: 'Found docs',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'retry',
            succeeded: false,
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      });

      expect(state.errors['error-1'].phase).toBe(2);
      expect(state.errors['error-1'].totalAttempts).toBe(4);
      expect(state.errors['error-1'].officialDocsSearched).toHaveLength(1);
    });

    it('should track multiple independent errors', async () => {
      const { trackError } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackError(state, 'error-a', {
        signature: 'error-a',
        category: 'typescript_error',
        phase: 1,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      });

      trackError(state, 'error-b', {
        signature: 'error-b',
        category: 'test_failure',
        phase: 2,
        attemptsThisPhase: 2,
        totalAttempts: 5,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      });

      expect(Object.keys(state.errors)).toHaveLength(2);
      expect(state.errors['error-a'].category).toBe('typescript_error');
      expect(state.errors['error-b'].category).toBe('test_failure');
    });
  });

  describe('getErrorState', () => {
    it('should retrieve existing error state', async () => {
      const { trackError, getErrorState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      const errorState = {
        signature: 'get-error-sig',
        category: 'npm_install',
        phase: 3 as const,
        attemptsThisPhase: 2,
        totalAttempts: 8,
        officialDocsSearched: ['https://npmjs.com'],
        officialDocsContent: 'Install docs',
        unofficialDocsSearched: ['https://stackoverflow.com'],
        unofficialDocsContent: 'SO answer',
        fixStrategiesAttempted: [],
      };

      trackError(state, 'get-error-sig', errorState);

      const retrieved = getErrorState(state, 'get-error-sig');

      expect(retrieved).toBeDefined();
      expect(retrieved?.signature).toBe('get-error-sig');
      expect(retrieved?.phase).toBe(3);
      expect(retrieved?.totalAttempts).toBe(8);
    });

    it('should return undefined for non-existent error', async () => {
      const { getErrorState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      const retrieved = getErrorState(state, 'non-existent-error');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('clearError', () => {
    it('should remove tracked error by signature', async () => {
      const { trackError, clearError, getErrorState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackError(state, 'to-clear', {
        signature: 'to-clear',
        category: 'api_error',
        phase: 1,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      });

      expect(getErrorState(state, 'to-clear')).toBeDefined();

      clearError(state, 'to-clear');

      expect(getErrorState(state, 'to-clear')).toBeUndefined();
    });
  });
});

describe('file tracking (from file-tracker)', () => {
  describe('trackFileModification', () => {
    it('should add file to modifiedThisSession', async () => {
      const { trackFileModification } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileModification(state, 'src/component.ts');

      expect(state.files.modifiedThisSession).toContain('src/component.ts');
    });

    it('should add file to modifiedSinceCheckpoint', async () => {
      const { trackFileModification } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileModification(state, 'src/utils.ts');

      expect(state.files.modifiedSinceCheckpoint).toContain('src/utils.ts');
    });

    it('should not duplicate files when tracking same file twice', async () => {
      const { trackFileModification } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileModification(state, 'src/duplicate.ts');
      trackFileModification(state, 'src/duplicate.ts');

      expect(
        state.files.modifiedThisSession.filter((f) => f === 'src/duplicate.ts')
      ).toHaveLength(1);
      expect(
        state.files.modifiedSinceCheckpoint.filter((f) => f === 'src/duplicate.ts')
      ).toHaveLength(1);
    });

    it('should accumulate multiple different file modifications', async () => {
      const { trackFileModification } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileModification(state, 'src/file1.ts');
      trackFileModification(state, 'src/file2.ts');
      trackFileModification(state, 'src/file3.ts');

      expect(state.files.modifiedThisSession).toHaveLength(3);
      expect(state.files.modifiedSinceCheckpoint).toHaveLength(3);
    });
  });

  describe('trackFileCreation', () => {
    it('should add file to createdThisSession', async () => {
      const { trackFileCreation } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileCreation(state, 'src/new-file.ts');

      expect(state.files.createdThisSession).toContain('src/new-file.ts');
    });

    it('should also track created file as modified', async () => {
      const { trackFileCreation } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileCreation(state, 'src/created.ts');

      expect(state.files.createdThisSession).toContain('src/created.ts');
      expect(state.files.modifiedThisSession).toContain('src/created.ts');
      expect(state.files.modifiedSinceCheckpoint).toContain('src/created.ts');
    });

    it('should not duplicate files when tracking same creation twice', async () => {
      const { trackFileCreation } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileCreation(state, 'src/dup-create.ts');
      trackFileCreation(state, 'src/dup-create.ts');

      expect(
        state.files.createdThisSession.filter((f) => f === 'src/dup-create.ts')
      ).toHaveLength(1);
    });

    it('should accumulate multiple file creations', async () => {
      const { trackFileCreation } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileCreation(state, 'src/new1.ts');
      trackFileCreation(state, 'src/new2.ts');
      trackFileCreation(state, 'src/new3.ts');

      expect(state.files.createdThisSession).toHaveLength(3);
    });
  });

  describe('clearCheckpointTracking', () => {
    it('should clear modifiedSinceCheckpoint', async () => {
      const {
        trackFileModification,
        clearCheckpointTracking,
      } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileModification(state, 'file1.ts');
      trackFileModification(state, 'file2.ts');

      expect(state.files.modifiedSinceCheckpoint).toHaveLength(2);

      clearCheckpointTracking(state);

      expect(state.files.modifiedSinceCheckpoint).toHaveLength(0);
    });

    it('should not affect modifiedThisSession when clearing checkpoint', async () => {
      const {
        trackFileModification,
        clearCheckpointTracking,
      } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      trackFileModification(state, 'file1.ts');
      trackFileModification(state, 'file2.ts');

      clearCheckpointTracking(state);

      expect(state.files.modifiedThisSession).toHaveLength(2);
    });
  });

  describe('getModifiedFileCount', () => {
    it('should return count of files modified since checkpoint', async () => {
      const {
        trackFileModification,
        getModifiedFileCount,
      } = await import('../post-tool-use/file-tracker.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      expect(getModifiedFileCount(state)).toBe(0);

      trackFileModification(state, 'file1.ts');
      expect(getModifiedFileCount(state)).toBe(1);

      trackFileModification(state, 'file2.ts');
      expect(getModifiedFileCount(state)).toBe(2);
    });
  });
});

describe('session management', () => {
  describe('initializeSession', () => {
    it('should set session id and clear session files', async () => {
      const { initializeSession } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      state.files.modifiedThisSession = ['old-file.ts'];
      state.files.createdThisSession = ['old-created.ts'];

      initializeSession(state, 'new-session-id');

      expect(state.session.id).toBe('new-session-id');
      expect(state.session.startedAt).toBeDefined();
      expect(state.files.modifiedThisSession).toEqual([]);
      expect(state.files.createdThisSession).toEqual([]);
    });

    it('should set startedAt timestamp', async () => {
      const { initializeSession } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      const beforeInit = new Date().toISOString();

      initializeSession(state, 'test-session');

      const afterInit = new Date().toISOString();

      expect(state.session.startedAt).toBeDefined();
      expect(state.session.startedAt >= beforeInit).toBe(true);
      expect(state.session.startedAt <= afterInit).toBe(true);
    });
  });

  describe('resetForNewSession', () => {
    it('should return new default state', async () => {
      const { resetForNewSession } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      state.session.id = 'old-session';
      state.session.mode = 'vibecoding';
      state.tests.passingFiles = ['test1.ts', 'test2.ts'];
      state.build.status = 'passing';

      const newState = resetForNewSession(state);

      expect(newState.session.id).toBe('');
      expect(newState.session.mode).toBe('default');
      expect(newState.tests.passingFiles).toEqual([]);
      expect(newState.build.status).toBe('unknown');
    });

    it('should preserve git state across session reset', async () => {
      const { resetForNewSession } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      state.git.currentBranch = 'feature/preserved';
      state.git.featureBranch = 'feature/preserved';
      state.git.checkpoints = [
        { hash: 'abc123', message: 'checkpoint', timestamp: '2025-01-01T00:00:00Z' },
      ];

      const newState = resetForNewSession(state);

      expect(newState.git.currentBranch).toBe('feature/preserved');
      expect(newState.git.featureBranch).toBe('feature/preserved');
      expect(newState.git.checkpoints).toHaveLength(1);
    });

    it('should preserve error history across session reset', async () => {
      const { resetForNewSession, trackError } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      trackError(state, 'persistent-error', {
        signature: 'persistent-error',
        category: 'typescript_error',
        phase: 2,
        attemptsThisPhase: 1,
        totalAttempts: 5,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      });

      const newState = resetForNewSession(state);

      expect(newState.errors['persistent-error']).toBeDefined();
      expect(newState.errors['persistent-error'].phase).toBe(2);
    });

    it('should clear session-specific data', async () => {
      const { resetForNewSession } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();
      state.files.modifiedThisSession = ['file1.ts', 'file2.ts'];
      state.files.createdThisSession = ['file3.ts'];
      state.devServers['1234'] = {
        command: 'npm run dev',
        port: 3000,
        startedAt: '2025-01-01T00:00:00Z',
        lastError: null,
      };

      const newState = resetForNewSession(state);

      expect(newState.files.modifiedThisSession).toEqual([]);
      expect(newState.files.createdThisSession).toEqual([]);
      expect(Object.keys(newState.devServers)).toHaveLength(0);
    });
  });
});

describe('update state helpers', () => {
  describe('updateSessionState', () => {
    it('should update session with partial data', async () => {
      const { updateSessionState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      updateSessionState(state, { mode: 'vibecoding' });

      expect(state.session.mode).toBe('vibecoding');
      expect(state.session.id).toBe(''); // unchanged
    });

    it('should update multiple session fields', async () => {
      const { updateSessionState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      updateSessionState(state, {
        mode: 'justvibes',
        featureDescription: 'Testing feature',
      });

      expect(state.session.mode).toBe('justvibes');
      expect(state.session.featureDescription).toBe('Testing feature');
    });
  });

  describe('updateTestState', () => {
    it('should update test state with partial data', async () => {
      const { updateTestState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      updateTestState(state, {
        passingFiles: ['test1.ts', 'test2.ts'],
        lastFullRun: '2025-01-03T00:00:00Z',
      });

      expect(state.tests.passingFiles).toEqual(['test1.ts', 'test2.ts']);
      expect(state.tests.lastFullRun).toBe('2025-01-03T00:00:00Z');
      expect(state.tests.failingFiles).toEqual([]); // unchanged
    });
  });

  describe('updateBuildState', () => {
    it('should update build state with partial data', async () => {
      const { updateBuildState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      updateBuildState(state, {
        status: 'passing',
        lastRun: '2025-01-03T00:00:00Z',
      });

      expect(state.build.status).toBe('passing');
      expect(state.build.lastRun).toBe('2025-01-03T00:00:00Z');
      expect(state.build.fixAttempts).toBe(0); // unchanged
    });
  });

  describe('updateGitState', () => {
    it('should update git state with partial data', async () => {
      const { updateGitState } = await import('../state.js');
      const { createDefaultState } = await import('../types/state.js');

      const state = createDefaultState();

      updateGitState(state, {
        currentBranch: 'feature/new-feature',
        featureBranch: 'feature/new-feature',
      });

      expect(state.git.currentBranch).toBe('feature/new-feature');
      expect(state.git.featureBranch).toBe('feature/new-feature');
      expect(state.git.mainBranch).toBe('main'); // unchanged
    });
  });
});
