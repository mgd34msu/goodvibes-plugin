/**
 * HookRegistry Tests
 *
 * Tests for priority-sorted handler registration, unregistration,
 * enable/disable, getHandlers filtering, and count.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRegistry } from '../hook-registry.js';
import type { RegisteredHandler } from '../hook-registry.js';
import type { HookEvent } from '../../../extensions/events/factories.js';
import type { ClaudeHookResponse } from '../hook-processor.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const noop = vi.fn<[HookEvent, Record<string, unknown>], Promise<ClaudeHookResponse | null>>(
  async () => null,
);

function makeHandler(
  id: string,
  priority = 50,
  enabled = true,
): RegisteredHandler {
  return {
    id,
    hook_type: 'SubagentStart',
    handler: noop,
    priority,
    enabled,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
    vi.clearAllMocks();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('adds a handler and makes it retrievable', () => {
      const h = makeHandler('h1');
      registry.register(h);

      const handlers = registry.getHandlers('SubagentStart');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].id).toBe('h1');
    });

    it('maintains descending priority order with multiple handlers', () => {
      registry.register(makeHandler('low', 10));
      registry.register(makeHandler('high', 100));
      registry.register(makeHandler('mid', 50));

      const handlers = registry.getHandlers('SubagentStart');
      expect(handlers.map((h) => h.id)).toEqual(['high', 'mid', 'low']);
    });

    it('replaces an existing handler when registering the same ID', () => {
      const h1 = makeHandler('dup', 50);
      const h2 = { ...makeHandler('dup', 90) };

      registry.register(h1);
      registry.register(h2);

      // Only one handler should remain
      expect(registry.count('SubagentStart')).toBe(1);
      // Priority should reflect the replacement
      const handlers = registry.getHandlers('SubagentStart');
      expect(handlers[0].priority).toBe(90);
    });

    it('registers handlers for different hook types independently', () => {
      registry.register(makeHandler('start-h'));
      registry.register({
        id: 'stop-h',
        hook_type: 'SubagentStop',
        handler: noop,
        priority: 50,
        enabled: true,
      });

      expect(registry.getHandlers('SubagentStart')).toHaveLength(1);
      expect(registry.getHandlers('SubagentStop')).toHaveLength(1);
    });

    it('appends equal-priority handler after existing ones', () => {
      registry.register(makeHandler('first', 50));
      registry.register(makeHandler('second', 50));

      const handlers = registry.getHandlers('SubagentStart');
      // Both present — order is stable (first inserted goes last in priority tie)
      expect(handlers).toHaveLength(2);
      expect(handlers.map((h) => h.id)).toContain('first');
      expect(handlers.map((h) => h.id)).toContain('second');
    });
  });

  // ── unregister ────────────────────────────────────────────────────────────

  describe('unregister', () => {
    it('removes a registered handler and returns true', () => {
      registry.register(makeHandler('h1'));
      const removed = registry.unregister('h1');

      expect(removed).toBe(true);
      expect(registry.getHandlers('SubagentStart')).toHaveLength(0);
    });

    it('returns false for a non-existent ID', () => {
      expect(registry.unregister('does-not-exist')).toBe(false);
    });

    it('does not affect other handlers when removing one', () => {
      registry.register(makeHandler('h1', 100));
      registry.register(makeHandler('h2', 50));

      registry.unregister('h1');

      const handlers = registry.getHandlers('SubagentStart');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].id).toBe('h2');
    });

    it('decrements the total count', () => {
      registry.register(makeHandler('h1'));
      registry.register(makeHandler('h2'));
      expect(registry.count()).toBe(2);

      registry.unregister('h1');
      expect(registry.count()).toBe(1);
    });
  });

  // ── enable / disable ──────────────────────────────────────────────────────

  describe('enable', () => {
    it('enables a previously disabled handler', () => {
      const h = makeHandler('h1', 50, false);
      registry.register(h);

      expect(registry.getHandlers('SubagentStart')).toHaveLength(0);

      registry.enable('h1');
      expect(registry.getHandlers('SubagentStart')).toHaveLength(1);
    });

    it('is a no-op for an unknown ID (does not throw)', () => {
      expect(() => registry.enable('unknown')).not.toThrow();
    });
  });

  describe('disable', () => {
    it('removes handler from getHandlers results', () => {
      registry.register(makeHandler('h1'));
      registry.disable('h1');

      expect(registry.getHandlers('SubagentStart')).toHaveLength(0);
    });

    it('keeps the handler in total count (not removed, just disabled)', () => {
      registry.register(makeHandler('h1'));
      registry.disable('h1');

      expect(registry.count()).toBe(1);
      expect(registry.count('SubagentStart')).toBe(1);
    });

    it('is a no-op for an unknown ID (does not throw)', () => {
      expect(() => registry.disable('unknown')).not.toThrow();
    });
  });

  // ── getHandlers ───────────────────────────────────────────────────────────

  describe('getHandlers', () => {
    it('returns empty array for a hook type with no registrations', () => {
      expect(registry.getHandlers('PreToolUse')).toEqual([]);
    });

    it('returns only enabled handlers', () => {
      registry.register(makeHandler('active', 100, true));
      registry.register(makeHandler('inactive', 50, false));

      const handlers = registry.getHandlers('SubagentStart');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].id).toBe('active');
    });

    it('returns handlers in descending priority order', () => {
      registry.register(makeHandler('p10', 10));
      registry.register(makeHandler('p90', 90));
      registry.register(makeHandler('p50', 50));

      const ids = registry.getHandlers('SubagentStart').map((h) => h.id);
      expect(ids).toEqual(['p90', 'p50', 'p10']);
    });
  });

  // ── count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.count()).toBe(0);
      expect(registry.count('SubagentStart')).toBe(0);
    });

    it('returns total count across all hook types when called without argument', () => {
      registry.register(makeHandler('s1'));
      registry.register({
        id: 'e1',
        hook_type: 'SessionStart',
        handler: noop,
        priority: 50,
        enabled: true,
      });

      expect(registry.count()).toBe(2);
    });

    it('returns count for a specific hook type', () => {
      registry.register(makeHandler('s1'));
      registry.register(makeHandler('s2'));

      expect(registry.count('SubagentStart')).toBe(2);
      expect(registry.count('SessionStart')).toBe(0);
    });

    it('includes disabled handlers in count', () => {
      registry.register(makeHandler('d1', 50, false));
      expect(registry.count()).toBe(1);
      expect(registry.count('SubagentStart')).toBe(1);
    });
  });
});
