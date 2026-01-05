/**
 * Unit tests for pre-compact hook
 *
 * Tests cover:
 * - Pre-compaction checkpoint creation
 * - Session summary saving
 * - Files modified tracking
 * - Edge cases: no uncommitted changes, no state to preserve
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createPreCompactCheckpoint,
  saveSessionSummary,
  getFilesModifiedThisSession,
} from '../pre-compact/state-preservation.js';
import type { HooksState } from '../types/state.js';

// Mock dependencies
vi.mock('../state.js', () => ({
  loadState: vi.fn(),
  saveState: vi.fn(),
}));

vi.mock('../post-tool-use/checkpoint-manager.js', () => ({
  createCheckpointIfNeeded: vi.fn(),
}));

vi.mock('../automation/git-operations.js', () => ({
  hasUncommittedChanges: vi.fn(),
}));

vi.mock('../shared/index.js', () => ({
  ensureGoodVibesDir: vi.fn(),
  debug: vi.fn(),
  logError: vi.fn(),
  fileExists: vi.fn().mockResolvedValue(false),
}));

describe('pre-compact', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodvibes-precompact-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createPreCompactCheckpoint', () => {
    it('should skip checkpoint when no uncommitted changes', async () => {
      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const { createCheckpointIfNeeded } = await import('../post-tool-use/checkpoint-manager.js');

      vi.mocked(hasUncommittedChanges).mockResolvedValue(false);

      await createPreCompactCheckpoint(testDir);

      expect(createCheckpointIfNeeded).not.toHaveBeenCalled();
    });

    it('should create checkpoint when uncommitted changes exist', async () => {
      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const { createCheckpointIfNeeded } = await import('../post-tool-use/checkpoint-manager.js');
      const { loadState, saveState } = await import('../state.js');

      const mockState: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(loadState).mockResolvedValue(mockState);
      vi.mocked(createCheckpointIfNeeded).mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await createPreCompactCheckpoint(testDir);

      expect(createCheckpointIfNeeded).toHaveBeenCalledWith(
        mockState,
        testDir,
        'pre-compact: saving work before context compaction'
      );
      expect(saveState).toHaveBeenCalled();
    });

    it('should handle checkpoint creation failure gracefully', async () => {
      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const { createCheckpointIfNeeded } = await import('../post-tool-use/checkpoint-manager.js');
      const { loadState } = await import('../state.js');

      const mockState: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(loadState).mockResolvedValue(mockState);
      vi.mocked(createCheckpointIfNeeded).mockRejectedValue(new Error('Git error'));

      // Should not throw
      await expect(createPreCompactCheckpoint(testDir)).resolves.toBeUndefined();
    });

    it('should not save state when checkpoint is skipped', async () => {
      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const { createCheckpointIfNeeded } = await import('../post-tool-use/checkpoint-manager.js');
      const { loadState, saveState } = await import('../state.js');

      const mockState: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(loadState).mockResolvedValue(mockState);
      vi.mocked(createCheckpointIfNeeded).mockResolvedValue({
        created: false,
        message: 'Checkpoint skipped',
      });

      await createPreCompactCheckpoint(testDir);

      expect(saveState).not.toHaveBeenCalled();
    });
  });

  describe('saveSessionSummary', () => {
    it('should save summary to markdown file', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        return goodvibesDir;
      });

      const summary = 'Working on implementing new features.\n- Added tests\n- Fixed bugs';

      await saveSessionSummary(testDir, summary);

      const summaryPath = path.join(stateDir, 'last-session-summary.md');
      expect(fs.existsSync(summaryPath)).toBe(true);

      const content = fs.readFileSync(summaryPath, 'utf-8');
      expect(content).toContain('# Session Summary');
      expect(content).toContain('Working on implementing new features');
      expect(content).toContain('Added tests');
      expect(content).toContain('Fixed bugs');
    });

    it('should include timestamp in summary', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        return goodvibesDir;
      });

      await saveSessionSummary(testDir, 'Test summary');

      const summaryPath = path.join(stateDir, 'last-session-summary.md');
      const content = fs.readFileSync(summaryPath, 'utf-8');

      expect(content).toContain('Generated:');
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle empty summary', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        return goodvibesDir;
      });

      await saveSessionSummary(testDir, '');

      const summaryPath = path.join(stateDir, 'last-session-summary.md');
      expect(fs.existsSync(summaryPath)).toBe(true);

      const content = fs.readFileSync(summaryPath, 'utf-8');
      expect(content).toContain('# Session Summary');
    });

    it('should overwrite previous summary', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        return goodvibesDir;
      });

      await saveSessionSummary(testDir, 'First summary');
      await saveSessionSummary(testDir, 'Second summary');

      const summaryPath = path.join(stateDir, 'last-session-summary.md');
      const content = fs.readFileSync(summaryPath, 'utf-8');

      expect(content).toContain('Second summary');
      expect(content).not.toContain('First summary');
    });

    it('should handle file system errors gracefully', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');

      vi.mocked(ensureGoodVibesDir).mockRejectedValue(new Error('File system error'));

      // Should not throw
      await expect(saveSessionSummary(testDir, 'Test')).resolves.toBeUndefined();
    });

    it('should create state directory if it does not exist', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      await saveSessionSummary(testDir, 'Creating new state dir');

      expect(fs.existsSync(stateDir)).toBe(true);
    });

    it('should include markdown formatting in summary', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        return goodvibesDir;
      });

      const summary = '## Current Work\n\n- Feature A\n- Feature B\n\n```typescript\ncode example\n```';

      await saveSessionSummary(testDir, summary);

      const summaryPath = path.join(stateDir, 'last-session-summary.md');
      const content = fs.readFileSync(summaryPath, 'utf-8');

      expect(content).toContain('## Current Work');
      expect(content).toContain('```typescript');
    });

    it('should include footer message', async () => {
      const { ensureGoodVibesDir } = await import('../shared/index.js');
      const stateDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        const stateDir = path.join(goodvibesDir, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        return goodvibesDir;
      });

      await saveSessionSummary(testDir, 'Summary content');

      const summaryPath = path.join(stateDir, 'last-session-summary.md');
      const content = fs.readFileSync(summaryPath, 'utf-8');

      expect(content).toContain('This summary was automatically saved before context compaction by GoodVibes');
    });
  });

  describe('getFilesModifiedThisSession', () => {
    it('should return empty array for empty state', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toEqual([]);
    });

    it('should return modified files', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {
          modifiedThisSession: ['/src/file1.ts', '/src/file2.ts'],
          createdThisSession: [],
        },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toContain('/src/file1.ts');
      expect(files).toContain('/src/file2.ts');
      expect(files).toHaveLength(2);
    });

    it('should return created files', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {
          modifiedThisSession: [],
          createdThisSession: ['/src/new-file.ts', '/src/another-new.ts'],
        },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toContain('/src/new-file.ts');
      expect(files).toContain('/src/another-new.ts');
      expect(files).toHaveLength(2);
    });

    it('should combine modified and created files', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {
          modifiedThisSession: ['/src/existing.ts'],
          createdThisSession: ['/src/new.ts'],
        },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toContain('/src/existing.ts');
      expect(files).toContain('/src/new.ts');
      expect(files).toHaveLength(2);
    });

    it('should deduplicate files that appear in both lists', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {
          modifiedThisSession: ['/src/file.ts', '/src/other.ts'],
          createdThisSession: ['/src/file.ts'], // Duplicate
        },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toHaveLength(2);
      expect(files).toContain('/src/file.ts');
      expect(files).toContain('/src/other.ts');
    });

    it('should handle undefined file arrays', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {} as any, // Missing arrays
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toEqual([]);
    });

    it('should maintain file order from state', () => {
      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {
          modifiedThisSession: ['/src/a.ts', '/src/b.ts', '/src/c.ts'],
          createdThisSession: [],
        },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files[0]).toBe('/src/a.ts');
      expect(files[1]).toBe('/src/b.ts');
      expect(files[2]).toBe('/src/c.ts');
    });

    it('should handle large file lists', () => {
      const modifiedFiles = Array.from({ length: 100 }, (_, i) => `/src/file${i}.ts`);
      const createdFiles = Array.from({ length: 50 }, (_, i) => `/src/new${i}.ts`);

      const state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: {
          modifiedThisSession: modifiedFiles,
          createdThisSession: createdFiles,
        },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const files = getFilesModifiedThisSession(state);

      expect(files).toHaveLength(150);
    });
  });
});
