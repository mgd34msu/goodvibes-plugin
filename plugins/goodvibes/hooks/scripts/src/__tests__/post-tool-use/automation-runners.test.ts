/**
 * Unit tests for automation-runners
 *
 * Tests cover:
 * - maybeRunTests: all branches including enabled/disabled, test/spec files, no tests found, success/failure paths, error handling
 * - maybeRunBuild: all branches including enabled/disabled, threshold checks, success/failure paths, error handling
 * - maybeCreateCheckpoint: all branches including enabled/disabled configurations
 * - maybeCreateBranch: all branches including enabled/disabled configurations
 *
 * Coverage target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getDefaultConfig } from '../../types/config.js';
import { createMockHooksState } from '../test-utils/mock-factories.js';

import type { GoodVibesConfig } from '../../types/config.js';
import type { HooksState } from '../../types/state.js';

// Mock all external dependencies
vi.mock('../../shared/index.js', () => ({
  debug: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../post-tool-use/file-tracker.js', () => ({
  getModifiedFileCount: vi.fn(),
}));

vi.mock('../../post-tool-use/checkpoint-manager.js', () => ({
  createCheckpointIfNeeded: vi.fn(),
}));

vi.mock('../../post-tool-use/git-branch-manager.js', () => ({
  maybeCreateFeatureBranch: vi.fn(),
}));

vi.mock('../../automation/test-runner.js', () => ({
  findTestsForFile: vi.fn(),
  runTests: vi.fn(),
}));

vi.mock('../../automation/build-runner.js', () => ({
  runTypeCheck: vi.fn(),
}));

vi.mock('../../state.js', () => ({
  updateTestState: vi.fn((state: HooksState, updates: any) => ({
    ...state,
    tests: {
      ...state.tests,
      ...updates,
    },
  })),
  updateBuildState: vi.fn((state: HooksState, updates: any) => ({
    ...state,
    build: {
      ...state.build,
      ...updates,
    },
  })),
}));

describe('automation-runners', () => {
  let mockState: HooksState;
  let mockConfig: GoodVibesConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockState = createMockHooksState();
    mockConfig = getDefaultConfig();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('maybeRunTests', () => {
    it('should skip tests when automation is disabled', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { debug } = await import('../../shared/index.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: false,
        },
      };

      const result = await maybeRunTests(
        mockState,
        config,
        '/src/utils.ts',
        '/project'
      );

      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
      expect(debug).not.toHaveBeenCalled();
    });

    it('should skip tests when runAfterFileChange is disabled', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: true,
          testing: {
            ...mockConfig.automation.testing,
            runAfterFileChange: false,
          },
        },
      };

      const result = await maybeRunTests(
        mockState,
        config,
        '/src/utils.ts',
        '/project'
      );

      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should skip test files with .test. in filename', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.test.ts',
        '/project'
      );

      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should skip test files with .spec. in filename', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.spec.ts',
        '/project'
      );

      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should skip when no tests are found for the file', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile } =
        await import('../../automation/test-runner.js');
      const { debug } = await import('../../shared/index.js');

      vi.mocked(findTestsForFile).mockReturnValue([]);

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(findTestsForFile).toHaveBeenCalledWith('/src/utils.ts');
      expect(debug).toHaveBeenCalledWith('No tests found for: /src/utils.ts');
      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
    });

    it('should run tests and update state when tests pass', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');
      const { debug } = await import('../../shared/index.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const testResult = {
        passed: true,
        failures: [],
        summary: 'All tests passed',
      };

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue(testResult);

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(findTestsForFile).toHaveBeenCalledWith('/src/utils.ts');
      expect(runTests).toHaveBeenCalledWith(testFiles, '/project');
      expect(debug).toHaveBeenCalledWith('Running tests for: /src/utils.ts', {
        testFiles,
      });
      expect(result.ran).toBe(true);
      expect(result.result).toEqual(testResult);

      // Verify state update for passing tests
      expect(updateTestState).toHaveBeenCalledWith(mockState, {
        lastQuickRun: expect.any(String),
        passingFiles: testFiles,
        failingFiles: [],
      });
    });

    it('should deduplicate passing files when adding to state', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const stateWithExistingPassing = createMockHooksState({
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: [
            '/src/__tests__/utils.test.ts',
            '/src/__tests__/other.test.ts',
          ],
          failingFiles: [],
          pendingFixes: [],
        },
      });

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue({
        passed: true,
        failures: [],
        summary: 'All tests passed',
      });

      await maybeRunTests(
        stateWithExistingPassing,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(updateTestState).toHaveBeenCalledWith(stateWithExistingPassing, {
        lastQuickRun: expect.any(String),
        passingFiles: expect.arrayContaining([
          '/src/__tests__/utils.test.ts',
          '/src/__tests__/other.test.ts',
        ]),
        failingFiles: [],
      });
    });

    it('should remove from failing files when tests pass', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const stateWithFailingFile = createMockHooksState({
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: [],
          failingFiles: ['/src/__tests__/utils.test.ts'],
          pendingFixes: [],
        },
      });

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue({
        passed: true,
        failures: [],
        summary: 'All tests passed',
      });

      await maybeRunTests(
        stateWithFailingFile,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      const updateCall = vi.mocked(updateTestState).mock.calls[0];
      expect(updateCall[1].failingFiles).toEqual([]);
    });

    it('should run tests and update state when tests fail', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const testResult = {
        passed: false,
        failures: [
          {
            testFile: '/src/__tests__/utils.test.ts',
            error: 'Expected 1 to equal 2',
          },
        ],
        summary: '1 test failed',
      };

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue(testResult);

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(result.ran).toBe(true);
      expect(result.result).toEqual(testResult);

      // Verify state update for failing tests
      expect(updateTestState).toHaveBeenCalledWith(mockState, {
        lastQuickRun: expect.any(String),
        failingFiles: testFiles,
        passingFiles: [],
        pendingFixes: [
          {
            testFile: '/src/__tests__/utils.test.ts',
            error: 'Expected 1 to equal 2',
            fixAttempts: 0,
          },
        ],
      });
    });

    it('should deduplicate failing files when adding to state', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const stateWithExistingFailing = createMockHooksState({
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: [],
          failingFiles: [
            '/src/__tests__/utils.test.ts',
            '/src/__tests__/other.test.ts',
          ],
          pendingFixes: [],
        },
      });

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue({
        passed: false,
        failures: [
          {
            testFile: '/src/__tests__/utils.test.ts',
            error: 'Test failed',
          },
        ],
        summary: '1 test failed',
      });

      await maybeRunTests(
        stateWithExistingFailing,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(updateTestState).toHaveBeenCalledWith(stateWithExistingFailing, {
        lastQuickRun: expect.any(String),
        failingFiles: expect.arrayContaining([
          '/src/__tests__/utils.test.ts',
          '/src/__tests__/other.test.ts',
        ]),
        passingFiles: [],
        pendingFixes: expect.any(Array),
      });
    });

    it('should remove from passing files when tests fail', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const stateWithPassingFile = createMockHooksState({
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: ['/src/__tests__/utils.test.ts'],
          failingFiles: [],
          pendingFixes: [],
        },
      });

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue({
        passed: false,
        failures: [
          {
            testFile: '/src/__tests__/utils.test.ts',
            error: 'Test failed',
          },
        ],
        summary: '1 test failed',
      });

      await maybeRunTests(
        stateWithPassingFile,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      const updateCall = vi.mocked(updateTestState).mock.calls[0];
      expect(updateCall[1].passingFiles).toEqual([]);
    });

    it('should handle multiple test failures', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { updateTestState } = await import('../../state.js');

      const testFiles = [
        '/src/__tests__/utils.test.ts',
        '/src/__tests__/helpers.test.ts',
      ];
      const testResult = {
        passed: false,
        failures: [
          {
            testFile: '/src/__tests__/utils.test.ts',
            error: 'Error 1',
          },
          {
            testFile: '/src/__tests__/helpers.test.ts',
            error: 'Error 2',
          },
        ],
        summary: '2 tests failed',
      };

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockResolvedValue(testResult);

      await maybeRunTests(mockState, mockConfig, '/src/utils.ts', '/project');

      expect(updateTestState).toHaveBeenCalledWith(mockState, {
        lastQuickRun: expect.any(String),
        failingFiles: testFiles,
        passingFiles: [],
        pendingFixes: [
          {
            testFile: '/src/__tests__/utils.test.ts',
            error: 'Error 1',
            fixAttempts: 0,
          },
          {
            testFile: '/src/__tests__/helpers.test.ts',
            error: 'Error 2',
            fixAttempts: 0,
          },
        ],
      });
    });

    it('should handle errors from runTests and log them', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { logError } = await import('../../shared/index.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];
      const error = new Error('Test runner crashed');

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockRejectedValue(error);

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(logError).toHaveBeenCalledWith('maybeRunTests', error);
      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should handle non-Error exceptions', async () => {
      const { maybeRunTests } =
        await import('../../post-tool-use/automation-runners.js');
      const { findTestsForFile, runTests } =
        await import('../../automation/test-runner.js');
      const { logError } = await import('../../shared/index.js');

      const testFiles = ['/src/__tests__/utils.test.ts'];

      vi.mocked(findTestsForFile).mockReturnValue(testFiles);
      vi.mocked(runTests).mockRejectedValue('String error');

      const result = await maybeRunTests(
        mockState,
        mockConfig,
        '/src/utils.ts',
        '/project'
      );

      expect(logError).toHaveBeenCalledWith('maybeRunTests', 'String error');
      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
    });
  });

  describe('maybeRunBuild', () => {
    it('should skip build when automation is disabled', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: false,
        },
      };

      const result = await maybeRunBuild(mockState, config, '/project');

      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should skip build when modified count is below threshold', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { debug } = await import('../../shared/index.js');

      vi.mocked(getModifiedFileCount).mockReturnValue(3);

      const result = await maybeRunBuild(mockState, mockConfig, '/project');

      expect(getModifiedFileCount).toHaveBeenCalledWith(mockState);
      expect(debug).toHaveBeenCalledWith(
        'Build skipped: 3 files modified (threshold: 5)'
      );
      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
    });

    it('should skip build when modified count equals threshold minus one', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');

      vi.mocked(getModifiedFileCount).mockReturnValue(4);

      const result = await maybeRunBuild(mockState, mockConfig, '/project');

      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
    });

    it('should run build when modified count equals threshold', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { updateBuildState } = await import('../../state.js');
      const { debug } = await import('../../shared/index.js');

      vi.mocked(getModifiedFileCount).mockReturnValue(5);
      vi.mocked(runTypeCheck).mockResolvedValue({
        passed: true,
        errors: [],
        summary: 'Type check passed',
      });

      const result = await maybeRunBuild(mockState, mockConfig, '/project');

      expect(debug).toHaveBeenCalledWith(
        'Running typecheck after 5 file modifications'
      );
      expect(runTypeCheck).toHaveBeenCalledWith('/project');
      expect(result.ran).toBe(true);
      expect(result.result).toEqual({
        passed: true,
        errors: [],
        summary: 'Type check passed',
      });

      expect(updateBuildState).toHaveBeenCalledWith(mockState, {
        lastRun: expect.any(String),
        status: 'passing',
        errors: [],
        fixAttempts: 0,
      });
    });

    it('should run build when modified count exceeds threshold', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { debug } = await import('../../shared/index.js');

      vi.mocked(getModifiedFileCount).mockReturnValue(10);
      vi.mocked(runTypeCheck).mockResolvedValue({
        passed: true,
        errors: [],
        summary: 'Type check passed',
      });

      const result = await maybeRunBuild(mockState, mockConfig, '/project');

      expect(debug).toHaveBeenCalledWith(
        'Running typecheck after 10 file modifications'
      );
      expect(result.ran).toBe(true);
    });

    it('should update state with passing status when build passes', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { updateBuildState } = await import('../../state.js');

      vi.mocked(getModifiedFileCount).mockReturnValue(5);
      vi.mocked(runTypeCheck).mockResolvedValue({
        passed: true,
        errors: [],
        summary: 'Type check passed',
      });

      await maybeRunBuild(mockState, mockConfig, '/project');

      expect(updateBuildState).toHaveBeenCalledWith(mockState, {
        lastRun: expect.any(String),
        status: 'passing',
        errors: [],
        fixAttempts: 0,
      });
    });

    it('should update state with failing status and increment fixAttempts when build fails', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { updateBuildState } = await import('../../state.js');

      const stateWithFailedBuild = createMockHooksState({
        build: {
          lastRun: null,
          status: 'failing',
          errors: [],
          fixAttempts: 2,
        },
      });

      const buildErrors = [
        { file: 'src/index.ts', message: 'Type error', line: 10 },
      ];

      vi.mocked(getModifiedFileCount).mockReturnValue(5);
      vi.mocked(runTypeCheck).mockResolvedValue({
        passed: false,
        errors: buildErrors,
        summary: 'Type check failed',
      });

      await maybeRunBuild(stateWithFailedBuild, mockConfig, '/project');

      expect(updateBuildState).toHaveBeenCalledWith(stateWithFailedBuild, {
        lastRun: expect.any(String),
        status: 'failing',
        errors: buildErrors,
        fixAttempts: 3,
      });
    });

    it('should reset fixAttempts to 0 when build passes after previous failures', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { updateBuildState } = await import('../../state.js');

      const stateWithFailedBuild = createMockHooksState({
        build: {
          lastRun: null,
          status: 'failing',
          errors: [],
          fixAttempts: 5,
        },
      });

      vi.mocked(getModifiedFileCount).mockReturnValue(5);
      vi.mocked(runTypeCheck).mockResolvedValue({
        passed: true,
        errors: [],
        summary: 'Type check passed',
      });

      await maybeRunBuild(stateWithFailedBuild, mockConfig, '/project');

      expect(updateBuildState).toHaveBeenCalledWith(stateWithFailedBuild, {
        lastRun: expect.any(String),
        status: 'passing',
        errors: [],
        fixAttempts: 0,
      });
    });

    it('should handle errors from runTypeCheck and log them', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { logError } = await import('../../shared/index.js');

      const error = new Error('TypeScript crashed');

      vi.mocked(getModifiedFileCount).mockReturnValue(5);
      vi.mocked(runTypeCheck).mockRejectedValue(error);

      const result = await maybeRunBuild(mockState, mockConfig, '/project');

      expect(logError).toHaveBeenCalledWith('maybeRunBuild', error);
      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
      expect(result.state).toBe(mockState);
    });

    it('should handle non-Error exceptions from runTypeCheck', async () => {
      const { maybeRunBuild } =
        await import('../../post-tool-use/automation-runners.js');
      const { getModifiedFileCount } =
        await import('../../post-tool-use/file-tracker.js');
      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const { logError } = await import('../../shared/index.js');

      vi.mocked(getModifiedFileCount).mockReturnValue(5);
      vi.mocked(runTypeCheck).mockRejectedValue('String error');

      const result = await maybeRunBuild(mockState, mockConfig, '/project');

      expect(logError).toHaveBeenCalledWith('maybeRunBuild', 'String error');
      expect(result.ran).toBe(false);
      expect(result.result).toBe(null);
    });
  });

  describe('maybeCreateCheckpoint', () => {
    it('should skip checkpoint when automation is disabled', async () => {
      const { maybeCreateCheckpoint } =
        await import('../../post-tool-use/automation-runners.js');
      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: false,
        },
      };

      const result = await maybeCreateCheckpoint(mockState, config, '/project');

      expect(createCheckpointIfNeeded).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.message).toBe('');
      expect(result.state).toBe(mockState);
    });

    it('should skip checkpoint when autoCheckpoint is disabled', async () => {
      const { maybeCreateCheckpoint } =
        await import('../../post-tool-use/automation-runners.js');
      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: true,
          git: {
            ...mockConfig.automation.git,
            autoCheckpoint: false,
          },
        },
      };

      const result = await maybeCreateCheckpoint(mockState, config, '/project');

      expect(createCheckpointIfNeeded).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.message).toBe('');
    });

    it('should create checkpoint when both automation and autoCheckpoint are enabled', async () => {
      const { maybeCreateCheckpoint } =
        await import('../../post-tool-use/automation-runners.js');
      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      const checkpointResult = {
        created: true,
        message:
          'checkpoint: pre-compact: saving work before context compaction',
        state: {
          ...mockState,
          git: {
            ...mockState.git,
            checkpoints: ['abc1234'],
          },
        },
      };

      vi.mocked(createCheckpointIfNeeded).mockResolvedValue(checkpointResult);

      const result = await maybeCreateCheckpoint(
        mockState,
        mockConfig,
        '/project'
      );

      expect(createCheckpointIfNeeded).toHaveBeenCalledWith(
        mockState,
        '/project'
      );
      expect(result.created).toBe(true);
      expect(result.message).toBe(
        'checkpoint: pre-compact: saving work before context compaction'
      );
      expect(result.state).toEqual(checkpointResult.state);
    });

    it('should return result when checkpoint is not created', async () => {
      const { maybeCreateCheckpoint } =
        await import('../../post-tool-use/automation-runners.js');
      const { createCheckpointIfNeeded } =
        await import('../../post-tool-use/checkpoint-manager.js');

      const checkpointResult = {
        created: false,
        message: '',
        state: mockState,
      };

      vi.mocked(createCheckpointIfNeeded).mockResolvedValue(checkpointResult);

      const result = await maybeCreateCheckpoint(
        mockState,
        mockConfig,
        '/project'
      );

      expect(result.created).toBe(false);
      expect(result.message).toBe('');
      expect(result.state).toBe(mockState);
    });
  });

  describe('maybeCreateBranch', () => {
    it('should skip branch creation when automation is disabled', async () => {
      const { maybeCreateBranch } =
        await import('../../post-tool-use/automation-runners.js');
      const { maybeCreateFeatureBranch } =
        await import('../../post-tool-use/git-branch-manager.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: false,
        },
      };

      const result = await maybeCreateBranch(mockState, config, '/project');

      expect(maybeCreateFeatureBranch).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.branchName).toBe(null);
    });

    it('should skip branch creation when autoFeatureBranch is disabled', async () => {
      const { maybeCreateBranch } =
        await import('../../post-tool-use/automation-runners.js');
      const { maybeCreateFeatureBranch } =
        await import('../../post-tool-use/git-branch-manager.js');

      const config: GoodVibesConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enabled: true,
          git: {
            ...mockConfig.automation.git,
            autoFeatureBranch: false,
          },
        },
      };

      const result = await maybeCreateBranch(mockState, config, '/project');

      expect(maybeCreateFeatureBranch).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.branchName).toBe(null);
    });

    it('should create branch when both automation and autoFeatureBranch are enabled', async () => {
      const { maybeCreateBranch } =
        await import('../../post-tool-use/automation-runners.js');
      const { maybeCreateFeatureBranch } =
        await import('../../post-tool-use/git-branch-manager.js');

      const branchResult = {
        created: true,
        branchName: 'feature/add-user-authentication',
      };

      vi.mocked(maybeCreateFeatureBranch).mockResolvedValue(branchResult);

      const result = await maybeCreateBranch(mockState, mockConfig, '/project');

      expect(maybeCreateFeatureBranch).toHaveBeenCalledWith(
        mockState,
        '/project'
      );
      expect(result.created).toBe(true);
      expect(result.branchName).toBe('feature/add-user-authentication');
    });

    it('should return result when branch is not created', async () => {
      const { maybeCreateBranch } =
        await import('../../post-tool-use/automation-runners.js');
      const { maybeCreateFeatureBranch } =
        await import('../../post-tool-use/git-branch-manager.js');

      const branchResult = {
        created: false,
        branchName: null,
      };

      vi.mocked(maybeCreateFeatureBranch).mockResolvedValue(branchResult);

      const result = await maybeCreateBranch(mockState, mockConfig, '/project');

      expect(result.created).toBe(false);
      expect(result.branchName).toBe(null);
    });
  });
});
