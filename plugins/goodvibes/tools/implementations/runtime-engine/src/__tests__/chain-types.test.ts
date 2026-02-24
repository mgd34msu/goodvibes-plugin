/**
 * Chain Types Tests
 *
 * Tests for workflow definition structure, chain type constants, event name
 * constants, max_transitions defaults, and the isChainType type guard.
 */

import { describe, it, expect } from 'vitest';
import {
  CHAIN_TYPES,
  CHAIN_MAX_TRANSITIONS,
  WRFC_EVENTS,
  TEST_FIX_EVENTS,
  REVIEW_ONLY_EVENTS,
  isChainType,
} from '../workflow/definitions/chain-types.js';
import { WRFC_LOOP_DEFINITION } from '../workflow/definitions/wrfc-loop.js';
import { TEST_THEN_FIX_DEFINITION } from '../workflow/definitions/test-then-fix.js';
import { REVIEW_ONLY_DEFINITION } from '../workflow/definitions/review-only.js';
import { FIX_LOOP_DEFINITION } from '../workflow/definitions/fix-loop.js';

// ─── isChainType ───────────────────────────────────────────────────────────────

describe('isChainType', () => {
  it('returns true for all valid chain types', () => {
    for (const ct of CHAIN_TYPES) {
      expect(isChainType(ct)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isChainType('unknown_chain')).toBe(false);
    expect(isChainType('')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isChainType(null)).toBe(false);
    expect(isChainType(42)).toBe(false);
    expect(isChainType(undefined)).toBe(false);
    expect(isChainType({})).toBe(false);
  });
});

// ─── CHAIN_MAX_TRANSITIONS ────────────────────────────────────────────────────

describe('CHAIN_MAX_TRANSITIONS', () => {
  it('has an entry for every chain type', () => {
    for (const ct of CHAIN_TYPES) {
      expect(CHAIN_MAX_TRANSITIONS[ct]).toBeGreaterThan(0);
    }
  });

  it('uses reasonable defaults (not excessive)', () => {
    // None should exceed 50 — anything higher is a likely bug
    for (const ct of CHAIN_TYPES) {
      expect(CHAIN_MAX_TRANSITIONS[ct]).toBeLessThanOrEqual(50);
    }
  });
});

// ─── Event Constants ──────────────────────────────────────────────────────────

describe('WRFC_EVENTS', () => {
  it('all values are non-empty strings', () => {
    for (const [, v] of Object.entries(WRFC_EVENTS)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('uses wrfc: namespace prefix', () => {
    for (const [, v] of Object.entries(WRFC_EVENTS)) {
      expect(v).toMatch(/^wrfc:/);
    }
  });
});

describe('TEST_FIX_EVENTS', () => {
  it('all values use test_fix: prefix', () => {
    for (const [, v] of Object.entries(TEST_FIX_EVENTS)) {
      expect(v).toMatch(/^test_fix:/);
    }
  });
});

describe('REVIEW_ONLY_EVENTS', () => {
  it('all values use review_only: prefix', () => {
    for (const [, v] of Object.entries(REVIEW_ONLY_EVENTS)) {
      expect(v).toMatch(/^review_only:/);
    }
  });
});

// ─── Workflow Definition Structure ────────────────────────────────────────────

describe('WRFC_LOOP_DEFINITION structure', () => {
  it('has valid id, name, version', () => {
    expect(WRFC_LOOP_DEFINITION.id).toBe('wrfc_loop');
    expect(typeof WRFC_LOOP_DEFINITION.name).toBe('string');
    expect(WRFC_LOOP_DEFINITION.version).toBe(1);
  });

  it('max_transitions is reasonable (n1 fix)', () => {
    expect(WRFC_LOOP_DEFINITION.max_transitions).toBeLessThanOrEqual(50);
    expect(WRFC_LOOP_DEFINITION.max_transitions).toBeGreaterThan(0);
  });

  it('initial_state is present in states', () => {
    const stateNames = Object.keys(WRFC_LOOP_DEFINITION.states);
    expect(stateNames).toContain(WRFC_LOOP_DEFINITION.initial_state);
  });

  it('all terminal_states are in states', () => {
    const stateNames = Object.keys(WRFC_LOOP_DEFINITION.states);
    for (const ts of WRFC_LOOP_DEFINITION.terminal_states) {
      expect(stateNames).toContain(ts);
    }
  });
});

describe('TEST_THEN_FIX_DEFINITION structure', () => {
  it('has valid id and reasonable max_transitions', () => {
    expect(TEST_THEN_FIX_DEFINITION.id).toBe('test_then_fix');
    expect(TEST_THEN_FIX_DEFINITION.max_transitions).toBeLessThanOrEqual(50);
  });

  it('initial_state is IDLE', () => {
    expect(TEST_THEN_FIX_DEFINITION.initial_state).toBe('IDLE');
  });

  it('has both COMPLETE and ESCALATED terminal states', () => {
    expect(TEST_THEN_FIX_DEFINITION.terminal_states).toContain('COMPLETE');
    expect(TEST_THEN_FIX_DEFINITION.terminal_states).toContain('ESCALATED');
  });
});

describe('REVIEW_ONLY_DEFINITION structure', () => {
  it('has valid id and reasonable max_transitions', () => {
    expect(REVIEW_ONLY_DEFINITION.id).toBe('review_only');
    expect(REVIEW_ONLY_DEFINITION.max_transitions).toBeLessThanOrEqual(20);
  });
});

describe('FIX_LOOP_DEFINITION structure', () => {
  it('has valid id', () => {
    expect(FIX_LOOP_DEFINITION.id).toBe('fix_loop');
  });

  it('initial_state is present in states', () => {
    const stateNames = Object.keys(FIX_LOOP_DEFINITION.states);
    expect(stateNames).toContain(FIX_LOOP_DEFINITION.initial_state);
  });
});
