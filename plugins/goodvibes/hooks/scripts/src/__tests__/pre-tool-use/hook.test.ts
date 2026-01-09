/**
 * Tests for pre-tool-use/hook.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies
vi.mock('../../pre-tool-use/git-handlers.js');
vi.mock('../../pre-tool-use/git-guards.js');
vi.mock('../../pre-tool-use/quality-gates.js');
vi.mock('../../pre-tool-use/tool-validators.js');
vi.mock('../../shared/index.js');

import { isGitCommand } from '../../pre-tool-use/git-guards.js';
import {
  extractBashCommand,
  handleGitCommit,
  handleGitCommand,
} from '../../pre-tool-use/git-handlers.js';
import { runPreToolUseHook } from '../../pre-tool-use/hook.js';
import { isCommitCommand } from '../../pre-tool-use/quality-gates.js';
import { TOOL_VALIDATORS } from '../../pre-tool-use/tool-validators.js';
import {
  respond,
  readHookInput,
  allowTool,
  debug,
  logError,
} from '../../shared/index.js';

import type { HookInput } from '../../shared/hook-io.js';

const mockedExtractBashCommand = vi.mocked(extractBashCommand);
const mockedHandleGitCommit = vi.mocked(handleGitCommit);
const mockedHandleGitCommand = vi.mocked(handleGitCommand);
const mockedIsGitCommand = vi.mocked(isGitCommand);
const mockedIsCommitCommand = vi.mocked(isCommitCommand);
const mockedRespond = vi.mocked(respond);
const mockedReadHookInput = vi.mocked(readHookInput);
const mockedAllowTool = vi.mocked(allowTool);
const mockedDebug = vi.mocked(debug);
const mockedLogError = vi.mocked(logError);

describe('pre-tool-use hook', () => {
  let mockInput: HookInput;

  beforeEach(() => {
    mockInput = {
      session_id: 'test-session',
      transcript_path: '/path/to/transcript',
      cwd: '/test/project',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    };

    vi.clearAllMocks();

    mockedReadHookInput.mockResolvedValue(mockInput);
    mockedAllowTool.mockReturnValue({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runPreToolUseHook', () => {
    describe('Bash tool handling', () => {
      it('should handle Bash tool with git commit command', async () => {
        mockedExtractBashCommand.mockReturnValue('git commit -m "test"');
        mockedIsCommitCommand.mockReturnValue(true);

        await runPreToolUseHook();

        expect(mockedReadHookInput).toHaveBeenCalled();
        expect(mockedExtractBashCommand).toHaveBeenCalledWith(mockInput);
        expect(mockedHandleGitCommit).toHaveBeenCalledWith(
          mockInput,
          'git commit -m "test"'
        );
        expect(mockedHandleGitCommand).not.toHaveBeenCalled();
      });

      it('should handle Bash tool with non-commit git command', async () => {
        mockInput.tool_input = { command: 'git push' };
        mockedReadHookInput.mockResolvedValue(mockInput);
        mockedExtractBashCommand.mockReturnValue('git push');
        mockedIsCommitCommand.mockReturnValue(false);
        mockedIsGitCommand.mockReturnValue(true);

        await runPreToolUseHook();

        expect(mockedIsCommitCommand).toHaveBeenCalledWith('git push');
        expect(mockedIsGitCommand).toHaveBeenCalledWith('git push');
        expect(mockedHandleGitCommand).toHaveBeenCalledWith(mockInput, 'git push');
        expect(mockedHandleGitCommit).not.toHaveBeenCalled();
      });

      it('should allow Bash tool with non-git command', async () => {
        mockInput.tool_input = { command: 'npm test' };
        mockedReadHookInput.mockResolvedValue(mockInput);
        mockedExtractBashCommand.mockReturnValue('npm test');
        mockedIsCommitCommand.mockReturnValue(false);
        mockedIsGitCommand.mockReturnValue(false);

        await runPreToolUseHook();

        expect(mockedRespond).toHaveBeenCalledWith(
          expect.objectContaining({ continue: true })
        );
        expect(mockedHandleGitCommit).not.toHaveBeenCalled();
        expect(mockedHandleGitCommand).not.toHaveBeenCalled();
      });

      it('should handle Bash tool when command extraction returns null', async () => {
        mockedExtractBashCommand.mockReturnValue(null);

        await runPreToolUseHook();

        expect(mockedRespond).toHaveBeenCalledWith(
          expect.objectContaining({ continue: true })
        );
        expect(mockedIsCommitCommand).not.toHaveBeenCalled();
        expect(mockedIsGitCommand).not.toHaveBeenCalled();
      });

      it('should handle namespaced Bash tool', async () => {
        mockInput.tool_name = 'namespace__Bash';
        mockedReadHookInput.mockResolvedValue(mockInput);
        mockedExtractBashCommand.mockReturnValue('git commit -m "test"');
        mockedIsCommitCommand.mockReturnValue(true);

        await runPreToolUseHook();

        expect(mockedExtractBashCommand).toHaveBeenCalledWith(mockInput);
        expect(mockedHandleGitCommit).toHaveBeenCalled();
      });
    });

    describe('MCP tool handling', () => {
      const mockValidator = vi.fn().mockResolvedValue(undefined);

      beforeEach(() => {
        mockInput.tool_name = 'mcp__goodvibes-tools__detect_stack';
        mockedReadHookInput.mockResolvedValue(mockInput);
        vi.mocked(TOOL_VALIDATORS).detect_stack = mockValidator;
      });

      it('should extract tool name and call validator', async () => {
        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith('Extracted tool name: detect_stack');
        expect(mockValidator).toHaveBeenCalledWith(mockInput);
      });

      it('should handle tool with validator', async () => {
        mockInput.tool_name = 'mcp__goodvibes-tools__check_types';
        mockedReadHookInput.mockResolvedValue(mockInput);
        const checkTypesValidator = vi.fn().mockResolvedValue(undefined);
        vi.mocked(TOOL_VALIDATORS).check_types = checkTypesValidator;

        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith('Extracted tool name: check_types');
        expect(checkTypesValidator).toHaveBeenCalledWith(mockInput);
      });

      it('should allow unknown tool by default', async () => {
        mockInput.tool_name = 'mcp__unknown__tool';
        mockedReadHookInput.mockResolvedValue(mockInput);

        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith('Extracted tool name: tool');
        expect(mockedDebug).toHaveBeenCalledWith(
          "Unknown tool 'tool', allowing by default"
        );
        expect(mockedRespond).toHaveBeenCalledWith(
          expect.objectContaining({ continue: true })
        );
      });

      it('should handle tool name without namespace separators', async () => {
        mockInput.tool_name = 'simple_tool';
        mockedReadHookInput.mockResolvedValue(mockInput);

        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith('Extracted tool name: simple_tool');
        expect(mockedDebug).toHaveBeenCalledWith(
          "Unknown tool 'simple_tool', allowing by default"
        );
      });

      it('should handle empty tool name', async () => {
        mockInput.tool_name = '';
        mockedReadHookInput.mockResolvedValue(mockInput);

        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith('Extracted tool name: ');
        expect(mockedDebug).toHaveBeenCalledWith(
          "Unknown tool '', allowing by default"
        );
      });

      it('should handle undefined tool name', async () => {
        mockInput.tool_name = undefined;
        mockedReadHookInput.mockResolvedValue(mockInput);

        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith('Extracted tool name: ');
      });
    });

    describe('error handling', () => {
      it('should handle readHookInput errors gracefully', async () => {
        const error = new Error('Failed to read input');
        mockedReadHookInput.mockRejectedValue(error);

        await runPreToolUseHook();

        expect(mockedLogError).toHaveBeenCalledWith('PreToolUse main', error);
        expect(mockedAllowTool).toHaveBeenCalledWith(
          'PreToolUse',
          'Hook error: Failed to read input'
        );
        expect(mockedRespond).toHaveBeenCalledWith(
          expect.objectContaining({ continue: true })
        );
      });

      it('should handle non-Error thrown values', async () => {
        const error = 'String error';
        mockedReadHookInput.mockRejectedValue(error);

        await runPreToolUseHook();

        expect(mockedLogError).toHaveBeenCalledWith('PreToolUse main', error);
        expect(mockedAllowTool).toHaveBeenCalledWith(
          'PreToolUse',
          'Hook error: String error'
        );
      });

      it('should handle validator errors gracefully', async () => {
        mockInput.tool_name = 'mcp__goodvibes-tools__detect_stack';
        mockedReadHookInput.mockResolvedValue(mockInput);
        const error = new Error('Validator failed');
        const failingValidator = vi.fn().mockRejectedValue(error);
        vi.mocked(TOOL_VALIDATORS).detect_stack = failingValidator;

        await runPreToolUseHook();

        expect(mockedLogError).toHaveBeenCalledWith('PreToolUse main', error);
        expect(mockedAllowTool).toHaveBeenCalledWith(
          'PreToolUse',
          'Hook error: Validator failed'
        );
      });
    });

    describe('integration scenarios', () => {
      it('should log tool name and cwd on start', async () => {
        await runPreToolUseHook();

        expect(mockedDebug).toHaveBeenCalledWith(
          'PreToolUse hook received input',
          {
            tool_name: 'Bash',
            cwd: '/test/project',
          }
        );
      });

      it('should complete full flow for Bash tool', async () => {
        mockedExtractBashCommand.mockReturnValue('npm test');
        mockedIsCommitCommand.mockReturnValue(false);
        mockedIsGitCommand.mockReturnValue(false);

        await runPreToolUseHook();

        expect(mockedReadHookInput).toHaveBeenCalled();
        expect(mockedDebug).toHaveBeenCalledWith(
          'PreToolUse hook received input',
          expect.any(Object)
        );
        expect(mockedExtractBashCommand).toHaveBeenCalled();
        expect(mockedRespond).toHaveBeenCalled();
      });

      it('should complete full flow for MCP tool', async () => {
        mockInput.tool_name = 'mcp__goodvibes-tools__detect_stack';
        mockedReadHookInput.mockResolvedValue(mockInput);
        const validator = vi.fn().mockResolvedValue(undefined);
        vi.mocked(TOOL_VALIDATORS).detect_stack = validator;

        await runPreToolUseHook();

        expect(mockedReadHookInput).toHaveBeenCalled();
        expect(mockedDebug).toHaveBeenCalledWith(
          'PreToolUse hook received input',
          expect.any(Object)
        );
        expect(mockedDebug).toHaveBeenCalledWith(
          'Extracted tool name: detect_stack'
        );
        expect(validator).toHaveBeenCalled();
      });
    });
  });
});
