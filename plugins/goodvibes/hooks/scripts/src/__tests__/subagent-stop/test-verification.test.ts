/**
 * Tests for subagent-stop/test-verification module
 *
 * Tests cover:
 * - verifyAgentTests: run tests for files modified by an agent
 *   - No tests found for modified files
 *   - Tests found and all pass
 *   - Tests found and some fail
 *   - Deduplication of test files across multiple source files
 *   - State updates for passing/failing tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HooksState } from '../../types/state.js';
import { createDefaultState } from '../../types/state.js';

// Mock dependencies
const mockFindTestsForFile = vi.fn();
const mockRunTests = vi.fn();

// Mock automation/test-runner.js
vi.mock('../../automation/test-runner.js', () => ({
  findTestsForFile: (...args: unknown[]) => mockFindTestsForFile(...args),
  runTests: (...args: unknown[]) => mockRunTests(...args),
}));

describe('subagent-stop/test-verification', () => {
  let testState: HooksState;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    testState = createDefaultState();
  });

  describe('verifyAgentTests', () => {
    it('should return early when no tests are found for modified files', async () => {
      mockFindTestsForFile.mockReturnValue([]);

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      const result = await verifyAgentTests('/project', ['src/utils.ts', 'src/helpers.ts'], testState);

      expect(result).toEqual({
        ran: false,
        passed: true,
        summary: 'No tests for modified files',
      });
      expect(mockFindTestsForFile).toHaveBeenCalledTimes(2);
      expect(mockFindTestsForFile).toHaveBeenCalledWith('src/utils.ts');
      expect(mockFindTestsForFile).toHaveBeenCalledWith('src/helpers.ts');
      expect(mockRunTests).not.toHaveBeenCalled();
    });

    it('should run tests and return passing result when all tests pass', async () => {
      mockFindTestsForFile.mockReturnValueOnce(['src/utils.test.ts']);
      mockRunTests.mockResolvedValue({
        passed: true,
        summary: '1 test files passed',
        failures: [],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      const result = await verifyAgentTests('/project', ['src/utils.ts'], testState);

      expect(result).toEqual({
        ran: true,
        passed: true,
        summary: '1 test files passed',
      });
      expect(mockRunTests).toHaveBeenCalledWith(['src/utils.test.ts'], '/project');
      expect(testState.tests.passingFiles).toContain('src/utils.test.ts');
      expect(testState.tests.failingFiles).toHaveLength(0);
      expect(testState.tests.pendingFixes).toHaveLength(0);
    });

    it('should deduplicate test files across multiple source files', async () => {
      // Multiple source files map to the same test file
      mockFindTestsForFile
        .mockReturnValueOnce(['src/__tests__/shared.test.ts'])
        .mockReturnValueOnce(['src/__tests__/shared.test.ts', 'src/__tests__/helper.test.ts'])
        .mockReturnValueOnce(['src/__tests__/helper.test.ts']);
      mockRunTests.mockResolvedValue({
        passed: true,
        summary: '2 test files passed',
        failures: [],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      const result = await verifyAgentTests(
        '/project',
        ['src/shared.ts', 'src/helper.ts', 'src/other.ts'],
        testState
      );

      expect(result.ran).toBe(true);
      expect(result.passed).toBe(true);
      // Should only run unique tests
      expect(mockRunTests).toHaveBeenCalledWith(
        expect.arrayContaining(['src/__tests__/shared.test.ts', 'src/__tests__/helper.test.ts']),
        '/project'
      );
      // Verify deduplication - should only be 2 unique tests
      const runTestsCall = mockRunTests.mock.calls[0];
      expect(runTestsCall[0]).toHaveLength(2);
    });

    it('should handle test failures and update state', async () => {
      mockFindTestsForFile.mockReturnValueOnce(['src/broken.test.ts', 'src/other.test.ts']);
      mockRunTests.mockResolvedValue({
        passed: false,
        summary: 'Tests failed',
        failures: [
          { testFile: 'src/broken.test.ts', testName: 'should work', error: 'Expected true to be false' },
          { testFile: 'src/other.test.ts', testName: 'should also work', error: 'Timeout' },
        ],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      const result = await verifyAgentTests('/project', ['src/broken.ts'], testState);

      expect(result).toEqual({
        ran: true,
        passed: false,
        summary: 'Tests failed',
      });
      expect(testState.tests.failingFiles).toContain('src/broken.test.ts');
      expect(testState.tests.failingFiles).toContain('src/other.test.ts');
      expect(testState.tests.pendingFixes).toHaveLength(2);
      expect(testState.tests.pendingFixes[0]).toEqual({
        testFile: 'src/broken.test.ts',
        error: 'Expected true to be false',
        fixAttempts: 0,
      });
      expect(testState.tests.pendingFixes[1]).toEqual({
        testFile: 'src/other.test.ts',
        error: 'Timeout',
        fixAttempts: 0,
      });
      expect(testState.tests.passingFiles).toHaveLength(0);
    });

    it('should not add duplicate files to passingFiles', async () => {
      // Pre-populate passingFiles with some tests
      testState.tests.passingFiles = ['src/utils.test.ts', 'src/existing.test.ts'];

      mockFindTestsForFile.mockReturnValueOnce(['src/utils.test.ts', 'src/new.test.ts']);
      mockRunTests.mockResolvedValue({
        passed: true,
        summary: '2 test files passed',
        failures: [],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      await verifyAgentTests('/project', ['src/utils.ts'], testState);

      // Should have 3 entries: 2 original + 1 new (utils.test.ts should not be duplicated)
      expect(testState.tests.passingFiles).toHaveLength(3);
      expect(testState.tests.passingFiles).toContain('src/existing.test.ts');
      expect(testState.tests.passingFiles).toContain('src/utils.test.ts');
      expect(testState.tests.passingFiles).toContain('src/new.test.ts');
      // Count occurrences of utils.test.ts - should be exactly 1
      const utilsCount = testState.tests.passingFiles.filter(f => f === 'src/utils.test.ts').length;
      expect(utilsCount).toBe(1);
    });

    it('should not add duplicate files to failingFiles', async () => {
      // Pre-populate failingFiles with a test
      testState.tests.failingFiles = ['src/broken.test.ts'];

      mockFindTestsForFile.mockReturnValueOnce(['src/broken.test.ts', 'src/new-broken.test.ts']);
      mockRunTests.mockResolvedValue({
        passed: false,
        summary: 'Tests failed',
        failures: [
          { testFile: 'src/broken.test.ts', testName: 'test', error: 'Error 1' },
          { testFile: 'src/new-broken.test.ts', testName: 'test', error: 'Error 2' },
        ],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      await verifyAgentTests('/project', ['src/broken.ts'], testState);

      // Should have 2 entries: 1 original + 1 new (broken.test.ts should not be duplicated)
      expect(testState.tests.failingFiles).toHaveLength(2);
      expect(testState.tests.failingFiles).toContain('src/broken.test.ts');
      expect(testState.tests.failingFiles).toContain('src/new-broken.test.ts');
      // Count occurrences of broken.test.ts - should be exactly 1
      const brokenCount = testState.tests.failingFiles.filter(f => f === 'src/broken.test.ts').length;
      expect(brokenCount).toBe(1);
    });

    it('should add pending fixes for all failures even if file is already in failingFiles', async () => {
      // Pre-populate failingFiles
      testState.tests.failingFiles = ['src/broken.test.ts'];
      testState.tests.pendingFixes = [
        { testFile: 'src/broken.test.ts', error: 'Old error', fixAttempts: 2 },
      ];

      mockFindTestsForFile.mockReturnValueOnce(['src/broken.test.ts']);
      mockRunTests.mockResolvedValue({
        passed: false,
        summary: 'Tests failed',
        failures: [
          { testFile: 'src/broken.test.ts', testName: 'test', error: 'New error' },
        ],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      await verifyAgentTests('/project', ['src/broken.ts'], testState);

      // pendingFixes should have 2 entries now (original + new)
      expect(testState.tests.pendingFixes).toHaveLength(2);
      expect(testState.tests.pendingFixes[0]).toEqual({
        testFile: 'src/broken.test.ts',
        error: 'Old error',
        fixAttempts: 2,
      });
      expect(testState.tests.pendingFixes[1]).toEqual({
        testFile: 'src/broken.test.ts',
        error: 'New error',
        fixAttempts: 0,
      });
    });

    it('should handle empty filesModified array', async () => {
      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      const result = await verifyAgentTests('/project', [], testState);

      expect(result).toEqual({
        ran: false,
        passed: true,
        summary: 'No tests for modified files',
      });
      expect(mockFindTestsForFile).not.toHaveBeenCalled();
      expect(mockRunTests).not.toHaveBeenCalled();
    });

    it('should handle mixed results from findTestsForFile', async () => {
      // Some files have tests, some don't
      mockFindTestsForFile
        .mockReturnValueOnce([]) // no tests for first file
        .mockReturnValueOnce(['src/helper.test.ts']) // tests for second
        .mockReturnValueOnce([]); // no tests for third
      mockRunTests.mockResolvedValue({
        passed: true,
        summary: '1 test files passed',
        failures: [],
      });

      const { verifyAgentTests } = await import('../../subagent-stop/test-verification.js');
      const result = await verifyAgentTests(
        '/project',
        ['src/no-test-1.ts', 'src/helper.ts', 'src/no-test-2.ts'],
        testState
      );

      expect(result.ran).toBe(true);
      expect(mockRunTests).toHaveBeenCalledWith(['src/helper.test.ts'], '/project');
    });
  });
});
