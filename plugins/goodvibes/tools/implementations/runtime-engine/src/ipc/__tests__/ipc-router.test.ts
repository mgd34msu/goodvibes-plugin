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
