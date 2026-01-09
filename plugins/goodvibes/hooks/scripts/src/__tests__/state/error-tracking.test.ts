/**
 * Tests for error tracking operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { trackError, clearError, getErrorState } from '../../state/error-tracking.js';
import { createDefaultState } from '../../types/state.js';

import type { HooksState } from '../../types/state.js';
import type { ErrorState } from '../../types/errors.js';

describe('error-tracking', () => {
  let state: HooksState;

  beforeEach(() => {
    state = createDefaultState();
  });

  describe('trackError', () => {
    it('adds a new error to the state', () => {
      const signature = 'build-failed-abc123';
      const errorState: ErrorState = {
        count: 1,
        lastSeen: Date.now(),
        errorHash: signature,
      };

      const newState = trackError(state, signature, errorState);

      expect(newState.errors[signature]).toEqual(errorState);
      expect(Object.keys(newState.errors)).toHaveLength(1);
    });

    it('updates an existing error', () => {
      const signature = 'test-failed-xyz';
      const initialError: ErrorState = {
        count: 1,
        lastSeen: 1000,
        errorHash: signature,
      };

      const stateWithError = trackError(state, signature, initialError);

      const updatedError: ErrorState = {
        count: 2,
        lastSeen: 2000,
        errorHash: signature,
      };

      const newState = trackError(stateWithError, signature, updatedError);

      expect(newState.errors[signature]).toEqual(updatedError);
      expect(newState.errors[signature].count).toBe(2);
    });

    it('does not mutate the original state', () => {
      const signature = 'error-1';
      const errorState: ErrorState = {
        count: 1,
        lastSeen: Date.now(),
        errorHash: signature,
      };

      const originalErrors = { ...state.errors };
      trackError(state, signature, errorState);

      expect(state.errors).toEqual(originalErrors);
      expect(Object.keys(state.errors)).toHaveLength(0);
    });

    it('preserves other errors when tracking new one', () => {
      const error1: ErrorState = {
        count: 1,
        lastSeen: 1000,
        errorHash: 'error-1',
      };
      const error2: ErrorState = {
        count: 2,
        lastSeen: 2000,
        errorHash: 'error-2',
      };

      const stateWithError1 = trackError(state, 'error-1', error1);
      const stateWithBoth = trackError(stateWithError1, 'error-2', error2);

      expect(stateWithBoth.errors['error-1']).toEqual(error1);
      expect(stateWithBoth.errors['error-2']).toEqual(error2);
      expect(Object.keys(stateWithBoth.errors)).toHaveLength(2);
    });

    it('preserves other state properties', () => {
      const signature = 'test-error';
      const errorState: ErrorState = {
        count: 1,
        lastSeen: Date.now(),
        errorHash: signature,
      };

      const newState = trackError(state, signature, errorState);

      expect(newState.session).toBe(state.session);
      expect(newState.tests).toBe(state.tests);
      expect(newState.build).toBe(state.build);
      expect(newState.git).toBe(state.git);
      expect(newState.files).toBe(state.files);
    });
  });

  describe('clearError', () => {
    beforeEach(() => {
      const error1: ErrorState = {
        count: 1,
        lastSeen: 1000,
        errorHash: 'error-1',
      };
      const error2: ErrorState = {
        count: 2,
        lastSeen: 2000,
        errorHash: 'error-2',
      };
      state = trackError(state, 'error-1', error1);
      state = trackError(state, 'error-2', error2);
    });

    it('removes an error by signature', () => {
      const newState = clearError(state, 'error-1');

      expect(newState.errors['error-1']).toBeUndefined();
      expect(newState.errors['error-2']).toBeDefined();
    });

    it('preserves other errors', () => {
      const originalError2 = state.errors['error-2'];
      const newState = clearError(state, 'error-1');

      expect(newState.errors['error-2']).toEqual(originalError2);
    });

    it('does not mutate the original state', () => {
      const originalErrors = { ...state.errors };
      clearError(state, 'error-1');

      expect(state.errors).toEqual(originalErrors);
      expect(state.errors['error-1']).toBeDefined();
    });

    it('handles removing non-existent error gracefully', () => {
      const newState = clearError(state, 'non-existent');

      expect(Object.keys(newState.errors)).toHaveLength(2);
      expect(newState.errors['error-1']).toBeDefined();
      expect(newState.errors['error-2']).toBeDefined();
    });

    it('can clear all errors sequentially', () => {
      let newState = clearError(state, 'error-1');
      newState = clearError(newState, 'error-2');

      expect(Object.keys(newState.errors)).toHaveLength(0);
    });

    it('preserves other state properties', () => {
      const newState = clearError(state, 'error-1');

      expect(newState.session).toBe(state.session);
      expect(newState.tests).toBe(state.tests);
      expect(newState.build).toBe(state.build);
      expect(newState.git).toBe(state.git);
      expect(newState.files).toBe(state.files);
    });
  });

  describe('getErrorState', () => {
    beforeEach(() => {
      const error1: ErrorState = {
        count: 3,
        lastSeen: 1234567890,
        errorHash: 'error-1',
      };
      state = trackError(state, 'error-1', error1);
    });

    it('retrieves an existing error state', () => {
      const errorState = getErrorState(state, 'error-1');

      expect(errorState).toBeDefined();
      expect(errorState?.count).toBe(3);
      expect(errorState?.lastSeen).toBe(1234567890);
      expect(errorState?.errorHash).toBe('error-1');
    });

    it('returns undefined for non-existent error', () => {
      const errorState = getErrorState(state, 'non-existent');

      expect(errorState).toBeUndefined();
    });

    it('returns undefined for empty errors object', () => {
      const emptyState = createDefaultState();
      const errorState = getErrorState(emptyState, 'any-error');

      expect(errorState).toBeUndefined();
    });

    it('does not mutate state when retrieving', () => {
      const originalErrors = { ...state.errors };
      getErrorState(state, 'error-1');

      expect(state.errors).toEqual(originalErrors);
    });
  });

  describe('integration scenarios', () => {
    it('tracks error retry attempts', () => {
      const signature = 'persistent-error';

      let newState = state;
      for (let i = 1; i <= 5; i++) {
        const errorState: ErrorState = {
          count: i,
          lastSeen: Date.now(),
          errorHash: signature,
        };
        newState = trackError(newState, signature, errorState);
      }

      const finalError = getErrorState(newState, signature);
      expect(finalError?.count).toBe(5);
    });

    it('handles error resolution workflow', () => {
      const signature = 'build-error';
      const errorState: ErrorState = {
        count: 1,
        lastSeen: Date.now(),
        errorHash: signature,
      };

      let newState = trackError(state, signature, errorState);
      expect(getErrorState(newState, signature)).toBeDefined();

      newState = clearError(newState, signature);
      expect(getErrorState(newState, signature)).toBeUndefined();
    });

    it('manages multiple concurrent errors', () => {
      const errors = ['build-1', 'test-1', 'lint-1'];
      let newState = state;

      errors.forEach((sig, idx) => {
        const errorState: ErrorState = {
          count: idx + 1,
          lastSeen: Date.now(),
          errorHash: sig,
        };
        newState = trackError(newState, sig, errorState);
      });

      expect(Object.keys(newState.errors)).toHaveLength(3);

      newState = clearError(newState, 'test-1');
      expect(Object.keys(newState.errors)).toHaveLength(2);
      expect(getErrorState(newState, 'build-1')).toBeDefined();
      expect(getErrorState(newState, 'lint-1')).toBeDefined();
    });
  });
});
