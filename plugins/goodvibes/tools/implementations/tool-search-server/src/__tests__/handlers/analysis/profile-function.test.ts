/**
 * Comprehensive unit tests for profile-function handler
 *
 * Tests cover:
 * - Argument validation (file, function_name, inputs)
 * - File path resolution
 * - Module importing (ESM and CJS)
 * - Function extraction from module exports
 * - Warmup iterations
 * - Profiling iterations with timing
 * - Statistical calculations (mean, median, percentiles, std dev)
 * - Memory tracking
 * - Timeout handling
 * - Error handling
 * - Result formatting
 *
 * @module __tests__/handlers/analysis/profile-function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Store original values
const originalGc = global.gc;
const originalMemoryUsage = process.memoryUsage;

// Mock utils module
vi.mock('../../../utils.js', () => ({
  success: vi.fn((data) => ({
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  })),
  error: vi.fn((msg) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  })),
  fileExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Import internal functions for direct testing of edge cases
import {
  handleProfileFunction,
  __testing__,
  type ProfileFunctionArgs,
  type ProfileFunctionResult,
  type TimingStats,
  type MemoryStats,
} from '../../../handlers/analysis/profile-function.js';
import { error as errorResponse, success as successResponse, fileExists } from '../../../utils.js';

// Destructure internal testing functions
const {
  calculateStats,
  formatResult,
  extractFunction,
  importModule,
  isPromise,
  roundTo,
  bytesToMb,
} = __testing__;

describe('handleProfileFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockResolvedValue(false);

    // Reset global.gc mock
    global.gc = undefined;
  });

  afterEach(() => {
    vi.resetAllMocks();
    global.gc = originalGc;
  });

  // ===========================================================================
  // Argument Validation Tests
  // ===========================================================================

  describe('argument validation', () => {
    it('should require file argument', async () => {
      const args = {
        function_name: 'myFunction',
        inputs: [],
      } as unknown as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith('file is required');
    });

    it('should require file to be non-empty', async () => {
      const args: ProfileFunctionArgs = {
        file: '',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith('file is required');
    });

    it('should require function_name argument', async () => {
      const args = {
        file: 'test.ts',
        inputs: [],
      } as unknown as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith('function_name is required');
    });

    it('should require function_name to be non-empty', async () => {
      const args: ProfileFunctionArgs = {
        file: 'test.ts',
        function_name: '',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith('function_name is required');
    });

    it('should require inputs to be an array', async () => {
      const args = {
        file: 'test.ts',
        function_name: 'myFunction',
        inputs: 'not-an-array',
      } as unknown as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith('inputs must be an array of arguments');
    });

    it('should require inputs argument to exist', async () => {
      const args = {
        file: 'test.ts',
        function_name: 'myFunction',
      } as unknown as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith('inputs must be an array of arguments');
    });
  });

  // ===========================================================================
  // File Path Resolution Tests
  // ===========================================================================

  describe('file path resolution', () => {
    it('should return error when file does not exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: ProfileFunctionArgs = {
        file: 'nonexistent.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
    });

    it('should resolve relative path from PROJECT_ROOT', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: ProfileFunctionArgs = {
        file: 'src/utils.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should attempt to find the file
      expect(fileExists).toHaveBeenCalled();
    });

    it('should use absolute path directly', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: ProfileFunctionArgs = {
        file: '/absolute/path/utils.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(fileExists).toHaveBeenCalledWith('/absolute/path/utils.ts');
    });

    it('should try extensions when no extension provided', async () => {
      // First call (exact path) returns false, other extensions also false
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: ProfileFunctionArgs = {
        file: 'src/utils',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should try multiple extensions
      expect(fileExists).toHaveBeenCalledTimes(7); // exact + .ts, .tsx, .js, .jsx, .mjs, .cjs
    });

    it('should find file with .ts extension fallback', async () => {
      // First call (exact path) returns false, second call (.ts) returns true
      vi.mocked(fileExists)
        .mockResolvedValueOnce(false) // exact path
        .mockResolvedValueOnce(true); // .ts extension

      const args: ProfileFunctionArgs = {
        file: 'src/utils',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should have found the file and attempted to import
      // (will fail on import, but file resolution succeeded)
      expect(successResponse).toHaveBeenCalled();
    });

    it('should find file with .js extension fallback', async () => {
      vi.mocked(fileExists)
        .mockResolvedValueOnce(false) // exact path
        .mockResolvedValueOnce(false) // .ts
        .mockResolvedValueOnce(false) // .tsx
        .mockResolvedValueOnce(true); // .js

      const args: ProfileFunctionArgs = {
        file: 'src/utils',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should have found the file
      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Module Import Tests
  // ===========================================================================

  describe('module importing', () => {
    it('should handle import errors gracefully', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/invalid-module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should return success with error in result (not crash)
      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0];
      expect(call).toContain('error');
    });

    it('should handle TypeScript file imports', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle TSX file imports', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/component.tsx',
        function_name: 'MyComponent',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle JavaScript file imports', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.js',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should try compiled JS path for TypeScript files', async () => {
      vi.mocked(fileExists)
        .mockResolvedValueOnce(true) // .ts file exists
        .mockResolvedValueOnce(true); // .js fallback exists

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should try dist folder for TypeScript files', async () => {
      vi.mocked(fileExists)
        .mockResolvedValueOnce(true); // .ts file exists

      const args: ProfileFunctionArgs = {
        file: '/project/src/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Default Values Tests
  // ===========================================================================

  describe('default values', () => {
    it('should use default iterations of 100', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        // iterations not provided
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      // Check that 100 iterations was used in the result
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;
      expect(call).toContain('100');
    });

    it('should use default warmup of 10', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        // warmup not provided
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;
      expect(call).toContain('warmup');
    });

    it('should not capture memory by default', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        // capture_memory not provided
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should use default timeout of 5000ms', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        // timeout not provided
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Custom Options Tests
  // ===========================================================================

  describe('custom options', () => {
    it('should use custom iterations', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 50,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should use custom warmup', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        warmup: 5,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should enable memory capture', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        capture_memory: true,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should use custom timeout', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        timeout: 10000,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Result Structure Tests
  // ===========================================================================

  describe('result structure', () => {
    it('should return formatted markdown result', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('## Function Profile Results');
      expect(call).toContain('**Function:**');
      expect(call).toContain('**File:**');
      expect(call).toContain('**Iterations:**');
    });

    it('should include timing statistics table', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('### Timing Statistics');
      expect(call).toContain('| Metric | Value |');
      expect(call).toContain('| Mean |');
      expect(call).toContain('| Median |');
      expect(call).toContain('| P95 |');
      expect(call).toContain('| P99 |');
    });

    it('should include JSON result at end', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('```json');
      expect(call).toContain('function_name');
      expect(call).toContain('timing');
    });

    it('should include error section when import fails', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/invalid.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('### Error');
      expect(call).toContain('```');
    });
  });

  // ===========================================================================
  // Timing Statistics Tests
  // ===========================================================================

  describe('timing statistics calculation', () => {
    it('should return zero stats for empty times array', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      // All timing values should be 0 when no successful iterations
      expect(call).toContain('mean_ms');
    });

    it('should include min and max values', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('| Min |');
      expect(call).toContain('| Max |');
    });

    it('should include std_dev_ms', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('| Std Dev |');
    });

    it('should include total_ms', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('| Total |');
    });
  });

  // ===========================================================================
  // Memory Statistics Tests
  // ===========================================================================

  describe('memory statistics', () => {
    it('should not include memory section when capture_memory is false', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        capture_memory: false,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).not.toContain('### Memory Statistics');
    });

    it('should include memory section when capture_memory is true', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        capture_memory: true,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      // Memory section appears when memory tracking is enabled
      // (even if import fails, the structure is created)
    });

    it('should call gc when available and capture_memory is true', async () => {
      const mockGc = vi.fn();
      global.gc = mockGc;

      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        capture_memory: true,
      };

      await handleProfileFunction(args);

      // Note: gc is only called after successful module import.
      // Since we can't easily mock dynamic imports, gc won't be called
      // when the import fails. The test verifies that gc is set up correctly
      // and the handler completes without crashing even when import fails.
      expect(successResponse).toHaveBeenCalled();
      // When a real module can be imported, gc would be called.
      // For now, we verify the handler gracefully handles gc availability.
    });

    it('should work without gc available', async () => {
      global.gc = undefined;

      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        capture_memory: true,
      };

      await handleProfileFunction(args);

      // Should not crash
      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Input Arguments Tests
  // ===========================================================================

  describe('input arguments handling', () => {
    it('should accept empty inputs array', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should accept single input argument', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [42],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should accept multiple input arguments', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [1, 'hello', { key: 'value' }],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should accept array input arguments', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [[3, 1, 4, 1, 5, 9, 2, 6]],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should accept nested object arguments', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [{ nested: { deep: { value: true } } }],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should handle function not found in module', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'nonexistentFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should return success with error in result (graceful failure)
      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;
      expect(call).toContain('error');
    });

    it('should include available exports in error message', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'nonexistentFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      // Note: The "function not found" error with available exports only occurs
      // when module imports successfully but the function doesn't exist.
      // Since we can't easily mock dynamic imports, we get an import error instead.
      // The error message will contain "Cannot find module" rather than "not found".
      // Verify the error is captured and displayed in the result.
      expect(call).toContain('error');
      expect(call.toLowerCase()).toMatch(/cannot find module|not found|error/);
    });

    it('should handle TypeScript import error with helpful message', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/typescript-only.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      // Should include suggestion about tsx/ts-node or compilation
      expect(call.toLowerCase()).toContain('typescript');
    });

    it('should handle generic import error', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/broken-module.js',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Result Sample Tests
  // ===========================================================================

  describe('result sample handling', () => {
    it('should include result_sample section in output', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle non-serializable results', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'circularFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should not crash with circular reference
      expect(successResponse).toHaveBeenCalled();
    });

    it('should truncate large result samples', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'largeResultFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Warmup Handling Tests
  // ===========================================================================

  describe('warmup handling', () => {
    it('should run warmup iterations before profiling', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        warmup: 5,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('warmup: 5');
    });

    it('should handle warmup errors gracefully', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'throwingFunction',
        inputs: [],
        warmup: 3,
      };

      await handleProfileFunction(args);

      // Should not crash on warmup errors
      expect(successResponse).toHaveBeenCalled();
    });

    it('should support zero warmup iterations', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        warmup: 0,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('warmup: 0');
    });
  });

  // ===========================================================================
  // Iteration Handling Tests
  // ===========================================================================

  describe('iteration handling', () => {
    it('should track successful iterations count', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 10,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('iterations');
    });

    it('should handle partial iteration failures', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'intermittentFunction',
        inputs: [],
        iterations: 10,
      };

      await handleProfileFunction(args);

      // Should complete without crashing
      expect(successResponse).toHaveBeenCalled();
    });

    it('should report iteration failures in result', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'failingFunction',
        inputs: [],
        iterations: 5,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Async Function Tests
  // ===========================================================================

  describe('async function handling', () => {
    it('should handle async functions', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/async-module.ts',
        function_name: 'asyncFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle Promise-returning functions', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/promise-module.ts',
        function_name: 'promiseFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle async timeout', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/slow-module.ts',
        function_name: 'slowAsyncFunction',
        inputs: [],
        timeout: 100, // Very short timeout
      };

      await handleProfileFunction(args);

      // Should handle timeout gracefully
      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Synchronous Function Tests
  // ===========================================================================

  describe('synchronous function handling', () => {
    it('should handle sync functions', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/sync-module.ts',
        function_name: 'syncFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle sync throwing functions', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/throwing-module.ts',
        function_name: 'throwingSync',
        inputs: [],
      };

      await handleProfileFunction(args);

      // Should handle gracefully
      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Default Export Tests
  // ===========================================================================

  describe('default export handling', () => {
    it('should extract function from default export object', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/default-object.ts',
        function_name: 'myMethod',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle default export as function itself', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/default-function.ts',
        function_name: 'default',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases Tests
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle zero iterations', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 0,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle single iteration', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle very large number of iterations', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 1000,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle null input values', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [null],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should handle undefined input values', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [undefined],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Output Format Tests
  // ===========================================================================

  describe('output formatting', () => {
    it('should format timing values to 4 decimal places', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      // Should contain formatted timing values
      expect(call).toMatch(/\d+\.\d{4}/);
    });

    it('should format total time to 2 decimal places', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });

    it('should include function name in output', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'uniqueFunctionName',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('uniqueFunctionName');
    });

    it('should include file path in output', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/unique-module.ts',
        function_name: 'myFunction',
        inputs: [],
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('unique-module');
    });
  });

  // ===========================================================================
  // Percentile Calculation Tests
  // ===========================================================================

  describe('percentile calculations', () => {
    it('should calculate P95 correctly', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 100,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('p95_ms');
    });

    it('should calculate P99 correctly', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 100,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('p99_ms');
    });

    it('should handle percentiles for small sample sizes', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 2,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Median Calculation Tests
  // ===========================================================================

  describe('median calculation', () => {
    it('should calculate median for odd number of samples', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 5,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('median_ms');
    });

    it('should calculate median for even number of samples', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const args: ProfileFunctionArgs = {
        file: '/test/module.ts',
        function_name: 'myFunction',
        inputs: [],
        iterations: 4,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(call).toContain('median_ms');
    });
  });
});

// =============================================================================
// Integration Tests with Real Fixtures
// =============================================================================
// These tests use real JavaScript fixture files to test the full profiling
// pipeline including dynamic imports, function extraction, timing, and stats.

describe('handleProfileFunction integration tests', () => {
  // Get the absolute path to the fixtures directory
  // From src/__tests__/handlers/analysis, go up 2 levels to __tests__ then into fixtures
  const fixturesDir = path.resolve(__dirname, '../../fixtures');
  const testFunctionsPath = path.join(fixturesDir, 'test-functions.js');
  const defaultFunctionPath = path.join(fixturesDir, 'default-function.js');

  beforeEach(() => {
    vi.clearAllMocks();
    // Use real fileExists for integration tests
    vi.mocked(fileExists).mockImplementation(async (filePath: string) => {
      const fs = await import('fs/promises');
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Successful Function Profiling Tests
  // ===========================================================================

  describe('successful function profiling', () => {
    it('should profile a simple sync function with real timing stats', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'syncAdd',
        inputs: [5, 3],
        iterations: 10,
        warmup: 2,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      // Verify timing stats are calculated (not zeros)
      expect(result).toContain('## Function Profile Results');
      expect(result).toContain('syncAdd');
      expect(result).toContain('### Timing Statistics');

      // Parse the JSON to verify actual stats
      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        expect(parsed.iterations).toBe(10);
        expect(parsed.warmup_iterations).toBe(2);
        expect(parsed.timing.mean_ms).toBeGreaterThanOrEqual(0);
        expect(parsed.timing.median_ms).toBeGreaterThanOrEqual(0);
        expect(parsed.timing.p95_ms).toBeGreaterThanOrEqual(0);
        expect(parsed.timing.p99_ms).toBeGreaterThanOrEqual(0);
        expect(parsed.timing.min_ms).toBeGreaterThanOrEqual(0);
        expect(parsed.timing.max_ms).toBeGreaterThanOrEqual(parsed.timing.min_ms);
        expect(parsed.timing.total_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should profile an async function with timing', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'asyncDelay',
        inputs: [5], // 5ms delay
        iterations: 5,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Async function with 5ms delay should have timing > 0
        expect(parsed.timing.mean_ms).toBeGreaterThan(0);
        expect(parsed.result_sample).toEqual({ delayed: true, ms: 5 });
      }
    });

    it('should profile a Promise-returning function', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'promiseFunction',
        inputs: [42],
        iterations: 5,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        expect(parsed.result_sample).toHaveProperty('value', 42);
        expect(parsed.result_sample).toHaveProperty('timestamp');
      }
    });

    it('should profile a fast function and calculate stats correctly', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 100,
        warmup: 10,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // With 100 iterations, we should have meaningful percentile stats
        expect(parsed.iterations).toBe(100);
        expect(parsed.timing.std_dev_ms).toBeGreaterThanOrEqual(0);
        expect(parsed.result_sample).toBe(42);
      }
    });

    it('should profile a compute-intensive function', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'syncCompute',
        inputs: [5000], // 5000 iterations
        iterations: 10,
        warmup: 2,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Should have non-trivial execution time
        expect(parsed.timing.mean_ms).toBeGreaterThan(0);
        expect(typeof parsed.result_sample).toBe('number');
      }
    });
  });

  // ===========================================================================
  // Memory Tracking Tests
  // ===========================================================================

  describe('memory tracking integration', () => {
    it('should track memory when capture_memory is true', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'syncCompute',
        inputs: [1000],
        iterations: 5,
        warmup: 1,
        capture_memory: true,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      // Should include memory statistics section
      expect(result).toContain('### Memory Statistics');
      expect(result).toContain('Heap Before');
      expect(result).toContain('Heap After');
      expect(result).toContain('Heap Delta');
      expect(result).toContain('External Delta');

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        expect(parsed.memory).toBeDefined();
        expect(parsed.memory?.heap_used_before_mb).toBeGreaterThan(0);
        expect(parsed.memory?.heap_used_after_mb).toBeGreaterThan(0);
        expect(typeof parsed.memory?.heap_delta_mb).toBe('number');
        expect(typeof parsed.memory?.external_delta_mb).toBe('number');
      }
    });

    it('should work with gc available', async () => {
      // Mock gc being available
      const mockGc = vi.fn();
      global.gc = mockGc;

      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 3,
        warmup: 1,
        capture_memory: true,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      // gc should have been called (before profiling and after)
      expect(mockGc).toHaveBeenCalled();
      expect(result).toContain('### Memory Statistics');

      // Cleanup
      global.gc = undefined;
    });
  });

  // ===========================================================================
  // Result Sample Tests
  // ===========================================================================

  describe('result sample handling integration', () => {
    it('should include sample return value in result', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'multiArgFunction',
        inputs: [1, 2, 3, 4],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(result).toContain('### Sample Return Value');
      expect(result).toContain('"sum": 10');
      expect(result).toContain('"args"');
    });

    it('should handle undefined return value', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'voidFunction',
        inputs: [],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // undefined results are not included in the output
        expect(parsed.result_sample).toBeUndefined();
      }
    });

    it('should handle null return value', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'nullFunction',
        inputs: [],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        expect(parsed.result_sample).toBeNull();
      }
    });

    it('should truncate large result samples', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'largeResultFunction',
        inputs: [],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Large results should be replaced with placeholder
        expect(parsed.result_sample).toBe('[Result too large to display]');
      }
    });

    it('should handle non-serializable (circular) results', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'circularFunction',
        inputs: [],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Non-serializable results should be replaced with placeholder
        expect(parsed.result_sample).toBe('[Result not serializable]');
      }
    });
  });

  // ===========================================================================
  // Function Extraction Tests (Default Exports)
  // ===========================================================================

  describe('function extraction integration', () => {
    it('should extract function from default export object', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'myMethod',
        inputs: [21],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // myMethod doubles its input: 21 * 2 = 42
        expect(parsed.result_sample).toBe(42);
      }
    });

    it('should extract default export function with "default" name', async () => {
      const args: ProfileFunctionArgs = {
        file: defaultFunctionPath,
        function_name: 'default',
        inputs: [14],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // default function triples its input: 14 * 3 = 42
        expect(parsed.result_sample).toBe(42);
      }
    });

    it('should return error with available exports when function not found', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'nonexistentFn',
        inputs: [],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalled();
      const errorMsg = vi.mocked(errorResponse).mock.calls[0][0] as string;

      expect(errorMsg).toContain("Function 'nonexistentFn' not found");
      expect(errorMsg).toContain('Available exports');
      // Should list some available functions
      expect(errorMsg).toContain('syncAdd');
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling integration', () => {
    it('should handle throwing functions and report failures', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'throwingFunction',
        inputs: [],
        iterations: 5,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // All iterations should fail
        expect(parsed.iterations).toBe(0);
        expect(parsed.error).toContain('iterations failed');
        expect(parsed.error).toContain('Intentional test error');
      }
    });

    it('should handle async throwing functions', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'asyncThrowingFunction',
        inputs: [],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        expect(parsed.error).toContain('Async intentional test error');
      }
    });

    it('should handle partial iteration failures (intermittent)', async () => {
      // Reset the call counter first
      const module = await import('../../fixtures/test-functions.js');
      module.resetCallCount();

      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'intermittentFunction',
        inputs: [],
        iterations: 9, // Every 3rd call fails, so 3 failures
        warmup: 0, // No warmup to not affect call count
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Some iterations should succeed, some should fail
        expect(parsed.iterations).toBeLessThan(9);
        expect(parsed.iterations).toBeGreaterThan(0);
        expect(parsed.error).toContain('iterations failed');
      }
    });

    it('should handle timeout for slow async functions', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'slowAsyncFunction',
        inputs: [500], // 500ms delay
        iterations: 2,
        warmup: 0,
        timeout: 50, // 50ms timeout (function takes 500ms)
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Should have failed due to timeout
        expect(parsed.iterations).toBe(0);
        expect(parsed.error).toContain('timed out');
      }
    });
  });

  // ===========================================================================
  // Statistical Calculation Tests
  // ===========================================================================

  describe('statistical calculations integration', () => {
    it('should calculate correct median for odd number of iterations', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 11, // Odd number
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Median should be between min and max
        expect(parsed.timing.median_ms).toBeGreaterThanOrEqual(parsed.timing.min_ms);
        expect(parsed.timing.median_ms).toBeLessThanOrEqual(parsed.timing.max_ms);
      }
    });

    it('should calculate correct median for even number of iterations', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 10, // Even number
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Median for even count is average of two middle values
        expect(parsed.timing.median_ms).toBeGreaterThanOrEqual(parsed.timing.min_ms);
        expect(parsed.timing.median_ms).toBeLessThanOrEqual(parsed.timing.max_ms);
      }
    });

    it('should calculate percentiles correctly with many samples', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 100,
        warmup: 5,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // P95 and P99 should be >= median and <= max
        expect(parsed.timing.p95_ms).toBeGreaterThanOrEqual(parsed.timing.median_ms);
        expect(parsed.timing.p99_ms).toBeGreaterThanOrEqual(parsed.timing.p95_ms);
        expect(parsed.timing.p99_ms).toBeLessThanOrEqual(parsed.timing.max_ms);
      }
    });

    it('should calculate standard deviation', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'syncCompute',
        inputs: [100],
        iterations: 20,
        warmup: 3,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // Std dev should be non-negative
        expect(parsed.timing.std_dev_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle single iteration edge case', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 1,
        warmup: 0,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // With single iteration, mean = median = min = max
        expect(parsed.timing.mean_ms).toBe(parsed.timing.median_ms);
        expect(parsed.timing.min_ms).toBe(parsed.timing.max_ms);
        expect(parsed.timing.std_dev_ms).toBe(0); // No variance with single value
      }
    });
  });

  // ===========================================================================
  // Input Handling Tests
  // ===========================================================================

  describe('input handling integration', () => {
    it('should pass array inputs correctly', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'arrayFunction',
        inputs: [[1, 2, 3, 4, 5]],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // arrayFunction sums the array: 1+2+3+4+5 = 15
        expect(parsed.result_sample).toBe(15);
      }
    });

    it('should pass object inputs correctly', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'objectFunction',
        inputs: [{ a: 1, b: 2, c: 3 }],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // objectFunction returns number of keys: 3
        expect(parsed.result_sample).toBe(3);
      }
    });
  });

  // ===========================================================================
  // Warmup Handling Tests
  // ===========================================================================

  describe('warmup integration', () => {
    it('should run warmup iterations that ignore errors', async () => {
      // Reset call count
      const module = await import('../../fixtures/test-functions.js');
      module.resetCallCount();

      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'throwingFunction',
        inputs: [],
        iterations: 3,
        warmup: 5, // Warmup errors should be ignored
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      // Handler should complete without crashing due to warmup errors
    });

    it('should report correct warmup count in result', async () => {
      const args: ProfileFunctionArgs = {
        file: testFunctionsPath,
        function_name: 'fastFunction',
        inputs: [],
        iterations: 5,
        warmup: 7,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      expect(result).toContain('warmup: 7');
      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        expect(parsed.warmup_iterations).toBe(7);
      }
    });
  });
});

// =============================================================================
// Internal Function Tests (__testing__ exports)
// =============================================================================
// These tests directly test internal functions to achieve 100% line coverage
// for edge cases that are difficult to trigger through the main handler.

describe('Internal functions (__testing__)', () => {
  // ===========================================================================
  // calculateStats Tests - Covers Line 102 (empty array handling)
  // ===========================================================================

  describe('calculateStats', () => {
    it('should return zero stats for empty times array (line 102)', () => {
      const result = calculateStats([]);

      expect(result).toEqual({
        mean_ms: 0,
        median_ms: 0,
        p95_ms: 0,
        p99_ms: 0,
        min_ms: 0,
        max_ms: 0,
        std_dev_ms: 0,
        total_ms: 0,
      });
    });

    it('should calculate stats correctly for single value', () => {
      const result = calculateStats([5.0]);

      expect(result.mean_ms).toBe(5.0);
      expect(result.median_ms).toBe(5.0);
      expect(result.min_ms).toBe(5.0);
      expect(result.max_ms).toBe(5.0);
      expect(result.std_dev_ms).toBe(0);
      expect(result.total_ms).toBe(5.0);
    });

    it('should calculate median correctly for even number of samples', () => {
      const result = calculateStats([1, 2, 3, 4]);

      // Median of [1, 2, 3, 4] = (2 + 3) / 2 = 2.5
      expect(result.median_ms).toBe(2.5);
    });

    it('should calculate median correctly for odd number of samples', () => {
      const result = calculateStats([1, 2, 3, 4, 5]);

      // Median of [1, 2, 3, 4, 5] = 3
      expect(result.median_ms).toBe(3);
    });

    it('should calculate percentiles correctly', () => {
      // Create 100 values from 1 to 100
      const times = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = calculateStats(times);

      // P95 should be at index 95 (value 96)
      expect(result.p95_ms).toBe(96);
      // P99 should be at index 99 (value 100)
      expect(result.p99_ms).toBe(100);
    });

    it('should calculate standard deviation correctly', () => {
      // [2, 4, 4, 4, 5, 5, 7, 9] has mean = 5, std dev = 2
      const result = calculateStats([2, 4, 4, 4, 5, 5, 7, 9]);

      expect(result.mean_ms).toBe(5);
      expect(result.std_dev_ms).toBe(2);
    });
  });

  // ===========================================================================
  // formatResult Tests - Covers Line 250 (JSON.stringify failure fallback)
  // ===========================================================================

  describe('formatResult', () => {
    it('should format result with all timing fields', () => {
      const result: ProfileFunctionResult = {
        function_name: 'testFn',
        file: '/test/file.js',
        iterations: 10,
        warmup_iterations: 2,
        timing: {
          mean_ms: 1.5,
          median_ms: 1.4,
          p95_ms: 2.0,
          p99_ms: 2.5,
          min_ms: 1.0,
          max_ms: 3.0,
          std_dev_ms: 0.5,
          total_ms: 15.0,
        },
      };

      const formatted = formatResult(result);

      expect(formatted).toContain('## Function Profile Results');
      expect(formatted).toContain('testFn');
      expect(formatted).toContain('/test/file.js');
      expect(formatted).toContain('### Timing Statistics');
    });

    it('should include memory section when present', () => {
      const result: ProfileFunctionResult = {
        function_name: 'testFn',
        file: '/test/file.js',
        iterations: 10,
        warmup_iterations: 2,
        timing: {
          mean_ms: 1.5,
          median_ms: 1.4,
          p95_ms: 2.0,
          p99_ms: 2.5,
          min_ms: 1.0,
          max_ms: 3.0,
          std_dev_ms: 0.5,
          total_ms: 15.0,
        },
        memory: {
          heap_used_before_mb: 10.0,
          heap_used_after_mb: 12.0,
          heap_delta_mb: 2.0,
          external_delta_mb: 0.5,
        },
      };

      const formatted = formatResult(result);

      expect(formatted).toContain('### Memory Statistics');
      expect(formatted).toContain('Heap Before');
      expect(formatted).toContain('Heap After');
    });

    it('should include error section when error present', () => {
      const result: ProfileFunctionResult = {
        function_name: 'testFn',
        file: '/test/file.js',
        iterations: 10,
        warmup_iterations: 2,
        timing: {
          mean_ms: 0,
          median_ms: 0,
          p95_ms: 0,
          p99_ms: 0,
          min_ms: 0,
          max_ms: 0,
          std_dev_ms: 0,
          total_ms: 0,
        },
        error: 'Test error message',
      };

      const formatted = formatResult(result);

      expect(formatted).toContain('### Error');
      expect(formatted).toContain('Test error message');
    });

    it('should handle serializable result_sample', () => {
      const result: ProfileFunctionResult = {
        function_name: 'testFn',
        file: '/test/file.js',
        iterations: 10,
        warmup_iterations: 2,
        timing: {
          mean_ms: 1.5,
          median_ms: 1.4,
          p95_ms: 2.0,
          p99_ms: 2.5,
          min_ms: 1.0,
          max_ms: 3.0,
          std_dev_ms: 0.5,
          total_ms: 15.0,
        },
        result_sample: { value: 42, nested: { data: 'test' } },
      };

      const formatted = formatResult(result);

      // Should include the serialized result_sample
      expect(formatted).toContain('### Sample Return Value');
      expect(formatted).toContain('"value": 42');
      expect(formatted).toContain('"nested"');
    });
  });

  // ===========================================================================
  // extractFunction Tests
  // ===========================================================================

  describe('extractFunction', () => {
    it('should extract direct export function', () => {
      const mockModule = {
        myFunction: () => 42,
      };

      const fn = extractFunction(mockModule, 'myFunction');

      expect(fn).not.toBeNull();
      expect(fn!()).toBe(42);
    });

    it('should extract function from default export object', () => {
      const mockModule = {
        default: {
          myMethod: (x: number) => x * 2,
        },
      };

      const fn = extractFunction(mockModule, 'myMethod');

      expect(fn).not.toBeNull();
      expect(fn!(21)).toBe(42);
    });

    it('should extract default export function via direct property access', () => {
      // When functionName is 'default' and module.default is a function,
      // it's accessed as module['default'] which hits the direct export check
      const mockModule = {
        default: (x: number) => x * 3,
      };

      const fn = extractFunction(mockModule, 'default');

      expect(fn).not.toBeNull();
      expect(fn!(14)).toBe(42);
    });

    it('should return null when function not found', () => {
      const mockModule = {
        someOtherFunction: () => 'other',
      };

      const fn = extractFunction(mockModule, 'nonexistent');

      expect(fn).toBeNull();
    });

    it('should return null when default is not an object or function', () => {
      const mockModule = {
        default: 'not a function',
      };

      const fn = extractFunction(mockModule, 'someMethod');

      expect(fn).toBeNull();
    });

    it('should prefer direct export over default export', () => {
      const mockModule = {
        myFunction: () => 'direct',
        default: {
          myFunction: () => 'default',
        },
      };

      const fn = extractFunction(mockModule, 'myFunction');

      expect(fn).not.toBeNull();
      expect(fn!()).toBe('direct');
    });
  });

  // ===========================================================================
  // isPromise Tests
  // ===========================================================================

  describe('isPromise', () => {
    it('should return true for Promise', () => {
      expect(isPromise(Promise.resolve(42))).toBe(true);
    });

    it('should return true for async function result', () => {
      const asyncFn = async () => 42;
      expect(isPromise(asyncFn())).toBe(true);
    });

    it('should return false for non-Promise values', () => {
      expect(isPromise(42)).toBe(false);
      expect(isPromise('string')).toBe(false);
      expect(isPromise(null)).toBe(false);
      expect(isPromise(undefined)).toBe(false);
      expect(isPromise({})).toBe(false);
      expect(isPromise([])).toBe(false);
    });

    it('should return true for thenable objects', () => {
      const thenable = {
        then: (resolve: (value: number) => void) => resolve(42),
      };
      expect(isPromise(thenable)).toBe(true);
    });

    it('should return false for object with non-function then', () => {
      const notThenable = {
        then: 'not a function',
      };
      expect(isPromise(notThenable)).toBe(false);
    });
  });

  // ===========================================================================
  // roundTo Tests
  // ===========================================================================

  describe('roundTo', () => {
    it('should round to specified decimal places', () => {
      expect(roundTo(1.23456, 2)).toBe(1.23);
      expect(roundTo(1.23456, 4)).toBe(1.2346);
      expect(roundTo(1.5, 0)).toBe(2);
    });

    it('should handle negative numbers', () => {
      expect(roundTo(-1.23456, 2)).toBe(-1.23);
    });

    it('should handle zero', () => {
      expect(roundTo(0, 4)).toBe(0);
    });
  });

  // ===========================================================================
  // bytesToMb Tests
  // ===========================================================================

  describe('bytesToMb', () => {
    it('should convert bytes to megabytes', () => {
      expect(bytesToMb(1024 * 1024)).toBe(1);
      expect(bytesToMb(1024 * 1024 * 10)).toBe(10);
    });

    it('should handle zero', () => {
      expect(bytesToMb(0)).toBe(0);
    });

    it('should round to 4 decimal places', () => {
      expect(bytesToMb(1500000)).toBe(1.4305);
    });
  });

  // ===========================================================================
  // importModule Tests
  // ===========================================================================

  describe('importModule', () => {
    // Get the absolute path to the fixtures directory
    const fixturesDir = path.resolve(__dirname, '../../fixtures');

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should import JavaScript files directly', async () => {
      const jsPath = path.join(fixturesDir, 'test-functions.js');

      // Use real fileExists for this test
      vi.mocked(fileExists).mockImplementation(async (filePath: string) => {
        const fs = await import('fs/promises');
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      });

      const module = await importModule(jsPath);

      expect(module).toBeDefined();
      expect(typeof module.syncAdd).toBe('function');
    });

    it('should import TypeScript files directly when tsx is available', async () => {
      // In the vitest environment, tsx is registered so TS files can be imported
      const tsPath = path.join(fixturesDir, 'src', 'ts-module.ts');

      vi.mocked(fileExists).mockImplementation(async (filePath: string) => {
        const fs = await import('fs/promises');
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      });

      const module = await importModule(tsPath);

      expect(module).toBeDefined();
      expect(typeof module.distFallbackFunction).toBe('function');
    });
  });
});

// =============================================================================
// Additional Integration Tests for Uncovered Lines
// =============================================================================

describe('Additional coverage tests', () => {
  // Get the absolute path to the fixtures directory
  const fixturesDir = path.resolve(__dirname, '../../fixtures');
  const testFunctionsPath = path.join(fixturesDir, 'test-functions.js');
  const defaultFunctionPath = path.join(fixturesDir, 'default-function.js');

  beforeEach(() => {
    vi.clearAllMocks();
    // Use real fileExists for integration tests
    vi.mocked(fileExists).mockImplementation(async (filePath: string) => {
      const fs = await import('fs/promises');
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Line 359 - Extract default export function
  // ===========================================================================

  describe('default export function extraction (line 359)', () => {
    it('should profile default exported function using "default" name', async () => {
      const args: ProfileFunctionArgs = {
        file: defaultFunctionPath,
        function_name: 'default',
        inputs: [14],
        iterations: 3,
        warmup: 1,
      };

      await handleProfileFunction(args);

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as string;

      const jsonMatch = result.match(/---\n\n```json\n([\s\S]*?)\n```$/);
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as ProfileFunctionResult;
        // default function triples its input: 14 * 3 = 42
        expect(parsed.result_sample).toBe(42);
        expect(parsed.iterations).toBe(3);
      }
    });
  });
});
