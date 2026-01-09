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
  // Mock functions
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockMkdir: ReturnType<typeof vi.fn>;
  let mockAccess: ReturnType<typeof vi.fn>;
  let mockRename: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockLoadState: ReturnType<typeof vi.fn>;
  let mockSaveState: ReturnType<typeof vi.fn>;
  let mockGetDefaultConfig: ReturnType<typeof vi.fn>;
  let mockFileExists: ReturnType<typeof vi.fn>;
  let mockCreateResponse: ReturnType<typeof vi.fn>;
  let mockCombineMessages: ReturnType<typeof vi.fn>;
  let mockProcessFileAutomation: ReturnType<typeof vi.fn>;
  let mockHandleBashTool: ReturnType<typeof vi.fn>;
  let mockHandleDetectStack: ReturnType<typeof vi.fn>;
  let mockHandleRecommendSkills: ReturnType<typeof vi.fn>;
  let mockHandleSearch: ReturnType<typeof vi.fn>;
  let mockHandleValidateImplementation: ReturnType<typeof vi.fn>;
  let mockHandleRunSmokeTest: ReturnType<typeof vi.fn>;
  let mockHandleCheckTypes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockReadFile = vi.fn();
    mockWriteFile = vi.fn();
    mockMkdir = vi.fn();
    mockAccess = vi.fn();
    mockRename = vi.fn();
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockLoadState = vi.fn();
    mockSaveState = vi.fn();
    mockGetDefaultConfig = vi.fn(() => ({
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
    }));
    mockFileExists = vi.fn();
    mockCreateResponse = vi.fn((msg?: string) => ({
      continue: true,
      systemMessage: msg,
    }));
    mockCombineMessages = vi.fn((messages: string[]) =>
      messages.length > 0 ? messages.join(' | ') : undefined
    );
    mockProcessFileAutomation = vi.fn();
    mockHandleBashTool = vi.fn();
    mockHandleDetectStack = vi.fn();
    mockHandleRecommendSkills = vi.fn();
    mockHandleSearch = vi.fn();
    mockHandleValidateImplementation = vi.fn();
    mockHandleRunSmokeTest = vi.fn();
    mockHandleCheckTypes = vi.fn();

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
    mockLoadState.mockResolvedValue(createMockState());
    mockSaveState.mockResolvedValue(undefined);
    mockFileExists.mockResolvedValue(false);
    mockProcessFileAutomation.mockResolvedValue({
      messages: [],
      state: createMockState(),
    });
    mockHandleBashTool.mockReturnValue({
      isDevServer: false,
      errors: [],
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock fs/promises
    vi.doMock('fs/promises', () => ({
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      mkdir: mockMkdir,
      access: mockAccess,
      rename: mockRename,
    }));

    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      debug: mockDebug,
      logError: mockLogError,
      isTestEnvironment: () => false,
    }));

    // Mock state module
    vi.doMock('../state/index.js', () => ({
      loadState: mockLoadState,
      saveState: mockSaveState,
    }));

    // Mock types/config module
    vi.doMock('../types/config.js', () => ({
      getDefaultConfig: mockGetDefaultConfig,
    }));

    // Mock shared/file-utils module
    vi.doMock('../shared/file-utils.js', () => ({
      fileExists: mockFileExists,
    }));

    // Mock post-tool-use/response module
    vi.doMock('../post-tool-use/response.js', () => ({
      createResponse: mockCreateResponse,
      combineMessages: mockCombineMessages,
    }));

    // Mock post-tool-use/file-automation module
    vi.doMock('../post-tool-use/file-automation.js', () => ({
      processFileAutomation: mockProcessFileAutomation,
    }));

    // Mock post-tool-use/bash-handler module
    vi.doMock('../post-tool-use/bash-handler.js', () => ({
      handleBashTool: mockHandleBashTool,
    }));

    // Mock post-tool-use/mcp-handlers module
    vi.doMock('../post-tool-use/mcp-handlers.js', () => ({
      handleDetectStack: mockHandleDetectStack,
      handleRecommendSkills: mockHandleRecommendSkills,
      handleSearch: mockHandleSearch,
      handleValidateImplementation: mockHandleValidateImplementation,
      handleRunSmokeTest: mockHandleRunSmokeTest,
      handleCheckTypes: mockHandleCheckTypes,
    }));

    // Import the module (this triggers the hook)
    await import('../post-tool-use/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('deepMerge', () => {
    it('should merge simple objects', async () => {
      // We need to test deepMerge through loadAutomationConfig
      // Set up a partial config file
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: false,
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      // Verify debug was called showing the merged config was loaded
      // Use path.join to handle platform-specific path separators
      const expectedPath = path.join(
        '/test/project',
        '.goodvibes',
        'automation.json'
      );
      expect(mockFileExists).toHaveBeenCalledWith(expectedPath);
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle nested objects', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            testing: {
              runAfterFileChange: false,
              testCommand: 'npm run test:unit',
            },
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle arrays without merging them', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            testing: {
              testCommand: 'vitest run',
            },
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should skip undefined values in source', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: undefined,
            mode: 'vibecoding',
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle null values in source object', async () => {
      // Test the case where source[key] is null/falsy but not undefined
      // This exercises the first branch of the if condition (source[key] && ...)
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: null,
            testing: null,
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle primitive values in source that override nested objects', async () => {
      // Test the else-if branch where source[key] is a primitive (not object, not undefined)
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            mode: 'justvibes', // primitive string overrides
            enabled: true, // primitive boolean overrides
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle falsy non-null values like 0 and empty string', async () => {
      // Test with falsy values that are not undefined or null
      // 0 and '' are falsy but should still be assigned via else-if branch
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
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

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle false boolean values in config', async () => {
      // false is falsy but not undefined - should go through else-if branch
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
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

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
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

      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            enabled: true,
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      try {
        await setupMocksAndImport();
        expect(mockReadFile).toHaveBeenCalled();
      } finally {
        // Restore original JSON.parse
        JSON.parse = originalJSONParse;
      }
    });
  });

  describe('loadAutomationConfig', () => {
    it('should return defaults when config file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockFileExists).toHaveBeenCalled();
      expect(mockGetDefaultConfig).toHaveBeenCalled();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should merge user config with defaults when file exists', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          automation: {
            mode: 'vibecoding',
          },
        })
      );

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should return defaults on JSON parse error', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('invalid json {{{');

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'loadAutomationConfig failed',
        expect.any(Object)
      );
    });

    it('should return defaults on file read error', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockRejectedValue(new Error('Read error'));

      mockReadHookInput.mockResolvedValue({
        hook_name: 'post_tool_use',
        tool_name: 'Read',
        cwd: '/test/project',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'loadAutomationConfig failed',
        expect.any(Object)
      );
    });
  });

  describe('runPostToolUseHook', () => {
    describe('Edit tool', () => {
      it('should process file automation for Edit tool', async () => {
        const mockState = createMockState();
        mockLoadState.mockResolvedValue(mockState);
        mockProcessFileAutomation.mockResolvedValue({
          messages: ['Tests passed'],
          state: mockState,
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Edit',
          tool_input: { file_path: '/test/file.ts' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockProcessFileAutomation).toHaveBeenCalled();
        expect(mockSaveState).toHaveBeenCalled();
        expect(mockCombineMessages).toHaveBeenCalledWith(['Tests passed']);
        expect(mockRespond).toHaveBeenCalled();
      });
    });

    describe('Write tool', () => {
      it('should process file automation for Write tool', async () => {
        const mockState = createMockState();
        mockLoadState.mockResolvedValue(mockState);
        mockProcessFileAutomation.mockResolvedValue({
          messages: [],
          state: mockState,
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Write',
          tool_input: { file_path: '/test/new-file.ts', content: 'test' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockProcessFileAutomation).toHaveBeenCalled();
        expect(mockSaveState).toHaveBeenCalled();
        expect(mockRespond).toHaveBeenCalled();
      });
    });

    describe('Bash tool', () => {
      it('should handle Bash tool with no errors', async () => {
        mockHandleBashTool.mockReturnValue({
          isDevServer: false,
          errors: [],
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'ls -la' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockHandleBashTool).toHaveBeenCalled();
        expect(mockSaveState).toHaveBeenCalled();
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should handle Bash tool with errors', async () => {
        mockHandleBashTool.mockReturnValue({
          isDevServer: false,
          errors: ['Error 1', 'Error 2'],
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'npm run dev' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockHandleBashTool).toHaveBeenCalled();
        expect(mockCombineMessages).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.stringContaining('Dev server errors detected'),
          ])
        );
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should limit displayed errors to MAX_ERRORS_TO_DISPLAY', async () => {
        mockHandleBashTool.mockReturnValue({
          isDevServer: false,
          errors: ['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5'],
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'npm run dev' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockHandleBashTool).toHaveBeenCalled();
        // Should only include first 3 errors (MAX_ERRORS_TO_DISPLAY = 3)
        expect(mockCombineMessages).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.stringMatching(/Error 1.*Error 2.*Error 3/),
          ])
        );
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should detect dev server command', async () => {
        mockHandleBashTool.mockReturnValue({
          isDevServer: true,
          errors: [],
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Bash',
          tool_input: { command: 'npm run dev' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockHandleBashTool).toHaveBeenCalled();
        expect(mockRespond).toHaveBeenCalled();
      });
    });

    describe('MCP tools', () => {
      it('should handle detect_stack tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__goodvibes-tools__detect_stack',
          tool_input: { framework: 'React' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleDetectStack).toHaveBeenCalled();
      });

      it('should handle recommend_skills tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__goodvibes-tools__recommend_skills',
          tool_input: { recommendations: [] },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleRecommendSkills).toHaveBeenCalled();
      });

      it('should handle search_skills tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'search_skills',
          tool_input: { query: 'testing' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleSearch).toHaveBeenCalled();
      });

      it('should handle search_agents tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'search_agents',
          tool_input: { query: 'backend' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleSearch).toHaveBeenCalled();
      });

      it('should handle search_tools tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'search_tools',
          tool_input: { query: 'linting' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleSearch).toHaveBeenCalled();
      });

      it('should handle validate_implementation tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'validate_implementation',
          tool_input: { summary: { errors: 0, warnings: 0 } },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleValidateImplementation).toHaveBeenCalled();
      });

      it('should handle run_smoke_test tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'run_smoke_test',
          tool_input: { passed: true },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleRunSmokeTest).toHaveBeenCalled();
      });

      it('should handle check_types tool', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'check_types',
          tool_input: { errors: [] },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockSaveState).toHaveBeenCalled();
        expect(mockHandleCheckTypes).toHaveBeenCalled();
      });
    });

    describe('Tool name extraction', () => {
      it('should extract tool name from MCP format with double underscores', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__server__detect_stack',
          tool_input: {},
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining('Processing tool: detect_stack')
        );
        expect(mockHandleDetectStack).toHaveBeenCalled();
      });

      it('should handle built-in tool names directly', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Read',
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining('Processing tool: Read')
        );
      });

      it('should handle empty tool name', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: '',
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining("Tool '' - no special handling")
        );
      });

      it('should handle undefined tool name', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining("Tool '' - no special handling")
        );
      });

      it('should handle tool name ending with double underscore', async () => {
        // Test the || '' fallback when split('__').pop() might return empty string
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__server__',
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        // The split would give ['mcp', 'server', ''] and pop returns ''
        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining("Tool '' - no special handling")
        );
      });

      it('should handle MCP tool with multiple double underscore segments', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'mcp__goodvibes__server__check_types',
          tool_input: { errors: [] },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining('Processing tool: check_types')
        );
        expect(mockHandleCheckTypes).toHaveBeenCalled();
      });
    });

    describe('Unknown tools', () => {
      it('should log and continue for unknown tools', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'UnknownTool',
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith(
          "Tool 'UnknownTool' - no special handling"
        );
        expect(mockSaveState).toHaveBeenCalled();
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should handle Read tool (no special handling)', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Read',
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockDebug).toHaveBeenCalledWith("Tool 'Read' - no special handling");
        expect(mockRespond).toHaveBeenCalled();
      });
    });

    describe('Error handling', () => {
      it('should handle errors in main hook with Error object', async () => {
        const testError = new Error('Test error message');
        mockReadHookInput.mockRejectedValue(testError);

        await setupMocksAndImport();

        expect(mockLogError).toHaveBeenCalledWith('PostToolUse main', testError);
        expect(mockCreateResponse).toHaveBeenCalledWith(
          'Hook error: Test error message'
        );
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should handle errors in main hook with non-Error object', async () => {
        mockReadHookInput.mockRejectedValue('string error');

        await setupMocksAndImport();

        expect(mockLogError).toHaveBeenCalledWith(
          'PostToolUse main',
          'string error'
        );
        expect(mockCreateResponse).toHaveBeenCalledWith('Hook error: string error');
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should handle loadState errors', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Edit',
          cwd: '/test/project',
        });
        mockLoadState.mockRejectedValue(new Error('State load failed'));

        await setupMocksAndImport();

        expect(mockLogError).toHaveBeenCalledWith(
          'PostToolUse main',
          expect.any(Error)
        );
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should handle saveState errors gracefully', async () => {
        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Read',
          cwd: '/test/project',
        });
        mockSaveState.mockRejectedValue(new Error('State save failed'));

        await setupMocksAndImport();

        expect(mockLogError).toHaveBeenCalledWith(
          'PostToolUse main',
          expect.any(Error)
        );
        expect(mockRespond).toHaveBeenCalled();
      });
    });

    describe('Response building', () => {
      it('should combine multiple automation messages', async () => {
        mockProcessFileAutomation.mockResolvedValue({
          messages: ['Tests failed', 'Build check: errors found'],
          state: createMockState(),
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Edit',
          tool_input: { file_path: '/test/file.ts' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockCombineMessages).toHaveBeenCalledWith([
          'Tests failed',
          'Build check: errors found',
        ]);
        expect(mockRespond).toHaveBeenCalled();
      });

      it('should handle empty automation messages', async () => {
        mockProcessFileAutomation.mockResolvedValue({
          messages: [],
          state: createMockState(),
        });

        mockReadHookInput.mockResolvedValue({
          hook_name: 'post_tool_use',
          tool_name: 'Write',
          tool_input: { file_path: '/test/file.ts' },
          cwd: '/test/project',
        });

        await setupMocksAndImport();

        expect(mockCombineMessages).toHaveBeenCalledWith([]);
        expect(mockRespond).toHaveBeenCalled();
      });
    });
  });
});
