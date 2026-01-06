/**
 * Tests for pre-compact/state-preservation module
 *
 * Tests for state preservation functions used before context compaction,
 * including checkpoint creation, session summary saving, and file tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import type { HooksState } from '../../types/state.js';
import { createMockHooksState, createMockFileState } from '../test-utils/mock-factories.js';

// Mock dependencies - must be defined before vi.mock calls
const mockLoadState = vi.fn();
const mockSaveState = vi.fn();
const mockCreateCheckpointIfNeeded = vi.fn();
const mockHasUncommittedChanges = vi.fn();
const mockEnsureGoodVibesDir = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockFileExists = vi.fn();

// Mock fs/promises module
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

// Mock state module
vi.mock('../../state.js', () => ({
  loadState: (...args: unknown[]) => mockLoadState(...args),
  saveState: (...args: unknown[]) => mockSaveState(...args),
}));

// Mock checkpoint-manager module
vi.mock('../../post-tool-use/checkpoint-manager.js', () => ({
  createCheckpointIfNeeded: (...args: unknown[]) => mockCreateCheckpointIfNeeded(...args),
}));

// Mock git-operations module
vi.mock('../../automation/git-operations.js', () => ({
  hasUncommittedChanges: (...args: unknown[]) => mockHasUncommittedChanges(...args),
}));

// Mock shared module
vi.mock('../../shared/index.js', () => ({
  ensureGoodVibesDir: (...args: unknown[]) => mockEnsureGoodVibesDir(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
}));

describe('state-preservation', () => {
  const testCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset Date mock if any
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // createPreCompactCheckpoint tests
  // ==========================================================================
  describe('createPreCompactCheckpoint', () => {
    it('should skip checkpoint when there are no uncommitted changes', async () => {
      mockHasUncommittedChanges.mockResolvedValue(false);

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );
      await createPreCompactCheckpoint(testCwd);

      expect(mockHasUncommittedChanges).toHaveBeenCalledWith(testCwd);
      expect(mockDebug).toHaveBeenCalledWith(
        'No uncommitted changes, skipping pre-compact checkpoint'
      );
      expect(mockLoadState).not.toHaveBeenCalled();
      expect(mockCreateCheckpointIfNeeded).not.toHaveBeenCalled();
    });

    it('should create checkpoint when there are uncommitted changes', async () => {
      const mockState = createMockHooksState();
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue(mockState);
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'pre-compact checkpoint',
        state: mockState,
      });
      mockSaveState.mockResolvedValue(undefined);

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );
      await createPreCompactCheckpoint(testCwd);

      expect(mockHasUncommittedChanges).toHaveBeenCalledWith(testCwd);
      expect(mockLoadState).toHaveBeenCalledWith(testCwd);
      expect(mockCreateCheckpointIfNeeded).toHaveBeenCalledWith(
        mockState,
        testCwd,
        'pre-compact: saving work before context compaction'
      );
      expect(mockSaveState).toHaveBeenCalledWith(testCwd, mockState);
      expect(mockDebug).toHaveBeenCalledWith('Pre-compact checkpoint created', {
        message: 'pre-compact checkpoint',
      });
    });

    it('should not save state when checkpoint was not created', async () => {
      const mockState = createMockHooksState();
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue(mockState);
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: false,
        message: 'No changes to checkpoint',
        state: mockState,
      });

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );
      await createPreCompactCheckpoint(testCwd);

      expect(mockSaveState).not.toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('Pre-compact checkpoint skipped', {
        reason: 'No changes to checkpoint',
      });
    });

    it('should handle errors gracefully without throwing', async () => {
      const testError = new Error('Git operation failed');
      mockHasUncommittedChanges.mockRejectedValue(testError);

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );

      // Should not throw
      await expect(createPreCompactCheckpoint(testCwd)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('createPreCompactCheckpoint', testError);
    });

    it('should handle loadState errors gracefully', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      const stateError = new Error('Failed to load state');
      mockLoadState.mockRejectedValue(stateError);

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );

      await expect(createPreCompactCheckpoint(testCwd)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('createPreCompactCheckpoint', stateError);
    });

    it('should handle createCheckpointIfNeeded errors gracefully', async () => {
      const mockState = createMockHooksState();
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue(mockState);
      const checkpointError = new Error('Checkpoint creation failed');
      mockCreateCheckpointIfNeeded.mockRejectedValue(checkpointError);

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );

      await expect(createPreCompactCheckpoint(testCwd)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('createPreCompactCheckpoint', checkpointError);
    });

    it('should handle saveState errors gracefully', async () => {
      const mockState = createMockHooksState();
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue(mockState);
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'checkpoint created',
        state: mockState,
      });
      const saveError = new Error('Failed to save state');
      mockSaveState.mockRejectedValue(saveError);

      const { createPreCompactCheckpoint } = await import(
        '../../pre-compact/state-preservation.js'
      );

      await expect(createPreCompactCheckpoint(testCwd)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('createPreCompactCheckpoint', saveError);
    });
  });

  // ==========================================================================
  // saveSessionSummary tests
  // ==========================================================================
  describe('saveSessionSummary', () => {
    const testSummary = 'This is a test session summary with important context.';

    it('should save session summary to the correct path', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      // Mock Date for consistent timestamp
      const mockDate = new Date('2025-01-05T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, testSummary);

      const expectedStateDir = path.join(testCwd, '.goodvibes', 'state');
      const expectedSummaryPath = path.join(expectedStateDir, 'last-session-summary.md');

      expect(mockEnsureGoodVibesDir).toHaveBeenCalledWith(testCwd);
      expect(mockFileExists).toHaveBeenCalledWith(expectedStateDir);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expectedSummaryPath,
        expect.stringContaining('# Session Summary'),
        'utf-8'
      );
      expect(mockDebug).toHaveBeenCalledWith('Saved session summary', {
        path: expectedSummaryPath,
      });
    });

    it('should create state directory if it does not exist', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(false);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, testSummary);

      const expectedStateDir = path.join(testCwd, '.goodvibes', 'state');
      expect(mockMkdir).toHaveBeenCalledWith(expectedStateDir, {
        recursive: true,
      });
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should not create state directory if it already exists', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, testSummary);

      expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('should include timestamp in the summary content', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      const mockDate = new Date('2025-01-05T15:30:45.123Z');
      vi.setSystemTime(mockDate);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, testSummary);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Generated: 2025-01-05T15:30:45.123Z'),
        'utf-8'
      );
    });

    it('should include the summary content in the file', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      const customSummary = 'Custom summary with **markdown** content';

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, customSummary);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(customSummary),
        'utf-8'
      );
    });

    it('should include proper markdown structure', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, testSummary);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      expect(writtenContent).toContain('# Session Summary');
      expect(writtenContent).toContain('## Context Before Compaction');
      expect(writtenContent).toContain(
        '*This summary was automatically saved before context compaction by GoodVibes.*'
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      const writeError = new Error('Write failed');
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockRejectedValue(writeError);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');

      await expect(saveSessionSummary(testCwd, testSummary)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('saveSessionSummary', writeError);
    });

    it('should handle ensureGoodVibesDir errors gracefully', async () => {
      const dirError = new Error('Failed to create directory');
      mockEnsureGoodVibesDir.mockRejectedValue(dirError);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');

      await expect(saveSessionSummary(testCwd, testSummary)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('saveSessionSummary', dirError);
    });

    it('should handle fileExists errors gracefully', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      const existsError = new Error('Cannot check file existence');
      mockFileExists.mockRejectedValue(existsError);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');

      await expect(saveSessionSummary(testCwd, testSummary)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('saveSessionSummary', existsError);
    });

    it('should handle mkdir errors gracefully', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(false);
      const mkdirError = new Error('Cannot create directory');
      mockMkdir.mockRejectedValue(mkdirError);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');

      await expect(saveSessionSummary(testCwd, testSummary)).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledWith('saveSessionSummary', mkdirError);
    });

    it('should handle empty summary string', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, '');

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('## Context Before Compaction');
    });

    it('should handle summary with special characters', async () => {
      mockEnsureGoodVibesDir.mockResolvedValue(path.join(testCwd, '.goodvibes'));
      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      const specialSummary = 'Summary with "quotes", <tags>, & symbols: $100';

      const { saveSessionSummary } = await import('../../pre-compact/state-preservation.js');
      await saveSessionSummary(testCwd, specialSummary);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(specialSummary),
        'utf-8'
      );
    });
  });

  // ==========================================================================
  // getFilesModifiedThisSession tests
  // ==========================================================================
  describe('getFilesModifiedThisSession', () => {
    it('should return empty array when no files modified or created', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: [],
          createdThisSession: [],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual([]);
    });

    it('should return modified files only', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: ['file1.ts', 'file2.ts'],
          createdThisSession: [],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(expect.arrayContaining(['file1.ts', 'file2.ts']));
      expect(result).toHaveLength(2);
    });

    it('should return created files only', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: [],
          createdThisSession: ['newfile1.ts', 'newfile2.ts'],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(expect.arrayContaining(['newfile1.ts', 'newfile2.ts']));
      expect(result).toHaveLength(2);
    });

    it('should combine modified and created files', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: ['existing1.ts', 'existing2.ts'],
          createdThisSession: ['new1.ts', 'new2.ts'],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(
        expect.arrayContaining(['existing1.ts', 'existing2.ts', 'new1.ts', 'new2.ts'])
      );
      expect(result).toHaveLength(4);
    });

    it('should deduplicate files that appear in both arrays', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: ['file1.ts', 'file2.ts', 'shared.ts'],
          createdThisSession: ['shared.ts', 'new1.ts'],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      // Should contain 4 unique files, not 5
      expect(result).toHaveLength(4);
      expect(result).toEqual(
        expect.arrayContaining(['file1.ts', 'file2.ts', 'shared.ts', 'new1.ts'])
      );
    });

    it('should handle undefined modifiedThisSession', async () => {
      const state = createMockHooksState({
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: undefined as unknown as string[],
          createdThisSession: ['new1.ts'],
        },
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(['new1.ts']);
    });

    it('should handle undefined createdThisSession', async () => {
      const state = createMockHooksState({
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: ['file1.ts'],
          createdThisSession: undefined as unknown as string[],
        },
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(['file1.ts']);
    });

    it('should handle both arrays undefined', async () => {
      const state = createMockHooksState({
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: undefined as unknown as string[],
          createdThisSession: undefined as unknown as string[],
        },
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual([]);
    });

    it('should handle large number of files', async () => {
      const manyModified = Array.from({ length: 100 }, (_, i) => `modified${i}.ts`);
      const manyCreated = Array.from({ length: 50 }, (_, i) => `created${i}.ts`);

      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: manyModified,
          createdThisSession: manyCreated,
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toHaveLength(150);
    });

    it('should handle files with special characters in names', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: ['file with spaces.ts', 'file-with-dashes.ts'],
          createdThisSession: ['file_with_underscores.ts', 'file.multiple.dots.ts'],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(
        expect.arrayContaining([
          'file with spaces.ts',
          'file-with-dashes.ts',
          'file_with_underscores.ts',
          'file.multiple.dots.ts',
        ])
      );
    });

    it('should handle files with paths', async () => {
      const state = createMockHooksState({
        files: createMockFileState({
          modifiedThisSession: ['src/components/Button.tsx', 'src/utils/helpers.ts'],
          createdThisSession: ['tests/Button.test.tsx'],
        }),
      });

      const { getFilesModifiedThisSession } = await import(
        '../../pre-compact/state-preservation.js'
      );
      const result = getFilesModifiedThisSession(state);

      expect(result).toEqual(
        expect.arrayContaining([
          'src/components/Button.tsx',
          'src/utils/helpers.ts',
          'tests/Button.test.tsx',
        ])
      );
    });
  });
});
