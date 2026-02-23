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
});
