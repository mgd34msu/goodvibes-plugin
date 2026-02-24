/**
 * Unit tests for the `directives` action in handleRuntimeEvents.
 *
 * Strategy:
 * - handleRuntimeEvents and its helpers are imported directly — no module mocking
 *   needed for the handler logic itself.
 * - DirectiveQueue is used as-is (pure in-memory class, no I/O).
 * - HandlerContext is constructed as a plain mock object — only the fields used
 *   by the directives action are non-null (getDirectiveQueue, getUptime, version).
 * - All other HandlerContext fields throw if called so we catch unintended usage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleRuntimeEvents } from '../events.js';
import { DirectiveQueue } from '../../../directives/directive-queue.js';
import type { HandlerContext } from '../types.js';
import type { Directive } from '../../../ipc/protocol.js';

// ─── Logger mock ─────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal HandlerContext for the directives action. */
function makeCtx(queue: DirectiveQueue | null): HandlerContext {
  return {
    getUptime: () => 42,
    version: '1.0.0-test',
    getDirectiveQueue: () => queue,
    // The directives action does not call these — throw to catch regressions
    getConfig: () => { throw new Error('getConfig not expected'); },
    getHealth: () => { throw new Error('getHealth not expected'); },
    updateConfig: () => { throw new Error('updateConfig not expected'); },
    projectRoot: '/test',
    getEventBus: () => { throw new Error('getEventBus not expected'); },
    getEventLog: () => { throw new Error('getEventLog not expected'); },
    getEventQueue: () => { throw new Error('getEventQueue not expected'); },
    getWorkflowEngine: () => null,
    getTriggerRegistry: () => null,
    getAgentCoordinator: () => null,
  } as unknown as HandlerContext;
}

/** Build a sample Directive for test fixtures. */
function makeDirective(overrides: Partial<Directive> = {}): Directive {
  return {
    type: 'warn',
    content: 'test directive content',
    priority: 10,
    source: 'test-source',
    ...overrides,
  };
}

/**
 * Parse the CallToolResult and return its data payload.
 * The handler always emits JSON via toSuccess / toError.
 */
function parseResult(result: Awaited<ReturnType<typeof handleRuntimeEvents>>): unknown {
  expect(result.content).toHaveLength(1);
  const text = (result.content[0] as { type: string; text: string }).text;
  return JSON.parse(text);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleRuntimeEvents — directives action', () => {

  // ── Null queue guard ─────────────────────────────────────────────────────

  describe('queue null guard', () => {
    it('returns error when directive queue is null', async () => {
      const ctx = makeCtx(null);
      const result = await handleRuntimeEvents({ action: 'directives' }, ctx);

      expect(result.isError).toBe(true);
      const parsed = parseResult(result) as { success: boolean; error: string };
      expect(parsed.success).toBe(false);
      expect(parsed.error).toMatch(/not initialized/i);
    });
  });

  // ── peek mode ────────────────────────────────────────────────────────────

  describe('mode: peek (non-destructive)', () => {
    let queue: DirectiveQueue;
    const target = 'subagent_stop';

    beforeEach(() => {
      queue = new DirectiveQueue();
      queue.enqueue(target, makeDirective({ type: 'warn', priority: 5 }));
      queue.enqueue(target, makeDirective({ type: 'suggest', priority: 3 }));
    });

    it('returns directives without removing them', async () => {
      const ctx = makeCtx(queue);
      const result = await handleRuntimeEvents({ action: 'directives', mode: 'peek' }, ctx);

      expect(result.isError).toBe(false);
      const parsed = parseResult(result) as { success: boolean; data: { count: number; directives: Directive[] } };
      expect(parsed.success).toBe(true);
      expect(parsed.data.count).toBe(2);
      expect(parsed.data.directives).toHaveLength(2);
    });

    it('calling peek twice returns the same directives both times', async () => {
      const ctx = makeCtx(queue);

      const first = await handleRuntimeEvents({ action: 'directives', mode: 'peek' }, ctx);
      const second = await handleRuntimeEvents({ action: 'directives', mode: 'peek' }, ctx);

      const firstData = (parseResult(first) as { data: { count: number } }).data;
      const secondData = (parseResult(second) as { data: { count: number } }).data;

      expect(firstData.count).toBe(2);
      expect(secondData.count).toBe(2);
    });

    it('returns mode: peek in the response', async () => {
      const ctx = makeCtx(queue);
      const result = await handleRuntimeEvents({ action: 'directives', mode: 'peek' }, ctx);

      const data = (parseResult(result) as { data: { mode: string } }).data;
      expect(data.mode).toBe('peek');
    });
  });

  // ── drain mode ───────────────────────────────────────────────────────────

  describe('mode: drain (destructive)', () => {
    let queue: DirectiveQueue;
    const target = 'subagent_stop';

    beforeEach(() => {
      queue = new DirectiveQueue();
      queue.enqueue(target, makeDirective({ type: 'block_tool', priority: 8 }));
      queue.enqueue(target, makeDirective({ type: 'inject_system_message', priority: 6 }));
    });

    it('returns the directives on first drain', async () => {
      const ctx = makeCtx(queue);
      const result = await handleRuntimeEvents({ action: 'directives', mode: 'drain' }, ctx);

      expect(result.isError).toBe(false);
      const data = (parseResult(result) as { data: { count: number; directives: Directive[] } }).data;
      expect(data.count).toBe(2);
      expect(data.directives).toHaveLength(2);
    });

    it('removes directives so a second drain returns empty', async () => {
      const ctx = makeCtx(queue);

      await handleRuntimeEvents({ action: 'directives', mode: 'drain' }, ctx);
      const second = await handleRuntimeEvents({ action: 'directives', mode: 'drain' }, ctx);

      const data = (parseResult(second) as { data: { count: number; directives: Directive[] } }).data;
      expect(data.count).toBe(0);
      expect(data.directives).toHaveLength(0);
    });

    it('returns mode: drain in the response', async () => {
      const ctx = makeCtx(queue);
      const result = await handleRuntimeEvents({ action: 'directives', mode: 'drain' }, ctx);

      const data = (parseResult(result) as { data: { mode: string } }).data;
      expect(data.mode).toBe('drain');
    });
  });

  // ── default mode (no mode param) ─────────────────────────────────────────

  describe('default mode (no mode param)', () => {
    it('defaults to peek — directives remain after call', async () => {
      const queue = new DirectiveQueue();
      queue.enqueue('subagent_stop', makeDirective());
      const ctx = makeCtx(queue);

      // Call without mode
      const result = await handleRuntimeEvents({ action: 'directives' }, ctx);
      expect(result.isError).toBe(false);

      // Verify queue still has items (peek didn't drain)
      expect(queue.peek('subagent_stop')).toHaveLength(1);
    });

    it('responds with mode: peek when mode is not provided', async () => {
      const queue = new DirectiveQueue();
      queue.enqueue('subagent_stop', makeDirective());
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents({ action: 'directives' }, ctx);
      const data = (parseResult(result) as { data: { mode: string } }).data;
      expect(data.mode).toBe('peek');
    });
  });

  // ── target param ─────────────────────────────────────────────────────────

  describe('target param', () => {
    it('defaults target to subagent_stop', async () => {
      const queue = new DirectiveQueue();
      queue.enqueue('subagent_stop', makeDirective({ type: 'warn' }));
      queue.enqueue('pre_tool_use', makeDirective({ type: 'block_tool' }));
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents({ action: 'directives', mode: 'peek' }, ctx);
      const data = (parseResult(result) as { data: { count: number; target: string } }).data;

      // Should return only the subagent_stop directive
      expect(data.count).toBe(1);
      expect(data.target).toBe('subagent_stop');
    });

    it('respects a custom target param', async () => {
      const queue = new DirectiveQueue();
      queue.enqueue('subagent_stop', makeDirective({ type: 'warn' }));
      queue.enqueue('pre_tool_use', makeDirective({ type: 'block_tool' }));
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents(
        { action: 'directives', mode: 'peek', target: 'pre_tool_use' },
        ctx
      );
      const data = (parseResult(result) as { data: { count: number; target: string } }).data;

      expect(data.count).toBe(1);
      expect(data.target).toBe('pre_tool_use');
    });

    it('returns count 0 for an empty target', async () => {
      const queue = new DirectiveQueue();
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents(
        { action: 'directives', mode: 'peek', target: 'subagent_stop' },
        ctx
      );
      const data = (parseResult(result) as { data: { count: number } }).data;
      expect(data.count).toBe(0);
    });
  });

  // ── verbosity: count_only ─────────────────────────────────────────────────

  describe('verbosity: count_only', () => {
    it('returns only count, target, and mode — no directives array', async () => {
      const queue = new DirectiveQueue();
      queue.enqueue('subagent_stop', makeDirective({ type: 'warn' }));
      queue.enqueue('subagent_stop', makeDirective({ type: 'suggest' }));
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents(
        { action: 'directives', mode: 'peek', verbosity: 'count_only' },
        ctx
      );
      const data = (parseResult(result) as { data: Record<string, unknown> }).data;

      expect(data.count).toBe(2);
      expect(data.target).toBe('subagent_stop');
      expect(data.mode).toBe('peek');
      expect(data.directives).toBeUndefined();
    });
  });

  // ── verbosity: minimal ────────────────────────────────────────────────────

  describe('verbosity: minimal', () => {
    it('returns count + summaries with only type, priority, source', async () => {
      const queue = new DirectiveQueue();
      const directive = makeDirective({
        type: 'block_tool',
        priority: 15,
        source: 'workflow-guard',
        content: 'this content should not appear in minimal',
      });
      queue.enqueue('subagent_stop', directive);
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents(
        { action: 'directives', mode: 'peek', verbosity: 'minimal' },
        ctx
      );
      const data = (parseResult(result) as {
        data: { count: number; directives: Record<string, unknown>[] };
      }).data;

      expect(data.count).toBe(1);
      expect(data.directives).toHaveLength(1);

      const summary = data.directives[0];
      expect(summary.type).toBe('block_tool');
      expect(summary.priority).toBe(15);
      expect(summary.source).toBe('workflow-guard');
      // content is excluded in minimal mode
      expect(summary.content).toBeUndefined();
    });
  });

  // ── verbosity: standard (default) ────────────────────────────────────────

  describe('verbosity: standard', () => {
    it('returns full directive objects including content', async () => {
      const queue = new DirectiveQueue();
      const directive = makeDirective({
        type: 'inject_system_message',
        content: 'full content here',
        priority: 20,
        source: 'system',
      });
      queue.enqueue('subagent_stop', directive);
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents(
        { action: 'directives', mode: 'peek', verbosity: 'standard' },
        ctx
      );
      const data = (parseResult(result) as {
        data: { count: number; directives: Directive[] };
      }).data;

      expect(data.count).toBe(1);
      expect(data.directives).toHaveLength(1);

      const full = data.directives[0];
      expect(full.type).toBe('inject_system_message');
      expect(full.content).toBe('full content here');
      expect(full.priority).toBe(20);
      expect(full.source).toBe('system');
    });

    it('is the default when no verbosity param is provided', async () => {
      const queue = new DirectiveQueue();
      const directive = makeDirective({ content: 'should appear' });
      queue.enqueue('subagent_stop', directive);
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents(
        { action: 'directives', mode: 'peek' /* no verbosity */ },
        ctx
      );
      const data = (parseResult(result) as {
        data: { directives: Directive[] };
      }).data;

      expect(data.directives[0].content).toBe('should appear');
    });
  });

  // ── metadata in response ──────────────────────────────────────────────────

  describe('response metadata', () => {
    it('includes engine meta fields in the response envelope', async () => {
      const queue = new DirectiveQueue();
      const ctx = makeCtx(queue);

      const result = await handleRuntimeEvents({ action: 'directives' }, ctx);
      const parsed = parseResult(result) as {
        success: boolean;
        meta: { engine: string; version: string; uptime_ms: number; execution_ms: number };
      };

      expect(parsed.success).toBe(true);
      expect(parsed.meta.engine).toBe('runtime-engine');
      expect(parsed.meta.version).toBe('1.0.0-test');
      expect(typeof parsed.meta.uptime_ms).toBe('number');
      expect(typeof parsed.meta.execution_ms).toBe('number');
    });
  });
});
