/**
 * Builtins v2 Tests
 *
 * Tests for the new triggers added in the v2 tier:
 * - builtin_test_fix_handle_failure (trigger 14)
 * - builtin_test_fix_handle_retest (trigger 15)
 *
 * Also validates the full list count and that all required triggers are present.
 */

import { describe, it, expect } from 'vitest';
import { getBuiltinTriggers } from '../triggers/builtins.js';

describe('getBuiltinTriggers', () => {
  const triggers = getBuiltinTriggers();

  it('returns 16 triggers', () => {
    expect(triggers).toHaveLength(16);
  });

  it('all triggers have non-empty id, name, description', () => {
    for (const t of triggers) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
    }
  });

  it('all triggers use builtin_ prefix', () => {
    for (const t of triggers) {
      expect(t.id).toMatch(/^builtin_/);
    }
  });

  it('includes builtin_test_fix_handle_failure (trigger 14)', () => {
    const t = triggers.find((x) => x.id === 'builtin_test_fix_handle_failure');
    expect(t).toBeDefined();
    expect(t?.action.type).toBe('invoke_handler');
    if (t?.action.type === 'invoke_handler') {
      expect(t.action.handler).toBe('test_fix_handle_failure');
    }
    expect(t?.condition.type).toBe('event');
    if (t?.condition.type === 'event') {
      expect(t.condition.event_type).toBe('test_fix:tests_failed');
    }
  });

  it('includes builtin_test_fix_handle_retest (trigger 15)', () => {
    const t = triggers.find((x) => x.id === 'builtin_test_fix_handle_retest');
    expect(t).toBeDefined();
    expect(t?.action.type).toBe('invoke_handler');
    if (t?.action.type === 'invoke_handler') {
      expect(t.action.handler).toBe('test_fix_handle_retest');
    }
    expect(t?.condition.type).toBe('event');
    if (t?.condition.type === 'event') {
      expect(t.condition.event_type).toBe('test_fix:fix_completed');
    }
  });

  it('builtin_test_fix_handle_failure fires on test_fix:tests_failed events', () => {
    const t = triggers.find((x) => x.id === 'builtin_test_fix_handle_failure')!;
    expect(t.condition.type).toBe('event');
    if (t.condition.type === 'event') {
      expect(t.condition.event_type).toBe('test_fix:tests_failed');
    }
  });

  it('builtin_test_fix_handle_retest fires on test_fix:fix_completed', () => {
    const t = triggers.find((x) => x.id === 'builtin_test_fix_handle_retest')!;
    expect(t.condition.type).toBe('event');
    if (t.condition.type === 'event') {
      expect(t.condition.event_type).toBe('test_fix:fix_completed');
    }
  });

  it('no duplicate trigger IDs', () => {
    const ids = triggers.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all triggers have fires_count initialized to 0', () => {
    for (const t of triggers) {
      expect(t.fires_count).toBe(0);
    }
  });

  it('includes all pre-existing triggers by name', () => {
    const names = new Set(triggers.map((t) => t.name));
    // WRFC triggers
    expect(names.has('wrfc_start_workflow')).toBe(true);
    expect(names.has('wrfc_spawn_reviewer')).toBe(true);
    expect(names.has('wrfc_spawn_fixer')).toBe(true);
    expect(names.has('wrfc_fix_review_loop')).toBe(true);
    // Test-fix triggers
    expect(names.has('test_fix_start')).toBe(true);
    expect(names.has('test_fix_agent_completed')).toBe(true);
    // New triggers
    expect(names.has('test_fix_handle_failure')).toBe(true);
    expect(names.has('test_fix_handle_retest')).toBe(true);
    // Review-only triggers
    expect(names.has('review_only_start')).toBe(true);
    expect(names.has('review_only_agent_completed')).toBe(true);
  });

  it('builtin_wrfc_spawn_reviewer (7) has higher priority than builtin_test_fix_agent_completed (12)', () => {
    const wrfcSpawnReviewer = triggers.find((t) => t.id === 'builtin_wrfc_spawn_reviewer');
    const testFixAgentCompleted = triggers.find((t) => t.id === 'builtin_test_fix_agent_completed');
    expect(wrfcSpawnReviewer).toBeDefined();
    expect(testFixAgentCompleted).toBeDefined();
    // WRFC reviewer must take precedence (lower numeric priority = lower precedence in some systems,
    // but here higher numeric value = higher priority). Verify no conflict: they must differ.
    expect(wrfcSpawnReviewer!.priority).not.toBe(testFixAgentCompleted!.priority);
    // Specifically: wrfc_spawn_reviewer stays at 20, test_fix_agent_completed drops to 19.
    expect(wrfcSpawnReviewer!.priority).toBe(20);
    expect(testFixAgentCompleted!.priority).toBe(19);
  });
});
