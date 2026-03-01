/**
 * HookProcessor Tests
 *
 * Tests for hook name normalisation, handler dispatch, response merging,
 * error isolation, and the 100 KB additionalContext cap.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookProcessor } from '../hook-processor.js';
import { HookRegistry } from '../hook-registry.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { HookEvent } from '../../../extensions/events/factories.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRegistry(): HookRegistry {
  return new HookRegistry();
}

function makeProcessor(registry: HookRegistry, sessionId = 'test-session'): HookProcessor {
  return new HookProcessor({ registry, sessionId });
}

type HandlerFn = (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null>;

function makeHandler(response: ClaudeHookResponse | null = null): HandlerFn {
  return vi.fn(async () => response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HookProcessor', () => {
  let registry: HookRegistry;
  let processor: HookProcessor;

  beforeEach(() => {
    registry = makeRegistry();
    processor = makeProcessor(registry);
    vi.clearAllMocks();
  });

  // ── Hook name normalisation ────────────────────────────────────────────────

  describe('hook name normalisation', () => {
    it('returns {} for unknown hook names', async () => {
      const result = await processor.process('NonExistentHook', {});
      expect(result).toEqual({});
    });

    it('handles PascalCase hook names directly', async () => {
      const handler = makeHandler({ decision: 'allow' });
      registry.register({
        id: 'h1',
        hook_type: 'SubagentStart',
        handler,
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SubagentStart', {});
      expect(result.decision).toBe('allow');
    });

    it('converts snake_case to PascalCase and dispatches', async () => {
      const handler = makeHandler({ additionalContext: 'from-handler' });
      registry.register({
        id: 'h1',
        hook_type: 'SubagentStart',
        handler,
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('subagent_start', {});
      expect(result.additionalContext).toBe('from-handler');
    });

    it('converts multi-word snake_case correctly', async () => {
      const handler = makeHandler({ suppressOutput: true });
      registry.register({
        id: 'h1',
        hook_type: 'UserPromptSubmit',
        handler,
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('user_prompt_submit', {});
      expect(result.suppressOutput).toBe(true);
    });

    it('returns {} for empty string hook name', async () => {
      const result = await processor.process('', {});
      expect(result).toEqual({});
    });
  });

  // ── No handlers ───────────────────────────────────────────────────────────

  describe('when no handlers are registered', () => {
    it('returns empty object', async () => {
      const result = await processor.process('SessionStart', {});
      expect(result).toEqual({});
    });
  });

  // ── Handler dispatch ──────────────────────────────────────────────────────

  describe('handler dispatch', () => {
    it('calls registered handler with event and input', async () => {
      const handler = makeHandler(null);
      registry.register({
        id: 'h1',
        hook_type: 'SessionStart',
        handler,
        priority: 50,
        enabled: true,
      });

      const input = { session_id: 'abc', cwd: '/tmp' };
      await processor.process('SessionStart', input);

      expect(handler).toHaveBeenCalledOnce();
      // Second argument must be the raw input
      const [, passedInput] = (handler as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, Record<string, unknown>];
      expect(passedInput).toEqual(input);
    });

    it('calls handlers in priority order (highest first)', async () => {
      const callOrder: string[] = [];

      const highHandler: HandlerFn = vi.fn(async () => {
        callOrder.push('high');
        return null;
      });
      const lowHandler: HandlerFn = vi.fn(async () => {
        callOrder.push('low');
        return null;
      });

      registry.register({ id: 'low', hook_type: 'SessionStart', handler: lowHandler, priority: 10, enabled: true });
      registry.register({ id: 'high', hook_type: 'SessionStart', handler: highHandler, priority: 100, enabled: true });

      await processor.process('SessionStart', {});
      expect(callOrder).toEqual(['high', 'low']);
    });

    it('ignores null responses from handlers', async () => {
      registry.register({
        id: 'h1',
        hook_type: 'SessionStart',
        handler: makeHandler(null),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result).toEqual({});
    });
  });

  // ── Error isolation ───────────────────────────────────────────────────────

  describe('error isolation', () => {
    it('continues processing subsequent handlers when one throws', async () => {
      const throwingHandler: HandlerFn = vi.fn(async () => {
        throw new Error('handler exploded');
      });
      const goodHandler = makeHandler({ decision: 'allow' });

      registry.register({ id: 'thrower', hook_type: 'SessionStart', handler: throwingHandler, priority: 100, enabled: true });
      registry.register({ id: 'good', hook_type: 'SessionStart', handler: goodHandler, priority: 50, enabled: true });

      const result = await processor.process('SessionStart', {});
      // The good handler's response should still be merged
      expect(result.decision).toBe('allow');
    });

    it('returns {} when all handlers throw', async () => {
      const throwingHandler: HandlerFn = vi.fn(async () => {
        throw new Error('boom');
      });

      registry.register({ id: 'thrower', hook_type: 'SessionStart', handler: throwingHandler, priority: 50, enabled: true });

      const result = await processor.process('SessionStart', {});
      expect(result).toEqual({});
    });
  });

  // ── Response merging ──────────────────────────────────────────────────────

  describe('mergeResponses', () => {
    it('returns single handler response directly', async () => {
      registry.register({
        id: 'h1',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'allow', reason: 'ok' }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.decision).toBe('allow');
      expect(result.reason).toBe('ok');
    });

    it('block decision wins over allow', async () => {
      registry.register({
        id: 'allow-h',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'allow' }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'block-h',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'block', reason: 'blocked' }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.decision).toBe('block');
      expect(result.reason).toBe('blocked');
    });

    it('concatenates block reasons with "; "', async () => {
      registry.register({
        id: 'b1',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'block', reason: 'reason-one' }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'b2',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'block', reason: 'reason-two' }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.decision).toBe('block');
      expect(result.reason).toBe('reason-one; reason-two');
    });

    it('concatenates additionalContext with "\\n\\n"', async () => {
      registry.register({
        id: 'c1',
        hook_type: 'SessionStart',
        handler: makeHandler({ additionalContext: 'context-a' }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'c2',
        hook_type: 'SessionStart',
        handler: makeHandler({ additionalContext: 'context-b' }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.additionalContext).toBe('context-a\n\ncontext-b');
    });

    it('last non-null hookSpecificOutput wins', async () => {
      registry.register({
        id: 'first',
        hook_type: 'SessionStart',
        handler: makeHandler({ hookSpecificOutput: { key: 'first-val' } }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'last',
        hook_type: 'SessionStart',
        handler: makeHandler({ hookSpecificOutput: { key: 'last-val' } }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.hookSpecificOutput).toEqual({ key: 'last-val' });
    });

    it('suppressOutput is true when any handler sets it', async () => {
      registry.register({
        id: 'suppress',
        hook_type: 'SessionStart',
        handler: makeHandler({ suppressOutput: true }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'no-suppress',
        hook_type: 'SessionStart',
        handler: makeHandler({ suppressOutput: false }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.suppressOutput).toBe(true);
    });

    it('allow decision is set when only allow responses and no block', async () => {
      registry.register({
        id: 'a1',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'allow', reason: 'fine' }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'a2',
        hook_type: 'SessionStart',
        handler: makeHandler({ additionalContext: 'extra' }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.decision).toBe('allow');
    });

    it('block reason is omitted when no reason provided', async () => {
      registry.register({
        id: 'b1',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'block' }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'b2',
        hook_type: 'SessionStart',
        handler: makeHandler({ decision: 'block' }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.decision).toBe('block');
      expect(result.reason).toBeUndefined();
    });
  });

  // ── additionalContext 100 KB cap ───────────────────────────────────────────

  describe('additionalContext size cap', () => {
    it('truncates merged additionalContext at 100 KB', async () => {
      // Create two handlers whose combined context exceeds 100 KB
      const bigChunk = 'x'.repeat(60 * 1024); // 60 KB each → 120 KB joined

      registry.register({
        id: 'big1',
        hook_type: 'SessionStart',
        handler: makeHandler({ additionalContext: bigChunk }),
        priority: 100,
        enabled: true,
      });
      registry.register({
        id: 'big2',
        hook_type: 'SessionStart',
        handler: makeHandler({ additionalContext: bigChunk }),
        priority: 50,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});

      // Must be defined and within the 100 KB cap
      expect(result.additionalContext).toBeDefined();
      const byteLength = Buffer.byteLength(result.additionalContext!, 'utf8');
      expect(byteLength).toBeLessThanOrEqual(100 * 1024);
    });

    it('does not truncate context that is exactly 100 KB', async () => {
      const exactly100KB = 'a'.repeat(100 * 1024);

      registry.register({
        id: 'h1',
        hook_type: 'SessionStart',
        handler: makeHandler({ additionalContext: exactly100KB }),
        priority: 50,
        enabled: true,
      });
      // A second handler to trigger mergeResponses (not single-response path)
      registry.register({
        id: 'h2',
        hook_type: 'SessionStart',
        handler: makeHandler({}),
        priority: 40,
        enabled: true,
      });

      const result = await processor.process('SessionStart', {});
      expect(result.additionalContext).toBe(exactly100KB);
    });
  });
});
