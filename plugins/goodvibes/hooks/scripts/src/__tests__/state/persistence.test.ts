/**
 * Tests for state/persistence.ts
 * Target: 100% line and branch coverage
 *
 * Coverage targets:
 * - Line 68: throwOnError branch in loadState catch block
 * - Line 72: throw error in loadState catch block
 * - Line 125: throw error in saveState catch block
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { loadState, saveState } from '../../state/persistence.js';

import type { HooksState } from '../../types/state.js';

// Mock dependencies
const mockEnsureGoodVibesDir = vi.fn();
const mockFileExists = vi.fn();
const mockDebug = vi.fn();

vi.mock('../../shared/index.js', () => ({
  ensureGoodVibesDir: (...args: unknown[]) => mockEnsureGoodVibesDir(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
}));

vi.mock('../../shared/logging.js', () => ({
  debug: (...args: unknown[]) => mockDebug(...args),
}));

describe('state/persistence', () => {
  let testDir: string;
  let goodvibesDir: string;
  let statePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh temp directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goodvibes-state-test-'));
    goodvibesDir = path.join(testDir, '.goodvibes');
    statePath = path.join(goodvibesDir, 'state', 'hooks-state.json');

    // Create required directories
    await fs.mkdir(path.join(goodvibesDir, 'state'), { recursive: true });

    // Default mock implementations
    mockEnsureGoodVibesDir.mockResolvedValue(goodvibesDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadState', () => {
    it('should return default state when file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      const state = await loadState(testDir);

      expect(state).toBeDefined();
      expect(state.session).toBeDefined();
      expect(state.session.id).toBe('');
    });

    it('should load valid state from file', async () => {
      const validState: HooksState = {
        session: {
          id: 'test-session-123',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {},
      };

      await fs.writeFile(statePath, JSON.stringify(validState));
      mockFileExists.mockResolvedValue(true);

      const state = await loadState(testDir);

      expect(state.session.id).toBe('test-session-123');
      expect(state.session.started_at).toBe('2025-01-01T00:00:00Z');
    });

    it('should return default state when JSON is invalid', async () => {
      await fs.writeFile(statePath, 'invalid json {{{');
      mockFileExists.mockResolvedValue(true);

      const state = await loadState(testDir);

      // Should return default state on parse error
      expect(state.session.id).toBe('');
      expect(mockDebug).toHaveBeenCalledWith(
        'Failed to load state, using defaults',
        expect.any(Error)
      );
    });

    it('should return default state when state structure is invalid', async () => {
      await fs.writeFile(statePath, JSON.stringify({ invalid: 'structure' }));
      mockFileExists.mockResolvedValue(true);

      const state = await loadState(testDir);

      // Should return default state when 'session' field is missing
      expect(state.session.id).toBe('');
    });

    it('should return default state when file is null', async () => {
      await fs.writeFile(statePath, 'null');
      mockFileExists.mockResolvedValue(true);

      const state = await loadState(testDir);

      expect(state.session.id).toBe('');
    });

    it('should return default state when file is an array', async () => {
      await fs.writeFile(statePath, '[1, 2, 3]');
      mockFileExists.mockResolvedValue(true);

      const state = await loadState(testDir);

      expect(state.session.id).toBe('');
    });

    it('should throw error when throwOnError is true and file read fails (line 72)', async () => {
      await fs.writeFile(statePath, 'invalid json {{{');
      mockFileExists.mockResolvedValue(true);

      await expect(
        loadState(testDir, { throwOnError: true })
      ).rejects.toThrow();
    });

    it('should throw error when throwOnError is true and parse fails (line 72)', async () => {
      // Create a file with invalid JSON
      await fs.writeFile(statePath, '{ invalid json }');
      mockFileExists.mockResolvedValue(true);

      await expect(
        loadState(testDir, { throwOnError: true })
      ).rejects.toThrow();
    });

  });

  describe('saveState', () => {
    it('should save state to file successfully', async () => {
      const state: HooksState = {
        session: {
          id: 'save-test-123',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {},
      };

      await saveState(testDir, state);

      // Verify file was written
      const content = await fs.readFile(statePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.session.id).toBe('save-test-123');
      expect(mockEnsureGoodVibesDir).toHaveBeenCalledWith(testDir);
    });

    it('should create state directory if it does not exist', async () => {
      // Remove the state directory
      await fs.rm(path.join(goodvibesDir, 'state'), {
        recursive: true,
        force: true,
      });
      mockFileExists.mockResolvedValue(false);

      const state: HooksState = {
        session: {
          id: 'create-dir-test',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {},
      };

      await saveState(testDir, state);

      // Verify file was written
      const content = await fs.readFile(statePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.session.id).toBe('create-dir-test');
    });

    it('should format JSON with 2-space indentation', async () => {
      const state: HooksState = {
        session: {
          id: 'format-test',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {},
      };

      mockFileExists.mockResolvedValue(true);
      await saveState(testDir, state);

      const content = await fs.readFile(statePath, 'utf-8');

      // Verify formatting
      expect(content).toContain('  "session"');
      expect(content).toContain('    "id"');
    });

    it('should throw error when throwOnError is true and write fails (line 125)', async () => {
      const state: HooksState = {
        session: {
          id: 'throw-test',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {},
      };

      // Use an invalid path to cause write failure
      // On Windows, paths with invalid characters like NUL will fail
      const invalidPath = path.join(testDir, '\0invalid');

      await expect(
        saveState(invalidPath, state, { throwOnError: true })
      ).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle state with complex error_tracking', async () => {
      const state: HooksState = {
        session: {
          id: 'complex-test',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {
          'Bash:test': {
            count: 3,
            last_seen: '2025-01-01T00:00:00Z',
          },
          'Read:file': {
            count: 1,
            last_seen: '2025-01-01T00:01:00Z',
          },
        },
      };

      await saveState(testDir, state);

      mockFileExists.mockResolvedValue(true);
      const loaded = await loadState(testDir);

      expect(loaded.error_tracking['Bash:test']?.count).toBe(3);
      expect(loaded.error_tracking['Read:file']?.count).toBe(1);
    });

    it('should handle very long paths', async () => {
      const longPath = '/'.padEnd(500, 'a/very/long/path/');
      const state: HooksState = {
        session: {
          id: 'long-path-test',
          started_at: '2025-01-01T00:00:00Z',
          cwd: longPath,
        },
        error_tracking: {},
      };

      await saveState(testDir, state);
      mockFileExists.mockResolvedValue(true);

      const loaded = await loadState(testDir);
      expect(loaded.session.cwd).toBe(longPath);
    });

    it('should handle empty error_tracking', async () => {
      const state: HooksState = {
        session: {
          id: 'empty-tracking',
          started_at: '2025-01-01T00:00:00Z',
          cwd: testDir,
        },
        error_tracking: {},
      };

      await saveState(testDir, state);
      mockFileExists.mockResolvedValue(true);

      const loaded = await loadState(testDir);
      expect(Object.keys(loaded.error_tracking)).toHaveLength(0);
    });
  });
});
