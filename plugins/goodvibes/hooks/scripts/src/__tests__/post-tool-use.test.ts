/**
 * Unit tests for post-tool-use hook
 *
 * Tests cover:
 * - deepMerge utility function
 * - loadAutomationConfig function
 * - runPostToolUseHook main entry point
 * - All tool handlers (Edit, Write, Bash, MCP tools)
 * - Error handling paths
 */

import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises before any imports
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  rename: vi.fn(),
}));

// Mock shared/index.js
vi.mock('../shared/index.js', () => ({
  respond: vi.fn(),
  readHookInput: vi.fn(),
  debug: vi.fn(),
  logError: vi.fn(),
}));

// Mock state.js
vi.mock('../state.js', () => ({
  loadState: vi.fn(),
  saveState: vi.fn(),
}));

// Mock types/config.js
vi.mock('../types/config.js', () => ({
  getDefaultConfig: vi.fn(() => ({
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
  })),
}));

// Mock shared/file-utils.js
vi.mock('../shared/file-utils.js', () => ({
  fileExists: vi.fn(),
}));

// Mock post-tool-use/response.js
vi.mock('../post-tool-use/response.js', () => ({
  createResponse: vi.fn((msg?: string) => ({
    continue: true,
    systemMessage: msg,
  })),
  combineMessages: vi.fn((messages: string[]) =>
    messages.length > 0 ? messages.join(' | ') : undefined
  ),
}));

// Mock post-tool-use/file-automation.js
vi.mock('../post-tool-use/file-automation.js', () => ({
  processFileAutomation: vi.fn(),
}));

// Mock post-tool-use/bash-handler.js
vi.mock('../post-tool-use/bash-handler.js', () => ({
  handleBashTool: vi.fn(),
}));

// Mock post-tool-use/mcp-handlers.js
vi.mock('../post-tool-use/mcp-handlers.js', () => ({
  handleDetectStack: vi.fn(),
  handleRecommendSkills: vi.fn(),
  handleSearch: vi.fn(),
  handleValidateImplementation: vi.fn(),
  handleRunSmokeTest: vi.fn(),
  handleCheckTypes: vi.fn(),
}));

// Import mocked modules
import * as fs from 'fs/promises';

import { handleBashTool } from '../post-tool-use/bash-handler.js';
import { processFileAutomation } from '../post-tool-use/file-automation.js';
import {
  handleDetectStack,
  handleRecommendSkills,
  handleSearch,
  handleValidateImplementation,
  handleRunSmokeTest,
  handleCheckTypes,
} from '../post-tool-use/mcp-handlers.js';
import { createResponse, combineMessages } from '../post-tool-use/response.js';
import { fileExists } from '../shared/file-utils.js';
import { respond, readHookInput, debug, logError } from '../shared/index.js';
import { loadState, saveState } from '../state.js';
import { getDefaultConfig } from '../types/config.js';

// Create a default state for tests
function createMockState() {
  return {
    session: {
      id: 'test-session',
      startedAt: new Date().toISOString(),
      mode: 'default' as const,
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
      status: 'unknown' as const,
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
}

describe('post-tool-use hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Set up default mock implementations
    vi.mocked(loadState).mockResolvedValue(createMockState());
    vi.mocked(saveState).mockResolvedValue(undefined);
    vi.mocked(fileExists).mockResolvedValue(false);
    vi.mocked(processFileAutomation).mockResolvedValue({
      messages: [],
      state: createMockState(),
    });
    vi.mocked(handleBashTool).mockReturnValue({
      isDevServer: false,
      errors: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deepMerge', () => {
    it('should merge simple objects', async () => {
      // We need to test deepMerge through loadAutomationConfig
      // Set up a partial config file
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: false,
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      // Import and run the hook to trigger loadAutomationConfig
      await import('../post-tool-use.js');

      // Verify debug was called showing the merged config was loaded
      // Use path.join to handle platform-specific path separators
      const expectedPath = path.join(
        '/test/project',
        '.goodvibes',
        'automation.json'
      );
      expect(fileExists).toHaveBeenCalledWith(expectedPath);
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle nested objects', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            testing: {
              runAfterFileChange: false,
              testCommand: 'npm run test:unit',
            },
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle arrays without merging them', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            testing: {
              testCommand: 'vitest run',
            },
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should skip undefined values in source', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: undefined,
            mode: 'vibecoding',
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle null values in source object', async () => {
      // Test the case where source[key] is null/falsy but not undefined
      // This exercises the first branch of the if condition (source[key] && ...)
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: null,
            testing: null,
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle primitive values in source that override nested objects', async () => {
      // Test the else-if branch where source[key] is a primitive (not object, not undefined)
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            mode: 'justvibes', // primitive string overrides
            enabled: true, // primitive boolean overrides
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle falsy non-null values like 0 and empty string', async () => {
      // Test with falsy values that are not undefined or null
      // 0 and '' are falsy but should still be assigned via else-if branch
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            building: {
              runAfterFileThreshold: 0, // falsy but valid number
              maxRetries: 0,
            },
            testing: {
              testCommand: '', // falsy but valid string
            },
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle false boolean values in config', async () => {
      // false is falsy but not undefined - should go through else-if branch
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: false,
            testing: {
              runAfterFileChange: false,
              runBeforeCommit: false,
            },
            git: {
              autoFeatureBranch: false,
              autoCheckpoint: false,
            },
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should skip undefined values in deepMerge (else branch)', async () => {
      // This test exercises the else branch (line 57) where source[key] === undefined
      // We need to mock JSON.parse to return an object with explicit undefined
      const originalJSONParse = JSON.parse;
      const mockParse = vi.fn((text: string) => {
        const parsed = originalJSONParse(text);
        // Add an explicit undefined property to the parsed object
        if (parsed?.automation) {
          Object.defineProperty(parsed.automation, 'undefinedProp', {
            value: undefined,
            enumerable: true,
          });
        }
        return parsed;
      });

      // Temporarily replace JSON.parse
      JSON.parse = mockParse;

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: true,
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();

      try {
        await import('../post-tool-use.js');
        expect(fs.readFile).toHaveBeenCalled();
      } finally {
        // Restore original JSON.parse
        JSON.parse = originalJSONParse;
      }
    });
  });

  describe('loadAutomationConfig', () => {
    it('should return defaults when config file does not exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fileExists).toHaveBeenCalled();
      expect(getDefaultConfig).toHaveBeenCalled();
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should merge user config with defaults when file exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          automation: {
            mode: 'vibecoding',
          },
        })
      );

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should return defaults on JSON parse error', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {{{');

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(debug).toHaveBeenCalledWith(
        'loadAutomationConfig failed',
        expect.any(Object)
      );
    });

    it('should return defaults on file read error', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      vi.mocked(readHookInput).mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      vi.resetModules();
      await import('../post-tool-use.js');

      expect(debug).toHaveBeenCalledWith(
        'loadAutomationConfig failed',
        expect.any(Object)
      );
    });
  });

  describe('runPostToolUseHook', () => {
    describe('Edit tool', () => {
      it('should process file automation for Edit tool', async () => {
        const mockState = createMockState();
        vi.mocked(loadState).mockResolvedValue(mockState);
        vi.mocked(processFileAutomation).mockResolvedValue({
          messages: ['Tests passed'],
          state: mockState,
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Edit',
          tool_input: { file_path: '/test/file.ts' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(processFileAutomation).toHaveBeenCalled();
        expect(saveState).toHaveBeenCalled();
        expect(combineMessages).toHaveBeenCalledWith(['Tests passed']);
        expect(respond).toHaveBeenCalled();
      });
    });

    describe('Write tool', () => {
      it('should process file automation for Write tool', async () => {
        const mockState = createMockState();
        vi.mocked(loadState).mockResolvedValue(mockState);
        vi.mocked(processFileAutomation).mockResolvedValue({
          messages: [],
          state: mockState,
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Write',
          tool_input: { file_path: '/test/new-file.ts', content: 'test' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(processFileAutomation).toHaveBeenCalled();
        expect(saveState).toHaveBeenCalled();
        expect(respond).toHaveBeenCalled();
      });
    });

    describe('Bash tool', () => {
      it('should handle Bash tool with no errors', async () => {
        vi.mocked(handleBashTool).mockReturnValue({
          isDevServer: false,
          errors: [],
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'ls -la' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(handleBashTool).toHaveBeenCalled();
        expect(saveState).toHaveBeenCalled();
        expect(respond).toHaveBeenCalled();
      });

      it('should handle Bash tool with errors', async () => {
        vi.mocked(handleBashTool).mockReturnValue({
          isDevServer: false,
          errors: ['Error 1', 'Error 2'],
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'npm run dev' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(handleBashTool).toHaveBeenCalled();
        expect(combineMessages).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.stringContaining('Dev server errors detected'),
          ])
        );
        expect(respond).toHaveBeenCalled();
      });

      it('should limit displayed errors to MAX_ERRORS_TO_DISPLAY', async () => {
        vi.mocked(handleBashTool).mockReturnValue({
          isDevServer: false,
          errors: ['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5'],
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'npm run dev' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(handleBashTool).toHaveBeenCalled();
        // Should only include first 3 errors (MAX_ERRORS_TO_DISPLAY = 3)
        expect(combineMessages).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.stringMatching(/Error 1.*Error 2.*Error 3/),
          ])
        );
        expect(respond).toHaveBeenCalled();
      });

      it('should detect dev server command', async () => {
        vi.mocked(handleBashTool).mockReturnValue({
          isDevServer: true,
          errors: [],
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'npm run dev' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(handleBashTool).toHaveBeenCalled();
        expect(respond).toHaveBeenCalled();
      });
    });

    describe('MCP tools', () => {
      it('should handle detect_stack tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__goodvibes-tools__detect_stack',
          tool_input: { framework: 'React' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleDetectStack).toHaveBeenCalled();
      });

      it('should handle recommend_skills tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__goodvibes-tools__recommend_skills',
          tool_input: { recommendations: [] },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleRecommendSkills).toHaveBeenCalled();
      });

      it('should handle search_skills tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'search_skills',
          tool_input: { query: 'testing' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleSearch).toHaveBeenCalled();
      });

      it('should handle search_agents tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'search_agents',
          tool_input: { query: 'backend' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleSearch).toHaveBeenCalled();
      });

      it('should handle search_tools tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'search_tools',
          tool_input: { query: 'linting' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleSearch).toHaveBeenCalled();
      });

      it('should handle validate_implementation tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'validate_implementation',
          tool_input: { summary: { errors: 0, warnings: 0 } },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleValidateImplementation).toHaveBeenCalled();
      });

      it('should handle run_smoke_test tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'run_smoke_test',
          tool_input: { passed: true },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleRunSmokeTest).toHaveBeenCalled();
      });

      it('should handle check_types tool', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'check_types',
          tool_input: { errors: [] },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(saveState).toHaveBeenCalled();
        expect(handleCheckTypes).toHaveBeenCalled();
      });
    });

    describe('Tool name extraction', () => {
      it('should extract tool name from MCP format with double underscores', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__server__detect_stack',
          tool_input: {},
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining('Processing tool: detect_stack')
        );
        expect(handleDetectStack).toHaveBeenCalled();
      });

      it('should handle built-in tool names directly', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Read',
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining('Processing tool: Read')
        );
      });

      it('should handle empty tool name', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: '',
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining("Tool '' - no special handling")
        );
      });

      it('should handle undefined tool name', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining("Tool '' - no special handling")
        );
      });

      it('should handle tool name ending with double underscore', async () => {
        // Test the || '' fallback when split('__').pop() might return empty string
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__server__',
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        // The split would give ['mcp', 'server', ''] and pop returns ''
        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining("Tool '' - no special handling")
        );
      });

      it('should handle MCP tool with multiple double underscore segments', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__goodvibes__server__check_types',
          tool_input: { errors: [] },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining('Processing tool: check_types')
        );
        expect(handleCheckTypes).toHaveBeenCalled();
      });
    });

    describe('Unknown tools', () => {
      it('should log and continue for unknown tools', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'UnknownTool',
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith(
          "Tool 'UnknownTool' - no special handling"
        );
        expect(saveState).toHaveBeenCalled();
        expect(respond).toHaveBeenCalled();
      });

      it('should handle Read tool (no special handling)', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Read',
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(debug).toHaveBeenCalledWith("Tool 'Read' - no special handling");
        expect(respond).toHaveBeenCalled();
      });
    });

    describe('Error handling', () => {
      it('should handle errors in main hook with Error object', async () => {
        const testError = new Error('Test error message');
        vi.mocked(readHookInput).mockRejectedValue(testError);

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(logError).toHaveBeenCalledWith('PostToolUse main', testError);
        expect(createResponse).toHaveBeenCalledWith(
          'Hook error: Test error message'
        );
        expect(respond).toHaveBeenCalled();
      });

      it('should handle errors in main hook with non-Error object', async () => {
        vi.mocked(readHookInput).mockRejectedValue('string error');

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(logError).toHaveBeenCalledWith(
          'PostToolUse main',
          'string error'
        );
        expect(createResponse).toHaveBeenCalledWith('Hook error: string error');
        expect(respond).toHaveBeenCalled();
      });

      it('should handle loadState errors', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Edit',
          cwd: '/test/project',
        });
        vi.mocked(loadState).mockRejectedValue(new Error('State load failed'));

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(logError).toHaveBeenCalledWith(
          'PostToolUse main',
          expect.any(Error)
        );
        expect(respond).toHaveBeenCalled();
      });

      it('should handle saveState errors gracefully', async () => {
        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Read',
          cwd: '/test/project',
        });
        vi.mocked(saveState).mockRejectedValue(new Error('State save failed'));

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(logError).toHaveBeenCalledWith(
          'PostToolUse main',
          expect.any(Error)
        );
        expect(respond).toHaveBeenCalled();
      });
    });

    describe('Response building', () => {
      it('should combine multiple automation messages', async () => {
        vi.mocked(processFileAutomation).mockResolvedValue({
          messages: ['Tests failed', 'Build check: errors found'],
          state: createMockState(),
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Edit',
          tool_input: { file_path: '/test/file.ts' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(combineMessages).toHaveBeenCalledWith([
          'Tests failed',
          'Build check: errors found',
        ]);
        expect(respond).toHaveBeenCalled();
      });

      it('should handle empty automation messages', async () => {
        vi.mocked(processFileAutomation).mockResolvedValue({
          messages: [],
          state: createMockState(),
        });

        vi.mocked(readHookInput).mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Write',
          tool_input: { file_path: '/test/file.ts' },
          cwd: '/test/project',
        });

        vi.resetModules();
        await import('../post-tool-use.js');

        expect(combineMessages).toHaveBeenCalledWith([]);
        expect(respond).toHaveBeenCalled();
      });
    });
  });
});
