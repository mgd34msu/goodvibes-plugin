/**
 * Unit tests for file-automation module
 *
 * Tests cover:
 * - handleFileModification for Edit tools
 * - handleFileModification for Write tools
 * - handleFileModification with missing file_path
 * - processFileAutomation full workflow
 * - processFileAutomation with all automation branches
 * - processFileAutomation edge cases
 * - Re-exported functions from automation-runners
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HooksState } from '../../types/state.js';
import type { GoodVibesConfig } from '../../types/config.js';
import type { HookInput } from '../../shared/index.js';
import {
  handleFileModification,
  processFileAutomation,
  maybeRunTests,
  maybeRunBuild,
  maybeCreateCheckpoint,
  maybeCreateBranch,
} from '../../post-tool-use/file-automation.js';

// Mock all external dependencies
vi.mock('../../shared/index.js', () => ({
  debug: vi.fn(),
}));

vi.mock('../../post-tool-use/file-tracker.js', () => ({
  trackFileModification: vi.fn((state: HooksState, filePath: string) => ({
    ...state,
    files: {
      ...state.files,
      modifiedThisSession: [...state.files.modifiedThisSession, filePath],
      modifiedSinceCheckpoint: [...state.files.modifiedSinceCheckpoint, filePath],
    },
  })),
  trackFileCreation: vi.fn((state: HooksState, filePath: string) => ({
    ...state,
    files: {
      ...state.files,
      createdThisSession: [...state.files.createdThisSession, filePath],
      modifiedThisSession: [...state.files.modifiedThisSession, filePath],
      modifiedSinceCheckpoint: [...state.files.modifiedSinceCheckpoint, filePath],
    },
  })),
}));

vi.mock('../../post-tool-use/automation-runners.js', () => ({
  maybeRunTests: vi.fn(),
  maybeRunBuild: vi.fn(),
  maybeCreateCheckpoint: vi.fn(),
  maybeCreateBranch: vi.fn(),
}));

describe('file-automation', () => {
  let mockState: HooksState;
  let mockConfig: GoodVibesConfig;
  let mockInput: HookInput;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      session: {
        id: 'test-session',
        startedAt: '2025-01-01T00:00:00Z',
        mode: 'default',
        featureDescription: null,
      },
      errors: {},
      tests: {
        lastFullRun: null,
        lastQuickRun: null,
        passingFiles: [],
        failingFiles: [],
        pendingFixes: [],
      },
      build: {
        lastRun: null,
        status: 'unknown',
        errors: [],
        fixAttempts: 0,
      },
      git: {
        mainBranch: 'main',
        currentBranch: 'main',
        featureBranch: null,
        featureStartedAt: null,
        featureDescription: null,
        checkpoints: [],
        pendingMerge: false,
      },
      files: {
        modifiedSinceCheckpoint: [],
        modifiedThisSession: [],
        createdThisSession: [],
      },
      devServers: {},
    };

    mockConfig = {
      automation: {
        enabled: true,
        mode: 'default',
        testing: {
          runAfterFileChange: true,
          runBeforeCommit: true,
          runBeforeMerge: true,
          testCommand: 'npm test',
          maxRetries: 3,
        },
        building: {
          runAfterFileThreshold: 5,
          runBeforeCommit: true,
          runBeforeMerge: true,
          buildCommand: 'npm run build',
          typecheckCommand: 'npx tsc --noEmit',
          maxRetries: 3,
        },
        git: {
          autoFeatureBranch: true,
          autoCheckpoint: true,
          autoMerge: true,
          checkpointThreshold: 5,
          mainBranch: 'main',
        },
        recovery: {
          maxRetriesPerError: 3,
          logFailures: true,
          skipAfterMaxRetries: true,
        },
      },
    };

    mockInput = {
      session_id: 'test-session',
      transcript_path: '/path/to/transcript',
      cwd: '/project',
      permission_mode: 'auto',
      hook_event_name: 'post-tool-use',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/project/src/utils.ts',
      },
    };
  });

  describe('handleFileModification', () => {
    it('should track file modification for Edit tool', () => {
      const result = handleFileModification(mockState, mockInput, 'Edit');

      expect(result.tracked).toBe(true);
      expect(result.filePath).toBe('/project/src/utils.ts');
      expect(result.state.files.modifiedThisSession).toContain('/project/src/utils.ts');
      expect(result.state.files.modifiedSinceCheckpoint).toContain('/project/src/utils.ts');
    });

    it('should track file creation for Write tool', () => {
      const writeInput = {
        ...mockInput,
        tool_name: 'Write',
      };

      const result = handleFileModification(mockState, writeInput, 'Write');

      expect(result.tracked).toBe(true);
      expect(result.filePath).toBe('/project/src/utils.ts');
      expect(result.state.files.createdThisSession).toContain('/project/src/utils.ts');
      expect(result.state.files.modifiedThisSession).toContain('/project/src/utils.ts');
      expect(result.state.files.modifiedSinceCheckpoint).toContain('/project/src/utils.ts');
    });

    it('should return tracked=false when file_path is missing', () => {
      const inputNoPath = {
        ...mockInput,
        tool_input: {},
      };

      const result = handleFileModification(mockState, inputNoPath, 'Edit');

      expect(result.tracked).toBe(false);
      expect(result.filePath).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should return tracked=false when tool_input is undefined', () => {
      const inputNoToolInput = {
        ...mockInput,
        tool_input: undefined,
      };

      const result = handleFileModification(mockState, inputNoToolInput, 'Edit');

      expect(result.tracked).toBe(false);
      expect(result.filePath).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should handle file_path as undefined in tool_input', () => {
      const inputUndefinedPath = {
        ...mockInput,
        tool_input: {
          file_path: undefined,
        },
      };

      const result = handleFileModification(mockState, inputUndefinedPath, 'Edit');

      expect(result.tracked).toBe(false);
      expect(result.filePath).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should handle non-Edit non-Write tool as modification', () => {
      const result = handleFileModification(mockState, mockInput, 'SomeOtherTool');

      expect(result.tracked).toBe(true);
      expect(result.filePath).toBe('/project/src/utils.ts');
      expect(result.state.files.modifiedThisSession).toContain('/project/src/utils.ts');
      expect(result.state.files.createdThisSession).not.toContain('/project/src/utils.ts');
    });
  });

  describe('processFileAutomation', () => {
    it('should return empty messages when file is not tracked', async () => {
      const inputNoPath = {
        ...mockInput,
        tool_input: {},
      };

      const result = await processFileAutomation(mockState, mockConfig, inputNoPath, 'Edit');

      expect(result.messages).toEqual([]);
      expect(result.state).toBe(mockState);
    });

    it('should run full automation workflow successfully', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: true,
        result: {
          passed: true,
          summary: 'All tests passed',
          duration: 1000,
          failures: [],
        },
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: true,
        result: {
          passed: true,
          summary: 'Build succeeded',
          duration: 2000,
          errors: [],
        },
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: true,
        message: 'Created checkpoint: checkpoint-1',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: true,
        branchName: 'feature/test-feature',
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toEqual([
        'Created checkpoint: checkpoint-1',
        'Created feature branch: feature/test-feature',
      ]);
      expect(maybeRunTests).toHaveBeenCalledWith(
        expect.any(Object),
        mockConfig,
        '/project/src/utils.ts',
        '/project'
      );
      expect(maybeRunBuild).toHaveBeenCalledWith(expect.any(Object), mockConfig, '/project');
      expect(maybeCreateCheckpoint).toHaveBeenCalledWith(expect.any(Object), mockConfig, '/project');
      expect(maybeCreateBranch).toHaveBeenCalledWith(expect.any(Object), mockConfig, '/project');
    });

    it('should add test failure message when tests fail', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: true,
        result: {
          passed: false,
          summary: '2 tests failed',
          duration: 1000,
          failures: [
            {
              testFile: '/project/src/__tests__/utils.test.ts',
              error: 'Expected true to be false',
            },
          ],
        },
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: false,
        message: '',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toContain('Tests failed: 2 tests failed');
    });

    it('should add build failure message when build fails', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: true,
        result: {
          passed: false,
          summary: '3 type errors found',
          duration: 2000,
          errors: [
            { file: '/project/src/utils.ts', line: 10, message: 'Type error' },
          ],
        },
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: false,
        message: '',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toContain('Build check: 3 type errors found');
    });

    it('should handle tests ran but result is null', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: true,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: false,
        message: '',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toEqual([]);
    });

    it('should handle build ran but result is null', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: true,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: false,
        message: '',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toEqual([]);
    });

    it('should handle checkpoint created but branch not created', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toEqual(['Checkpoint created']);
    });

    it('should handle branch created but branchName is null', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: false,
        result: null,
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: false,
        message: '',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: true,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toEqual([]);
    });

    it('should combine multiple messages when multiple automations run', async () => {
      const updatedState = { ...mockState };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: true,
        result: {
          passed: false,
          summary: 'Test failure',
          duration: 1000,
          failures: [],
        },
        state: updatedState,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: true,
        result: {
          passed: false,
          summary: 'Build failure',
          duration: 2000,
          errors: [],
        },
        state: updatedState,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: true,
        message: 'Checkpoint message',
        state: updatedState,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: true,
        branchName: 'feature/new',
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.messages).toEqual([
        'Tests failed: Test failure',
        'Build check: Build failure',
        'Checkpoint message',
        'Created feature branch: feature/new',
      ]);
    });

    it('should propagate state through the automation chain', async () => {
      const stateAfterTest = {
        ...mockState,
        tests: { ...mockState.tests, lastQuickRun: '2025-01-01T01:00:00Z' },
      };
      const stateAfterBuild = {
        ...stateAfterTest,
        build: { ...stateAfterTest.build, lastRun: '2025-01-01T02:00:00Z' },
      };
      const stateAfterCheckpoint = {
        ...stateAfterBuild,
        git: {
          ...stateAfterBuild.git,
          checkpoints: [{ hash: 'abc123', message: 'checkpoint', timestamp: '2025-01-01T03:00:00Z' }],
        },
      };

      vi.mocked(maybeRunTests).mockResolvedValue({
        ran: true,
        result: { passed: true, summary: 'OK', duration: 1000, failures: [] },
        state: stateAfterTest,
      });

      vi.mocked(maybeRunBuild).mockResolvedValue({
        ran: true,
        result: { passed: true, summary: 'OK', duration: 2000, errors: [] },
        state: stateAfterBuild,
      });

      vi.mocked(maybeCreateCheckpoint).mockResolvedValue({
        created: true,
        message: 'Checkpoint',
        state: stateAfterCheckpoint,
      });

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Edit');

      expect(result.state.tests.lastQuickRun).toBe('2025-01-01T01:00:00Z');
      expect(result.state.build.lastRun).toBe('2025-01-01T02:00:00Z');
      expect(result.state.git.checkpoints).toHaveLength(1);
    });

    it('should handle Write tool correctly', async () => {
      // Need to let the real file-tracker mocks work, so don't override with empty state
      vi.mocked(maybeRunTests).mockImplementation(async (state) => ({
        ran: false,
        result: null,
        state,
      }));

      vi.mocked(maybeRunBuild).mockImplementation(async (state) => ({
        ran: false,
        result: null,
        state,
      }));

      vi.mocked(maybeCreateCheckpoint).mockImplementation(async (state) => ({
        created: false,
        message: '',
        state,
      }));

      vi.mocked(maybeCreateBranch).mockResolvedValue({
        created: false,
        branchName: null,
      });

      const result = await processFileAutomation(mockState, mockConfig, mockInput, 'Write');

      expect(result.state.files.createdThisSession).toContain('/project/src/utils.ts');
    });
  });

  describe('re-exported functions', () => {
    it('should export maybeRunTests', () => {
      expect(maybeRunTests).toBeDefined();
      expect(typeof maybeRunTests).toBe('function');
    });

    it('should export maybeRunBuild', () => {
      expect(maybeRunBuild).toBeDefined();
      expect(typeof maybeRunBuild).toBe('function');
    });

    it('should export maybeCreateCheckpoint', () => {
      expect(maybeCreateCheckpoint).toBeDefined();
      expect(typeof maybeCreateCheckpoint).toBe('function');
    });

    it('should export maybeCreateBranch', () => {
      expect(maybeCreateBranch).toBeDefined();
      expect(typeof maybeCreateBranch).toBe('function');
    });
  });
});
