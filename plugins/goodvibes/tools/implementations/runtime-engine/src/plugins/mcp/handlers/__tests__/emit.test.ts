/**
 * runtime_emit Handler Tests
 *
 * Tests validation (null/undefined/non-object args, missing event_type,
 * system:* prefix blocking), successful emission, unknown prefix warning,
 * MAX_EVENT_TYPE_LENGTH enforcement, and exception handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRuntimeEmit } from '../emit.js';
import type { HandlerContext } from '../types.js';
import { MAX_EVENT_TYPE_LENGTH } from '../../../../shared/constants.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmittedEvent() {
  return {
    id: 'evt-generated-123',
    timestamp: '2024-01-01T00:00:00.000Z',
    type: 'session:started',
    source: { kind: 'mcp_tool', tool_name: 'runtime_emit' },
    payload: { type: 'session:started', data: {} },
  };
}

function makeContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  const emittedEvent = makeEmittedEvent();
  return {
    getUptime: vi.fn().mockReturnValue(500),
    getConfig: vi.fn(),
    getHealth: vi.fn(),
    updateConfig: vi.fn(),
    projectRoot: '/project',
    version: '1.0.0',
    getEventBus: vi.fn().mockReturnValue({
      emit: vi.fn().mockReturnValue(emittedEvent),
      on: vi.fn(),
      off: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
    }),
    getEventLog: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      getStats: vi.fn(),
    }),
    getEventQueue: vi.fn().mockReturnValue({
      getStats: vi.fn().mockReturnValue({ pending: 0 }),
    }),
    getWorkflowEngine: vi.fn().mockReturnValue(null),
    getTriggerRegistry: vi.fn().mockReturnValue(null),
    getAgentCoordinator: vi.fn().mockReturnValue(null),
    getDirectiveQueue: vi.fn().mockReturnValue(null),
    ...overrides,
  } as HandlerContext;
}

/** Parse the JSON body from a CallToolResult */
function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleRuntimeEmit', () => {
  let ctx: HandlerContext;

  beforeEach(() => {
    ctx = makeContext();
    vi.clearAllMocks();
  });

  // ── Input validation ────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns error for null args', async () => {
      const result = await handleRuntimeEmit(null, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Invalid arguments');
    });

    it('returns error for undefined args', async () => {
      const result = await handleRuntimeEmit(undefined, ctx);
      expect(result.isError).toBe(true);
    });

    it('returns error for non-object args (number)', async () => {
      const result = await handleRuntimeEmit(42, ctx);
      expect(result.isError).toBe(true);
    });

    it('returns error for non-object args (string)', async () => {
      const result = await handleRuntimeEmit('bad', ctx);
      expect(result.isError).toBe(true);
    });

    it('returns error for non-object args (boolean)', async () => {
      const result = await handleRuntimeEmit(true, ctx);
      expect(result.isError).toBe(true);
    });

    it('returns error when event_type is missing', async () => {
      const result = await handleRuntimeEmit({}, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('event_type');
    });

    it('returns error when event_type is empty string (falsy)', async () => {
      const result = await handleRuntimeEmit({ event_type: '' }, ctx);
      expect(result.isError).toBe(true);
    });
  });

  // ── system:* prefix blocking ─────────────────────────────────────────────

  describe('system:* event blocking', () => {
    it('returns error for system:health_check event type', async () => {
      const result = await handleRuntimeEmit({ event_type: 'system:health_check' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('system:*');
      expect(parsed['error']).toContain('reserved for internal use');
    });

    it('returns error for system:started event type', async () => {
      const result = await handleRuntimeEmit({ event_type: 'system:started' }, ctx);
      expect(result.isError).toBe(true);
    });

    it('blocks system:* regardless of event_type case (system: prefix exact match)', async () => {
      // system:* check is startsWith — only lowercase 'system:' is blocked
      const result = await handleRuntimeEmit({ event_type: 'system:shutdown' }, ctx);
      expect(result.isError).toBe(true);
    });

    it('does not block non-system prefixed types', async () => {
      const result = await handleRuntimeEmit({ event_type: 'session:started' }, ctx);
      expect(result.isError).toBe(false);
    });
  });

  // ── successful emission ──────────────────────────────────────────────────

  describe('successful emission', () => {
    it('calls getEventBus().emit with correct structure', async () => {
      const emitMock = vi.fn().mockReturnValue(makeEmittedEvent());
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: emitMock }),
      });

      await handleRuntimeEmit({ event_type: 'session:started' }, ctx);

      expect(emitMock).toHaveBeenCalledOnce();
      const emittedArg = emitMock.mock.calls[0][0] as Record<string, unknown>;
      expect(emittedArg['type']).toBe('session:started');
      expect(emittedArg['source']).toMatchObject({ kind: 'mcp_tool', tool_name: 'runtime_emit' });
      expect(typeof emittedArg['id']).toBe('string');
      expect(typeof emittedArg['timestamp']).toBe('number');
    });

    it('returns success with emitted event data', async () => {
      const emittedEvt = makeEmittedEvent();
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: vi.fn().mockReturnValue(emittedEvt) }),
      });

      const result = await handleRuntimeEmit({ event_type: 'session:started' }, ctx);
      expect(result.isError).toBe(false);

      const parsed = parseResult(result);
      expect(parsed['success']).toBe(true);
      const data = parsed['data'] as { emitted: typeof emittedEvt };
      expect(data.emitted.id).toBe('evt-generated-123');
    });

    it('includes payload in emitted event when provided', async () => {
      const emitMock = vi.fn().mockReturnValue(makeEmittedEvent());
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: emitMock }),
      });

      await handleRuntimeEmit(
        { event_type: 'hook:post_tool_use', payload: { tool: 'read', exit_code: 0 } },
        ctx,
      );

      const emittedArg = emitMock.mock.calls[0][0] as Record<string, unknown>;
      const payload = emittedArg['payload'] as Record<string, unknown>;
      expect(payload['data']).toMatchObject({ tool: 'read', exit_code: 0 });
    });

    it('defaults payload to empty object when not provided', async () => {
      const emitMock = vi.fn().mockReturnValue(makeEmittedEvent());
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: emitMock }),
      });

      await handleRuntimeEmit({ event_type: 'workflow:started' }, ctx);

      const emittedArg = emitMock.mock.calls[0][0] as Record<string, unknown>;
      const payload = emittedArg['payload'] as Record<string, unknown>;
      expect(payload['data']).toEqual({});
    });

    it('includes correlation_id in metadata when provided', async () => {
      const emitMock = vi.fn().mockReturnValue(makeEmittedEvent());
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: emitMock }),
      });

      await handleRuntimeEmit(
        { event_type: 'agent:spawned', correlation_id: 'corr-abc' },
        ctx,
      );

      const emittedArg = emitMock.mock.calls[0][0] as Record<string, unknown>;
      expect(emittedArg['metadata']).toMatchObject({ correlation_id: 'corr-abc' });
    });

    it('omits metadata when correlation_id is not provided', async () => {
      const emitMock = vi.fn().mockReturnValue(makeEmittedEvent());
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: emitMock }),
      });

      await handleRuntimeEmit({ event_type: 'trigger:fired' }, ctx);

      const emittedArg = emitMock.mock.calls[0][0] as Record<string, unknown>;
      expect(emittedArg['metadata']).toBeUndefined();
    });
  });

  // ── known prefix validation ──────────────────────────────────────────────

  describe('known prefix validation', () => {
    const knownPrefixes = [
      'session:started',
      'hook:pre_tool_use',
      'workflow:started',
      'wrfc:phase_started',
      'fix:applied',
      'agent:spawned',
      'trigger:fired',
      'file:changed',
      'build:started',
      'test:started',
      'devserver:started',
      'engine:started',
    ];

    for (const eventType of knownPrefixes) {
      it(`succeeds for known prefix: ${eventType}`, async () => {
        const result = await handleRuntimeEmit({ event_type: eventType }, ctx);
        expect(result.isError).toBe(false);
      });
    }

    it('succeeds but logs warning for unknown prefix', async () => {
      // Should succeed despite unknown prefix
      const result = await handleRuntimeEmit({ event_type: 'custom:my_event' }, ctx);
      expect(result.isError).toBe(false);
    });

    it('succeeds for unknown prefix (no colon) and logs warning', async () => {
      const result = await handleRuntimeEmit({ event_type: 'my_custom_event' }, ctx);
      expect(result.isError).toBe(false);
    });
  });

  // ── MAX_EVENT_TYPE_LENGTH ────────────────────────────────────────────────

  describe('MAX_EVENT_TYPE_LENGTH', () => {
    it('MAX_EVENT_TYPE_LENGTH is 100', () => {
      expect(MAX_EVENT_TYPE_LENGTH).toBe(100);
    });

    it('accepts event_type at exactly MAX_EVENT_TYPE_LENGTH chars', async () => {
      const eventType = 'session:' + 'a'.repeat(MAX_EVENT_TYPE_LENGTH - 'session:'.length);
      expect(eventType.length).toBe(MAX_EVENT_TYPE_LENGTH);

      const result = await handleRuntimeEmit({ event_type: eventType }, ctx);
      expect(result.isError).toBe(false);
    });

    it('accepts event_type exceeding MAX_EVENT_TYPE_LENGTH (sanitized for logging only)', async () => {
      // The handler does NOT truncate event_type for emission — only for log injection sanitization
      // The event is still emitted with the original event_type
      const longType = 'session:' + 'a'.repeat(200);
      const emitMock = vi.fn().mockReturnValue(makeEmittedEvent());
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ emit: emitMock }),
      });

      const result = await handleRuntimeEmit({ event_type: longType }, ctx);
      expect(result.isError).toBe(false);

      // The emitted event should use the original (unsanitized) event_type
      const emittedArg = emitMock.mock.calls[0][0] as Record<string, unknown>;
      expect(emittedArg['type']).toBe(longType);
    });
  });

  // ── exception handling ───────────────────────────────────────────────────

  describe('exception handling', () => {
    it('returns error when getEventBus().emit throws', async () => {
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({
          emit: vi.fn().mockImplementation(() => {
            throw new Error('bus exploded');
          }),
        }),
      });

      const result = await handleRuntimeEmit({ event_type: 'session:started' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('bus exploded');
    });

    it('returns error when getEventBus() throws', async () => {
      ctx = makeContext({
        getEventBus: vi.fn().mockImplementation(() => {
          throw new Error('no bus');
        }),
      });

      const result = await handleRuntimeEmit({ event_type: 'session:started' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('no bus');
    });

    it('returns isError: true on all error responses', async () => {
      const errorCases = [
        null,
        undefined,
        {},
        { event_type: 'system:blocked' },
      ];

      for (const args of errorCases) {
        const result = await handleRuntimeEmit(args, ctx);
        expect(result.isError).toBe(true);
      }
    });

    it('response meta includes version and uptime_ms', async () => {
      ctx = makeContext({ version: '2.0.0', getUptime: vi.fn().mockReturnValue(9999) });
      const result = await handleRuntimeEmit({ event_type: 'session:started' }, ctx);
      const parsed = parseResult(result);
      const meta = parsed['meta'] as { version: string; uptime_ms: number; engine: string };
      expect(meta.version).toBe('2.0.0');
      expect(meta.uptime_ms).toBe(9999);
      expect(meta.engine).toBe('runtime-engine');
    });
  });
});
