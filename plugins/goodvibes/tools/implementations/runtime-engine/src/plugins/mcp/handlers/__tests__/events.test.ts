/**
 * runtime_events Handler Tests
 *
 * Tests exported helpers (matchesTypePattern, resolveTimestamp, applyVerbosity)
 * and the full handleRuntimeEvents function with all actions:
 * tail, query, stats, directives, and error cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  matchesTypePattern,
  resolveTimestamp,
  applyVerbosity,
  handleRuntimeEvents,
} from '../events.js';
import type { HandlerContext } from '../types.js';
import type { RuntimeEvent } from '../../../../extensions/events/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: 'evt-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    type: 'hook:pre_tool_use',
    source: { kind: 'hook' },
    payload: { type: 'hook:pre_tool_use', data: {} },
    ...overrides,
  } as RuntimeEvent;
}

function makeContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    getUptime: vi.fn().mockReturnValue(1000),
    getConfig: vi.fn(),
    getHealth: vi.fn(),
    updateConfig: vi.fn(),
    projectRoot: '/project',
    version: '1.0.0',
    getEventBus: vi.fn().mockReturnValue({
      getHistory: vi.fn().mockReturnValue([]),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }),
    getEventLog: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockReturnValue({ total_events: 0 }),
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

// ─── matchesTypePattern ───────────────────────────────────────────────────────

describe('matchesTypePattern', () => {
  it('returns true for global wildcard *', () => {
    expect(matchesTypePattern('hook:pre_tool_use', '*')).toBe(true);
    expect(matchesTypePattern('anything:here', '*')).toBe(true);
  });

  it('returns true for namespace wildcard ns:*', () => {
    expect(matchesTypePattern('hook:pre_tool_use', 'hook:*')).toBe(true);
    expect(matchesTypePattern('hook:post_tool_use', 'hook:*')).toBe(true);
  });

  it('returns false for namespace wildcard when namespace does not match', () => {
    expect(matchesTypePattern('agent:spawned', 'hook:*')).toBe(false);
    expect(matchesTypePattern('session:started', 'workflow:*')).toBe(false);
  });

  it('returns true for exact match', () => {
    expect(matchesTypePattern('agent:spawned', 'agent:spawned')).toBe(true);
  });

  it('returns false for non-matching exact pattern', () => {
    expect(matchesTypePattern('agent:spawned', 'agent:completed')).toBe(false);
  });

  it('namespace wildcard does not match partial prefix without colon', () => {
    // 'hook:*' should not match 'hookextra:event'
    expect(matchesTypePattern('hookextra:event', 'hook:*')).toBe(false);
  });

  it('returns false when pattern is not * and does not end with :*', () => {
    expect(matchesTypePattern('hook:pre_tool_use', 'hook:pre_tool_us')).toBe(false);
  });
});

// ─── resolveTimestamp ────────────────────────────────────────────────────────

describe('resolveTimestamp', () => {
  it('passes through ISO timestamps unchanged', () => {
    const iso = '2024-01-01T00:00:00.000Z';
    expect(resolveTimestamp(iso)).toBe(iso);
  });

  it('passes through date strings containing a hyphen', () => {
    const dateStr = '2024-06-01';
    expect(resolveTimestamp(dateStr)).toBe(dateStr);
  });

  it('converts relative time string like 5m to an ISO timestamp in the past', () => {
    const before = Date.now();
    const result = resolveTimestamp('5m');
    const after = Date.now();

    const resultMs = new Date(result).getTime();
    // Should be approximately 5 minutes ago (4:30 to 5:30 minutes in ms)
    expect(resultMs).toBeLessThan(before - 4 * 60 * 1000);
    expect(resultMs).toBeGreaterThan(after - 6 * 60 * 1000);
  });

  it('converts relative time string like 1h to an ISO timestamp in the past', () => {
    const result = resolveTimestamp('1h');
    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeLessThan(Date.now() - 55 * 60 * 1000);
  });

  it('falls back to returning the original value for invalid relative strings', () => {
    // An invalid relative string should be returned as-is (the catch returns `value`)
    const result = resolveTimestamp('invalid-relative-time');
    // Either the original string is returned, or it contains 'invalid-relative-time'
    // The function passes through strings containing '-' unchanged
    expect(result).toBe('invalid-relative-time');
  });
});

// ─── applyVerbosity ──────────────────────────────────────────────────────────

describe('applyVerbosity', () => {
  const events = [
    makeEvent({ id: 'e1', type: 'hook:pre_tool_use', source: { kind: 'hook' } as unknown as RuntimeEvent['source'] }),
    makeEvent({ id: 'e2', type: 'agent:spawned', source: { kind: 'internal' } as unknown as RuntimeEvent['source'] }),
  ];

  it('count_only returns only count', () => {
    const result = applyVerbosity(events, 'count_only') as Record<string, unknown>;
    expect(result).toEqual({ count: 2 });
    expect('events' in result).toBe(false);
  });

  it('minimal returns count and stripped event objects', () => {
    const result = applyVerbosity(events, 'minimal') as {
      count: number;
      events: Array<{ id: string; type: string; timestamp: string; source_kind: string }>;
    };
    expect(result.count).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      id: 'e1',
      type: 'hook:pre_tool_use',
      timestamp: expect.any(String) as string,
      source_kind: 'hook',
    });
    // Should NOT include full payload
    expect('payload' in result.events[0]).toBe(false);
  });

  it('standard returns count and full event objects', () => {
    const result = applyVerbosity(events, 'standard') as { count: number; events: RuntimeEvent[] };
    expect(result.count).toBe(2);
    expect(result.events).toBe(events);
  });

  it('verbose returns count and full event objects', () => {
    const result = applyVerbosity(events, 'verbose') as { count: number; events: RuntimeEvent[] };
    expect(result.count).toBe(2);
    expect(result.events).toBe(events);
  });

  it('handles empty events array', () => {
    expect(applyVerbosity([], 'count_only')).toEqual({ count: 0 });
    const minimal = applyVerbosity([], 'minimal') as { count: number; events: unknown[] };
    expect(minimal.count).toBe(0);
    expect(minimal.events).toHaveLength(0);
  });
});

// ─── handleRuntimeEvents ─────────────────────────────────────────────────────

describe('handleRuntimeEvents', () => {
  let ctx: HandlerContext;

  beforeEach(() => {
    ctx = makeContext();
    vi.clearAllMocks();
  });

  // ── Input validation ────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns error for null args', async () => {
      const result = await handleRuntimeEvents(null, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Invalid arguments');
    });

    it('returns error for undefined args', async () => {
      const result = await handleRuntimeEvents(undefined, ctx);
      expect(result.isError).toBe(true);
    });

    it('returns error for non-object args (string)', async () => {
      const result = await handleRuntimeEvents('bad', ctx);
      expect(result.isError).toBe(true);
    });

    it('returns error when action is missing', async () => {
      const result = await handleRuntimeEvents({}, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('action');
    });

    it('returns error for unknown action', async () => {
      const result = await handleRuntimeEvents({ action: 'bogus' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('bogus');
    });
  });

  // ── tail action ─────────────────────────────────────────────────────────

  describe('tail action', () => {
    it('returns events from getHistory with default limit 50', async () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const getHistoryMock = vi.fn().mockReturnValue(events);
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ getHistory: getHistoryMock }),
      });

      const result = await handleRuntimeEvents({ action: 'tail' }, ctx);
      expect(result.isError).toBe(false);

      // Verify getHistory was called with a filter containing limit: 50
      expect(getHistoryMock).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('respects limit from filter', async () => {
      const getHistoryMock = vi.fn().mockReturnValue([]);
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ getHistory: getHistoryMock }),
      });

      await handleRuntimeEvents({ action: 'tail', filter: { limit: 10 } }, ctx);
      expect(getHistoryMock).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('applies type pattern filter post-history', async () => {
      const events = [
        makeEvent({ id: 'e1', type: 'hook:pre_tool_use' }),
        makeEvent({ id: 'e2', type: 'agent:spawned' }),
      ];
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ getHistory: vi.fn().mockReturnValue(events) }),
      });

      const result = await handleRuntimeEvents(
        { action: 'tail', filter: { types: ['hook:*'] } },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as { count: number; events: RuntimeEvent[] };
      expect(data.count).toBe(1);
      expect(data.events[0].id).toBe('e1');
    });

    it('applies source_kind filter post-history', async () => {
      const events = [
        makeEvent({ id: 'e1', source: { kind: 'hook' } as unknown as RuntimeEvent['source'] }),
        makeEvent({ id: 'e2', source: { kind: 'internal' } as unknown as RuntimeEvent['source'] }),
      ];
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ getHistory: vi.fn().mockReturnValue(events) }),
      });

      const result = await handleRuntimeEvents(
        { action: 'tail', filter: { source_kind: 'hook' } },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as { count: number; events: RuntimeEvent[] };
      expect(data.count).toBe(1);
      expect(data.events[0].id).toBe('e1');
    });

    it('applies verbosity shaping (count_only)', async () => {
      const events = [makeEvent(), makeEvent({ id: 'e2' })];
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ getHistory: vi.fn().mockReturnValue(events) }),
      });

      const result = await handleRuntimeEvents(
        { action: 'tail', verbosity: 'count_only' },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as { count: number };
      expect(data).toEqual({ count: 2 });
    });

    it('passes since filter (relative time) to getHistory', async () => {
      const getHistoryMock = vi.fn().mockReturnValue([]);
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({ getHistory: getHistoryMock }),
      });

      await handleRuntimeEvents(
        { action: 'tail', filter: { since: '5m' } },
        ctx,
      );

      const callFilter = getHistoryMock.mock.calls[0][0] as { since: string };
      // since should be resolved to an ISO timestamp
      expect(callFilter.since).toMatch(/\d{4}-\d{2}-\d{2}T/u);
    });
  });

  // ── query action ─────────────────────────────────────────────────────────

  describe('query action', () => {
    it('calls getEventLog().query with the filter', async () => {
      const queryMock = vi.fn().mockResolvedValue([]);
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({ query: queryMock, getStats: vi.fn() }),
      });

      await handleRuntimeEvents({ action: 'query' }, ctx);
      expect(queryMock).toHaveBeenCalledOnce();
    });

    it('passes exact types directly to log filter (no wildcards)', async () => {
      const queryMock = vi.fn().mockResolvedValue([]);
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({ query: queryMock, getStats: vi.fn() }),
      });

      await handleRuntimeEvents(
        { action: 'query', filter: { types: ['hook:pre_tool_use', 'agent:spawned'] } },
        ctx,
      );

      const callFilter = queryMock.mock.calls[0][0] as { types: string[] };
      expect(callFilter.types).toEqual(['hook:pre_tool_use', 'agent:spawned']);
    });

    it('does not pass types to log filter when wildcards present (post-query filter)', async () => {
      const queryMock = vi.fn().mockResolvedValue([]);
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({ query: queryMock, getStats: vi.fn() }),
      });

      await handleRuntimeEvents(
        { action: 'query', filter: { types: ['hook:*'] } },
        ctx,
      );

      const callFilter = queryMock.mock.calls[0][0] as { types: string[] | undefined };
      // Wildcards present — types should NOT be passed to log filter
      expect(callFilter.types).toBeUndefined();
    });

    it('applies wildcard type patterns post-query', async () => {
      const events = [
        makeEvent({ id: 'e1', type: 'hook:pre_tool_use' }),
        makeEvent({ id: 'e2', type: 'agent:spawned' }),
      ];
      const queryMock = vi.fn().mockResolvedValue(events);
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({ query: queryMock, getStats: vi.fn() }),
      });

      const result = await handleRuntimeEvents(
        { action: 'query', filter: { types: ['hook:*'] } },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as { count: number; events: RuntimeEvent[] };
      expect(data.count).toBe(1);
      expect(data.events[0].id).toBe('e1');
    });

    it('applies source_kind filter post-query', async () => {
      const events = [
        makeEvent({ id: 'e1', source: { kind: 'hook' } as unknown as RuntimeEvent['source'] }),
        makeEvent({ id: 'e2', source: { kind: 'mcp_tool' } as unknown as RuntimeEvent['source'] }),
      ];
      const queryMock = vi.fn().mockResolvedValue(events);
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({ query: queryMock, getStats: vi.fn() }),
      });

      const result = await handleRuntimeEvents(
        { action: 'query', filter: { source_kind: 'mcp_tool' } },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as { count: number; events: RuntimeEvent[] };
      expect(data.count).toBe(1);
      expect(data.events[0].id).toBe('e2');
    });

    it('respects limit from filter (defaults to 50)', async () => {
      const queryMock = vi.fn().mockResolvedValue([]);
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({ query: queryMock, getStats: vi.fn() }),
      });

      await handleRuntimeEvents({ action: 'query', filter: { limit: 5 } }, ctx);
      const callFilter = queryMock.mock.calls[0][0] as { limit: number };
      expect(callFilter.limit).toBe(5);
    });
  });

  // ── stats action ─────────────────────────────────────────────────────────

  describe('stats action', () => {
    it('returns log stats and queue stats (standard verbosity)', async () => {
      const logStats = { total_events: 42 };
      const queueStats = { pending: 3 };
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({
          getStats: vi.fn().mockReturnValue(logStats),
          query: vi.fn(),
        }),
        getEventQueue: vi.fn().mockReturnValue({
          getStats: vi.fn().mockReturnValue(queueStats),
        }),
      });

      const result = await handleRuntimeEvents({ action: 'stats' }, ctx);
      expect(result.isError).toBe(false);
      const parsed = parseResult(result);
      const data = parsed['data'] as { log: typeof logStats; queue: typeof queueStats };
      expect(data.log).toEqual(logStats);
      expect(data.queue).toEqual(queueStats);
    });

    it('returns abbreviated stats for count_only verbosity', async () => {
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({
          getStats: vi.fn().mockReturnValue({ total_events: 10 }),
          query: vi.fn(),
        }),
        getEventQueue: vi.fn().mockReturnValue({
          getStats: vi.fn().mockReturnValue({ pending: 2 }),
        }),
      });

      const result = await handleRuntimeEvents(
        { action: 'stats', verbosity: 'count_only' },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as { event_count: number; queue_pending: number };
      expect(data.event_count).toBe(10);
      expect(data.queue_pending).toBe(2);
    });
  });

  // ── directives action ────────────────────────────────────────────────────

  describe('directives action', () => {
    it('returns error when directive queue is not initialized', async () => {
      ctx = makeContext({
        getDirectiveQueue: vi.fn().mockReturnValue(null),
      });

      const result = await handleRuntimeEvents({ action: 'directives' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Directive queue not initialized');
    });

    it('peeks directives by default (mode=peek, target=subagent_stop)', async () => {
      const directives = [{ type: 'wrfc', priority: 1, source: 'test', content: {} }];
      const peekMock = vi.fn().mockReturnValue(directives);
      const drainMock = vi.fn().mockReturnValue([]);
      ctx = makeContext({
        getDirectiveQueue: vi.fn().mockReturnValue({ peek: peekMock, drain: drainMock }),
      });

      const result = await handleRuntimeEvents({ action: 'directives' }, ctx);
      expect(result.isError).toBe(false);
      expect(peekMock).toHaveBeenCalledWith('subagent_stop');
      expect(drainMock).not.toHaveBeenCalled();

      const parsed = parseResult(result);
      const data = parsed['data'] as { count: number; mode: string; target: string };
      expect(data.count).toBe(1);
      expect(data.mode).toBe('peek');
      expect(data.target).toBe('subagent_stop');
    });

    it('drains directives when mode=drain', async () => {
      const drainMock = vi.fn().mockReturnValue([{ type: 'test', priority: 1, source: 'src' }]);
      ctx = makeContext({
        getDirectiveQueue: vi.fn().mockReturnValue({
          peek: vi.fn().mockReturnValue([]),
          drain: drainMock,
        }),
      });

      await handleRuntimeEvents(
        { action: 'directives', mode: 'drain', target: 'my_target' },
        ctx,
      );
      expect(drainMock).toHaveBeenCalledWith('my_target');
    });

    it('count_only verbosity returns count, target, mode only', async () => {
      ctx = makeContext({
        getDirectiveQueue: vi.fn().mockReturnValue({
          peek: vi.fn().mockReturnValue([{ type: 'a' }, { type: 'b' }]),
          drain: vi.fn().mockReturnValue([]),
        }),
      });

      const result = await handleRuntimeEvents(
        { action: 'directives', verbosity: 'count_only' },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as Record<string, unknown>;
      expect(data['count']).toBe(2);
      expect('directives' in data).toBe(false);
    });

    it('minimal verbosity returns stripped directive fields', async () => {
      const directive = { type: 'wrfc', priority: 5, source: 'src', content: { secret: true } };
      ctx = makeContext({
        getDirectiveQueue: vi.fn().mockReturnValue({
          peek: vi.fn().mockReturnValue([directive]),
          drain: vi.fn().mockReturnValue([]),
        }),
      });

      const result = await handleRuntimeEvents(
        { action: 'directives', verbosity: 'minimal' },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as {
        directives: Array<{ type: string; priority: number; source: string }>;
      };
      expect(data.directives[0]).toMatchObject({
        type: 'wrfc',
        priority: 5,
        source: 'src',
      });
      // Should NOT include content
      expect('content' in data.directives[0]).toBe(false);
    });

    it('standard verbosity returns full directives', async () => {
      const directive = { type: 'wrfc', priority: 5, source: 'src', content: { detail: 'yes' } };
      ctx = makeContext({
        getDirectiveQueue: vi.fn().mockReturnValue({
          peek: vi.fn().mockReturnValue([directive]),
          drain: vi.fn().mockReturnValue([]),
        }),
      });

      const result = await handleRuntimeEvents(
        { action: 'directives', verbosity: 'standard' },
        ctx,
      );
      const parsed = parseResult(result);
      const data = parsed['data'] as {
        directives: Array<typeof directive>;
      };
      expect(data.directives[0].content).toEqual({ detail: 'yes' });
    });
  });

  // ── exception handling ───────────────────────────────────────────────────

  describe('exception handling', () => {
    it('returns error response when getEventBus().getHistory throws', async () => {
      ctx = makeContext({
        getEventBus: vi.fn().mockReturnValue({
          getHistory: vi.fn().mockImplementation(() => {
            throw new Error('bus failure');
          }),
        }),
      });

      const result = await handleRuntimeEvents({ action: 'tail' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('bus failure');
    });

    it('returns error response when getEventLog().query rejects', async () => {
      ctx = makeContext({
        getEventLog: vi.fn().mockReturnValue({
          query: vi.fn().mockRejectedValue(new Error('log failure')),
          getStats: vi.fn(),
        }),
      });

      const result = await handleRuntimeEvents({ action: 'query' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('log failure');
    });
  });
});
