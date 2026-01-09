/**
 * Tests for MCP Tool Handlers
 *
 * Comprehensive coverage of all MCP tool handling functions.
 * Tests all branches, error paths, and edge cases.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies
vi.mock('fs/promises');
vi.mock('../../shared/index.js', () => ({
  respond: vi.fn(),
  loadAnalytics: vi.fn(),
  saveAnalytics: vi.fn(),
  logToolUsage: vi.fn(),
  ensureCacheDir: vi.fn(),
  debug: vi.fn(),
  logError: vi.fn(),
  CACHE_DIR: '/mock/.goodvibes',
  isTestEnvironment: () => false,
}));
vi.mock('../../post-tool-use/response.js', () => ({
  createResponse: vi.fn((msg?: string) => ({
    continue: true,
    systemMessage: msg,
  })),
}));

// Import mocked modules
import {
  handleDetectStack,
  handleRecommendSkills,
  handleSearch,
  handleValidateImplementation,
  handleRunSmokeTest,
  handleCheckTypes,
} from '../../post-tool-use/mcp-handlers.js';
import { createResponse } from '../../post-tool-use/response.js';
import {
  respond,
  loadAnalytics,
  saveAnalytics,
  logToolUsage,
  ensureCacheDir,
  debug,
  logError,
  CACHE_DIR,
} from '../../shared/index.js';

import type { HookInput } from '../../shared/index.js';

describe('MCP Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleDetectStack', () => {
    it('should cache stack detection when tool_input is provided', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          framework: 'React',
          language: 'TypeScript',
          bundler: 'Vite',
        },
      };

      await handleDetectStack(input);

      expect(ensureCacheDir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(CACHE_DIR, 'detected-stack.json'),
        JSON.stringify(input.tool_input, null, 2)
      );
      expect(debug).toHaveBeenCalledWith('handleDetectStack called', {
        has_tool_input: true,
      });
      expect(debug).toHaveBeenCalledWith(
        expect.stringContaining('Cached stack detection to')
      );
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'detect_stack',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith(
        'Stack detected. Consider using recommend_skills for relevant skill suggestions.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing tool_input gracefully', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
      };

      await handleDetectStack(input);

      expect(ensureCacheDir).toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith('handleDetectStack called', {
        has_tool_input: false,
      });
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'detect_stack',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith(
        'Stack detected. Consider using recommend_skills for relevant skill suggestions.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle errors when caching fails', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: { framework: 'React' },
      };
      const error = new Error('Failed to write file');
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await handleDetectStack(input);

      expect(logError).toHaveBeenCalledWith('handleDetectStack', error);
      expect(createResponse).toHaveBeenCalledWith(
        'Error caching stack: Failed to write file'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: { framework: 'React' },
      };
      vi.mocked(ensureCacheDir).mockRejectedValue('string error');

      await handleDetectStack(input);

      expect(logError).toHaveBeenCalledWith(
        'handleDetectStack',
        'string error'
      );
      expect(createResponse).toHaveBeenCalledWith(
        'Error caching stack: string error'
      );
      expect(respond).toHaveBeenCalled();
    });
  });

  describe('handleRecommendSkills', () => {
    it('should track recommended skills with valid recommendations', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 0,
        validations_run: 0,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          recommendations: [
            { path: 'skills/react/hooks.md', score: 0.9 },
            { path: 'skills/typescript/generics.md', score: 0.8 },
          ],
        },
      };

      await handleRecommendSkills(input);

      expect(loadAnalytics).toHaveBeenCalled();
      expect(analytics.skills_recommended).toEqual([
        'skills/react/hooks.md',
        'skills/typescript/generics.md',
      ]);
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'recommend_skills',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing analytics gracefully', async () => {
      vi.mocked(loadAnalytics).mockResolvedValue(null);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          recommendations: [{ path: 'skills/test.md' }],
        },
      };

      await handleRecommendSkills(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'recommend_skills',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing tool_input', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 0,
        validations_run: 0,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
      };

      await handleRecommendSkills(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'recommend_skills',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing recommendations array', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 0,
        validations_run: 0,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          other_field: 'value',
        },
      };

      await handleRecommendSkills(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'recommend_skills',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-array recommendations', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 0,
        validations_run: 0,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          recommendations: 'not an array',
        },
      };

      await handleRecommendSkills(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'recommend_skills',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should filter out invalid recommendation objects', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 0,
        validations_run: 0,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          recommendations: [
            { path: 'valid/skill.md' },
            null,
            { no_path_field: 'test' },
            { path: 123 }, // non-string path
            'string item',
            { path: 'another/valid.md' },
          ],
        },
      };

      await handleRecommendSkills(input);

      expect(analytics.skills_recommended).toEqual([
        'valid/skill.md',
        'another/valid.md',
      ]);
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'recommend_skills',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadAnalytics).mockRejectedValue(new Error('Load failed'));

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          recommendations: [{ path: 'test.md' }],
        },
      };

      await handleRecommendSkills(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: expect.stringContaining('Load failed'),
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadAnalytics).mockRejectedValue('string error');

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          recommendations: [{ path: 'test.md' }],
        },
      };

      await handleRecommendSkills(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: 'string error',
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });
  });

  describe('handleSearch', () => {
    it('should log search tool usage', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: { query: 'test query' },
      };

      await handleSearch(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'search',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should work with empty input', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
      };

      await handleSearch(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'search',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });
  });

  describe('handleValidateImplementation', () => {
    it('should track validation with errors and warnings', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          summary: {
            errors: 3,
            warnings: 2,
          },
        },
      };

      await handleValidateImplementation(input);

      expect(analytics.validations_run).toBe(3);
      expect(analytics.issues_found).toBe(10); // 5 + 3 + 2
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'validate_implementation',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing summary', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          other_field: 'value',
        },
      };

      await handleValidateImplementation(input);

      expect(analytics.validations_run).toBe(3);
      expect(analytics.issues_found).toBe(5); // unchanged
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'validate_implementation',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing errors and warnings in summary', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          summary: {
            other_field: 'value',
          },
        },
      };

      await handleValidateImplementation(input);

      expect(analytics.validations_run).toBe(3);
      expect(analytics.issues_found).toBe(5); // 5 + 0 + 0
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'validate_implementation',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing analytics', async () => {
      vi.mocked(loadAnalytics).mockResolvedValue(null);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          summary: {
            errors: 3,
            warnings: 2,
          },
        },
      };

      await handleValidateImplementation(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'validate_implementation',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadAnalytics).mockRejectedValue(new Error('Load failed'));

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          summary: { errors: 3 },
        },
      };

      await handleValidateImplementation(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: expect.stringContaining('Load failed'),
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadAnalytics).mockRejectedValue('string error');

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          summary: { errors: 3 },
        },
      };

      await handleValidateImplementation(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: 'string error',
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });
  });

  describe('handleRunSmokeTest', () => {
    it('should report test failures', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          passed: false,
          summary: {
            failed: 3,
            passed: 7,
          },
        },
      };

      await handleRunSmokeTest(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'run_smoke_test',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith(
        'Smoke test: 3 check(s) failed. Review output for details.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle failed tests with missing summary', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          passed: false,
        },
      };

      await handleRunSmokeTest(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'run_smoke_test',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith(
        'Smoke test: 0 check(s) failed. Review output for details.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle failed tests with missing failed count', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          passed: false,
          summary: {
            passed: 7,
          },
        },
      };

      await handleRunSmokeTest(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'run_smoke_test',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith(
        'Smoke test: 0 check(s) failed. Review output for details.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle passed tests', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          passed: true,
          summary: {
            failed: 0,
            passed: 10,
          },
        },
      };

      await handleRunSmokeTest(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'run_smoke_test',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing tool_input', async () => {
      const input: HookInput = {
        hook_name: 'post_tool_use',
      };

      await handleRunSmokeTest(input);

      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'run_smoke_test',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(logToolUsage).mockRejectedValue(new Error('Log failed'));

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          passed: false,
          summary: { failed: 3 },
        },
      };

      await handleRunSmokeTest(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: expect.stringContaining('Log failed'),
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(logToolUsage).mockRejectedValue('string error');

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          passed: false,
          summary: { failed: 3 },
        },
      };

      await handleRunSmokeTest(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: 'string error',
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });
  });

  describe('handleCheckTypes', () => {
    it('should report type errors', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [] as string[],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);
      vi.mocked(logToolUsage).mockResolvedValue(undefined);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          errors: [
            { file: 'test.ts', line: 10, message: 'Type error 1' },
            { file: 'test2.ts', line: 20, message: 'Type error 2' },
            { file: 'test3.ts', line: 30, message: 'Type error 3' },
          ],
        },
      };

      await handleCheckTypes(input);

      expect(loadAnalytics).toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'check_types',
        timestamp: expect.any(String),
        success: true,
      });
      // The analytics object is modified in place, so check what was saved
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(analytics.issues_found).toBe(8); // 5 + 3
      expect(createResponse).toHaveBeenCalledWith(
        'TypeScript: 3 type error(s) found.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle no type errors', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [] as string[],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);
      vi.mocked(logToolUsage).mockResolvedValue(undefined);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          errors: [],
        },
      };

      await handleCheckTypes(input);

      expect(loadAnalytics).toHaveBeenCalled();
      // Empty array is truthy, so saveAnalytics IS called with 0 additional errors
      expect(saveAnalytics).toHaveBeenCalledWith(analytics);
      expect(analytics.issues_found).toBe(5); // 5 + 0
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'check_types',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith(
        'TypeScript: 0 type error(s) found.'
      );
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing errors field', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          other_field: 'value',
        },
      };

      await handleCheckTypes(input);

      expect(loadAnalytics).toHaveBeenCalled();
      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'check_types',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-array errors field', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          errors: 'not an array',
        },
      };

      await handleCheckTypes(input);

      expect(loadAnalytics).toHaveBeenCalled();
      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'check_types',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle missing analytics', async () => {
      vi.mocked(loadAnalytics).mockResolvedValue(null);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          errors: [{ file: 'test.ts', line: 10, message: 'Type error' }],
        },
      };

      await handleCheckTypes(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'check_types',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle errors with analytics but no errors in tool_input', async () => {
      const analytics = {
        session_id: 'test-session',
        skills_recommended: [],
        issues_found: 5,
        validations_run: 2,
      };
      vi.mocked(loadAnalytics).mockResolvedValue(analytics);

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {},
      };

      await handleCheckTypes(input);

      expect(saveAnalytics).not.toHaveBeenCalled();
      expect(logToolUsage).toHaveBeenCalledWith({
        tool: 'check_types',
        timestamp: expect.any(String),
        success: true,
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadAnalytics).mockRejectedValue(new Error('Load failed'));

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          errors: [{ file: 'test.ts', line: 10, message: 'Error' }],
        },
      };

      await handleCheckTypes(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: expect.stringContaining('Load failed'),
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadAnalytics).mockRejectedValue('string error');

      const input: HookInput = {
        hook_name: 'post_tool_use',
        tool_input: {
          errors: [{ file: 'test.ts', line: 10, message: 'Error' }],
        },
      };

      await handleCheckTypes(input);

      expect(debug).toHaveBeenCalledWith('handler failed', {
        error: 'string error',
      });
      expect(createResponse).toHaveBeenCalledWith();
      expect(respond).toHaveBeenCalled();
    });
  });
});
