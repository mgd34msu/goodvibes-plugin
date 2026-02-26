/**
 * Unit tests for ExecutorModeManager
 *
 * Tests mode detection priority (env var > config > inferred > default),
 * runtime mode switching, shouldProcessQueue, shouldClearContext, and event
 * emission.
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires.
 * - process.env manipulation is isolated per-test via beforeEach/afterEach.
 * - Paths in vi.mock() are relative to THIS file (src/lifecycle/__tests__/).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const eventBusEmit = vi.fn();
  const EventBus = vi.fn().mockImplementation(function () {
    return { emit: eventBusEmit };
  });

  const loggerInfo = vi.fn();
  const loggerDebug = vi.fn();
  const loggerWarn = vi.fn();
  const loggerError = vi.fn();
  const createLogger = vi.fn().mockReturnValue({
    info: loggerInfo,
    debug: loggerDebug,
    warn: loggerWarn,
    error: loggerError,
  });

  const generateEventId = vi.fn().mockReturnValue('event-id-mock');
  const timestampFn = vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z');

  return {
    eventBusEmit,
    EventBus,
    createLogger,
    generateEventId,
    timestampFn,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../events/event-bus.js', () => ({ EventBus: mocks.EventBus }));
vi.mock('../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../shared/utils.js', () => ({
  generateEventId: mocks.generateEventId,
  timestamp: mocks.timestampFn,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ExecutorModeManager } from '../executor-mode.js';
import type { ExecutorConfig } from '../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ExecutorConfig> = {}): ExecutorConfig {
  return {
    mode: 'engaged',
    daemon: {
      clear_context_after_batch: false,
      tmux_session_name: 'claude-daemon',
      tick_command: 'tick',
    },
    budget: {
      warning_threshold: 0.8,
      daily_reset_hour: 0,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExecutorModeManager', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      GOODVIBES_EXECUTOR_MODE: process.env['GOODVIBES_EXECUTOR_MODE'],
      TMUX: process.env['TMUX'],
      GOODVIBES_INTERACTIVE: process.env['GOODVIBES_INTERACTIVE'],
    };
    // Clean slate for each test
    delete process.env['GOODVIBES_EXECUTOR_MODE'];
    delete process.env['TMUX'];
    delete process.env['GOODVIBES_INTERACTIVE'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  // ── Construction defaults ──────────────────────────────────────────────────

  describe('constructor / default mode', () => {
    it('defaults to engaged mode when no env var, config is engaged, and no TMUX', () => {
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('engaged');
    });

    it('sets detectionMethod to default when falling through all priority checks', () => {
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getDetectionMethod()).toBe('default');
    });

    it('accepts optional eventBus without throwing', () => {
      const bus = new mocks.EventBus();
      expect(() => new ExecutorModeManager(makeConfig(), bus)).not.toThrow();
    });

    it('works without eventBus (undefined)', () => {
      expect(() => new ExecutorModeManager(makeConfig())).not.toThrow();
    });
  });

  // ── detectMode: Priority 1 — env var ──────────────────────────────────────

  describe('detectMode — Priority 1: GOODVIBES_EXECUTOR_MODE env var', () => {
    it('sets daemon mode from env var', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'daemon';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('daemon');
    });

    it('sets hybrid mode from env var', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'hybrid';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('hybrid');
    });

    it('sets engaged mode from env var override (keeps engaged explicitly)', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'engaged';
      const manager = new ExecutorModeManager(makeConfig({ mode: 'daemon' }));
      expect(manager.getMode()).toBe('engaged');
    });

    it('sets detectionMethod to explicit when env var is used', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'daemon';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getDetectionMethod()).toBe('explicit');
    });

    it('env var takes priority over config mode', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'hybrid';
      const manager = new ExecutorModeManager(makeConfig({ mode: 'daemon' }));
      expect(manager.getMode()).toBe('hybrid');
    });

    it('env var takes priority over TMUX inference', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'engaged';
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('engaged');
    });

    it('ignores invalid env var values and falls through to next priority', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'invalid_mode';
      const manager = new ExecutorModeManager(makeConfig());
      // Falls through to default
      expect(manager.getMode()).toBe('engaged');
    });
  });

  // ── detectMode: Priority 2 — config ───────────────────────────────────────

  describe('detectMode — Priority 2: config.mode != engaged', () => {
    it('uses config daemon mode when config is not engaged', () => {
      const manager = new ExecutorModeManager(makeConfig({ mode: 'daemon' }));
      expect(manager.getMode()).toBe('daemon');
    });

    it('uses config hybrid mode when config is not engaged', () => {
      const manager = new ExecutorModeManager(makeConfig({ mode: 'hybrid' }));
      expect(manager.getMode()).toBe('hybrid');
    });

    it('sets detectionMethod to explicit when config mode is used', () => {
      const manager = new ExecutorModeManager(makeConfig({ mode: 'daemon' }));
      expect(manager.getDetectionMethod()).toBe('explicit');
    });

    it('config mode takes priority over TMUX inference', () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      const manager = new ExecutorModeManager(makeConfig({ mode: 'hybrid' }));
      expect(manager.getMode()).toBe('hybrid');
    });
  });

  // ── detectMode: Priority 3 — TMUX inference ───────────────────────────────

  describe('detectMode — Priority 3: TMUX inference', () => {
    it('infers daemon mode when TMUX is set and GOODVIBES_INTERACTIVE is not set', () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('daemon');
    });

    it('sets detectionMethod to inferred when TMUX inference is used', () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getDetectionMethod()).toBe('inferred');
    });

    it('stays engaged when TMUX and GOODVIBES_INTERACTIVE are both set', () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      process.env['GOODVIBES_INTERACTIVE'] = '1';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('engaged');
    });

    it('stays engaged when TMUX is not set (no inference possible)', () => {
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('engaged');
    });

    it('hybrid is never inferred from environment (stays engaged if no other priority)', () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      // Even with TMUX, we only infer daemon, never hybrid
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('daemon');
      expect(manager.getMode()).not.toBe('hybrid');
    });
  });

  // ── setMode ────────────────────────────────────────────────────────────────

  describe('setMode', () => {
    it('switches mode at runtime', () => {
      const manager = new ExecutorModeManager(makeConfig());
      manager.setMode('daemon');
      expect(manager.getMode()).toBe('daemon');
    });

    it('sets detectionMethod to explicit on setMode', () => {
      const manager = new ExecutorModeManager(makeConfig());
      manager.setMode('hybrid');
      expect(manager.getDetectionMethod()).toBe('explicit');
    });

    it('emits executor:mode_set event when eventBus is provided', () => {
      const bus = new mocks.EventBus();
      const manager = new ExecutorModeManager(makeConfig(), bus);
      manager.setMode('daemon');

      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:mode_set',
          payload: expect.objectContaining({
            type: 'executor:mode_set',
            data: expect.objectContaining({
              mode: 'daemon',
              previous_mode: 'engaged',
              detection_method: 'explicit',
            }),
          }),
        }),
      );
    });

    it('does NOT emit event when no eventBus is provided', () => {
      const manager = new ExecutorModeManager(makeConfig());
      manager.setMode('daemon');
      // mocks.eventBusEmit is bound to EventBus instances; no bus → no emit
      expect(mocks.eventBusEmit).not.toHaveBeenCalled();
    });

    it('can switch back from daemon to engaged', () => {
      const manager = new ExecutorModeManager(makeConfig({ mode: 'daemon' }));
      expect(manager.getMode()).toBe('daemon');
      manager.setMode('engaged');
      expect(manager.getMode()).toBe('engaged');
    });
  });

  // ── shouldProcessQueue ────────────────────────────────────────────────────

  describe('shouldProcessQueue', () => {
    it('returns false in engaged mode', () => {
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.shouldProcessQueue()).toBe(false);
    });

    it('returns true in daemon mode', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'daemon';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.shouldProcessQueue()).toBe(true);
    });

    it('returns true in hybrid mode', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'hybrid';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.shouldProcessQueue()).toBe(true);
    });

    it('updates after setMode changes mode', () => {
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.shouldProcessQueue()).toBe(false);
      manager.setMode('daemon');
      expect(manager.shouldProcessQueue()).toBe(true);
    });
  });

  // ── shouldClearContext ────────────────────────────────────────────────────

  describe('shouldClearContext', () => {
    it('returns false in engaged mode', () => {
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.shouldClearContext()).toBe(false);
    });

    it('returns false in hybrid mode', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'hybrid';
      const manager = new ExecutorModeManager(makeConfig({
        daemon: {
          clear_context_after_batch: true,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
        },
      }));
      expect(manager.shouldClearContext()).toBe(false);
    });

    it('returns true in daemon mode when clear_context_after_batch is true', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'daemon';
      const manager = new ExecutorModeManager(makeConfig({
        daemon: {
          clear_context_after_batch: true,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
        },
      }));
      expect(manager.shouldClearContext()).toBe(true);
    });

    it('returns false in daemon mode when clear_context_after_batch is false', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'daemon';
      const manager = new ExecutorModeManager(makeConfig({
        daemon: {
          clear_context_after_batch: false,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
        },
      }));
      expect(manager.shouldClearContext()).toBe(false);
    });
  });

  // ── getMode ───────────────────────────────────────────────────────────────

  describe('getMode', () => {
    it('returns the current mode', () => {
      process.env['GOODVIBES_EXECUTOR_MODE'] = 'hybrid';
      const manager = new ExecutorModeManager(makeConfig());
      expect(manager.getMode()).toBe('hybrid');
    });
  });
});
