import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bridgeCIFailure } from '../ci-handler.js';
import { createEvent } from '../../../../shared/events.js';
import type { RuntimeEvent } from '../../../../shared/events.js';
import type { EventEmitter } from '../../../../core/types.js';

// Mock logger — no real I/O in tests
vi.mock('../../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmitter(): EventEmitter & { emit: ReturnType<typeof vi.fn> } {
  return { emit: vi.fn() } as EventEmitter & { emit: ReturnType<typeof vi.fn> };
}

/**
 * Minimal RuntimeEvent for the _event parameter.
 * bridgeCIFailure ignores _event entirely; we just need a type-safe value.
 */
function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return createEvent({
    type: 'system:startup',
    source: { kind: 'system' },
    payload: { type: 'system:startup', data: {} },
    ...overrides,
  });
}

function makeArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'failure',
    provider: 'github-actions',
    branch: 'main',
    commit: 'abc1234',
    source_event_id: 'evt-001',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bridgeCIFailure', () => {
  let emitter: EventEmitter & { emit: ReturnType<typeof vi.fn> };
  let event: RuntimeEvent;

  beforeEach(() => {
    emitter = makeEmitter();
    event = makeRuntimeEvent();
  });

  // ─── Failure statuses — emit build:failed ──────────────────────────────────

  describe('failure statuses', () => {
    it.each(['failure', 'failed', 'error'])(
      'emits build:failed for status=%s',
      async (status) => {
        const handler = bridgeCIFailure('/project', emitter);
        await handler(makeArgs({ status }), event);
        expect(emitter.emit).toHaveBeenCalledOnce();
        const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
        expect(emittedEvent.type).toBe('build:failed');
      },
    );
  });

  // ─── Non-failure statuses — silently ignored ───────────────────────────────

  describe('non-failure statuses', () => {
    it.each(['success', 'pending', 'queued', 'in_progress', 'cancelled', ''])(
      'does not emit for status=%s',
      async (status) => {
        const handler = bridgeCIFailure('/project', emitter);
        await handler(makeArgs({ status }), event);
        expect(emitter.emit).not.toHaveBeenCalled();
      },
    );

    it('does not emit when status is missing entirely', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler({ provider: 'github-actions' }, event);
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('does not emit when status is a non-string type', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler({ status: 42 }, event);
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  // ─── Case insensitivity ────────────────────────────────────────────────────

  describe('case insensitivity', () => {
    it.each(['FAILURE', 'FAILED', 'ERROR', 'Failure', 'Failed', 'Error'])(
      'emits build:failed for uppercase/mixed status=%s',
      async (status) => {
        const handler = bridgeCIFailure('/project', emitter);
        await handler(makeArgs({ status }), event);
        expect(emitter.emit).toHaveBeenCalledOnce();
      },
    );
  });

  // ─── Default arg values ────────────────────────────────────────────────────

  describe('default args', () => {
    it('defaults provider to "ci" when not provided', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler({ status: 'failure' }, event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      expect(data['command']).toBe('ci:ci');
    });

    it('defaults provider to "ci" when provider is not a string', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler({ status: 'failure', provider: 123 }, event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      expect(data['command']).toBe('ci:ci');
    });

    it('defaults branch to "unknown" when not provided', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler({ status: 'failure' }, event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      const errors = data['errors'] as string[];
      expect(errors[0]).toContain('"unknown"');
    });

    it('defaults commit to "unknown" when not provided', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler({ status: 'failure' }, event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      const errors = data['errors'] as string[];
      expect(errors[0]).toContain('"unknown"');
    });
  });

  // ─── Emitted event structure ───────────────────────────────────────────────

  describe('emitted event structure', () => {
    it('emitted event has type=build:failed', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs(), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      expect(emittedEvent.type).toBe('build:failed');
    });

    it('emitted event payload.type is build:failed', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs(), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      expect(payload['type']).toBe('build:failed');
    });

    it('emitted event payload.data.command is ci:<provider>', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs({ provider: 'github-actions' }), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      expect(data['command']).toBe('ci:github-actions');
    });

    it('emitted event payload.data.exit_code is 1', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs(), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      expect(data['exit_code']).toBe(1);
    });

    it('emitted event payload.data.errors contains branch, commit, and status', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs({ branch: 'feature/test', commit: 'deadbeef', status: 'failure' }), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      const errors = data['errors'] as string[];
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('feature/test');
      expect(errors[0]).toContain('deadbeef');
      expect(errors[0]).toContain('failure');
    });

    it('emitted event payload.data.warnings is an empty array', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs(), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload['data'] as Record<string, unknown>;
      expect(data['warnings']).toEqual([]);
    });

    it('emitted event source.kind is a string (system subsystem)', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs(), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      // The ci-handler specifies source: { kind: 'system' }.
      // createEvent spreads overrides, so source.kind should be present.
      expect(typeof emittedEvent.source.kind).toBe('string');
      expect(emittedEvent.source.kind).toBeTruthy();
    });

    it('emitted event has a string id', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs(), event);
      const emittedEvent = emitter.emit.mock.calls[0][0] as RuntimeEvent;
      expect(typeof emittedEvent.id).toBe('string');
      expect(emittedEvent.id.length).toBeGreaterThan(0);
    });
  });

  // ─── Multiple invocations ──────────────────────────────────────────────────

  describe('multiple invocations', () => {
    it('emits once per failure call, not once per handler creation', async () => {
      const handler = bridgeCIFailure('/project', emitter);
      await handler(makeArgs({ status: 'failure' }), event);
      await handler(makeArgs({ status: 'failed' }), event);
      await handler(makeArgs({ status: 'success' }), event);
      expect(emitter.emit).toHaveBeenCalledTimes(2);
    });
  });
});
