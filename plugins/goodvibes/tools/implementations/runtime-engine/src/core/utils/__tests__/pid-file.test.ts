/**
 * Tests for PID file utilities — core/utils/pid-file.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';

// Use vi.hoisted so mock references are available inside the vi.mock() factory
const { mockWriteFileSync, mockReadFileSync, mockUnlinkSync, mockExistsSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockExistsSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync,
}));

vi.mock('../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../shared/utils.js', () => ({
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

import {
  getPidFilePath,
  isProcessRunning,
  writePidFile,
  removePidFile,
  checkCrashRecovery,
} from '../pid-file.js';

describe('pid-file utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // getPidFilePath
  // ──────────────────────────────────────────────────────────

  describe('getPidFilePath()', () => {
    it('returns a string path containing the process PID', () => {
      const path = getPidFilePath('/my/project');
      expect(path).toContain(String(process.pid));
    });

    it('returns a path in the OS temp directory', () => {
      const path = getPidFilePath('/my/project');
      expect(path).toContain(tmpdir());
    });

    it('includes goodvibes-runtime-engine in the filename', () => {
      const path = getPidFilePath('/my/project');
      expect(path).toContain('goodvibes-runtime-engine');
    });

    it('produces different paths for different project roots', () => {
      const path1 = getPidFilePath('/project/alpha');
      const path2 = getPidFilePath('/project/beta');
      expect(path1).not.toBe(path2);
    });

    it('produces the same path for the same project root', () => {
      expect(getPidFilePath('/same/root')).toBe(getPidFilePath('/same/root'));
    });

    it('includes an 8-character hash segment', () => {
      const path = getPidFilePath('/my/project');
      // format: goodvibes-runtime-engine-{8char hash}-{pid}.pid
      const match = path.match(/goodvibes-runtime-engine-([a-f0-9]{8})-\d+\.pid$/);
      expect(match).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────
  // isProcessRunning
  // ──────────────────────────────────────────────────────────

  describe('isProcessRunning()', () => {
    it('returns true when process.kill(pid, 0) succeeds', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      expect(isProcessRunning(12345)).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(12345, 0);
      killSpy.mockRestore();
    });

    it('returns false when process.kill throws (process not found)', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      });
      expect(isProcessRunning(99999)).toBe(false);
      killSpy.mockRestore();
    });

    it('returns false for any exception from process.kill', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('generic error');
      });
      expect(isProcessRunning(1)).toBe(false);
      killSpy.mockRestore();
    });
  });

  // ──────────────────────────────────────────────────────────
  // writePidFile
  // ──────────────────────────────────────────────────────────

  describe('writePidFile()', () => {
    it('calls writeFileSync with the PID as string', () => {
      writePidFile('/my/project');
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const [, content, opts] = mockWriteFileSync.mock.calls[0] as [string, string, object];
      expect(content).toBe(String(process.pid));
      expect(opts).toMatchObject({ encoding: 'utf-8', mode: 0o600 });
    });

    it('writes to the path returned by getPidFilePath', () => {
      writePidFile('/my/project');
      const [path] = mockWriteFileSync.mock.calls[0] as [string];
      expect(path).toBe(getPidFilePath('/my/project'));
    });

    it('silently ignores write errors', () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('disk full');
      });
      expect(() => writePidFile('/my/project')).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────
  // removePidFile
  // ──────────────────────────────────────────────────────────

  describe('removePidFile()', () => {
    it('calls unlinkSync on the PID file path', () => {
      removePidFile('/my/project');
      expect(mockUnlinkSync).toHaveBeenCalledOnce();
      const [path] = mockUnlinkSync.mock.calls[0] as [string];
      expect(path).toBe(getPidFilePath('/my/project'));
    });

    it('silently ignores ENOENT errors', () => {
      mockUnlinkSync.mockImplementation(() => {
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
      });
      expect(() => removePidFile('/my/project')).not.toThrow();
    });

    it('does not throw for other errors (swallows with warn)', () => {
      mockUnlinkSync.mockImplementation(() => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      });
      // Should not throw — just logs a warning
      expect(() => removePidFile('/my/project')).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────
  // checkCrashRecovery
  // ──────────────────────────────────────────────────────────

  describe('checkCrashRecovery()', () => {
    it('returns early without reading file when no PID file exists', async () => {
      mockExistsSync.mockReturnValue(false);
      await checkCrashRecovery('/my/project');
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('takes no action when PID file contains current process PID', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(String(process.pid));
      await checkCrashRecovery('/my/project');
      // Should not call unlinkSync because it is our own PID
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('removes stale PID file when previous process is dead', async () => {
      const deadPid = 99999;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(String(deadPid));

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      });

      await checkCrashRecovery('/my/project');

      expect(mockUnlinkSync).toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('removes stale PID file but logs warning when previous process is still running', async () => {
      const alivePid = 88888;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(String(alivePid));

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      await checkCrashRecovery('/my/project');

      expect(mockUnlinkSync).toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('removes stale PID file when content is invalid (NaN)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not-a-number');

      await checkCrashRecovery('/my/project');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('removes stale PID file when content is 0 (invalid PID)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('0');

      await checkCrashRecovery('/my/project');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('removes stale PID file when content is negative (invalid PID)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('-5');

      await checkCrashRecovery('/my/project');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('removes stale PID file when content is a float (non-integer)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('12.5');

      await checkCrashRecovery('/my/project');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('handles read errors gracefully without throwing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('permission denied');
      });

      await expect(checkCrashRecovery('/my/project')).resolves.toBeUndefined();
    });
  });
});
