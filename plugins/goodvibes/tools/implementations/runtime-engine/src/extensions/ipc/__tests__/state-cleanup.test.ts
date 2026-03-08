/**
 * Tests for performStateCleanup — state directory cleanup logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────
const {
  mockReaddirSync,
  mockStatSync,
  mockRenameSync,
  mockUnlinkSync,
  mockExistsSync,
  mockEnsureDirSync,
  mockIsPidAlive,
} = vi.hoisted(() => ({
  mockReaddirSync: vi.fn().mockReturnValue([]),
  mockStatSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
  mockRenameSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockEnsureDirSync: vi.fn(),
  mockIsPidAlive: vi.fn().mockReturnValue(false),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  renameSync: mockRenameSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync,
}));

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  basename: (p: string) => p.split('/').pop() ?? p,
}));

vi.mock('../../../core/utils/fs-utils.js', () => ({
  ensureDirSync: mockEnsureDirSync,
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../process-utils.js', () => ({
  isPidAlive: mockIsPidAlive,
}));

import { performStateCleanup } from '../state-cleanup.js';
import type { CleanupOptions } from '../state-cleanup.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STALE_MTIME = Date.now() - 48 * 60 * 60 * 1000; // 48 h ago — over 24 h threshold
const FRESH_MTIME = Date.now() - 1 * 60 * 60 * 1000;  // 1 h ago — under 24 h threshold
const OLD_ARCHIVE_MTIME = Date.now() - 200 * 60 * 60 * 1000; // 200 h ago — over 168 h delete threshold

function makeOpts(overrides: Partial<CleanupOptions> = {}): CleanupOptions {
  return {
    stateDir: '/state',
    archiveAfterHours: 24,
    deleteAfterHours: 168,
    livePids: new Set<number>(),
    liveSessions: new Set<string>(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: stateDir exists, archive dirs do not
  mockExistsSync.mockImplementation((p: string) => p === '/state');
  mockReaddirSync.mockReturnValue([]);
  mockStatSync.mockReturnValue({ mtimeMs: STALE_MTIME });
  mockIsPidAlive.mockReturnValue(false);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('performStateCleanup', () => {
  describe('non-existent stateDir', () => {
    it('returns zeroed result without reading directory', () => {
      mockExistsSync.mockReturnValue(false);
      const result = performStateCleanup(makeOpts());
      expect(result).toEqual({ archived: 0, deleted: 0, skipped: 0, socketsRemoved: 0, errors: [] });
      expect(mockReaddirSync).not.toHaveBeenCalled();
    });
  });

  describe('empty stateDir', () => {
    it('returns zeroed result', () => {
      mockReaddirSync.mockReturnValue([]);
      const result = performStateCleanup(makeOpts());
      expect(result).toEqual({ archived: 0, deleted: 0, skipped: 0, socketsRemoved: 0, errors: [] });
    });
  });

  describe('readdirSync error on stateDir', () => {
    it('returns error and early-exits', () => {
      mockReaddirSync.mockImplementationOnce(() => { throw new Error('EACCES'); });
      const result = performStateCleanup(makeOpts());
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('EACCES');
      expect(result.archived).toBe(0);
    });
  });

  describe('socket pointer files — PID-keyed', () => {
    it('archives stale pointer when PID is dead and not in livePids', () => {
      mockReaddirSync.mockReturnValueOnce(['runtime-12345.socket']);
      mockIsPidAlive.mockReturnValue(false);
      mockStatSync.mockReturnValue({ mtimeMs: STALE_MTIME });

      const result = performStateCleanup(makeOpts());

      expect(result.archived).toBe(1);
      expect(mockRenameSync).toHaveBeenCalledTimes(1);
      expect(result.skipped).toBe(0);
    });

    it('skips pointer when PID is alive via isPidAlive', () => {
      mockReaddirSync.mockReturnValueOnce(['runtime-12345.socket']);
      mockIsPidAlive.mockReturnValue(true);

      const result = performStateCleanup(makeOpts());

      expect(result.skipped).toBe(1);
      expect(result.archived).toBe(0);
      expect(mockRenameSync).not.toHaveBeenCalled();
    });

    it('skips pointer when PID is in livePids set', () => {
      mockReaddirSync.mockReturnValueOnce(['runtime-99999.socket']);
      mockIsPidAlive.mockReturnValue(false);

      const result = performStateCleanup(makeOpts({ livePids: new Set([99999]) }));

      expect(result.skipped).toBe(1);
      expect(result.archived).toBe(0);
    });

    it('does not archive fresh pointer even if PID is dead', () => {
      mockReaddirSync.mockReturnValueOnce(['runtime-12345.socket']);
      mockIsPidAlive.mockReturnValue(false);
      mockStatSync.mockReturnValue({ mtimeMs: FRESH_MTIME });

      const result = performStateCleanup(makeOpts());

      expect(result.archived).toBe(0);
      expect(mockRenameSync).not.toHaveBeenCalled();
    });
  });

  describe('socket pointer files — UUID-keyed', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('skips pointer for live session UUID', () => {
      mockReaddirSync.mockReturnValueOnce([`runtime-${uuid}.socket`]);

      const result = performStateCleanup(makeOpts({ liveSessions: new Set([uuid]) }));

      expect(result.skipped).toBe(1);
      expect(result.archived).toBe(0);
    });

    it('archives stale pointer for dead session UUID', () => {
      mockReaddirSync.mockReturnValueOnce([`runtime-${uuid}.socket`]);
      mockStatSync.mockReturnValue({ mtimeMs: STALE_MTIME });

      const result = performStateCleanup(makeOpts());

      expect(result.archived).toBe(1);
      expect(mockRenameSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('socket pointer files — unknown key format', () => {
    it('skips pointer with unrecognised key', () => {
      mockReaddirSync.mockReturnValueOnce(['runtime-weird-key.socket']);

      const result = performStateCleanup(makeOpts());

      expect(result.skipped).toBe(1);
      expect(result.archived).toBe(0);
    });
  });

  describe('session state files', () => {
    const sessionId = 'abc123def456';

    it('archives stale session file when session is not live', () => {
      mockReaddirSync.mockReturnValueOnce([`session_${sessionId}.json`]);
      mockStatSync.mockReturnValue({ mtimeMs: STALE_MTIME });

      const result = performStateCleanup(makeOpts());

      expect(result.archived).toBe(1);
      expect(mockRenameSync).toHaveBeenCalledTimes(1);
    });

    it('skips session file when session is in liveSessions', () => {
      mockReaddirSync.mockReturnValueOnce([`session_${sessionId}.json`]);

      const result = performStateCleanup(makeOpts({ liveSessions: new Set([sessionId]) }));

      expect(result.skipped).toBe(1);
      expect(result.archived).toBe(0);
    });

    it('does not archive fresh session file', () => {
      mockReaddirSync.mockReturnValueOnce([`session_${sessionId}.json`]);
      mockStatSync.mockReturnValue({ mtimeMs: FRESH_MTIME });

      const result = performStateCleanup(makeOpts());

      expect(result.archived).toBe(0);
    });
  });

  describe('archive phase — delete old archived files', () => {
    it('deletes archived files older than deleteAfterHours', () => {
      // stateDir exists, archive/pointers dir exists, archive/sessions does not
      mockExistsSync.mockImplementation((p: string) =>
        p === '/state' || p === '/state/archive/pointers'
      );
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/state') return [];
        if (dir === '/state/archive/pointers') return ['old-file.20260101.1234'];
        return [];
      });
      mockStatSync.mockReturnValue({ mtimeMs: OLD_ARCHIVE_MTIME });

      const result = performStateCleanup(makeOpts());

      expect(result.deleted).toBe(1);
      expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    });

    it('does not delete archived files within deleteAfterHours', () => {
      mockExistsSync.mockImplementation((p: string) =>
        p === '/state' || p === '/state/archive/pointers'
      );
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/state') return [];
        if (dir === '/state/archive/pointers') return ['recent-file.20260308.9999'];
        return [];
      });
      mockStatSync.mockReturnValue({ mtimeMs: STALE_MTIME }); // 48 h — under 168 h delete threshold

      const result = performStateCleanup(makeOpts());

      expect(result.deleted).toBe(0);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('individual file errors do not stop processing', () => {
    it('continues processing after a statSync error on one file', () => {
      mockReaddirSync.mockReturnValueOnce([
        'runtime-11111.socket', // will fail stat
        'runtime-22222.socket', // will succeed and be archived
      ]);
      mockIsPidAlive.mockReturnValue(false);
      let callCount = 0;
      mockStatSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('ENOENT');
        return { mtimeMs: STALE_MTIME };
      });

      const result = performStateCleanup(makeOpts());

      expect(result.skipped).toBe(1); // first file skipped due to stat error
      expect(result.archived).toBe(1); // second file archived
    });
  });

  describe('phase 3 — socket file cleanup', () => {
    it('removes dead-PID socket files and increments socketsRemoved', () => {
      const sockDir = '/state/sockets/active';
      mockExistsSync.mockImplementation((p: string) => p === '/state' || p === sockDir);
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/state') return [];
        if (dir === sockDir) return ['goodvibes-runtime-abc-55555.sock'];
        return [];
      });
      mockIsPidAlive.mockReturnValue(false);

      const result = performStateCleanup(makeOpts({ activeSocketDir: sockDir }));

      expect(result.socketsRemoved).toBe(1);
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${sockDir}/goodvibes-runtime-abc-55555.sock`);
    });

    it('does not remove socket files for live PIDs', () => {
      const sockDir = '/state/sockets/active';
      mockExistsSync.mockImplementation((p: string) => p === '/state' || p === sockDir);
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/state') return [];
        if (dir === sockDir) return ['goodvibes-runtime-abc-77777.sock'];
        return [];
      });
      mockIsPidAlive.mockReturnValue(true);

      const result = performStateCleanup(makeOpts({ activeSocketDir: sockDir }));

      expect(result.socketsRemoved).toBe(0);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('skips phase 3 when activeSocketDir is undefined', () => {
      mockExistsSync.mockImplementation((p: string) => p === '/state');
      mockReaddirSync.mockReturnValue([]);

      const result = performStateCleanup(makeOpts({ activeSocketDir: undefined }));

      expect(result.socketsRemoved).toBe(0);
    });
  });
});
