/**
 * Tests for state updater functions
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  updateSessionState,
  updateTestState,
  updateBuildState,
  updateGitState,
} from '../../state/updaters.js';
import { createDefaultState } from '../../types/state.js';

import type { HooksState } from '../../types/state.js';

describe('updaters', () => {
  let state: HooksState;

  beforeEach(() => {
    state = createDefaultState();
  });

  describe('updateSessionState', () => {
    it('updates session id', () => {
      const newState = updateSessionState(state, { id: 'new-session-id' });

      expect(newState.session.id).toBe('new-session-id');
    });

    it('updates session startedAt', () => {
      const timestamp = '2024-01-04T12:00:00Z';
      const newState = updateSessionState(state, { startedAt: timestamp });

      expect(newState.session.startedAt).toBe(timestamp);
    });

    it('updates session mode', () => {
      const newState = updateSessionState(state, { mode: 'vibecoding' });

      expect(newState.session.mode).toBe('vibecoding');
    });

    it('updates session featureDescription', () => {
      const description = 'Add user authentication';
      const newState = updateSessionState(state, { featureDescription: description });

      expect(newState.session.featureDescription).toBe(description);
    });

    it('updates multiple session properties at once', () => {
      const newState = updateSessionState(state, {
        id: 'multi-session',
        mode: 'justvibes',
        featureDescription: 'Test feature',
      });

      expect(newState.session.id).toBe('multi-session');
      expect(newState.session.mode).toBe('justvibes');
      expect(newState.session.featureDescription).toBe('Test feature');
    });

    it('preserves unmodified session properties', () => {
      state.session.id = 'existing-id';
      state.session.mode = 'vibecoding';

      const newState = updateSessionState(state, { featureDescription: 'New feature' });

      expect(newState.session.id).toBe('existing-id');
      expect(newState.session.mode).toBe('vibecoding');
    });

    it('does not mutate the original state', () => {
      const originalId = state.session.id;
      updateSessionState(state, { id: 'new-id' });

      expect(state.session.id).toBe(originalId);
    });

    it('preserves other state properties', () => {
      const newState = updateSessionState(state, { id: 'new-id' });

      expect(newState.tests).toBe(state.tests);
      expect(newState.build).toBe(state.build);
      expect(newState.git).toBe(state.git);
      expect(newState.files).toBe(state.files);
      expect(newState.errors).toBe(state.errors);
    });
  });

  describe('updateTestState', () => {
    it('updates lastFullRun', () => {
      const timestamp = '2024-01-04T12:00:00Z';
      const newState = updateTestState(state, { lastFullRun: timestamp });

      expect(newState.tests.lastFullRun).toBe(timestamp);
    });

    it('updates lastQuickRun', () => {
      const timestamp = '2024-01-04T12:05:00Z';
      const newState = updateTestState(state, { lastQuickRun: timestamp });

      expect(newState.tests.lastQuickRun).toBe(timestamp);
    });

    it('updates passingFiles', () => {
      const files = ['test1.test.ts', 'test2.test.ts'];
      const newState = updateTestState(state, { passingFiles: files });

      expect(newState.tests.passingFiles).toEqual(files);
    });

    it('updates failingFiles', () => {
      const files = ['failing.test.ts'];
      const newState = updateTestState(state, { failingFiles: files });

      expect(newState.tests.failingFiles).toEqual(files);
    });

    it('updates pendingFixes', () => {
      const fixes = [
        {
          testFile: 'test.test.ts',
          error: 'Assertion failed',
          fixAttempts: 1,
        },
      ];
      const newState = updateTestState(state, { pendingFixes: fixes });

      expect(newState.tests.pendingFixes).toEqual(fixes);
    });

    it('updates multiple test properties at once', () => {
      const newState = updateTestState(state, {
        lastFullRun: '2024-01-04T12:00:00Z',
        passingFiles: ['test1.test.ts'],
        failingFiles: ['test2.test.ts'],
      });

      expect(newState.tests.lastFullRun).toBe('2024-01-04T12:00:00Z');
      expect(newState.tests.passingFiles).toEqual(['test1.test.ts']);
      expect(newState.tests.failingFiles).toEqual(['test2.test.ts']);
    });

    it('preserves unmodified test properties', () => {
      state.tests.passingFiles = ['existing.test.ts'];

      const newState = updateTestState(state, { lastFullRun: '2024-01-04T12:00:00Z' });

      expect(newState.tests.passingFiles).toEqual(['existing.test.ts']);
    });

    it('does not mutate the original state', () => {
      const originalPassingFiles = [...state.tests.passingFiles];
      updateTestState(state, { passingFiles: ['new.test.ts'] });

      expect(state.tests.passingFiles).toEqual(originalPassingFiles);
    });

    it('preserves other state properties', () => {
      const newState = updateTestState(state, { lastFullRun: '2024-01-04T12:00:00Z' });

      expect(newState.session).toBe(state.session);
      expect(newState.build).toBe(state.build);
      expect(newState.git).toBe(state.git);
      expect(newState.files).toBe(state.files);
      expect(newState.errors).toBe(state.errors);
    });
  });

  describe('updateBuildState', () => {
    it('updates lastRun', () => {
      const timestamp = '2024-01-04T12:00:00Z';
      const newState = updateBuildState(state, { lastRun: timestamp });

      expect(newState.build.lastRun).toBe(timestamp);
    });

    it('updates status', () => {
      const newState = updateBuildState(state, { status: 'passing' });

      expect(newState.build.status).toBe('passing');
    });

    it('updates errors', () => {
      const errors = [
        {
          file: 'src/index.ts',
          line: 10,
          message: 'Type error',
        },
      ];
      const newState = updateBuildState(state, { errors });

      expect(newState.build.errors).toEqual(errors);
    });

    it('updates fixAttempts', () => {
      const newState = updateBuildState(state, { fixAttempts: 3 });

      expect(newState.build.fixAttempts).toBe(3);
    });

    it('updates multiple build properties at once', () => {
      const newState = updateBuildState(state, {
        lastRun: '2024-01-04T12:00:00Z',
        status: 'failing',
        fixAttempts: 2,
      });

      expect(newState.build.lastRun).toBe('2024-01-04T12:00:00Z');
      expect(newState.build.status).toBe('failing');
      expect(newState.build.fixAttempts).toBe(2);
    });

    it('preserves unmodified build properties', () => {
      state.build.status = 'passing';
      state.build.fixAttempts = 5;

      const newState = updateBuildState(state, { lastRun: '2024-01-04T12:00:00Z' });

      expect(newState.build.status).toBe('passing');
      expect(newState.build.fixAttempts).toBe(5);
    });

    it('does not mutate the original state', () => {
      const originalStatus = state.build.status;
      updateBuildState(state, { status: 'passing' });

      expect(state.build.status).toBe(originalStatus);
    });

    it('preserves other state properties', () => {
      const newState = updateBuildState(state, { status: 'passing' });

      expect(newState.session).toBe(state.session);
      expect(newState.tests).toBe(state.tests);
      expect(newState.git).toBe(state.git);
      expect(newState.files).toBe(state.files);
      expect(newState.errors).toBe(state.errors);
    });
  });

  describe('updateGitState', () => {
    it('updates mainBranch', () => {
      const newState = updateGitState(state, { mainBranch: 'master' });

      expect(newState.git.mainBranch).toBe('master');
    });

    it('updates currentBranch', () => {
      const newState = updateGitState(state, { currentBranch: 'feature/test' });

      expect(newState.git.currentBranch).toBe('feature/test');
    });

    it('updates featureBranch', () => {
      const newState = updateGitState(state, { featureBranch: 'feature/auth' });

      expect(newState.git.featureBranch).toBe('feature/auth');
    });

    it('updates featureStartedAt', () => {
      const timestamp = '2024-01-04T12:00:00Z';
      const newState = updateGitState(state, { featureStartedAt: timestamp });

      expect(newState.git.featureStartedAt).toBe(timestamp);
    });

    it('updates featureDescription', () => {
      const description = 'Add authentication';
      const newState = updateGitState(state, { featureDescription: description });

      expect(newState.git.featureDescription).toBe(description);
    });

    it('updates checkpoints', () => {
      const checkpoints = [
        {
          hash: 'abc123',
          message: 'Checkpoint 1',
          timestamp: '2024-01-04T12:00:00Z',
        },
      ];
      const newState = updateGitState(state, { checkpoints });

      expect(newState.git.checkpoints).toEqual(checkpoints);
    });

    it('updates pendingMerge', () => {
      const newState = updateGitState(state, { pendingMerge: true });

      expect(newState.git.pendingMerge).toBe(true);
    });

    it('updates multiple git properties at once', () => {
      const newState = updateGitState(state, {
        currentBranch: 'feature/test',
        featureBranch: 'feature/test',
        featureDescription: 'Testing feature',
      });

      expect(newState.git.currentBranch).toBe('feature/test');
      expect(newState.git.featureBranch).toBe('feature/test');
      expect(newState.git.featureDescription).toBe('Testing feature');
    });

    it('preserves unmodified git properties', () => {
      state.git.mainBranch = 'main';
      state.git.currentBranch = 'develop';

      const newState = updateGitState(state, { featureBranch: 'feature/new' });

      expect(newState.git.mainBranch).toBe('main');
      expect(newState.git.currentBranch).toBe('develop');
    });

    it('does not mutate the original state', () => {
      const originalBranch = state.git.currentBranch;
      updateGitState(state, { currentBranch: 'new-branch' });

      expect(state.git.currentBranch).toBe(originalBranch);
    });

    it('preserves other state properties', () => {
      const newState = updateGitState(state, { currentBranch: 'new-branch' });

      expect(newState.session).toBe(state.session);
      expect(newState.tests).toBe(state.tests);
      expect(newState.build).toBe(state.build);
      expect(newState.files).toBe(state.files);
      expect(newState.errors).toBe(state.errors);
    });
  });

  describe('integration scenarios', () => {
    it('chains multiple updates', () => {
      let newState = state;
      newState = updateSessionState(newState, { id: 'new-session' });
      newState = updateTestState(newState, { passingFiles: ['test.test.ts'] });
      newState = updateBuildState(newState, { status: 'passing' });
      newState = updateGitState(newState, { currentBranch: 'feature/test' });

      expect(newState.session.id).toBe('new-session');
      expect(newState.tests.passingFiles).toEqual(['test.test.ts']);
      expect(newState.build.status).toBe('passing');
      expect(newState.git.currentBranch).toBe('feature/test');
    });

    it('handles partial updates without losing data', () => {
      state.tests.passingFiles = ['test1.test.ts', 'test2.test.ts'];
      state.tests.failingFiles = ['test3.test.ts'];

      const newState = updateTestState(state, { lastFullRun: '2024-01-04T12:00:00Z' });

      expect(newState.tests.passingFiles).toEqual(['test1.test.ts', 'test2.test.ts']);
      expect(newState.tests.failingFiles).toEqual(['test3.test.ts']);
      expect(newState.tests.lastFullRun).toBe('2024-01-04T12:00:00Z');
    });

    it('maintains immutability across multiple updates', () => {
      const originalState = { ...state };

      updateSessionState(state, { id: 'new-id' });
      updateTestState(state, { passingFiles: ['test.test.ts'] });
      updateBuildState(state, { status: 'passing' });
      updateGitState(state, { currentBranch: 'new-branch' });

      expect(state.session.id).toBe(originalState.session.id);
      expect(state.tests.passingFiles).toEqual(originalState.tests.passingFiles);
      expect(state.build.status).toBe(originalState.build.status);
      expect(state.git.currentBranch).toBe(originalState.git.currentBranch);
    });
  });
});
