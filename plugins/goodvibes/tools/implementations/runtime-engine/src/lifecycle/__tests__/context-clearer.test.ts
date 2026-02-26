/**
 * Unit tests for ContextClearer
 *
 * Tests tmux availability detection, context clearing via tmux and fallback,
 * command format verification, and timeout handling.
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires.
 * - node:child_process execSync is fully mocked.
 * - process.env['TMUX'] is manipulated per-test and restored in afterEach.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const execSync = vi.fn();
  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });
  return { execSync, createLogger };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({ execSync: mocks.execSync }));
vi.mock('../shared/logger.js', () => ({ createLogger: mocks.createLogger }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ContextClearer } from '../context-clearer.js';
import type { DaemonConfig } from '../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  return {
    clear_context_after_batch: true,
    tmux_session_name: 'claude-daemon',
    tick_command: 'tick',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContextClearer', () => {
  let savedTmux: string | undefined;

  beforeEach(() => {
    savedTmux = process.env['TMUX'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedTmux === undefined) {
      delete process.env['TMUX'];
    } else {
      process.env['TMUX'] = savedTmux;
    }
  });

  // ── isTmuxAvailable (tested indirectly via clearContext) ────────────────────

  describe('tmux availability', () => {
    it('uses tmux path when TMUX env var is set to non-empty string', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result.method).toBe('tmux');
      expect(result.success).toBe(true);
    });

    it('falls back to queue_injection when TMUX env var is not set', async () => {
      delete process.env['TMUX'];
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result.method).toBe('queue_injection');
      expect(result.success).toBe(true);
    });

    it('falls back to queue_injection when TMUX env var is empty string', async () => {
      process.env['TMUX'] = '';
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result.method).toBe('queue_injection');
      expect(result.success).toBe(true);
    });
  });

  // ── clearContext ─────────────────────────────────────────────────────────

  describe('clearContext', () => {
    it('returns method tmux and success true when execSync succeeds', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result).toEqual({ method: 'tmux', success: true });
    });

    it('falls back to queue_injection when execSync throws', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockImplementation(() => { throw new Error('tmux not found'); });
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result.method).toBe('queue_injection');
      expect(result.success).toBe(true);
    });

    it('falls back to queue_injection when tmux is unavailable (no TMUX env)', async () => {
      delete process.env['TMUX'];
      const clearer = new ContextClearer(makeConfig());
      const result = await clearer.clearContext();
      expect(result).toEqual({ method: 'queue_injection', success: true });
    });

    it('uses the configured tmux_session_name in the command', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig({ tmux_session_name: 'my-session' }));
      await clearer.clearContext();
      expect(mocks.execSync).toHaveBeenCalledWith(
        expect.stringContaining('my-session'),
        expect.any(Object),
      );
    });

    it('includes /clear in the tmux send-keys command', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig());
      await clearer.clearContext();
      const cmd = mocks.execSync.mock.calls[0][0] as string;
      expect(cmd).toContain('/clear');
      expect(cmd).toContain('tmux send-keys');
    });

    it('passes a 5000ms timeout to execSync', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockReturnValue(undefined);
      const clearer = new ContextClearer(makeConfig());
      await clearer.clearContext();
      const opts = mocks.execSync.mock.calls[0][1] as { timeout: number };
      expect(opts.timeout).toBe(5000);
    });

    it('handles execSync throwing non-Error objects gracefully', async () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      mocks.execSync.mockImplementation(() => { throw 'string error'; });
      const clearer = new ContextClearer(makeConfig());
      // Should not throw and should fall back
      await expect(clearer.clearContext()).resolves.toEqual({
        method: 'queue_injection',
        success: true,
      });
    });

    it('does not call execSync when TMUX is unavailable', async () => {
      delete process.env['TMUX'];
      const clearer = new ContextClearer(makeConfig());
      await clearer.clearContext();
      expect(mocks.execSync).not.toHaveBeenCalled();
    });
  });
});
