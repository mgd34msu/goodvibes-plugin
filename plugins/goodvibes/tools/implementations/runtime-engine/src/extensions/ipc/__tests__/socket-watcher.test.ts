import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

let mockLogWarn: ReturnType<typeof vi.fn>;
let mockLogInfo: ReturnType<typeof vi.fn>;
let mockLogDebug: ReturnType<typeof vi.fn>;

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: (...args: unknown[]) => mockLogDebug?.(...args),
    info: (...args: unknown[]) => mockLogInfo?.(...args),
    warn: (...args: unknown[]) => mockLogWarn?.(...args),
    error: vi.fn(),
  }),
}));

// fs mock
let mockExistsSync: ReturnType<typeof vi.fn>;
let mockWatch: ReturnType<typeof vi.fn>;
let mockWatcherClose: ReturnType<typeof vi.fn>;
let capturedWatchCallback: ((eventType: string, filename: string | null) => void) | null = null;

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync?.(...args),
  watch: (...args: unknown[]) => mockWatch?.(...args),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import { SocketWatcher } from '../socket-watcher.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const SOCKET_PATH = '/tmp/test-dir/goodvibes-runtime-abc-12345.sock';

function makeWatcher(
  onSocketLost: () => void | Promise<void> = vi.fn(),
  options?: { pollIntervalMs?: number; debounceMs?: number },
) {
  return new SocketWatcher(SOCKET_PATH, onSocketLost, options);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SocketWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLogWarn = vi.fn();
    mockLogInfo = vi.fn();
    mockLogDebug = vi.fn();
    mockWatcherClose = vi.fn();
    capturedWatchCallback = null;

    // Default: fs.watch succeeds, existsSync returns true (socket alive)
    mockWatch = vi.fn().mockImplementation((_dir: string, cb: (eventType: string, filename: string | null) => void) => {
      capturedWatchCallback = cb;
      return { unref: vi.fn(), close: mockWatcherClose };
    });
    mockExistsSync = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ─── start() idempotency ───────────────────────────────────────────────────

  describe('start() idempotency', () => {
    it('calling start() twice is a no-op (watch called once)', () => {
      const watcher = makeWatcher();
      watcher.start();
      watcher.start();
      expect(mockWatch).toHaveBeenCalledTimes(1);
    });

    it('isWatching() returns true after start()', () => {
      const watcher = makeWatcher();
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('isWatching() returns false before start()', () => {
      const watcher = makeWatcher();
      expect(watcher.isWatching()).toBe(false);
    });
  });

  // ─── stop() ───────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('sets isWatching() to false', () => {
      const watcher = makeWatcher();
      watcher.start();
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('closes the directory watcher', () => {
      const watcher = makeWatcher();
      watcher.start();
      watcher.stop();
      expect(mockWatcherClose).toHaveBeenCalledTimes(1);
    });

    it('clears the poll timer (no callback fires after stop)', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false); // socket missing
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 1000 });
      watcher.start();
      watcher.stop();
      vi.advanceTimersByTime(5000);
      expect(onSocketLost).not.toHaveBeenCalled();
    });

    it('calling stop() when not watching is a no-op', () => {
      const watcher = makeWatcher();
      expect(() => watcher.stop()).not.toThrow();
    });

    it('calling stop() twice is safe', () => {
      const watcher = makeWatcher();
      watcher.start();
      watcher.stop();
      expect(() => watcher.stop()).not.toThrow();
    });
  });

  // ─── isWatching() ─────────────────────────────────────────────────────────

  describe('isWatching()', () => {
    it('returns false initially', () => {
      const watcher = makeWatcher();
      expect(watcher.isWatching()).toBe(false);
    });

    it('returns true after start()', () => {
      const watcher = makeWatcher();
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('returns false after stop()', () => {
      const watcher = makeWatcher();
      watcher.start();
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });
  });

  // ─── declareLost() single-fire guard ──────────────────────────────────────

  describe('declareLost() single-fire guard', () => {
    it('callback fires exactly once even when poll and fs.watch both trigger', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false); // socket always missing
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100, debounceMs: 50 });
      watcher.start();

      // Trigger via fs.watch rename event
      capturedWatchCallback?.('rename', 'goodvibes-runtime-abc-12345.sock');
      vi.advanceTimersByTime(50); // debounce fires

      // Trigger via poll as well
      vi.advanceTimersByTime(100);

      expect(onSocketLost).toHaveBeenCalledTimes(1);
    });

    it('stops watching after firing', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100 });
      watcher.start();
      vi.advanceTimersByTime(100);
      expect(watcher.isWatching()).toBe(false);
    });

    it('logs info when invoking the callback', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100 });
      watcher.start();
      vi.advanceTimersByTime(100);
      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('invoking onSocketLost callback'),
        expect.any(Object),
      );
    });
  });

  // ─── Poll fallback detects missing socket ──────────────────────────────────

  describe('poll fallback', () => {
    it('invokes onSocketLost when poll detects missing socket', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 500 });
      watcher.start();
      vi.advanceTimersByTime(500);
      expect(onSocketLost).toHaveBeenCalledTimes(1);
    });

    it('does not invoke onSocketLost when socket still exists', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(true);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 500 });
      watcher.start();
      vi.advanceTimersByTime(2000);
      expect(onSocketLost).not.toHaveBeenCalled();
    });

    it('logs warn when poll detects missing socket', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 500 });
      watcher.start();
      vi.advanceTimersByTime(500);
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('periodic poll detected missing socket'),
        expect.any(Object),
      );
    });
  });

  // ─── fs.watch failure → poll-only mode ────────────────────────────────────

  describe('fs.watch failure (poll-only mode)', () => {
    it('logs warn with poll-only mode message when fs.watch throws', () => {
      mockWatch = vi.fn().mockImplementation(() => {
        throw new Error('ENOSYS');
      });
      const watcher = makeWatcher(vi.fn(), { pollIntervalMs: 500 });
      watcher.start();
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('poll-only mode'),
        expect.any(Object),
      );
    });

    it('includes poll interval in log message when fs.watch throws', () => {
      mockWatch = vi.fn().mockImplementation(() => {
        throw new Error('ENOSYS');
      });
      const watcher = makeWatcher(vi.fn(), { pollIntervalMs: 12345 });
      watcher.start();
      const warnCall = (mockLogWarn as Mock).mock.calls[0][0];
      expect(warnCall).toContain('12345ms');
    });

    it('still invokes onSocketLost via poll when fs.watch is unavailable', () => {
      mockWatch = vi.fn().mockImplementation(() => {
        throw new Error('ENOSYS');
      });
      mockExistsSync.mockReturnValue(false);
      const onSocketLost = vi.fn();
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 500 });
      watcher.start();
      vi.advanceTimersByTime(500);
      expect(onSocketLost).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Async callback rejection handling ────────────────────────────────────

  describe('async callback rejection handling', () => {
    it('does not throw when callback returns a rejected Promise', async () => {
      const onSocketLost = vi.fn().mockReturnValue(Promise.reject(new Error('async error')));
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100 });
      watcher.start();
      vi.advanceTimersByTime(100);
      // Allow the microtask queue to flush
      await Promise.resolve();
      // If rejection were unhandled it would have thrown by now
    });

    it('logs warn when callback returns a rejected Promise', async () => {
      const rejectionError = new Error('async failure');
      const onSocketLost = vi.fn().mockReturnValue(Promise.reject(rejectionError));
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100 });
      watcher.start();
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('onSocketLost callback rejected'),
        expect.objectContaining({ error: expect.stringContaining('async failure') }),
      );
    });

    it('logs warn when callback throws synchronously', () => {
      const onSocketLost = vi.fn().mockImplementation(() => {
        throw new Error('sync error');
      });
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100 });
      watcher.start();
      vi.advanceTimersByTime(100);
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('onSocketLost callback threw'),
        expect.objectContaining({ error: expect.stringContaining('sync error') }),
      );
    });

    it('invokes the callback when it returns a resolved Promise', async () => {
      const onSocketLost = vi.fn().mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { pollIntervalMs: 100 });
      watcher.start();
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      expect(onSocketLost).toHaveBeenCalledTimes(1);
    });
  });

  // ─── fs.watch rename event + debounce ─────────────────────────────────────

  describe('fs.watch rename event with debounce', () => {
    it('does not fire immediately on rename event (waits for debounce)', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { debounceMs: 500 });
      watcher.start();
      capturedWatchCallback?.('rename', 'goodvibes-runtime-abc-12345.sock');
      vi.advanceTimersByTime(100); // less than debounce
      expect(onSocketLost).not.toHaveBeenCalled();
    });

    it('fires after debounce window when socket is missing', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { debounceMs: 500 });
      watcher.start();
      capturedWatchCallback?.('rename', 'goodvibes-runtime-abc-12345.sock');
      vi.advanceTimersByTime(500);
      expect(onSocketLost).toHaveBeenCalledTimes(1);
    });

    it('does not fire if socket exists after debounce (false positive)', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(true); // socket still alive
      const watcher = makeWatcher(onSocketLost, { debounceMs: 500 });
      watcher.start();
      capturedWatchCallback?.('rename', 'goodvibes-runtime-abc-12345.sock');
      vi.advanceTimersByTime(500);
      expect(onSocketLost).not.toHaveBeenCalled();
    });

    it('ignores rename events for other files', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { debounceMs: 100 });
      watcher.start();
      capturedWatchCallback?.('rename', 'some-other-file.sock');
      vi.advanceTimersByTime(200);
      expect(onSocketLost).not.toHaveBeenCalled();
    });

    it('resets debounce timer on repeated rename events', () => {
      const onSocketLost = vi.fn();
      mockExistsSync.mockReturnValue(false);
      const watcher = makeWatcher(onSocketLost, { debounceMs: 500 });
      watcher.start();
      capturedWatchCallback?.('rename', 'goodvibes-runtime-abc-12345.sock');
      vi.advanceTimersByTime(300);
      capturedWatchCallback?.('rename', 'goodvibes-runtime-abc-12345.sock'); // reset
      vi.advanceTimersByTime(300); // only 300ms since last event
      expect(onSocketLost).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200); // now 500ms since last event
      expect(onSocketLost).toHaveBeenCalledTimes(1);
    });
  });
});
