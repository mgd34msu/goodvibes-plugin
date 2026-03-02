import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() so the mock variable is available inside the vi.mock() factory
const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ContextClearer } from '../context-clearer.js';
import type { DaemonConfig } from '../../../shared/config.js';

function makeConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  return {
    clear_context_after_batch: false,
    tmux_session_name: 'test-session',
    tick_command: '/usr/bin/tick',
    tick_interval_ms: 60_000,
    auto_tick: true,
    eval_interval_ms: 10_000,
    ...overrides,
  };
}

describe('ContextClearer', () => {
  let originalTmux: string | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    originalTmux = process.env['TMUX'];
  });

  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env['TMUX'];
    } else {
      process.env['TMUX'] = originalTmux;
    }
  });

  // ─── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores the provided config', () => {
      const config = makeConfig({ tmux_session_name: 'my-session' });
      const clearer = new ContextClearer(config);
      // Access private config via type cast for verification
      expect((clearer as unknown as { config: DaemonConfig }).config).toBe(config);
    });
  });

  // ─── clearContext — tmux path ────────────────────────────────────────────────

  describe('clearContext — tmux available', () => {
    beforeEach(() => {
      process.env['TMUX'] = '/tmp/tmux-1234/default,1234,0';
    });

    it('returns method=tmux and success=true when tmux commands succeed', async () => {
      mockExecFileSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig({ tmux_session_name: 'my-session' }));
      const result = await clearer.clearContext();
      expect(result).toEqual({ method: 'tmux', success: true });
    });

    it('calls tmux send-keys twice with correct session name and keys', async () => {
      mockExecFileSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig({ tmux_session_name: 'my-session' }));
      await clearer.clearContext();

      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
      expect(mockExecFileSync).toHaveBeenNthCalledWith(
        1,
        'tmux',
        ['send-keys', '-t', 'my-session', '/clear'],
        { timeout: 5000, stdio: 'pipe' },
      );
      expect(mockExecFileSync).toHaveBeenNthCalledWith(
        2,
        'tmux',
        ['send-keys', '-t', 'my-session', 'Enter'],
        { timeout: 5000, stdio: 'pipe' },
      );
    });

    it('falls back to queue_injection when execFileSync throws on first call', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('tmux not found');
      });
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result).toEqual({ method: 'queue_injection', success: true });
    });

    it('falls back to queue_injection when clearViaTmux returns false', async () => {
      // execFileSync throws on first call — clearViaTmux catches internally and returns false
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('session not found');
      });
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      // clearViaTmux returned false (caught internally), so clearContext falls back
      expect(result).toEqual({ method: 'queue_injection', success: true });
    });
  });

  // ─── clearContext — no tmux ──────────────────────────────────────────────────

  describe('clearContext — tmux not available', () => {
    beforeEach(() => {
      delete process.env['TMUX'];
    });

    it('returns method=queue_injection and success=true without calling execFileSync', async () => {
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result).toEqual({ method: 'queue_injection', success: true });
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('returns queue_injection when TMUX env is empty string', async () => {
      process.env['TMUX'] = '';
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result).toEqual({ method: 'queue_injection', success: true });
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── clearViaTmux — session name propagation ─────────────────────────────────

  describe('clearViaTmux — session name from config', () => {
    beforeEach(() => {
      process.env['TMUX'] = '/tmp/tmux-test';
    });

    it('uses tmux_session_name from config in the send-keys target', async () => {
      mockExecFileSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig({ tmux_session_name: 'production-session' }));
      await clearer.clearContext();

      const firstCall = mockExecFileSync.mock.calls[0];
      expect(firstCall[1]).toContain('production-session');
    });
  });
});
