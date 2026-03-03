/**
 * SessionStart Handler Tests
 *
 * Tests for session:started event emission, cwd fallback, and mode handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSessionStartHandler } from '../../handlers/session-start.js';
import type { HookEvent } from '../../../../extensions/events/factories.js';
import type { EventBus } from '../../../../extensions/events/event-bus.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockEvent(session_id = 'session-abc'): HookEvent {
  return {
    id: 'evt-1',
    timestamp: Date.now(),
    type: 'hook',
    source: { kind: 'internal', hook_name: 'session_start' },
    hook_type: 'SessionStart',
    hook_input: {},
    session_id,
    payload: { type: 'hook', data: {} },
    priority: 0,
    context: {},
  } as unknown as HookEvent;
}

function makeMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as EventBus;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createSessionStartHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── No eventBus ───────────────────────────────────────────────────────────

  it('returns null when eventBus is null', async () => {
    const handler = createSessionStartHandler({ eventBus: null });
    const result = await handler(makeMockEvent(), { cwd: '/tmp' });
    expect(result).toBeNull();
  });

  // ── Event emission ────────────────────────────────────────────────────────

  it('emits session:started event when eventBus is provided', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    const result = await handler(makeMockEvent(), { cwd: '/home/user/project' });

    expect(eventBus.emit).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('emits event with type session:started', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent('session-xyz'), { cwd: '/work' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(emittedEvent.type).toBe('session:started');
  });

  it('includes session_id from the hook event in the emitted payload', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent('session-xyz'), { cwd: '/work' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.session_id).toBe('session-xyz');
  });

  it('uses cwd from input when provided', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), { cwd: '/custom/path' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.cwd).toBe('/custom/path');
    expect(data.project_root).toBe('/custom/path');
  });

  it('falls back to process.cwd() when cwd is not in input', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), {});

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.cwd).toBe(process.cwd());
  });

  it('falls back to process.cwd() when cwd is a non-string', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), { cwd: 42 });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.cwd).toBe(process.cwd());
  });

  // ── Mode handling ──────────────────────────────────────────────────────────

  it('sets mode to "justvibes" when input mode is "justvibes"', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), { cwd: '/work', mode: 'justvibes' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.mode).toBe('justvibes');
  });

  it('defaults mode to "vibecoding" when input mode is omitted', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), { cwd: '/work' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.mode).toBe('vibecoding');
  });

  it('defaults mode to "vibecoding" for any unrecognised mode value', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), { cwd: '/work', mode: 'unknown-mode' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const payload = emittedEvent.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.mode).toBe('vibecoding');
  });

  // ── Error resilience ──────────────────────────────────────────────────────

  it('propagates errors thrown by eventBus.emit', async () => {
    const eventBus = makeMockEventBus();
    (eventBus.emit as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('bus exploded');
    });
    const handler = createSessionStartHandler({ eventBus });

    // session-start catches the error internally and returns null
    const result = await handler(makeMockEvent(), { cwd: '/work' });
    expect(result).toBeNull();
  });

  it('includes source with hook_name in emitted event', async () => {
    const eventBus = makeMockEventBus();
    const handler = createSessionStartHandler({ eventBus });

    await handler(makeMockEvent(), { cwd: '/work' });

    const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const source = emittedEvent.source as Record<string, unknown>;
    expect(source.kind).toBe('internal');
    expect(source.hook_name).toBe('session_start');
  });
});
