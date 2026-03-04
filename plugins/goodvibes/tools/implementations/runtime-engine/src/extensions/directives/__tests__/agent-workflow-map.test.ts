import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentWorkflowMap } from '../agent-workflow-map.js';

// Mock the logger so tests run without I/O side-effects
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('AgentWorkflowMap.clear', () => {
  let map: AgentWorkflowMap;

  beforeEach(() => {
    map = new AgentWorkflowMap();
  });

  it('clears all bindings from the map', () => {
    map.bind('agent-1', 'wf-1');
    map.bind('agent-2', 'wf-2');
    map.clear();
    expect(map.size()).toBe(0);
    expect(map.lookup('agent-1')).toBeUndefined();
    expect(map.lookup('agent-2')).toBeUndefined();
  });

  it('clears all pending binds', () => {
    map.addPendingBind('reviewer', 'wf-1');
    map.addPendingBind('engineer', 'wf-2');
    map.clear();
    // After clear, pending binds should be gone — resolve returns null
    expect(map.resolvePendingBind('reviewer')).toBeNull();
    expect(map.resolvePendingBind('engineer')).toBeNull();
  });

  it('does not throw when called on an empty map', () => {
    expect(() => map.clear()).not.toThrow();
  });

  it('clears both bindings and pending binds simultaneously', () => {
    map.bind('agent-1', 'wf-1');
    map.addPendingBind('reviewer', 'wf-2');
    map.clear();
    expect(map.size()).toBe(0);
    expect(map.resolvePendingBind('reviewer')).toBeNull();
  });
});

describe('AgentWorkflowMap.consumePendingBindsForWorkflow', () => {
  let map: AgentWorkflowMap;

  beforeEach(() => {
    map = new AgentWorkflowMap();
  });

  it('returns 0 and does not crash on an empty pending queue', () => {
    const removed = map.consumePendingBindsForWorkflow('wf-123');
    expect(removed).toBe(0);
  });

  it('removes a single matching entry and returns 1', () => {
    map.addPendingBind('reviewer', 'wf-abc');
    const removed = map.consumePendingBindsForWorkflow('wf-abc');
    expect(removed).toBe(1);
    // Queue should be empty; resolving that type now returns null
    expect(map.resolvePendingBind('reviewer')).toBeNull();
  });

  it('removes multiple entries for the same workflow and returns the count', () => {
    map.addPendingBind('reviewer', 'wf-multi');
    map.addPendingBind('engineer', 'wf-multi');
    map.addPendingBind('goodvibes:reviewer', 'wf-multi');
    const removed = map.consumePendingBindsForWorkflow('wf-multi');
    expect(removed).toBe(3);
  });

  it('preserves entries that belong to a different workflow', () => {
    map.addPendingBind('reviewer', 'wf-other');
    const removed = map.consumePendingBindsForWorkflow('wf-target');
    expect(removed).toBe(0);
    // The other-workflow entry is still resolvable
    expect(map.resolvePendingBind('reviewer')).toBe('wf-other');
  });

  it('removes only matching entries from a mixed queue', () => {
    map.addPendingBind('reviewer', 'wf-A');
    map.addPendingBind('engineer', 'wf-B');
    map.addPendingBind('goodvibes:reviewer', 'wf-A');
    map.addPendingBind('fixer', 'wf-C');

    const removed = map.consumePendingBindsForWorkflow('wf-A');
    expect(removed).toBe(2);

    // Entries for wf-B and wf-C must still be present
    expect(map.resolvePendingBind('engineer')).toBe('wf-B');
    expect(map.resolvePendingBind('fixer')).toBe('wf-C');

    // Entries for wf-A must be gone
    expect(map.resolvePendingBind('reviewer')).toBeNull();
    expect(map.resolvePendingBind('goodvibes:reviewer')).toBeNull();
  });
});

describe('AgentWorkflowMap session isolation', () => {
  let map: AgentWorkflowMap;

  beforeEach(() => {
    map = new AgentWorkflowMap();
  });

  // ─── addPendingBind with sessionId ──────────────────────────────────────────

  describe('addPendingBind with sessionId', () => {
    it('stores the sessionId on the pending bind entry', () => {
      map.addPendingBind('reviewer', 'wf-1', 'sess-A');
      // Resolvable when scoped to the correct session
      expect(map.resolvePendingBind('reviewer', 'sess-A')).toBe('wf-1');
    });

    it('uses "default" sessionId when no sessionId provided', () => {
      map.addPendingBind('reviewer', 'wf-1');
      expect(map.resolvePendingBind('reviewer', 'default')).toBe('wf-1');
    });
  });

  // ─── resolvePendingBind with sessionId ──────────────────────────────────────

  describe('resolvePendingBind with sessionId', () => {
    it('returns null when no pending bind exists for the given session', () => {
      map.addPendingBind('reviewer', 'wf-1', 'sess-A');
      // Session-B has no pending bind for reviewer
      expect(map.resolvePendingBind('reviewer', 'sess-B')).toBeNull();
      // The sess-A entry should still be present
      expect(map.resolvePendingBind('reviewer', 'sess-A')).toBe('wf-1');
    });

    it('resolves only the matching session entry when multiple sessions have pending binds', () => {
      map.addPendingBind('reviewer', 'wf-A', 'sess-A');
      map.addPendingBind('reviewer', 'wf-B', 'sess-B');

      // Resolve sess-A first
      expect(map.resolvePendingBind('reviewer', 'sess-A')).toBe('wf-A');
      // sess-B entry must be unaffected
      expect(map.resolvePendingBind('reviewer', 'sess-B')).toBe('wf-B');
    });

    it('falls back to any session when sessionId is omitted', () => {
      map.addPendingBind('reviewer', 'wf-A', 'sess-A');
      // Without sessionId filter, resolve picks the first matching entry regardless of session
      const resolved = map.resolvePendingBind('reviewer');
      expect(resolved).toBe('wf-A');
    });

    it('sibling cleanup respects session isolation — only removes siblings from resolved workflow', () => {
      // Two sessions each have a reviewer + prefixed entry for their own workflow
      map.addPendingBind('reviewer', 'wf-A', 'sess-A');
      map.addPendingBind('goodvibes:reviewer', 'wf-A', 'sess-A');
      map.addPendingBind('reviewer', 'wf-B', 'sess-B');
      map.addPendingBind('goodvibes:reviewer', 'wf-B', 'sess-B');

      // Resolve sess-A's reviewer — sibling goodvibes:reviewer for wf-A should be cleaned up
      expect(map.resolvePendingBind('reviewer', 'sess-A')).toBe('wf-A');
      // sess-A's sibling is gone (cleaned up by sibling cleanup for wf-A)
      expect(map.resolvePendingBind('goodvibes:reviewer', 'sess-A')).toBeNull();
      // sess-B entries must be untouched (wf-B is a different workflow, not affected by wf-A sibling cleanup)
      // Verify by resolving goodvibes:reviewer for sess-B first (before the sess-B reviewer consumes it)
      expect(map.resolvePendingBind('goodvibes:reviewer', 'sess-B')).toBe('wf-B');
      // After goodvibes:reviewer/wf-B resolved, sibling reviewer/wf-B is also cleaned up
      expect(map.resolvePendingBind('reviewer', 'sess-B')).toBeNull();
    });
  });

  // ─── clearForSession ─────────────────────────────────────────────────────────

  describe('clearForSession', () => {
    it('returns 0 when queue is empty', () => {
      expect(map.clearForSession('sess-A')).toBe(0);
    });

    it('removes all pending binds for the given session', () => {
      map.addPendingBind('reviewer', 'wf-1', 'sess-A');
      map.addPendingBind('engineer', 'wf-1', 'sess-A');
      const removed = map.clearForSession('sess-A');
      expect(removed).toBe(2);
      expect(map.resolvePendingBind('reviewer', 'sess-A')).toBeNull();
      expect(map.resolvePendingBind('engineer', 'sess-A')).toBeNull();
    });

    it('preserves pending binds from other sessions', () => {
      map.addPendingBind('reviewer', 'wf-A', 'sess-A');
      map.addPendingBind('reviewer', 'wf-B', 'sess-B');
      map.clearForSession('sess-A');
      // sess-B entry must survive
      expect(map.resolvePendingBind('reviewer', 'sess-B')).toBe('wf-B');
    });

    it('returns the count of entries removed', () => {
      map.addPendingBind('reviewer', 'wf-1', 'sess-X');
      map.addPendingBind('goodvibes:reviewer', 'wf-1', 'sess-X');
      map.addPendingBind('engineer', 'wf-2', 'sess-Y');
      const removed = map.clearForSession('sess-X');
      expect(removed).toBe(2);
    });

    it('does not clear regular map bindings (agentId -> workflowId)', () => {
      map.bind('agent-abc', 'wf-1');
      map.addPendingBind('reviewer', 'wf-1', 'sess-A');
      map.clearForSession('sess-A');
      // Regular map binding is unaffected
      expect(map.lookup('agent-abc')).toBe('wf-1');
    });

    it('does not throw when called for a session with no pending binds', () => {
      map.addPendingBind('reviewer', 'wf-1', 'sess-B');
      expect(() => map.clearForSession('sess-A')).not.toThrow();
      expect(map.resolvePendingBind('reviewer', 'sess-B')).toBe('wf-1');
    });
  });
});
