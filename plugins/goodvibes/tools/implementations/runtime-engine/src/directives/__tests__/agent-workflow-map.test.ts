/**
 * AgentWorkflowMap Tests
 *
 * Unit tests for the in-memory agent_id → workflow_id binding map.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentWorkflowMap } from '../agent-workflow-map.js';

describe('AgentWorkflowMap', () => {
  let map: AgentWorkflowMap;

  beforeEach(() => {
    map = new AgentWorkflowMap();
  });

  // ─── bind ─────────────────────────────────────────────────────────────────────────────────

  describe('bind', () => {
    it('stores a new agent_id → workflow_id binding', () => {
      map.bind('agent_abc', 'wrfc_abc');
      expect(map.lookup('agent_abc')).toBe('wrfc_abc');
    });

    it('increments size after each new bind', () => {
      expect(map.size()).toBe(0);
      map.bind('agent_1', 'wrfc_1');
      expect(map.size()).toBe(1);
      map.bind('agent_2', 'wrfc_2');
      expect(map.size()).toBe(2);
    });

    it('preserves the first binding when same agent_id is bound twice (duplicate guard)', () => {
      map.bind('agent_abc', 'wrfc_abc');
      map.bind('agent_abc', 'wrfc_different'); // duplicate — should be ignored
      expect(map.lookup('agent_abc')).toBe('wrfc_abc');
      expect(map.size()).toBe(1);
    });
  });

  // ─── lookup ────────────────────────────────────────────────────────────────────────────

  describe('lookup', () => {
    it('returns the workflow_id for a bound agent', () => {
      map.bind('agent_xyz', 'wrfc_xyz');
      expect(map.lookup('agent_xyz')).toBe('wrfc_xyz');
    });

    it('returns undefined for an unbound agent_id', () => {
      expect(map.lookup('agent_nonexistent')).toBeUndefined();
    });

    it('returns correct workflow_id when multiple agents are bound', () => {
      map.bind('agent_a', 'wrfc_a');
      map.bind('agent_b', 'wrfc_b');
      map.bind('agent_c', 'wrfc_a'); // two agents in same chain
      expect(map.lookup('agent_a')).toBe('wrfc_a');
      expect(map.lookup('agent_b')).toBe('wrfc_b');
      expect(map.lookup('agent_c')).toBe('wrfc_a');
    });
  });

  // ─── unbind ────────────────────────────────────────────────────────────────────────────

  describe('unbind', () => {
    it('removes a bound agent_id from the map', () => {
      map.bind('agent_abc', 'wrfc_abc');
      map.unbind('agent_abc');
      expect(map.lookup('agent_abc')).toBeUndefined();
    });

    it('decrements size after unbind', () => {
      map.bind('agent_abc', 'wrfc_abc');
      expect(map.size()).toBe(1);
      map.unbind('agent_abc');
      expect(map.size()).toBe(0);
    });

    it('is a no-op (does not throw) when agent_id is not bound', () => {
      expect(() => map.unbind('agent_nonexistent')).not.toThrow();
    });

    it('only removes the specific agent_id, not others in the same workflow', () => {
      map.bind('agent_a', 'wrfc_shared');
      map.bind('agent_b', 'wrfc_shared');
      map.unbind('agent_a');
      expect(map.lookup('agent_a')).toBeUndefined();
      expect(map.lookup('agent_b')).toBe('wrfc_shared');
    });
  });

  // ─── has ─────────────────────────────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns true for a bound agent_id', () => {
      map.bind('agent_abc', 'wrfc_abc');
      expect(map.has('agent_abc')).toBe(true);
    });

    it('returns false for an unbound agent_id', () => {
      expect(map.has('agent_nonexistent')).toBe(false);
    });

    it('returns false after unbind', () => {
      map.bind('agent_abc', 'wrfc_abc');
      map.unbind('agent_abc');
      expect(map.has('agent_abc')).toBe(false);
    });
  });

  // ─── size + snapshot ─────────────────────────────────────────────────────────────────

  describe('size and snapshot', () => {
    it('returns 0 for an empty map', () => {
      expect(map.size()).toBe(0);
    });

    it('snapshot returns empty object for an empty map', () => {
      expect(map.snapshot()).toEqual({});
    });

    it('snapshot reflects current bindings', () => {
      map.bind('agent_a', 'wrfc_a');
      map.bind('agent_b', 'wrfc_b');
      expect(map.snapshot()).toEqual({
        agent_a: 'wrfc_a',
        agent_b: 'wrfc_b',
      });
    });

    it('snapshot does not include unbound entries', () => {
      map.bind('agent_a', 'wrfc_a');
      map.bind('agent_b', 'wrfc_b');
      map.unbind('agent_a');
      expect(map.snapshot()).toEqual({ agent_b: 'wrfc_b' });
    });
  });

  // ─── addPendingBind + resolvePendingBind ────────────────────────────────────────────────────

  describe('addPendingBind and resolvePendingBind', () => {
    it('resolves a pending bind returning the correct workflow_id', () => {
      map.addPendingBind('reviewer', 'wrfc_123');
      expect(map.resolvePendingBind('reviewer')).toBe('wrfc_123');
    });

    it('returns null when no pending bind exists for the agent type', () => {
      expect(map.resolvePendingBind('reviewer')).toBeNull();
    });

    it('returns null for an unrelated agent type when a bind exists for another type', () => {
      map.addPendingBind('engineer', 'wrfc_abc');
      expect(map.resolvePendingBind('reviewer')).toBeNull();
      // engineer bind still available
      expect(map.resolvePendingBind('engineer')).toBe('wrfc_abc');
    });

    it('resolves in FIFO order when multiple binds exist for the same agent type', () => {
      map.addPendingBind('reviewer', 'wrfc_first');
      map.addPendingBind('reviewer', 'wrfc_second');
      expect(map.resolvePendingBind('reviewer')).toBe('wrfc_first');
      expect(map.resolvePendingBind('reviewer')).toBe('wrfc_second');
    });

    it('does not leak after many add/resolve cycles', () => {
      for (let i = 0; i < 100; i++) {
        map.addPendingBind('reviewer', `wrfc_${i}`);
        map.resolvePendingBind('reviewer');
      }
      // After draining, no binds remain
      expect(map.resolvePendingBind('reviewer')).toBeNull();
    });

    it('removes sibling entries (same workflowId, different agentType) on resolve', () => {
      // Dual-key pattern: both reviewer and goodvibes:reviewer added for same workflow
      map.addPendingBind('reviewer', 'wrfc_xyz');
      map.addPendingBind('goodvibes:reviewer', 'wrfc_xyz');

      // Resolving one should clean up the sibling
      expect(map.resolvePendingBind('reviewer')).toBe('wrfc_xyz');
      // Sibling should be gone
      expect(map.resolvePendingBind('goodvibes:reviewer')).toBeNull();
    });

    it('only cleans sibling entries for the resolved workflowId, not other workflows', () => {
      map.addPendingBind('reviewer', 'wrfc_A');
      map.addPendingBind('goodvibes:reviewer', 'wrfc_A');
      map.addPendingBind('reviewer', 'wrfc_B'); // different workflow, same type

      // Resolve wrfc_A’s reviewer; only wrfc_A siblings removed, wrfc_B untouched
      expect(map.resolvePendingBind('reviewer')).toBe('wrfc_A');
      // goodvibes:reviewer for wrfc_A should be cleaned up
      expect(map.resolvePendingBind('goodvibes:reviewer')).toBeNull();
      // reviewer for wrfc_B should still be available
      expect(map.resolvePendingBind('reviewer')).toBe('wrfc_B');
    });

    it('prunes stale entries older than 60s during resolve', () => {
      // Directly manipulate internal queue via addPendingBind then mutate timestamp
      map.addPendingBind('reviewer', 'wrfc_stale');
      // Access internal state by casting to any (test only)
      const internal = map as unknown as {
        pendingBinds: Array<{ agentType: string; workflowId: string; timestamp: number }>;
      };
      // Set timestamp 61 seconds in the past
      internal.pendingBinds[0]!.timestamp = Date.now() - 61_000;

      // Add a fresh bind so there’s something to trigger pruning
      map.addPendingBind('engineer', 'wrfc_fresh');

      // Resolving engineer prunes the stale reviewer entry
      expect(map.resolvePendingBind('engineer')).toBe('wrfc_fresh');
      // Stale reviewer should be gone
      expect(map.resolvePendingBind('reviewer')).toBeNull();
    });
  });
});
