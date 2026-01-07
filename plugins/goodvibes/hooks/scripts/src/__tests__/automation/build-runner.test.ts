/**
 * Tests for automation/build-runner.ts
 *
 * Covers all build runner functionality including:
 * - detectBuildCommand: Detect build command based on project config
 * - runBuild: Execute build and return structured results
 * - runTypeCheck: Run TypeScript type checking
 * - parseBuildErrors: Parse TypeScript compiler output (internal)
 * - BUILD_COMMANDS: Build command configuration
 * - TYPECHECK_COMMAND: TypeScript check command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('build-runner', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // BUILD_COMMANDS and TYPECHECK_COMMAND exports
  // =============================================================================
  describe('exports', () => {
    it('should export BUILD_COMMANDS with expected framework commands', async () => {
      const { BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');

      expect(BUILD_COMMANDS).toEqual({
        next: 'npm run build',
        vite: 'npm run build',
        typescript: 'npx tsc --noEmit',
        default: 'npm run build',
      });
    });

    it('should export TYPECHECK_COMMAND as tsc --noEmit', async () => {
      const { TYPECHECK_COMMAND } =
        await import('../../automation/build-runner.js');

      expect(TYPECHECK_COMMAND).toBe('npx tsc --noEmit');
    });
  });

  // =============================================================================
  // detectBuildCommand tests
  // =============================================================================
  describe('detectBuildCommand', () => {
    it('should return next command when next.config.js exists', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          return Promise.resolve(filePath.endsWith('next.config.js'));
        }),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.next);
    });

    it('should return next command when next.config.mjs exists', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          return Promise.resolve(filePath.endsWith('next.config.mjs'));
        }),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.next);
    });

    it('should return next command when next.config.ts exists', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          return Promise.resolve(filePath.endsWith('next.config.ts'));
        }),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.next);
    });

    it('should return vite command when vite.config.ts exists', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          return Promise.resolve(filePath.endsWith('vite.config.ts'));
        }),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.vite);
    });

    it('should return vite command when vite.config.js exists', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          return Promise.resolve(filePath.endsWith('vite.config.js'));
        }),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.vite);
    });

    it('should return default command when no framework config found', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.default);
    });

    it('should prioritize Next.js over Vite when both exist', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          // Both next.config.js and vite.config.ts exist
          return Promise.resolve(
            filePath.endsWith('next.config.js') ||
              filePath.endsWith('vite.config.ts')
          );
        }),
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand, BUILD_COMMANDS } =
        await import('../../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe(BUILD_COMMANDS.next);
    });

    it('should check all Next.js config variants in parallel', async () => {
      const mockFileExists = vi.fn().mockResolvedValue(false);
      vi.doMock('../../shared/index.js', () => ({
        fileExists: mockFileExists,
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand } =
        await import('../../automation/build-runner.js');
      await detectBuildCommand('/test/project');

      // Should check next.config.js, next.config.mjs, next.config.ts
      const nextConfigCalls = mockFileExists.mock.calls.filter(
        (call: string[]) => call[0].includes('next.config')
      );
      expect(nextConfigCalls).toHaveLength(3);
    });

    it('should check all Vite config variants in parallel', async () => {
      const mockFileExists = vi.fn().mockResolvedValue(false);
      vi.doMock('../../shared/index.js', () => ({
        fileExists: mockFileExists,
        extractErrorOutput: vi.fn(),
      }));

      const { detectBuildCommand } =
        await import('../../automation/build-runner.js');
      await detectBuildCommand('/test/project');

      // Should check vite.config.ts, vite.config.js
      const viteConfigCalls = mockFileExists.mock.calls.filter(
        (call: string[]) => call[0].includes('vite.config')
      );
      expect(viteConfigCalls).toHaveLength(2);
    });
  });

  // =============================================================================
  // runBuild tests
  // =============================================================================
  describe('runBuild', () => {
    it('should return passed result when build succeeds', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('Build successful')),
      }));

      const { runBuild } = await import('../../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result).toEqual({
        passed: true,
        summary: 'Build passed',
        errors: [],
      });
    });

    it('should return failed result with parsed errors when build fails', async () => {
      const errorOutput = `
src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils.ts(25,10): error TS2304: Cannot find name 'foo'.
`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Build failed');
        }),
      }));

      const { runBuild } = await import('../../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result.passed).toBe(false);
      expect(result.summary).toBe('Build failed');
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toEqual({
        file: 'src/index.ts',
        line: 10,
        message: "Type 'string' is not assignable to type 'number'.",
      });
      expect(result.errors[1]).toEqual({
        file: 'src/utils.ts',
        line: 25,
        message: "Cannot find name 'foo'.",
      });
    });

    it('should use detected build command', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from(''));
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockImplementation((filePath: string) => {
          return Promise.resolve(filePath.endsWith('next.config.js'));
        }),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runBuild } = await import('../../automation/build-runner.js');
      await runBuild('/test/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        'npm run build',
        expect.objectContaining({
          cwd: '/test/project',
          stdio: 'pipe',
          timeout: 120000,
        })
      );
    });

    it('should pass cwd and timeout to execSync', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from(''));
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runBuild } = await import('../../automation/build-runner.js');
      await runBuild('/my/custom/path');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cwd: '/my/custom/path',
          stdio: 'pipe',
          timeout: 120000,
        })
      );
    });
  });

  // =============================================================================
  // runTypeCheck tests
  // =============================================================================
  describe('runTypeCheck', () => {
    it('should return passed result when type check succeeds', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('')),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result).toEqual({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });
    });

    it('should return failed result with parsed errors when type check fails', async () => {
      const errorOutput = `
src/components/Button.tsx(15,3): error TS2741: Property 'onClick' is missing in type '{}' but required in type 'ButtonProps'.
`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.passed).toBe(false);
      expect(result.summary).toBe('Type errors found');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        file: 'src/components/Button.tsx',
        line: 15,
        message:
          "Property 'onClick' is missing in type '{}' but required in type 'ButtonProps'.",
      });
    });

    it('should use TYPECHECK_COMMAND', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from(''));
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runTypeCheck, TYPECHECK_COMMAND } =
        await import('../../automation/build-runner.js');
      runTypeCheck('/test/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        TYPECHECK_COMMAND,
        expect.objectContaining({
          cwd: '/test/project',
          stdio: 'pipe',
          timeout: 120000,
        })
      );
    });

    it('should pass cwd and timeout to execSync', async () => {
      const mockExecSync = vi.fn().mockReturnValue(Buffer.from(''));
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: mockExecSync,
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      runTypeCheck('/my/project/path');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cwd: '/my/project/path',
          stdio: 'pipe',
          timeout: 120000,
        })
      );
    });
  });

  // =============================================================================
  // parseBuildErrors tests (tested via runBuild and runTypeCheck)
  // =============================================================================
  describe('parseBuildErrors behavior', () => {
    it('should parse multiple errors from output', async () => {
      const errorOutput = `
src/a.ts(1,1): error TS1001: First error
src/b.ts(2,2): error TS1002: Second error
src/c.ts(3,3): error TS1003: Third error
`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors).toHaveLength(3);
    });

    it('should extract file path correctly from error', async () => {
      const errorOutput = `path/to/deep/nested/file.ts(42,10): error TS2345: Argument of type 'string' is not assignable.`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors[0].file).toBe('path/to/deep/nested/file.ts');
    });

    it('should extract line number correctly from error', async () => {
      const errorOutput = `src/file.ts(123,5): error TS2345: Some error message.`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors[0].line).toBe(123);
    });

    it('should extract error message correctly', async () => {
      const errorOutput = `src/file.ts(1,1): error TS2345: This is a detailed error message with special chars: 'string' | number.`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors[0].message).toBe(
        "This is a detailed error message with special chars: 'string' | number."
      );
    });

    it('should ignore non-matching lines', async () => {
      const errorOutput = `
Starting type check...
src/file.ts(1,1): error TS2345: Actual error.
Some random output
Warning: something happened
Build completed with errors.
`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Actual error.');
    });

    it('should return empty array when no errors match pattern', async () => {
      const errorOutput = `
Build failed due to unknown reason.
No TypeScript errors in standard format.
`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty output', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(''),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors).toHaveLength(0);
    });

    it('should handle Windows-style paths', async () => {
      const errorOutput = `C:\\Users\\dev\\project\\src\\file.ts(10,5): error TS2322: Type error.`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].file).toBe(
        'C:\\Users\\dev\\project\\src\\file.ts'
      );
    });

    it('should handle various TypeScript error codes', async () => {
      const errorOutput = `
file.ts(1,1): error TS1: Error with single digit code.
file.ts(2,1): error TS12: Error with two digit code.
file.ts(3,1): error TS123: Error with three digit code.
file.ts(4,1): error TS1234: Error with four digit code.
file.ts(5,1): error TS12345: Error with five digit code.
`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors).toHaveLength(5);
    });

    it('should handle file paths with special characters', async () => {
      const errorOutput = `src/components/my-component.test.tsx(5,10): error TS2345: Error in test file.`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn(),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Type check failed');
        }),
      }));

      const { runTypeCheck } = await import('../../automation/build-runner.js');
      const result = runTypeCheck('/test/project');

      expect(result.errors[0].file).toBe(
        'src/components/my-component.test.tsx'
      );
    });
  });

  // =============================================================================
  // BuildResult interface tests
  // =============================================================================
  describe('BuildResult interface', () => {
    it('should have correct structure for passed result', async () => {
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
        extractErrorOutput: vi.fn(),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('')),
      }));

      const { runBuild } = await import('../../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('errors');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.summary).toBe('string');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should have correct error structure for failed result', async () => {
      const errorOutput = `src/file.ts(10,5): error TS2322: Type error.`;
      vi.doMock('../../shared/index.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
        extractErrorOutput: vi.fn().mockReturnValue(errorOutput),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('Build failed');
        }),
      }));

      const { runBuild } = await import('../../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result.errors[0]).toHaveProperty('file');
      expect(result.errors[0]).toHaveProperty('line');
      expect(result.errors[0]).toHaveProperty('message');
      expect(typeof result.errors[0].file).toBe('string');
      expect(typeof result.errors[0].line).toBe('number');
      expect(typeof result.errors[0].message).toBe('string');
    });
  });
});
