/**
 * hook-processor.test.ts
 *
 * Tests for HookProcessor — normalisation, mergeResponses, and
 * the 100 KB additionalContext cap.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookProcessor, type ClaudeHookResponse } from '../hook-processor.js';
import type { HookRegistry } from '../hook-registry.js';
import type { HookEvent } from '../../../extensions/events/hook-event.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RegisteredHandler = Parameters<HookRegistry['getHandlers']> extends [infer _T]
  ? ReturnType<HookRegistry['getHandlers']>[number]
  : never;

function makeRegisteredHandler(
  id: string,
  handler: (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null>,
  priority = 50,
): RegisteredHandler {
  return { id, handler, priority, enabled: true } as RegisteredHandler;
}

function makeRegistry(
  handlers: RegisteredHandler[] = [],
): HookRegistry {
  return {
    getHandlers: vi.fn().mockReturnValue(handlers),
    register: vi.fn(),
    unregister: vi.fn(),
  } as unknown as HookRegistry;
}

function makeProcessor(handlers: RegisteredHandler[] = []): HookProcessor {
  return new HookProcessor({
    registry: makeRegistry(handlers),
    sessionId: 'test-session',
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HookProcessor', () => {
  // ── Hook name normalisation ────────────────────────────────────────────────

  describe('hook name normalisation', () => {
    it('returns empty response for unknown hook names', async () => {
      const processor = makeProcessor();
      const result = await processor.process('UnknownHook', {});
      expect(result).toEqual({});
    });

    it('accepts valid PascalCase hook names', async () => {
      const handler = makeRegisteredHandler('h1', async () => ({ decision: 'allow' as const }));
      const registry = makeRegistry([handler]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.decision).toBe('allow');
    });

    it('converts snake_case to PascalCase', async () => {
      const handler = makeRegisteredHandler('h1', async () => ({ decision: 'allow' as const }));
      const registry = makeRegistry([handler]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('pre_tool_use', {});
      expect(result.decision).toBe('allow');
    });

    it('returns empty response when no handlers registered', async () => {
      const processor = makeProcessor([]);
      const result = await processor.process('PreToolUse', {});
      expect(result).toEqual({});
    });
  });

  // ── Handler error isolation ────────────────────────────────────────────────

  describe('handler error isolation', () => {
    it('does not propagate handler exceptions; continues to next handler', async () => {
      const thrower = makeRegisteredHandler('thrower', async () => {
        throw new Error('boom');
      });
      const good = makeRegisteredHandler('good', async () => ({ decision: 'allow' as const }));
      const registry = makeRegistry([thrower, good]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      // Good handler result still surfaced despite thrower
      expect(result.decision).toBe('allow');
    });
  });

  // ── mergeResponses ─────────────────────────────────────────────────────────

  describe('mergeResponses', () => {
    it('block wins over allow when any handler blocks', async () => {
      const blocker = makeRegisteredHandler('blocker', async () => ({
        decision: 'block' as const,
        reason: 'not allowed',
      }));
      const allower = makeRegisteredHandler('allower', async () => ({
        decision: 'allow' as const,
      }));
      const registry = makeRegistry([blocker, allower]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.decision).toBe('block');
      expect(result.reason).toContain('not allowed');
    });

    it('concatenates multiple block reasons with "; "', async () => {
      const b1 = makeRegisteredHandler('b1', async () => ({
        decision: 'block' as const,
        reason: 'reason A',
      }));
      const b2 = makeRegisteredHandler('b2', async () => ({
        decision: 'block' as const,
        reason: 'reason B',
      }));
      const registry = makeRegistry([b1, b2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.reason).toBe('reason A; reason B');
    });

    it('concatenates additionalContext with "\n\n"', async () => {
      const h1 = makeRegisteredHandler('h1', async () => ({ additionalContext: 'ctx-A' }));
      const h2 = makeRegisteredHandler('h2', async () => ({ additionalContext: 'ctx-B' }));
      const registry = makeRegistry([h1, h2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.additionalContext).toBe('ctx-A\n\nctx-B');
    });

    it('last hookSpecificOutput wins', async () => {
      const h1 = makeRegisteredHandler('h1', async () => ({
        hookSpecificOutput: { version: 1 },
      }));
      const h2 = makeRegisteredHandler('h2', async () => ({
        hookSpecificOutput: { version: 2 },
      }));
      const registry = makeRegistry([h1, h2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.hookSpecificOutput).toEqual({ version: 2 });
    });

    it('suppressOutput is true if any handler sets it', async () => {
      const h1 = makeRegisteredHandler('h1', async () => ({ suppressOutput: true }));
      const h2 = makeRegisteredHandler('h2', async () => ({}));
      const registry = makeRegistry([h1, h2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.suppressOutput).toBe(true);
    });

    it('single-handler response is returned as-is (shallow copy)', async () => {
      const h1 = makeRegisteredHandler('h1', async () => ({
        decision: 'allow' as const,
        additionalContext: 'hello',
      }));
      const registry = makeRegistry([h1]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.decision).toBe('allow');
      expect(result.additionalContext).toBe('hello');
    });

    it('null handler results are ignored during merge', async () => {
      const returnsNull = makeRegisteredHandler('null-handler', async () => null);
      const returnsAllow = makeRegisteredHandler('allower', async () => ({
        decision: 'allow' as const,
      }));
      const registry = makeRegistry([returnsNull, returnsAllow]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.decision).toBe('allow');
    });
  });

  // ── additionalContext 100 KB cap ───────────────────────────────────────────

  describe('additionalContext 100 KB cap', () => {
    const MAX_BYTES = 100 * 1024; // 102 400

    it('context within the 100 KB cap is returned unchanged', async () => {
      const ctx = 'a'.repeat(1000); // 1 KB, well within cap
      const h1 = makeRegisteredHandler('h1', async () => ({ additionalContext: ctx }));
      const h2 = makeRegisteredHandler('h2', async () => ({ additionalContext: ctx }));
      const registry = makeRegistry([h1, h2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      // 1000 + 2 (\n\n) + 1000 = 2002 chars — well under 100 KB
      expect(result.additionalContext).toBe(`${ctx}\n\n${ctx}`);
    });

    it('context exactly at 100 KB is returned unchanged', async () => {
      // Produce exactly MAX_BYTES bytes of ASCII (1 byte per char)
      const ctx = 'x'.repeat(MAX_BYTES);
      const h1 = makeRegisteredHandler('h1', async () => ({ additionalContext: ctx }));
      const registry = makeRegistry([h1, makeRegisteredHandler('h2', async () => ({}))]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.additionalContext).toBe(ctx);
      expect(Buffer.byteLength(result.additionalContext!, 'utf8')).toBeLessThanOrEqual(MAX_BYTES);
    });

    it('context exceeding 100 KB is truncated to <= 100 KB', async () => {
      // Each handler provides 60 KB. Combined = 120 KB + 2 bytes separator.
      const chunk = 'z'.repeat(60 * 1024);
      const h1 = makeRegisteredHandler('h1', async () => ({ additionalContext: chunk }));
      const h2 = makeRegisteredHandler('h2', async () => ({ additionalContext: chunk }));
      const registry = makeRegistry([h1, h2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.additionalContext).toBeDefined();
      expect(Buffer.byteLength(result.additionalContext!, 'utf8')).toBeLessThanOrEqual(MAX_BYTES);
    });

    it('truncation does not produce a partial UTF-8 multi-byte sequence', async () => {
      // Use 3-byte UTF-8 characters (U+4E00 = \u4e00, CJK ideograph \"\u4e00\")
      // Each character is 3 bytes. Fill to just over 100 KB.
      const cjkChar = '\u4e00'; // 3 bytes in UTF-8
      const charsNeeded = Math.ceil((MAX_BYTES + 10) / 3);
      const bigCtx = cjkChar.repeat(charsNeeded);
      const h1 = makeRegisteredHandler('h1', async () => ({ additionalContext: bigCtx }));
      const h2 = makeRegisteredHandler('h2', async () => ({}));
      const registry = makeRegistry([h1, h2]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.additionalContext).toBeDefined();
      // Must be valid UTF-8 — no replacement characters
      expect(result.additionalContext).not.toContain('\uFFFD');
      expect(Buffer.byteLength(result.additionalContext!, 'utf8')).toBeLessThanOrEqual(MAX_BYTES);
    });

    it('single handler context over 100 KB is NOT truncated (single-handler fast path)', async () => {
      // The single-handler fast path returns { ...responses[0] } without running truncation.
      // Only the multi-handler merge path enforces the cap.
      const bigCtx = 'a'.repeat(MAX_BYTES + 1000);
      const h1 = makeRegisteredHandler('h1', async () => ({ additionalContext: bigCtx }));
      const registry = makeRegistry([h1]);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      // Fast path: context returned verbatim regardless of size
      expect(result.additionalContext).toBe(bigCtx);
    });

    it('multiple handlers with combined context <= 100 KB not affected', async () => {
      // 10 handlers each providing 5 KB = 50 KB total (+ separators still < 100 KB)
      const chunk = 'k'.repeat(5 * 1024);
      const handlers = Array.from({ length: 10 }, (_, i) =>
        makeRegisteredHandler(`h${i}`, async () => ({ additionalContext: chunk })),
      );
      const registry = makeRegistry(handlers);
      const processor = new HookProcessor({ registry, sessionId: 'sess' });
      const result = await processor.process('PreToolUse', {});
      expect(result.additionalContext).toBeDefined();
      // 10 * 5120 + 9 * 2 = 51218 bytes — under cap
      expect(Buffer.byteLength(result.additionalContext!, 'utf8')).toBeLessThanOrEqual(MAX_BYTES);
    });
  });
});
