/**
 * Tests for session management operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { initializeSession, resetForNewSession } from '../../state/session.js';
import { createDefaultState } from '../../types/state.js';

import type { ErrorState } from '../../types/errors.js';
import type { HooksState } from '../../types/state.js';

describe('session', () => {
  let state: HooksState;

  beforeEach(() => {
    vi.useFakeTimers();
    state = createDefaultState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initializeSession', () => {
    it('sets the session id', () => {
      const sessionId = 'session-2024-01-04-abc123';
      const newState = initializeSession(state, sessionId);

      expect(newState.session.id).toBe(sessionId);
    });

    it('sets the session startedAt timestamp', () => {
      const now = new Date('2024-01-04T12:00:00Z');
      vi.setSystemTime(now);

      const newState = initializeSession(state, 'test-session');

      expect(newState.session.startedAt).toBe('2024-01-04T12:00:00.000Z');
    });

    it('clears modifiedThisSession array', () => {
      state.files.modifiedThisSession = ['file1.ts', 'file2.ts'];

      const newState = initializeSession(state, 'new-session');

      expect(newState.files.modifiedThisSession).toEqual([]);
    });

    it('clears createdThisSession array', () => {
      state.files.createdThisSession = ['new-file.ts'];

      const newState = initializeSession(state, 'new-session');

      expect(newState.files.createdThisSession).toEqual([]);
    });

    it('preserves other session properties', () => {
      state.session.mode = 'vibecoding';
      state.session.featureDescription = 'Test feature';

      const newState = initializeSession(state, 'new-session');

      expect(newState.session.mode).toBe('vibecoding');
      expect(newState.session.featureDescription).toBe('Test feature');
    });

    it('preserves other file tracking properties', () => {
      state.files.modifiedSinceCheckpoint = ['file1.ts'];

      const newState = initializeSession(state, 'new-session');

      expect(newState.files.modifiedSinceCheckpoint).toEqual(['file1.ts']);
    });

    it('does not mutate the original state', () => {
      const originalId = state.session.id;
      const originalStartedAt = state.session.startedAt;
      const originalModified = [...state.files.modifiedThisSession];
      const originalCreated = [...state.files.createdThisSession];

      initializeSession(state, 'new-session');

      expect(state.session.id).toBe(originalId);
      expect(state.session.startedAt).toBe(originalStartedAt);
      expect(state.files.modifiedThisSession).toEqual(originalModified);
      expect(state.files.createdThisSession).toEqual(originalCreated);
    });

    it('preserves other state properties', () => {
      const newState = initializeSession(state, 'new-session');

      expect(newState.tests).toBe(state.tests);
      expect(newState.build).toBe(state.build);
      expect(newState.git).toBe(state.git);
      expect(newState.errors).toBe(state.errors);
      expect(newState.devServers).toBe(state.devServers);
    });

    it('handles empty session id', () => {
      const newState = initializeSession(state, '');

      expect(newState.session.id).toBe('');
    });

    it('handles long session id', () => {
      const longId = 'session-' + 'x'.repeat(100);
      const newState = initializeSession(state, longId);

      expect(newState.session.id).toBe(longId);
    });
  });

  describe('resetForNewSession', () => {
    beforeEach(() => {
      state.session.id = 'old-session';
      state.session.mode = 'vibecoding';
      state.tests.passingFiles = ['test1.test.ts'];
      state.build.status = 'passing';
      state.files.modifiedThisSession = ['file1.ts', 'file2.ts'];
    });

    it('creates a default state with fresh values', () => {
      const newState = resetForNewSession(state);

      expect(newState.session.id).toBe('');
      expect(newState.session.mode).toBe('default');
      expect(newState.tests.passingFiles).toEqual([]);
      expect(newState.build.status).toBe('unknown');
      expect(newState.files.modifiedThisSession).toEqual([]);
    });

    it('preserves git state', () => {
      state.git.currentBranch = 'feature/test';
      state.git.mainBranch = 'main';
      state.git.featureBranch = 'feature/test';
      state.git.checkpoints = [
        {
          hash: 'abc123',
          message: 'Checkpoint',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      const newState = resetForNewSession(state);

      expect(newState.git.currentBranch).toBe('feature/test');
      expect(newState.git.mainBranch).toBe('main');
      expect(newState.git.featureBranch).toBe('feature/test');
      expect(newState.git.checkpoints).toEqual(state.git.checkpoints);
    });

    it('preserves error tracking state', () => {
      const error1: ErrorState = {
        count: 3,
        lastSeen: 123456,
        errorHash: 'error-1',
      };
      state.errors = { 'error-1': error1 };

      const newState = resetForNewSession(state);

      expect(newState.errors).toEqual(state.errors);
    });

    it('does not mutate the original state', () => {
      const originalSession = { ...state.session };
      const originalTests = { ...state.tests };

      resetForNewSession(state);

      expect(state.session).toEqual(originalSession);
      expect(state.tests).toEqual(originalTests);
    });

    it('resets test state', () => {
      state.tests.lastFullRun = '2024-01-01T00:00:00Z';
      state.tests.passingFiles = ['test1.test.ts'];
      state.tests.failingFiles = ['test2.test.ts'];
      state.tests.pendingFixes = [
        {
          testFile: 'test2.test.ts',
          error: 'Test failed',
          fixAttempts: 2,
        },
      ];

      const newState = resetForNewSession(state);

      expect(newState.tests.lastFullRun).toBeNull();
      expect(newState.tests.passingFiles).toEqual([]);
      expect(newState.tests.failingFiles).toEqual([]);
      expect(newState.tests.pendingFixes).toEqual([]);
    });

    it('resets build state', () => {
      state.build.lastRun = '2024-01-01T00:00:00Z';
      state.build.status = 'failing';
      state.build.errors = [
        {
          file: 'src/index.ts',
          line: 10,
          message: 'Type error',
        },
      ];
      state.build.fixAttempts = 3;

      const newState = resetForNewSession(state);

      expect(newState.build.lastRun).toBeNull();
      expect(newState.build.status).toBe('unknown');
      expect(newState.build.errors).toEqual([]);
      expect(newState.build.fixAttempts).toBe(0);
    });

    it('resets file tracking state', () => {
      state.files.modifiedThisSession = ['file1.ts', 'file2.ts'];
      state.files.createdThisSession = ['file3.ts'];
      state.files.modifiedSinceCheckpoint = ['file1.ts'];

      const newState = resetForNewSession(state);

      expect(newState.files.modifiedThisSession).toEqual([]);
      expect(newState.files.createdThisSession).toEqual([]);
      expect(newState.files.modifiedSinceCheckpoint).toEqual([]);
    });

    it('resets dev servers state', () => {
      state.devServers = {
        '1234': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2024-01-01T00:00:00Z',
          lastError: null,
        },
      };

      const newState = resetForNewSession(state);

      expect(newState.devServers).toEqual({});
    });

    it('sets new timestamp for default state', () => {
      const now = new Date('2024-01-04T12:00:00Z');
      vi.setSystemTime(now);

      const newState = resetForNewSession(state);

      expect(newState.session.startedAt).toBe('2024-01-04T12:00:00.000Z');
    });
  });

  describe('integration scenarios', () => {
    it('handles session transition workflow', () => {
      state.session.id = 'old-session';
      state.git.currentBranch = 'feature/test';
      state.files.modifiedThisSession = ['file1.ts'];

      const resetState = resetForNewSession(state);
      const newState = initializeSession(resetState, 'new-session');

      expect(newState.session.id).toBe('new-session');
      expect(newState.git.currentBranch).toBe('feature/test');
      expect(newState.files.modifiedThisSession).toEqual([]);
    });

    it('preserves git state across multiple resets', () => {
      state.git.currentBranch = 'feature/important';
      state.git.checkpoints = [
        {
          hash: 'abc',
          message: 'Checkpoint 1',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      let newState = resetForNewSession(state);
      newState = resetForNewSession(newState);

      expect(newState.git.currentBranch).toBe('feature/important');
      expect(newState.git.checkpoints).toHaveLength(1);
    });

    it('preserves errors across session reset', () => {
      const error1: ErrorState = {
        count: 5,
        lastSeen: Date.now(),
        errorHash: 'persistent-error',
      };
      state.errors = { 'persistent-error': error1 };

      const newState = resetForNewSession(state);

      expect(newState.errors['persistent-error']).toEqual(error1);
    });
  });
});
