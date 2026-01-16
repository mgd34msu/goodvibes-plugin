/**
 * Unit tests for profile-function handler
 *
 * Tests cover:
 * - Argument validation
 * - File existence checking
 *
 * Note: The profile-function handler is a runtime profiler that dynamically
 * imports and executes functions with timing measurements. Full testing would
 * require end-to-end tests with actual function execution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock utils module
vi.mock('../../../utils.js', () => ({
  success: vi.fn((data) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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

import { handleProfileFunction, ProfileFunctionArgs } from '../../../handlers/analysis/profile-function.js';
import { error as errorResponse } from '../../../utils.js';

describe('handleProfileFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('argument validation', () => {
    it('should require file argument', async () => {
      const args = {
        function_name: 'myFunction',
        inputs: [],
      } as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('file')
      );
    });

    it('should require function_name argument', async () => {
      const args = {
        file: 'test.ts',
        inputs: [],
      } as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('function_name')
      );
    });

    it('should require inputs argument', async () => {
      const args = {
        file: 'test.ts',
        function_name: 'myFunction',
      } as ProfileFunctionArgs;

      await handleProfileFunction(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('inputs')
      );
    });
  });
});
