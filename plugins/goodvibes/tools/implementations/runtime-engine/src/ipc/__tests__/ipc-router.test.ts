/**
 * Unit tests for IPCRouter WRFC config validation.
 *
 * Focuses on the config:loaded hook_event path that validates and stores
 * WRFC configuration fields. Verifies that valid fields pass through,
 * invalid fields are rejected with warnings, unknown fields are stripped,
 * and edge cases (non-object wrfc, missing wrfc key) are handled gracefully.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPCRouter } from '../ipc-router.js';
import type { IPCRouterDeps } from '../ipc-router.js';
import type { HookEventMessage } from '../protocol.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfigLoadedEvent(hookInput: Record<string, unknown>): HookEventMessage {
  return {
    type: 'hook_event',
    id: 'msg-config-001',
    hook_name: 'config:loaded',
    hook_input: hookInput,
    timestamp: new Date().toISOString(),
  };
}

function makeQueryMsg(kind: string) {
  return {
    type: 'query' as const,
    id: 'msg-query-001',
    query: { kind },
    timestamp: new Date().toISOString(),
  };
}

function makeDeps(overrides: Partial<IPCRouterDeps> = {}): IPCRouterDeps {
  const setWRFCConfig = vi.fn();
  const drain = vi.fn().mockReturnValue([]);

  return {
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as IPCRouterDeps['eventBus'],
    triggerRegistry: null,
    workflowEngine: null,
    agentCoordinator: null,
    directiveQueue: {
      setWRFCConfig,
      drain,
      enqueue: vi.fn(),
    } as unknown as IPCRouterDeps['directiveQueue'],
    ...overrides,
  };
}

// ─── Valid config ─────────────────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — valid config', () => {
  it('stores all valid WRFC fields via setWRFCConfig', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const msg = makeConfigLoadedEvent({
      wrfc: { min_review_score: 8, max_fix_attempts: 3, auto_commit: true },
    });

    const response = await router.route(msg);

    expect(response.status).toBe('ok');
    expect(deps.directiveQueue!.setWRFCConfig).toHaveBeenCalledOnce();
    expect(deps.directiveQueue!.setWRFCConfig).toHaveBeenCalledWith({
      min_review_score: 8,
      max_fix_attempts: 3,
      auto_commit: true,
    });
  });

  it('stores a single valid field when only one is present', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const msg = makeConfigLoadedEvent({ wrfc: { min_review_score: 5 } });
    await router.route(msg);

    expect(deps.directiveQueue!.setWRFCConfig).toHaveBeenCalledWith({ min_review_score: 5 });
  });

  it('accepts min_review_score boundary value 0', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { min_review_score: 0 } }));
    expect(deps.directiveQueue!.setWRFCConfig).toHaveBeenCalledWith({ min_review_score: 0 });
  });

  it('accepts min_review_score boundary value 10', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { min_review_score: 10 } }));
    expect(deps.directiveQueue!.setWRFCConfig).toHaveBeenCalledWith({ min_review_score: 10 });
  });
});

// ─── Invalid min_review_score ─────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — invalid min_review_score', () => {
  it('rejects min_review_score above 10', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { min_review_score: 15 } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('rejects min_review_score below 0', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { min_review_score: -1 } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('rejects non-numeric min_review_score', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { min_review_score: '8' } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });
});

// ─── Invalid max_fix_attempts ─────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — invalid max_fix_attempts', () => {
  it('rejects max_fix_attempts of 0 (not positive)', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { max_fix_attempts: 0 } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('rejects negative max_fix_attempts', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { max_fix_attempts: -2 } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('rejects non-integer max_fix_attempts (float)', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { max_fix_attempts: 2.5 } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('rejects string max_fix_attempts', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { max_fix_attempts: '3' } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });
});

// ─── Invalid auto_commit ──────────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — invalid auto_commit', () => {
  it('rejects string auto_commit', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { auto_commit: 'true' } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('rejects numeric auto_commit', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: { auto_commit: 1 } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });
});

// ─── Unknown fields stripped ──────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — unknown fields stripped', () => {
  it('strips unknown fields and only stores known valid fields', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const msg = makeConfigLoadedEvent({
      wrfc: { min_review_score: 7, unknown_field: 'ignored', another: 42 },
    });
    await router.route(msg);

    expect(deps.directiveQueue!.setWRFCConfig).toHaveBeenCalledWith({ min_review_score: 7 });
    const call = (deps.directiveQueue!.setWRFCConfig as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).not.toHaveProperty('unknown_field');
    expect(call).not.toHaveProperty('another');
  });
});

// ─── Empty validated object ───────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — empty validated object', () => {
  it('does not call setWRFCConfig when all fields are invalid', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const msg = makeConfigLoadedEvent({
      wrfc: { min_review_score: 99, max_fix_attempts: -1, auto_commit: 'yes' },
    });
    await router.route(msg);

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('does not call setWRFCConfig for an empty wrfc object', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: {} }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });
});

// ─── Non-object wrfc value ────────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — non-object wrfc', () => {
  it('ignores wrfc when it is a string', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: 'invalid' }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('ignores wrfc when it is a number', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: 42 }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('ignores wrfc when it is null', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: null }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('ignores wrfc when it is an array', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ wrfc: [1, 2, 3] }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });
});

// ─── Missing wrfc key ─────────────────────────────────────────────────────────

describe('IPCRouter — WRFC config:loaded — missing wrfc key', () => {
  it('does not call setWRFCConfig when wrfc key is absent', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    await router.route(makeConfigLoadedEvent({ other_config: { foo: 'bar' } }));

    expect(deps.directiveQueue!.setWRFCConfig).not.toHaveBeenCalled();
  });

  it('still returns ok status when wrfc key is absent', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const response = await router.route(makeConfigLoadedEvent({}));

    expect(response.status).toBe('ok');
    expect(response.data.kind).toBe('ack');
  });
});

// ─── get_executor_mode ────────────────────────────────────────────────────────

describe('IPCRouter — query get_executor_mode', () => {
  it('returns executor_mode kind with mode from executorMode dep', async () => {
    const deps = makeDeps({
      executorMode: { getMode: vi.fn().mockReturnValue('paused') } as unknown as IPCRouterDeps['executorMode'],
    });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_mode'));

    expect(response.status).toBe('ok');
    expect(response.data.kind).toBe('executor_mode');
    expect((response.data as { mode: string }).mode).toBe('paused');
  });

  it('defaults mode to engaged when executorMode dep is absent', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_mode'));

    expect(response.status).toBe('ok');
    expect(response.data.kind).toBe('executor_mode');
    expect((response.data as { mode: string }).mode).toBe('engaged');
  });

  it('defaults mode to engaged when executorMode dep is null', async () => {
    const deps = makeDeps({ executorMode: null });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_mode'));

    expect(response.status).toBe('ok');
    expect((response.data as { mode: string }).mode).toBe('engaged');
  });
});

// ─── get_executor_budget ──────────────────────────────────────────────────────

describe('IPCRouter — query get_executor_budget', () => {
  it('returns spending and can_process from executorBudget dep', async () => {
    const mockSpending = { total_usd: 1.5, daily_usd: 0.5, daily_reset_at: 0, last_updated: 0 };
    const deps = makeDeps({
      executorBudget: {
        getSpending: vi.fn().mockReturnValue(mockSpending),
        canProcess: vi.fn().mockReturnValue(true),
      } as unknown as IPCRouterDeps['executorBudget'],
    });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_budget'));

    expect(response.status).toBe('ok');
    expect(response.data.kind).toBe('executor_budget');
    const data = response.data as { spending: unknown; can_process: boolean };
    expect(data.spending).toEqual(mockSpending);
    expect(data.can_process).toBe(true);
  });

  it('returns spending: null and can_process: true when executorBudget dep is absent', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_budget'));

    expect(response.status).toBe('ok');
    const data = response.data as { spending: unknown; can_process: boolean };
    expect(data.spending).toBeNull();
    expect(data.can_process).toBe(true);
  });

  it('returns can_process: false when budget dep reports exhausted', async () => {
    const deps = makeDeps({
      executorBudget: {
        getSpending: vi.fn().mockReturnValue({ total_usd: 100, daily_usd: 10, daily_reset_at: 0, last_updated: 0 }),
        canProcess: vi.fn().mockReturnValue(false),
      } as unknown as IPCRouterDeps['executorBudget'],
    });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_budget'));

    expect((response.data as { can_process: boolean }).can_process).toBe(false);
  });

  it('returns spending: null and can_process: true when executorBudget dep is null', async () => {
    const deps = makeDeps({ executorBudget: null });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('get_executor_budget'));

    const data = response.data as { spending: unknown; can_process: boolean };
    expect(data.spending).toBeNull();
    expect(data.can_process).toBe(true);
  });
});

// ─── process_tick ─────────────────────────────────────────────────────────────

describe('IPCRouter — query process_tick', () => {
  it('returns tick_result kind with result from daemonTickHandler.handleTick()', async () => {
    const tickResult = { tick_number: 1, events_processed: 2, duration_ms: 5, context_cleared: false, budget_status: 'ok' };
    const deps = makeDeps({
      daemonTickHandler: {
        handleTick: vi.fn().mockResolvedValue(tickResult),
      } as unknown as IPCRouterDeps['daemonTickHandler'],
    });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('process_tick'));

    expect(response.status).toBe('ok');
    expect(response.data.kind).toBe('tick_result');
    expect((response.data as { result: unknown }).result).toEqual(tickResult);
  });

  it('awaits handleTick() asynchronously and returns result', async () => {
    const handleTick = vi.fn().mockResolvedValue({ tick_number: 5, events_processed: 0, duration_ms: 1, context_cleared: false, budget_status: 'ok' });
    const deps = makeDeps({
      daemonTickHandler: { handleTick } as unknown as IPCRouterDeps['daemonTickHandler'],
    });
    const router = new IPCRouter(deps);

    await router.route(makeQueryMsg('process_tick'));

    expect(handleTick).toHaveBeenCalledOnce();
  });

  it('returns result: undefined when daemonTickHandler dep is absent', async () => {
    const deps = makeDeps();
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('process_tick'));

    expect(response.status).toBe('ok');
    expect(response.data.kind).toBe('tick_result');
    expect((response.data as { result: unknown }).result).toBeUndefined();
  });

  it('returns result: undefined when daemonTickHandler dep is null', async () => {
    const deps = makeDeps({ daemonTickHandler: null });
    const router = new IPCRouter(deps);

    const response = await router.route(makeQueryMsg('process_tick'));

    expect((response.data as { result: unknown }).result).toBeUndefined();
  });
});
