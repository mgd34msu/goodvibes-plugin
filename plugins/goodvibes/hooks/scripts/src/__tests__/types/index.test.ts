/**
 * Tests for types/index.ts
 *
 * Validates that all exports are properly re-exported from the central index file.
 */

import { describe, it, expect } from 'vitest';

import {
  // Error exports
  PHASE_RETRY_LIMITS,
  type ErrorCategory,
  type ErrorState,
  // State exports
  createDefaultState,
  type HooksState,
  type SessionState,
  type TestState,
  type BuildState,
  type GitState,
  type FileState,
  type DevServerState,
  // Config exports
  getDefaultConfig,
  type GoodVibesConfig,
  // Memory exports
  type MemoryDecision,
  type MemoryPattern,
  type MemoryFailure,
  type MemoryPreference,
  type ProjectMemory,
  // Telemetry exports
  type TelemetryEntry,
  type TelemetryTracking,
} from '../../types/index.js';

describe('types/index', () => {
  describe('re-exports from errors.ts', () => {
    it('should export PHASE_RETRY_LIMITS', () => {
      expect(PHASE_RETRY_LIMITS).toBeDefined();
      expect(PHASE_RETRY_LIMITS.typescript_error).toBe(3);
    });

    it('should export ErrorCategory type (via PHASE_RETRY_LIMITS keys)', () => {
      const categories: ErrorCategory[] = Object.keys(
        PHASE_RETRY_LIMITS
      ) as ErrorCategory[];
      expect(categories).toContain('typescript_error');
    });

    it('should export ErrorState type', () => {
      const errorState: ErrorState = {
        signature: 'test',
        category: 'unknown',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };
      expect(errorState.signature).toBe('test');
    });
  });

  describe('re-exports from state.ts', () => {
    it('should export createDefaultState', () => {
      expect(createDefaultState).toBeDefined();
      expect(typeof createDefaultState).toBe('function');

      const state = createDefaultState();
      expect(state.session).toBeDefined();
    });

    it('should export HooksState type', () => {
      const state: HooksState = createDefaultState();
      expect(state).toBeDefined();
    });

    it('should export SessionState type', () => {
      const session: SessionState = {
        id: '',
        startedAt: '',
        mode: 'default',
        featureDescription: null,
      };
      expect(session.mode).toBe('default');
    });

    it('should export TestState type', () => {
      const tests: TestState = {
        lastFullRun: null,
        lastQuickRun: null,
        passingFiles: [],
        failingFiles: [],
        pendingFixes: [],
      };
      expect(tests.passingFiles).toEqual([]);
    });

    it('should export BuildState type', () => {
      const build: BuildState = {
        lastRun: null,
        status: 'unknown',
        errors: [],
        fixAttempts: 0,
      };
      expect(build.status).toBe('unknown');
    });

    it('should export GitState type', () => {
      const git: GitState = {
        mainBranch: 'main',
        currentBranch: 'main',
        featureBranch: null,
        featureStartedAt: null,
        featureDescription: null,
        checkpoints: [],
        pendingMerge: false,
      };
      expect(git.mainBranch).toBe('main');
    });

    it('should export FileState type', () => {
      const files: FileState = {
        modifiedSinceCheckpoint: [],
        modifiedThisSession: [],
        createdThisSession: [],
      };
      expect(files.modifiedThisSession).toEqual([]);
    });

    it('should export DevServerState type', () => {
      const devServers: DevServerState = {};
      expect(devServers).toEqual({});
    });
  });

  describe('re-exports from config.ts', () => {
    it('should export getDefaultConfig', () => {
      expect(getDefaultConfig).toBeDefined();
      expect(typeof getDefaultConfig).toBe('function');

      const config = getDefaultConfig();
      expect(config.automation).toBeDefined();
    });

    it('should export GoodVibesConfig type', () => {
      const config: GoodVibesConfig = getDefaultConfig();
      expect(config.automation.enabled).toBe(true);
    });
  });

  describe('re-exports from memory.ts', () => {
    it('should export MemoryDecision type', () => {
      const decision: MemoryDecision = {
        title: 'Use TypeScript',
        date: '2025-01-01',
        alternatives: ['JavaScript', 'Flow'],
        rationale: 'Type safety',
      };
      expect(decision.title).toBe('Use TypeScript');
    });

    it('should export MemoryPattern type', () => {
      const pattern: MemoryPattern = {
        name: 'Repository Pattern',
        date: '2025-01-01',
        description: 'Abstraction over data access',
      };
      expect(pattern.name).toBe('Repository Pattern');
    });

    it('should export MemoryFailure type', () => {
      const failure: MemoryFailure = {
        approach: 'Global state',
        date: '2025-01-01',
        reason: 'Hard to test',
      };
      expect(failure.approach).toBe('Global state');
    });

    it('should export MemoryPreference type', () => {
      const preference: MemoryPreference = {
        key: 'indentation',
        value: '2 spaces',
        date: '2025-01-01',
      };
      expect(preference.key).toBe('indentation');
    });

    it('should export ProjectMemory type', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
      };
      expect(memory.decisions).toEqual([]);
    });
  });

  describe('re-exports from telemetry.ts', () => {
    it('should export TelemetryEntry type', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: '/path/to/project',
        project_name: 'my-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T00:10:00Z',
        duration_ms: 600000,
        status: 'completed',
        keywords: ['testing', 'coverage'],
        files_modified: ['src/test.ts'],
        tools_used: ['Read', 'Write'],
        summary: 'Added tests',
      };
      expect(entry.event).toBe('subagent_complete');
    });

    it('should export TelemetryTracking type', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: '/path/to/project',
        project_name: 'my-project',
        started_at: '2025-01-01T00:00:00Z',
      };
      expect(tracking.agent_id).toBe('agent-123');
    });
  });
});
