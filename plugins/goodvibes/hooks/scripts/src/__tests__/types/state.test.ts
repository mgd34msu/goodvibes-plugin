/**
 * Tests for types/state.ts
 *
 * Tests cover:
 * - createDefaultState function
 * - All state interface structures
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createDefaultState,
  type HooksState,
  type SessionState,
  type TestState,
  type BuildState,
  type GitState,
  type FileState,
  type DevServerState,
} from '../../types/state.js';

describe('types/state', () => {
  describe('createDefaultState', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return a valid HooksState object', () => {
      const state = createDefaultState();

      expect(state).toBeDefined();
      expect(state.session).toBeDefined();
      expect(state.errors).toBeDefined();
      expect(state.tests).toBeDefined();
      expect(state.build).toBeDefined();
      expect(state.git).toBeDefined();
      expect(state.files).toBeDefined();
      expect(state.devServers).toBeDefined();
    });

    it('should return a new object each time (no shared state)', () => {
      const state1 = createDefaultState();
      const state2 = createDefaultState();

      expect(state1).not.toBe(state2);
      expect(state1.session).not.toBe(state2.session);
      expect(state1.tests).not.toBe(state2.tests);
      expect(state1.build).not.toBe(state2.build);
      expect(state1.git).not.toBe(state2.git);
      expect(state1.files).not.toBe(state2.files);
    });

    describe('session defaults', () => {
      it('should have empty session id', () => {
        const state = createDefaultState();
        expect(state.session.id).toBe('');
      });

      it('should set startedAt to current timestamp', () => {
        const state = createDefaultState();
        expect(state.session.startedAt).toBe('2025-06-15T12:00:00.000Z');
      });

      it('should default mode to default', () => {
        const state = createDefaultState();
        expect(state.session.mode).toBe('default');
      });

      it('should have null featureDescription', () => {
        const state = createDefaultState();
        expect(state.session.featureDescription).toBeNull();
      });
    });

    describe('errors defaults', () => {
      it('should have empty errors record', () => {
        const state = createDefaultState();
        expect(state.errors).toEqual({});
        expect(Object.keys(state.errors)).toHaveLength(0);
      });
    });

    describe('tests defaults', () => {
      it('should have null lastFullRun', () => {
        const state = createDefaultState();
        expect(state.tests.lastFullRun).toBeNull();
      });

      it('should have null lastQuickRun', () => {
        const state = createDefaultState();
        expect(state.tests.lastQuickRun).toBeNull();
      });

      it('should have empty passingFiles array', () => {
        const state = createDefaultState();
        expect(state.tests.passingFiles).toEqual([]);
      });

      it('should have empty failingFiles array', () => {
        const state = createDefaultState();
        expect(state.tests.failingFiles).toEqual([]);
      });

      it('should have empty pendingFixes array', () => {
        const state = createDefaultState();
        expect(state.tests.pendingFixes).toEqual([]);
      });
    });

    describe('build defaults', () => {
      it('should have null lastRun', () => {
        const state = createDefaultState();
        expect(state.build.lastRun).toBeNull();
      });

      it('should have unknown status', () => {
        const state = createDefaultState();
        expect(state.build.status).toBe('unknown');
      });

      it('should have empty errors array', () => {
        const state = createDefaultState();
        expect(state.build.errors).toEqual([]);
      });

      it('should have zero fixAttempts', () => {
        const state = createDefaultState();
        expect(state.build.fixAttempts).toBe(0);
      });
    });

    describe('git defaults', () => {
      it('should default mainBranch to main', () => {
        const state = createDefaultState();
        expect(state.git.mainBranch).toBe('main');
      });

      it('should default currentBranch to main', () => {
        const state = createDefaultState();
        expect(state.git.currentBranch).toBe('main');
      });

      it('should have null featureBranch', () => {
        const state = createDefaultState();
        expect(state.git.featureBranch).toBeNull();
      });

      it('should have null featureStartedAt', () => {
        const state = createDefaultState();
        expect(state.git.featureStartedAt).toBeNull();
      });

      it('should have null featureDescription', () => {
        const state = createDefaultState();
        expect(state.git.featureDescription).toBeNull();
      });

      it('should have empty checkpoints array', () => {
        const state = createDefaultState();
        expect(state.git.checkpoints).toEqual([]);
      });

      it('should have false pendingMerge', () => {
        const state = createDefaultState();
        expect(state.git.pendingMerge).toBe(false);
      });
    });

    describe('files defaults', () => {
      it('should have empty modifiedSinceCheckpoint array', () => {
        const state = createDefaultState();
        expect(state.files.modifiedSinceCheckpoint).toEqual([]);
      });

      it('should have empty modifiedThisSession array', () => {
        const state = createDefaultState();
        expect(state.files.modifiedThisSession).toEqual([]);
      });

      it('should have empty createdThisSession array', () => {
        const state = createDefaultState();
        expect(state.files.createdThisSession).toEqual([]);
      });
    });

    describe('devServers defaults', () => {
      it('should have empty devServers object', () => {
        const state = createDefaultState();
        expect(state.devServers).toEqual({});
        expect(Object.keys(state.devServers)).toHaveLength(0);
      });
    });

    it('should satisfy HooksState type', () => {
      const state: HooksState = createDefaultState();

      // Type assertion - if this compiles, the type is satisfied
      expect(state).toBeDefined();
    });
  });

  describe('type structure validation', () => {
    it('SessionState should accept valid values', () => {
      const session: SessionState = {
        id: 'session-123',
        startedAt: '2025-01-01T00:00:00Z',
        mode: 'vibecoding',
        featureDescription: 'Building a new feature',
      };

      expect(session.mode).toBe('vibecoding');
    });

    it('SessionState should accept justvibes mode', () => {
      const session: SessionState = {
        id: 'session-456',
        startedAt: '2025-01-01T00:00:00Z',
        mode: 'justvibes',
        featureDescription: null,
      };

      expect(session.mode).toBe('justvibes');
    });

    it('TestState should accept pending fixes', () => {
      const tests: TestState = {
        lastFullRun: '2025-01-01T00:00:00Z',
        lastQuickRun: '2025-01-01T01:00:00Z',
        passingFiles: ['test1.ts', 'test2.ts'],
        failingFiles: ['test3.ts'],
        pendingFixes: [
          {
            testFile: 'test3.ts',
            error: 'Expected 1 but got 2',
            fixAttempts: 2,
          },
        ],
      };

      expect(tests.pendingFixes).toHaveLength(1);
      expect(tests.pendingFixes[0].fixAttempts).toBe(2);
    });

    it('BuildState should accept build errors', () => {
      const build: BuildState = {
        lastRun: '2025-01-01T00:00:00Z',
        status: 'failing',
        errors: [
          {
            file: 'src/component.ts',
            line: 42,
            message: "Type 'string' is not assignable to type 'number'",
          },
        ],
        fixAttempts: 1,
      };

      expect(build.status).toBe('failing');
      expect(build.errors).toHaveLength(1);
    });

    it('BuildState should accept passing status', () => {
      const build: BuildState = {
        lastRun: '2025-01-01T00:00:00Z',
        status: 'passing',
        errors: [],
        fixAttempts: 0,
      };

      expect(build.status).toBe('passing');
    });

    it('GitState should accept checkpoints', () => {
      const git: GitState = {
        mainBranch: 'main',
        currentBranch: 'feature/test',
        featureBranch: 'feature/test',
        featureStartedAt: '2025-01-01T00:00:00Z',
        featureDescription: 'Test feature',
        checkpoints: [
          {
            hash: 'abc1234',
            message: 'checkpoint: initial work',
            timestamp: '2025-01-01T01:00:00Z',
          },
          {
            hash: 'def5678',
            message: 'checkpoint: more progress',
            timestamp: '2025-01-01T02:00:00Z',
          },
        ],
        pendingMerge: false,
      };

      expect(git.checkpoints).toHaveLength(2);
      expect(git.featureBranch).toBe('feature/test');
    });

    it('GitState should accept pending merge', () => {
      const git: GitState = {
        mainBranch: 'main',
        currentBranch: 'main',
        featureBranch: null,
        featureStartedAt: null,
        featureDescription: null,
        checkpoints: [],
        pendingMerge: true,
      };

      expect(git.pendingMerge).toBe(true);
    });

    it('FileState should track modifications', () => {
      const files: FileState = {
        modifiedSinceCheckpoint: ['file1.ts', 'file2.ts'],
        modifiedThisSession: ['file1.ts', 'file2.ts', 'file3.ts'],
        createdThisSession: ['file3.ts'],
      };

      expect(files.modifiedSinceCheckpoint).toHaveLength(2);
      expect(files.modifiedThisSession).toHaveLength(3);
      expect(files.createdThisSession).toHaveLength(1);
    });

    it('DevServerState should track running servers', () => {
      const devServers: DevServerState = {
        '12345': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
        '67890': {
          command: 'npm run storybook',
          port: 6006,
          startedAt: '2025-01-01T00:05:00Z',
          lastError: 'Port already in use',
        },
      };

      expect(Object.keys(devServers)).toHaveLength(2);
      expect(devServers['12345'].port).toBe(3000);
      expect(devServers['67890'].lastError).toBe('Port already in use');
    });
  });
});
