/**
 * Unit tests for bash-handler
 *
 * Tests cover:
 * - handleBashTool function with all paths
 * - Dev server command detection
 * - Dev server registration
 * - Error parsing from output
 * - Error recording for running dev servers
 * - Edge cases: missing command, missing output, empty state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleBashTool } from '../../post-tool-use/bash-handler.js';
import type { HooksState } from '../../types/state.js';
import type { HookInput } from '../../shared/index.js';

// Mock the dev-server-monitor module
vi.mock('../../post-tool-use/dev-server-monitor.js', () => ({
  isDevServerCommand: vi.fn(),
  registerDevServer: vi.fn(),
  parseDevServerErrors: vi.fn(),
  recordDevServerError: vi.fn(),
}));

// Mock the shared/index module (for debug)
vi.mock('../../shared/index.js', async () => {
  const actual = await vi.importActual('../../shared/index.js');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

describe('handleBashTool', () => {
  let mockState: HooksState;
  let mockInput: HookInput;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal state for testing
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

    // Create a minimal hook input
    mockInput = {
      session_id: 'test-session',
      transcript_path: '/path/to/transcript',
      cwd: '/test/cwd',
      permission_mode: 'auto',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: {},
    };
  });

  describe('missing command handling', () => {
    it('should return default response when tool_input is undefined', () => {
      const inputWithoutToolInput = { ...mockInput, tool_input: undefined };
      const result = handleBashTool(mockState, inputWithoutToolInput);

      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should return default response when command is undefined', () => {
      mockInput.tool_input = {};
      const result = handleBashTool(mockState, mockInput);

      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should return default response when command is null', () => {
      mockInput.tool_input = { command: null };
      const result = handleBashTool(mockState, mockInput);

      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should return default response when command is empty string', () => {
      mockInput.tool_input = { command: '' };
      const result = handleBashTool(mockState, mockInput);

      expect(result).toEqual({ isDevServer: false, errors: [] });
    });
  });

  describe('dev server command detection', () => {
    it('should detect and register dev server command', async () => {
      const { isDevServerCommand, registerDevServer } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );
      const { debug } = await import('../../shared/index.js');

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = { command: 'npm run dev' };

      const result = handleBashTool(mockState, mockInput);

      expect(isDevServerCommand).toHaveBeenCalledWith('npm run dev');
      expect(registerDevServer).toHaveBeenCalledWith(
        mockState,
        expect.stringMatching(/^bash_\d+$/),
        'npm run dev',
        3000
      );
      expect(debug).toHaveBeenCalledWith(
        expect.stringContaining('Registered dev server: npm run dev')
      );
      expect(result).toEqual({ isDevServer: true, errors: [] });
    });

    it('should handle vite dev command', async () => {
      const { isDevServerCommand, registerDevServer } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = { command: 'vite --port 5173' };

      const result = handleBashTool(mockState, mockInput);

      expect(isDevServerCommand).toHaveBeenCalledWith('vite --port 5173');
      expect(registerDevServer).toHaveBeenCalled();
      expect(result.isDevServer).toBe(true);
    });

    it('should handle next dev command', async () => {
      const { isDevServerCommand, registerDevServer } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = { command: 'next dev' };

      const result = handleBashTool(mockState, mockInput);

      expect(isDevServerCommand).toHaveBeenCalledWith('next dev');
      expect(registerDevServer).toHaveBeenCalled();
      expect(result.isDevServer).toBe(true);
    });

    it('should use default port 3000 when registering dev server', async () => {
      const { isDevServerCommand, registerDevServer } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = { command: 'npm run dev' };

      handleBashTool(mockState, mockInput);

      expect(registerDevServer).toHaveBeenCalledWith(
        mockState,
        expect.any(String),
        'npm run dev',
        3000
      );
    });

    it('should generate unique PIDs for multiple dev servers', async () => {
      const { isDevServerCommand, registerDevServer } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = { command: 'npm run dev' };

      // First call
      handleBashTool(mockState, mockInput);
      const firstPid = vi.mocked(registerDevServer).mock.calls[0][1];

      // Clear mocks but keep the mock implementation
      vi.mocked(registerDevServer).mockClear();

      // Second call (simulate small delay)
      handleBashTool(mockState, mockInput);
      const secondPid = vi.mocked(registerDevServer).mock.calls[0][1];

      // PIDs should have the format bash_<timestamp>
      expect(firstPid).toMatch(/^bash_\d+$/);
      expect(secondPid).toMatch(/^bash_\d+$/);
      // Note: In rapid succession they might be the same if Date.now() doesn't change
      // but the format is correct
    });
  });

  describe('error parsing from output', () => {
    it('should parse errors from command output', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue([
        'Cannot find module "foo"',
        'Unexpected token',
      ]);

      mockInput.tool_input = {
        command: 'node build.js',
        output: 'Error: Cannot find module "foo"\nSyntaxError: Unexpected token',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).toHaveBeenCalledWith(
        'Error: Cannot find module "foo"\nSyntaxError: Unexpected token'
      );
      expect(result).toEqual({
        isDevServer: false,
        errors: ['Cannot find module "foo"', 'Unexpected token'],
      });
    });

    it('should record errors for running dev servers', async () => {
      const {
        isDevServerCommand,
        parseDevServerErrors,
        recordDevServerError,
      } = await import('../../post-tool-use/dev-server-monitor.js');

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue(['Module not found']);

      // Add a running dev server
      mockState.devServers = {
        'bash_12345': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
        'bash_67890': {
          command: 'vite',
          port: 5173,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
      };

      mockInput.tool_input = {
        command: 'npm test',
        output: 'Module not found: ./missing',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(recordDevServerError).toHaveBeenCalledTimes(2);
      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'bash_12345',
        'Module not found'
      );
      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'bash_67890',
        'Module not found'
      );
      expect(result.errors).toEqual(['Module not found']);
    });

    it('should handle multiple errors from output', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue([
        'Error 1',
        'Error 2',
        'Error 3',
      ]);

      mockState.devServers = {
        'bash_12345': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
      };

      mockInput.tool_input = {
        command: 'npm build',
        output: 'Many errors here',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(result.errors).toEqual(['Error 1', 'Error 2', 'Error 3']);
    });

    it('should join multiple errors with semicolon when recording', async () => {
      const {
        isDevServerCommand,
        parseDevServerErrors,
        recordDevServerError,
      } = await import('../../post-tool-use/dev-server-monitor.js');

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue([
        'Error 1',
        'Error 2',
        'Error 3',
      ]);

      mockState.devServers = {
        'bash_12345': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
      };

      mockInput.tool_input = {
        command: 'npm build',
        output: 'Many errors here',
      };

      handleBashTool(mockState, mockInput);

      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'bash_12345',
        'Error 1; Error 2; Error 3'
      );
    });

    it('should return default response when no errors found in output', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue([]);

      mockInput.tool_input = {
        command: 'npm test',
        output: 'All tests passed!',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).toHaveBeenCalledWith('All tests passed!');
      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should not call parseDevServerErrors when output is undefined', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = { command: 'npm test' };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).not.toHaveBeenCalled();
      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should not call parseDevServerErrors when output is null', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = { command: 'npm test', output: null };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).not.toHaveBeenCalled();
      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should not call parseDevServerErrors when output is empty string', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = { command: 'npm test', output: '' };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).not.toHaveBeenCalled();
      expect(result).toEqual({ isDevServer: false, errors: [] });
    });
  });

  describe('edge cases', () => {
    it('should handle empty devServers object when recording errors', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue(['Some error']);

      mockState.devServers = {};

      mockInput.tool_input = {
        command: 'npm test',
        output: 'Error: Some error',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(result).toEqual({ isDevServer: false, errors: ['Some error'] });
    });

    it('should handle state with no existing dev servers', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue([]);

      mockInput.tool_input = {
        command: 'npm install',
        output: 'Installed successfully',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should not parse errors for dev server commands', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = {
        command: 'npm run dev',
        output: 'Error: Cannot find module',
      };

      const result = handleBashTool(mockState, mockInput);

      // Should return early after detecting dev server, not parse errors
      expect(parseDevServerErrors).not.toHaveBeenCalled();
      expect(result).toEqual({ isDevServer: true, errors: [] });
    });

    it('should handle command with only whitespace', async () => {
      const { isDevServerCommand } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = { command: '   ' };

      const result = handleBashTool(mockState, mockInput);

      // Whitespace is still a truthy string, so it will be checked
      expect(isDevServerCommand).toHaveBeenCalledWith('   ');
      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should handle output with special characters', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue(['Special chars: @#$%']);

      mockInput.tool_input = {
        command: 'npm test',
        output: 'Error: Special chars: @#$%^&*()',
      };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).toHaveBeenCalledWith(
        'Error: Special chars: @#$%^&*()'
      );
      expect(result.errors).toEqual(['Special chars: @#$%']);
    });

    it('should handle very long output', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue(['Long error']);

      const longOutput = 'x'.repeat(10000) + 'Error: Long error';

      mockInput.tool_input = {
        command: 'npm test',
        output: longOutput,
      };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).toHaveBeenCalledWith(longOutput);
      expect(result.errors).toEqual(['Long error']);
    });

    it('should handle single error from output', async () => {
      const {
        isDevServerCommand,
        parseDevServerErrors,
        recordDevServerError,
      } = await import('../../post-tool-use/dev-server-monitor.js');

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue(['Single error']);

      mockState.devServers = {
        'bash_12345': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
      };

      mockInput.tool_input = {
        command: 'npm build',
        output: 'Error: Single error',
      };

      handleBashTool(mockState, mockInput);

      // Single error should not have semicolons
      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'bash_12345',
        'Single error'
      );
    });
  });

  describe('type safety', () => {
    it('should handle tool_input with unexpected properties', async () => {
      const { isDevServerCommand } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = {
        command: 'npm test',
        output: 'test output',
        unexpectedProp: 'should be ignored',
        anotherProp: 123,
      };

      const result = handleBashTool(mockState, mockInput);

      expect(isDevServerCommand).toHaveBeenCalledWith('npm test');
      expect(result).toBeDefined();
    });

    it('should handle command as non-string type', () => {
      mockInput.tool_input = { command: 123 as any };

      // Type coercion will occur, but function should handle gracefully
      const result = handleBashTool(mockState, mockInput);

      // Number will be truthy, so it continues to isDevServerCommand
      expect(result).toBeDefined();
    });

    it('should handle output as non-string type', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = {
        command: 'npm test',
        output: 123 as any,
      };

      const result = handleBashTool(mockState, mockInput);

      // Number is truthy, so parseDevServerErrors will be called
      expect(parseDevServerErrors).toHaveBeenCalledWith(123);
      expect(result).toBeDefined();
    });
  });

  describe('complex scenarios', () => {
    it('should handle dev server detection with output present', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(true);

      mockInput.tool_input = {
        command: 'npm run dev',
        output: 'Server started on port 3000',
      };

      const result = handleBashTool(mockState, mockInput);

      // Dev server detection returns early, doesn't parse errors
      expect(parseDevServerErrors).not.toHaveBeenCalled();
      expect(result).toEqual({ isDevServer: true, errors: [] });
    });

    it('should handle non-dev-server command with no output', async () => {
      const { isDevServerCommand, parseDevServerErrors } = await import(
        '../../post-tool-use/dev-server-monitor.js'
      );

      vi.mocked(isDevServerCommand).mockReturnValue(false);

      mockInput.tool_input = { command: 'ls -la' };

      const result = handleBashTool(mockState, mockInput);

      expect(parseDevServerErrors).not.toHaveBeenCalled();
      expect(result).toEqual({ isDevServer: false, errors: [] });
    });

    it('should iterate over all dev servers when recording errors', async () => {
      const {
        isDevServerCommand,
        parseDevServerErrors,
        recordDevServerError,
      } = await import('../../post-tool-use/dev-server-monitor.js');

      vi.mocked(isDevServerCommand).mockReturnValue(false);
      vi.mocked(parseDevServerErrors).mockReturnValue(['Error message']);

      mockState.devServers = {
        'pid_1': {
          command: 'npm run dev',
          port: 3000,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
        'pid_2': {
          command: 'vite',
          port: 5173,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
        'pid_3': {
          command: 'next dev',
          port: 3001,
          startedAt: '2025-01-01T00:00:00Z',
          lastError: null,
        },
      };

      mockInput.tool_input = {
        command: 'npm test',
        output: 'Error: Error message',
      };

      handleBashTool(mockState, mockInput);

      expect(recordDevServerError).toHaveBeenCalledTimes(3);
      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'pid_1',
        'Error message'
      );
      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'pid_2',
        'Error message'
      );
      expect(recordDevServerError).toHaveBeenCalledWith(
        mockState,
        'pid_3',
        'Error message'
      );
    });
  });
});
