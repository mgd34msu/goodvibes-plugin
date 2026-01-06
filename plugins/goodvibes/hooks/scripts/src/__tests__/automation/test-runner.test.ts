/**
 * Tests for automation/test-runner.ts
 *
 * Covers all test runner functionality including:
 * - findTestsForFile: Find test files for a given source file
 * - runTests: Run specific test files and parse results
 * - runFullTestSuite: Run all tests and parse results
 * - parseTestFailures: Parse FAIL lines from test output (internal, tested via exports)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('test-runner', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // findTestsForFile tests
  // =============================================================================
  describe('findTestsForFile', () => {
    it('should find .test.ts files for source file', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.test.ts')),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result).toContain('src/utils/format.test.ts');
    });

    it('should find .test.tsx files for TSX source', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.test.tsx')),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/components/Button.tsx');

      expect(result).toContain('src/components/Button.test.tsx');
    });

    it('should find .spec.ts files', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.spec.ts')),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result).toContain('src/utils/format.spec.ts');
    });

    it('should find .spec.tsx files', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.spec.tsx')),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/components/Modal.tsx');

      expect(result).toContain('src/components/Modal.spec.tsx');
    });

    it('should find tests in __tests__ directory', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.includes('__tests__')),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result.some(f => f.includes('__tests__'))).toBe(true);
      expect(result.some(f => f.includes('src/__tests__/utils/format.test.ts'))).toBe(true);
    });

    it('should find tests in tests/ directory', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.startsWith('tests/')),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result.some(f => f.startsWith('tests/'))).toBe(true);
      expect(result.some(f => f.includes('tests/utils/format.test.ts'))).toBe(true);
    });

    it('should return empty array when no tests exist', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(false),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result).toEqual([]);
    });

    it('should find multiple test files if they exist', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => {
          return p.endsWith('.test.ts') || p.endsWith('.spec.ts');
        }),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result).toContain('src/utils/format.test.ts');
      expect(result).toContain('src/utils/format.spec.ts');
    });

    it('should handle .tsx source file extensions correctly', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p === 'src/Button.test.ts'),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/Button.tsx');

      expect(result).toContain('src/Button.test.ts');
    });

    it('should find all patterns for a single source file', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
      }));

      const { findTestsForFile } = await import('../../automation/test-runner.js');
      const result = findTestsForFile('src/utils/helper.ts');

      // All 6 patterns should be found when existsSync returns true
      expect(result).toHaveLength(6);
    });
  });

  // =============================================================================
  // runTests tests
  // =============================================================================
  describe('runTests', () => {
    it('should return success when no test files provided', async () => {
      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests([], '/test/project');

      expect(result.passed).toBe(true);
      expect(result.summary).toBe('No tests to run');
      expect(result.failures).toHaveLength(0);
    });

    it('should return success when tests pass', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('All tests passed')),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/test.test.ts'], '/test/project');

      expect(result.passed).toBe(true);
      expect(result.summary).toBe('1 test files passed');
      expect(result.failures).toHaveLength(0);
    });

    it('should return success with correct count for multiple test files', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('All tests passed')),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(
        ['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts'],
        '/test/project'
      );

      expect(result.passed).toBe(true);
      expect(result.summary).toBe('3 test files passed');
    });

    it('should call execSync with correct arguments', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from('ok'));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      runTests(['src/a.test.ts', 'src/b.test.ts'], '/my/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        'npm test -- src/a.test.ts src/b.test.ts',
        { cwd: '/my/project', stdio: 'pipe', timeout: 300000 }
      );
    });

    it('should parse FAIL lines from test output', async () => {
      const testOutput = `FAIL src/utils/format.test.ts
  Test case failed
  Expected: true
  Received: false
  at Object.<anonymous>`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation(
          (error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
            return error.stdout?.toString() || error.stderr?.toString() || error.message;
          }
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Tests failed') as Error & {
            stdout?: Buffer;
            stderr?: Buffer;
          };
          error.stdout = Buffer.from(testOutput);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/utils/format.test.ts'], '/test/project');

      expect(result.passed).toBe(false);
      expect(result.summary).toBe('Tests failed');
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/utils/format.test.ts');
      expect(result.failures[0].testName).toBe('unknown');
    });

    it('should parse multiple test failures', async () => {
      const testOutput = `FAIL src/a.test.ts
  Error in test a
  line 2
FAIL src/b.test.tsx
  Error in test b
  line 2`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation(
          (error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
            return error.stdout?.toString() || error.stderr?.toString() || error.message;
          }
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Tests failed') as Error & {
            stdout?: Buffer;
            stderr?: Buffer;
          };
          error.stdout = Buffer.from(testOutput);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/a.test.ts', 'src/b.test.tsx'], '/test/project');

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].testFile).toBe('src/a.test.ts');
      expect(result.failures[1].testFile).toBe('src/b.test.tsx');
    });

    it('should include 5 context lines in error', async () => {
      // FAILURE_CONTEXT_LINES = 5 means 5 lines total from FAIL line
      const testOutput = `FAIL src/test.test.ts
  line 1
  line 2
  line 3
  line 4
  line 5
  line 6`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation(
          (error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
            return error.stdout?.toString() || error.stderr?.toString() || error.message;
          }
        ),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Tests failed') as Error & {
            stdout?: Buffer;
            stderr?: Buffer;
          };
          error.stdout = Buffer.from(testOutput);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/test.test.ts'], '/test/project');

      // Should include FAIL line + 4 more lines (5 total)
      expect(result.failures[0].error).toContain('FAIL src/test.test.ts');
      expect(result.failures[0].error).toContain('line 1');
      expect(result.failures[0].error).toContain('line 4');
      // line 5 and line 6 should NOT be included (only 5 lines total)
      expect(result.failures[0].error).not.toContain('line 5');
      expect(result.failures[0].error).not.toContain('line 6');
    });

    it('should handle .test.js files in FAIL output', async () => {
      const testOutput = `FAIL src/legacy.test.js
  Legacy test failure`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Tests failed');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/legacy.test.js'], '/test/project');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/legacy.test.js');
    });

    it('should handle .test.jsx files in FAIL output', async () => {
      const testOutput = `FAIL src/component.test.jsx
  Component test failure`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Tests failed');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/component.test.jsx'], '/test/project');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/component.test.jsx');
    });

    it('should return empty failures when output has no FAIL lines', async () => {
      const testOutput = `Some other error format
npm ERR! code ELIFECYCLE
npm ERR! errno 1`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Tests failed');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/test.test.ts'], '/test/project');

      expect(result.passed).toBe(false);
      expect(result.summary).toBe('Tests failed');
      expect(result.failures).toHaveLength(0);
    });

    it('should handle output with fewer lines than FAILURE_CONTEXT_LINES', async () => {
      const testOutput = `FAIL src/short.test.ts
  only two lines`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Tests failed');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/short.test.ts'], '/test/project');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/short.test.ts');
      expect(result.failures[0].error).toContain('FAIL src/short.test.ts');
      expect(result.failures[0].error).toContain('only two lines');
    });

    it('should handle FAIL at end of output with no following lines', async () => {
      const testOutput = `Some preamble
FAIL src/last.test.ts`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Tests failed');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['src/last.test.ts'], '/test/project');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/last.test.ts');
    });
  });

  // =============================================================================
  // runFullTestSuite tests
  // =============================================================================
  describe('runFullTestSuite', () => {
    it('should return success when all tests pass', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('All tests passed')),
      }));

      const { runFullTestSuite } = await import('../../automation/test-runner.js');
      const result = runFullTestSuite('/test/project');

      expect(result.passed).toBe(true);
      expect(result.summary).toBe('All tests passed');
      expect(result.failures).toHaveLength(0);
    });

    it('should call execSync with correct arguments', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from('ok'));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runFullTestSuite } = await import('../../automation/test-runner.js');
      runFullTestSuite('/my/project');

      expect(mockExecSync).toHaveBeenCalledWith('npm test', {
        cwd: '/my/project',
        stdio: 'pipe',
        timeout: 600000,
      });
    });

    it('should return failure with parsed failures when tests fail', async () => {
      const testOutput = `FAIL src/api.test.ts
  API test failed
  Expected: 200
  Received: 500
FAIL src/db.test.ts
  DB test failed`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Tests failed');
        }),
      }));

      const { runFullTestSuite } = await import('../../automation/test-runner.js');
      const result = runFullTestSuite('/test/project');

      expect(result.passed).toBe(false);
      expect(result.summary).toBe('Tests failed');
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].testFile).toBe('src/api.test.ts');
      expect(result.failures[1].testFile).toBe('src/db.test.ts');
    });

    it('should return empty failures when no FAIL pattern matches', async () => {
      const testOutput = `npm ERR! Test failed.
See npm-debug.log for more info.`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('npm ERR!');
        }),
      }));

      const { runFullTestSuite } = await import('../../automation/test-runner.js');
      const result = runFullTestSuite('/test/project');

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(0);
    });

    it('should use 600000ms timeout for full test suite', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from('ok'));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runFullTestSuite } = await import('../../automation/test-runner.js');
      runFullTestSuite('/test/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 600000 })
      );
    });

    it('should include context lines in failure error', async () => {
      const testOutput = `FAIL src/context.test.ts
  context line 1
  context line 2
  context line 3
  context line 4
  context line 5
  context line 6`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Test failure');
        }),
      }));

      const { runFullTestSuite } = await import('../../automation/test-runner.js');
      const result = runFullTestSuite('/test/project');

      // FAILURE_CONTEXT_LINES = 5
      expect(result.failures[0].error).toContain('context line 1');
      expect(result.failures[0].error).toContain('context line 4');
      expect(result.failures[0].error).not.toContain('context line 5');
    });
  });

  // =============================================================================
  // parseTestFailures internal function tests (via exported functions)
  // =============================================================================
  describe('parseTestFailures behavior', () => {
    it('should handle empty output', async () => {
      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(''),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures).toHaveLength(0);
    });

    it('should handle output with only newlines', async () => {
      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue('\n\n\n'),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures).toHaveLength(0);
    });

    it('should not match FAIL without .test. extension', async () => {
      const testOutput = `FAIL src/not-a-test.ts
  This should not be parsed`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures).toHaveLength(0);
    });

    it('should match FAIL with various path formats', async () => {
      const testOutput = `FAIL ./src/test.test.ts
  Error 1
FAIL packages/core/test.test.tsx
  Error 2
FAIL test.test.js
  Error 3`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures).toHaveLength(3);
      expect(result.failures[0].testFile).toBe('./src/test.test.ts');
      expect(result.failures[1].testFile).toBe('packages/core/test.test.tsx');
      expect(result.failures[2].testFile).toBe('test.test.js');
    });

    it('should handle multiple spaces after FAIL', async () => {
      const testOutput = `FAIL    src/spaced.test.ts
  Error with extra spaces`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/spaced.test.ts');
    });

    it('should set testName to unknown for all failures', async () => {
      const testOutput = `FAIL src/a.test.ts
FAIL src/b.test.tsx`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures[0].testName).toBe('unknown');
      expect(result.failures[1].testName).toBe('unknown');
    });
  });

  // =============================================================================
  // TestResult interface validation
  // =============================================================================
  describe('TestResult interface', () => {
    it('should have correct structure for passed result', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('ok')),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('failures');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.summary).toBe('string');
      expect(Array.isArray(result.failures)).toBe(true);
    });

    it('should have correct structure for failed result', async () => {
      const testOutput = `FAIL src/test.test.ts
  Error message`;

      vi.doMock('../../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockReturnValue(testOutput),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Failed');
        }),
      }));

      const { runTests } = await import('../../automation/test-runner.js');
      const result = runTests(['test.test.ts'], '/project');

      expect(result.failures[0]).toHaveProperty('testFile');
      expect(result.failures[0]).toHaveProperty('testName');
      expect(result.failures[0]).toHaveProperty('error');
      expect(typeof result.failures[0].testFile).toBe('string');
      expect(typeof result.failures[0].testName).toBe('string');
      expect(typeof result.failures[0].error).toBe('string');
    });
  });
});
