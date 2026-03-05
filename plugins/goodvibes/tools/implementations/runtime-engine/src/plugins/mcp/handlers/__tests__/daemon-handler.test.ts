/**
 * runtime_daemon Handler Tests
 *
 * Tests the restart action: successful restart (stop + start + getStatus)
 * and restart failure (start throws after stop succeeds).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleDaemon } from '../daemon-handler.js';
import type { HandlerContext } from '../types.js';

// ─── Mock DaemonLifecycle ─────────────────────────────────────────────────────

const mockStop = vi.fn();
const mockStart = vi.fn();
const mockGetStatus = vi.fn();

vi.mock('../../../../transport/daemon-lifecycle.js', () => {
  const DaemonLifecycle = vi.fn(function (this: unknown) {
    (this as Record<string, unknown>)['stop'] = mockStop;
    (this as Record<string, unknown>)['start'] = mockStart;
    (this as Record<string, unknown>)['getStatus'] = mockGetStatus;
  });
  return { DaemonLifecycle };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    getUptime: vi.fn().mockReturnValue(500),
    getConfig: vi.fn().mockReturnValue({}),
    getHealth: vi.fn(),
    updateConfig: vi.fn(),
    projectRoot: '/project',
    version: '1.0.0',
    getEventBus: vi.fn().mockReturnValue(null),
    getEventLog: vi.fn().mockReturnValue(null),
    getEventQueue: vi.fn().mockReturnValue(null),
    getWorkflowEngine: vi.fn().mockReturnValue(null),
    getTriggerRegistry: vi.fn().mockReturnValue(null),
    getAgentCoordinator: vi.fn().mockReturnValue(null),
    getDirectiveQueue: vi.fn().mockReturnValue(null),
    transport: undefined,
    ...overrides,
  } as HandlerContext;
}

function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function parseData(result: unknown): Record<string, unknown> {
  const envelope = parseResult(result);
  return (envelope['data'] ?? {}) as Record<string, unknown>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleDaemon', () => {
  let ctx: HandlerContext;

  beforeEach(() => {
    ctx = makeContext();
    vi.clearAllMocks();
    // Fake a short delay to avoid actually waiting 500ms in tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── restart: success ─────────────────────────────────────────────────────────

  describe('restart action', () => {
    it('calls stop, start, getStatus in order and returns success', async () => {
      const callOrder: string[] = [];
      mockStop.mockImplementation(() => { callOrder.push('stop'); return Promise.resolve(); });
      mockStart.mockImplementation(() => { callOrder.push('start'); return Promise.resolve(); });
      mockGetStatus.mockResolvedValue({ running: true, pid: 1234 });

      const promise = handleDaemon({ action: 'restart' }, ctx);
      // Advance the 500ms cleanup timer
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.isError).toBeFalsy();
      expect(callOrder).toEqual(['stop', 'start']);

      const data = parseData(result);
      expect(data['message']).toBe('Daemon restarted');
      expect(data['running']).toBe(true);
      expect(data['pid']).toBe(1234);
    });

    it('returns error when start fails after stop succeeds', async () => {
      mockStop.mockResolvedValue(undefined);
      mockStart.mockRejectedValue(new Error('spawn failed'));

      const promise = handleDaemon({ action: 'restart' }, ctx);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Failed to restart daemon');
      expect(parsed['error']).toContain('spawn failed');
    });
  });
});
