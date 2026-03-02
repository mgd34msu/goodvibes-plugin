import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeHookName,
  HookAdapter,
  VALID_HOOK_TYPES,
} from '../hook-adapter.js';

// Suppress logger output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── normalizeHookName ───────────────────────────────────────────────────────

describe('normalizeHookName', () => {
  describe('colon-syntax input', () => {
    it('normalizes hook:pre_tool_use to PreToolUse', () => {
      expect(normalizeHookName('hook:pre_tool_use')).toBe('PreToolUse');
    });

    it('normalizes hook:subagent_stop to SubagentStop', () => {
      expect(normalizeHookName('hook:subagent_stop')).toBe('SubagentStop');
    });

    it('normalizes hook:session_start to SessionStart', () => {
      expect(normalizeHookName('hook:session_start')).toBe('SessionStart');
    });

    it('normalizes hook:user_prompt_submit to UserPromptSubmit', () => {
      expect(normalizeHookName('hook:user_prompt_submit')).toBe('UserPromptSubmit');
    });

    it('normalizes hook:post_tool_use_failure to PostToolUseFailure', () => {
      expect(normalizeHookName('hook:post_tool_use_failure')).toBe('PostToolUseFailure');
    });

    it('handles colon prefix with PascalCase suffix (e.g., hook:SubagentStop)', () => {
      expect(normalizeHookName('hook:SubagentStop')).toBe('SubagentStop');
    });
  });

  describe('snake_case input', () => {
    it('normalizes pre_tool_use to PreToolUse', () => {
      expect(normalizeHookName('pre_tool_use')).toBe('PreToolUse');
    });

    it('normalizes post_tool_use to PostToolUse', () => {
      expect(normalizeHookName('post_tool_use')).toBe('PostToolUse');
    });

    it('normalizes session_end to SessionEnd', () => {
      expect(normalizeHookName('session_end')).toBe('SessionEnd');
    });

    it('normalizes stop to Stop', () => {
      expect(normalizeHookName('stop')).toBe('Stop');
    });
  });

  describe('PascalCase input', () => {
    it('accepts PreToolUse directly', () => {
      expect(normalizeHookName('PreToolUse')).toBe('PreToolUse');
    });

    it('accepts SubagentStart directly', () => {
      expect(normalizeHookName('SubagentStart')).toBe('SubagentStart');
    });

    it('accepts all valid hook types', () => {
      for (const hookType of VALID_HOOK_TYPES) {
        expect(normalizeHookName(hookType)).toBe(hookType);
      }
    });
  });

  describe('invalid input', () => {
    it('returns null for unknown hook names', () => {
      expect(normalizeHookName('unknown_hook')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeHookName('')).toBeNull();
    });

    it('returns null for arbitrary strings', () => {
      expect(normalizeHookName('not_a_valid_hook')).toBeNull();
    });

    it('returns null for partial matches', () => {
      expect(normalizeHookName('tool_use')).toBeNull();
    });
  });
});

// ─── HookAdapter ─────────────────────────────────────────────────────────────

describe('HookAdapter', () => {
  let adapter: HookAdapter;

  beforeEach(() => {
    adapter = new HookAdapter();
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  describe('start() / stop() / status()', () => {
    it('starts in stopped state', () => {
      expect(adapter.status().running).toBe(false);
    });

    it('transitions to running after start()', async () => {
      await adapter.start();
      expect(adapter.status().running).toBe(true);
    });

    it('transitions to stopped after stop()', async () => {
      await adapter.start();
      await adapter.stop();
      expect(adapter.status().running).toBe(false);
    });

    it('start() is idempotent — calling twice does not throw', async () => {
      await adapter.start();
      await expect(adapter.start()).resolves.toBeUndefined();
      expect(adapter.status().running).toBe(true);
    });

    it('stop() is idempotent — calling twice does not throw', async () => {
      await expect(adapter.stop()).resolves.toBeUndefined();
    });

    it('status reports zero events and zero errors initially', () => {
      const s = adapter.status();
      expect(s.eventsProcessed).toBe(0);
      expect(s.errors).toBe(0);
      expect(s.lastEventAt).toBeUndefined();
    });
  });

  // ─── normalize() — string input ──────────────────────────────────────────────

  describe('normalize() — string input', () => {
    it('normalizes a PascalCase hook name string to a RuntimeEvent', () => {
      const event = adapter.normalize('PreToolUse');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('hook:pre_tool_use');
      expect((event!.source as { kind: string; hook_name: string }).hook_name).toBe('PreToolUse');
    });

    it('normalizes a snake_case hook name string', () => {
      const event = adapter.normalize('pre_tool_use');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('hook:pre_tool_use');
    });

    it('increments eventsProcessed on success', () => {
      adapter.normalize('SubagentStop');
      adapter.normalize('SubagentStop');
      expect(adapter.status().eventsProcessed).toBe(2);
    });

    it('sets lastEventAt after successful normalization', () => {
      const before = Date.now();
      adapter.normalize('SessionStart');
      const after = Date.now();
      const lastEventAt = adapter.status().lastEventAt;
      expect(lastEventAt).toBeGreaterThanOrEqual(before);
      expect(lastEventAt).toBeLessThanOrEqual(after);
    });
  });

  // ─── normalize() — object input ──────────────────────────────────────────────

  describe('normalize() — object input', () => {
    it('normalizes a RawHookPayload object', () => {
      const event = adapter.normalize({ hook_name: 'SubagentStop', session_id: 'abc' });
      expect(event).not.toBeNull();
      expect(event!.type).toBe('hook:subagent_stop');
    });

    it('includes extra payload fields in event data', () => {
      const event = adapter.normalize({ hook_name: 'SessionStart', tool_name: 'bash' });
      expect(event).not.toBeNull();
      const data = (event!.payload as { data: Record<string, unknown> }).data;
      expect(data['tool_name']).toBe('bash');
    });

    it('returns null and increments errors for missing hook_name', () => {
      const event = adapter.normalize({ tool_name: 'bash' });
      expect(event).toBeNull();
      expect(adapter.status().errors).toBe(1);
    });

    it('returns null and increments errors for null input', () => {
      const event = adapter.normalize(null);
      expect(event).toBeNull();
      expect(adapter.status().errors).toBe(1);
    });

    it('returns null and increments errors for non-string hook_name', () => {
      const event = adapter.normalize({ hook_name: 42 });
      expect(event).toBeNull();
      expect(adapter.status().errors).toBe(1);
    });

    it('returns null for unknown hook name', () => {
      const event = adapter.normalize({ hook_name: 'not_a_hook' });
      expect(event).toBeNull();
      expect(adapter.status().errors).toBe(1);
    });
  });

  // ─── error counting ───────────────────────────────────────────────────────────

  describe('error counting', () => {
    it('tracks multiple errors cumulatively', () => {
      adapter.normalize(null);
      adapter.normalize(undefined);
      adapter.normalize({ hook_name: 'unknown' });
      expect(adapter.status().errors).toBe(3);
    });

    it('does not increment errors on valid input', () => {
      adapter.normalize('SessionEnd');
      expect(adapter.status().errors).toBe(0);
    });
  });

  // ─── event shape ─────────────────────────────────────────────────────────────

  describe('event shape', () => {
    it('emitted event has required RuntimeEvent fields', () => {
      const event = adapter.normalize('Stop');
      expect(event).not.toBeNull();
      expect(typeof event!.id).toBe('string');
      expect(event!.id.length).toBeGreaterThan(0);
      expect(typeof event!.timestamp).toBe('number');
      expect(event!.priority).toBe(50);
      expect(event!.metadata).toBeDefined();
    });

    it('event source has kind=hook and hook_name', () => {
      const event = adapter.normalize('PreCompact');
      const source = event!.source as { kind: string; hook_name: string };
      expect(source.kind).toBe('hook');
      expect(source.hook_name).toBe('PreCompact');
    });
  });
});
