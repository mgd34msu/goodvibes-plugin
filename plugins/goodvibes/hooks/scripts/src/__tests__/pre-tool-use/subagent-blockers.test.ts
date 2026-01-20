/**
 * Tests for pre-tool-use/subagent-blockers.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../shared/index.js');

import {
  TOOL_REPLACEMENTS,
  BLOCKED_NATIVE_TOOLS,
  formatBlockMessage,
  isBlockedNativeTool,
  handleSubagentToolBlocking,
  validateSubagentToolUsage,
  getBatchProcessingReminder,
} from '../../pre-tool-use/subagent-blockers.js';
import { respond, blockTool, debug } from '../../shared/index.js';

import type { PreToolUseInput } from '../../pre-tool-use/subagent-blockers.js';

const mockedRespond = vi.mocked(respond);
const mockedBlockTool = vi.mocked(blockTool);
const mockedDebug = vi.mocked(debug);

describe('subagent-blockers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedBlockTool.mockReturnValue({
      continue: false,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'blocked',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TOOL_REPLACEMENTS', () => {
    it('should define replacement for Read tool', () => {
      expect(TOOL_REPLACEMENTS.Read).toBeDefined();
      expect(TOOL_REPLACEMENTS.Read.replacement).toBe('batch_read');
      expect(TOOL_REPLACEMENTS.Read.usage).toContain('batch_read');
      expect(TOOL_REPLACEMENTS.Read.capabilities).toContain('offset/limit');
    });

    it('should define replacement for Edit tool', () => {
      expect(TOOL_REPLACEMENTS.Edit).toBeDefined();
      expect(TOOL_REPLACEMENTS.Edit.replacement).toBe('atomic_multi_edit');
      expect(TOOL_REPLACEMENTS.Edit.usage).toContain('atomic_multi_edit');
      expect(TOOL_REPLACEMENTS.Edit.capabilities).toContain('atomically');
    });

    it('should define replacement for Write tool', () => {
      expect(TOOL_REPLACEMENTS.Write).toBeDefined();
      expect(TOOL_REPLACEMENTS.Write.replacement).toBe('atomic_multi_edit');
      expect(TOOL_REPLACEMENTS.Write.usage).toContain('create');
    });

    it('should define replacement for Glob tool', () => {
      expect(TOOL_REPLACEMENTS.Glob).toBeDefined();
      expect(TOOL_REPLACEMENTS.Glob.replacement).toBe('smart_glob');
      expect(TOOL_REPLACEMENTS.Glob.usage).toContain('smart_glob');
      expect(TOOL_REPLACEMENTS.Glob.capabilities).toContain('node_modules');
    });

    it('should define replacement for Grep tool', () => {
      expect(TOOL_REPLACEMENTS.Grep).toBeDefined();
      expect(TOOL_REPLACEMENTS.Grep.replacement).toBe('grep_with_content');
      expect(TOOL_REPLACEMENTS.Grep.usage).toContain('grep_with_content');
      expect(TOOL_REPLACEMENTS.Grep.capabilities).toContain('regex');
    });
  });

  describe('BLOCKED_NATIVE_TOOLS', () => {
    it('should include all tool replacement keys', () => {
      expect(BLOCKED_NATIVE_TOOLS).toContain('Read');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Edit');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Write');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Glob');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Grep');
    });

    it('should have exactly 5 blocked tools', () => {
      expect(BLOCKED_NATIVE_TOOLS).toHaveLength(5);
    });
  });

  describe('formatBlockMessage', () => {
    it('should format block message with replacement and usage', () => {
      const message = formatBlockMessage('Read', TOOL_REPLACEMENTS.Read);

      expect(message).toContain('BLOCKED');
      expect(message).toContain("'batch_read'");
      expect(message).toContain("'Read'");
      expect(message).toContain('mcp-cli call');
      expect(message).toContain('offset/limit');
    });

    it('should include MCP tool invocation syntax', () => {
      const message = formatBlockMessage('Edit', TOOL_REPLACEMENTS.Edit);

      expect(message).toContain('plugin_goodvibes_goodvibes-tools/atomic_multi_edit');
      expect(message).toContain('"operation": "replace"');
    });

    it('should include capabilities description', () => {
      const message = formatBlockMessage('Glob', TOOL_REPLACEMENTS.Glob);

      expect(message).toContain('node_modules/.git');
    });
  });

  describe('isBlockedNativeTool', () => {
    it('should return true for Read', () => {
      expect(isBlockedNativeTool('Read')).toBe(true);
    });

    it('should return true for Edit', () => {
      expect(isBlockedNativeTool('Edit')).toBe(true);
    });

    it('should return true for Write', () => {
      expect(isBlockedNativeTool('Write')).toBe(true);
    });

    it('should return true for Glob', () => {
      expect(isBlockedNativeTool('Glob')).toBe(true);
    });

    it('should return true for Grep', () => {
      expect(isBlockedNativeTool('Grep')).toBe(true);
    });

    it('should return false for Bash', () => {
      expect(isBlockedNativeTool('Bash')).toBe(false);
    });

    it('should return false for MCP tools', () => {
      expect(isBlockedNativeTool('mcp__goodvibes__batch_read')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isBlockedNativeTool('')).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(isBlockedNativeTool('SomeOtherTool')).toBe(false);
    });
  });

  describe('handleSubagentToolBlocking', () => {
    it('should return false when is_subagent is false', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        is_subagent: false,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(false);
      expect(mockedRespond).not.toHaveBeenCalled();
    });

    it('should return false when is_subagent is undefined', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(false);
      expect(mockedRespond).not.toHaveBeenCalled();
    });

    it('should block Read tool for subagent and return true', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        is_subagent: true,
        agent_type: 'backend-engineer',
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('batch_read')
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
      expect(mockedDebug).toHaveBeenCalledWith(
        expect.stringContaining("Blocking native tool 'Read'"),
        expect.objectContaining({ agent_type: 'backend-engineer' })
      );
    });

    it('should block Edit tool for subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('atomic_multi_edit')
      );
    });

    it('should block Write tool for subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('atomic_multi_edit')
      );
    });

    it('should block Glob tool for subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Glob',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('smart_glob')
      );
    });

    it('should block Grep tool for subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('grep_with_content')
      );
    });

    it('should return false for non-blocked tool even if subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(false);
      expect(mockedRespond).not.toHaveBeenCalled();
    });

    it('should handle empty tool_name for subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: '',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(false);
    });

    it('should handle undefined tool_name for subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        is_subagent: true,
      };

      const result = handleSubagentToolBlocking(input);

      expect(result).toBe(false);
    });
  });

  describe('validateSubagentToolUsage', () => {
    it('should not respond when tool is blocked (response handled by handleSubagentToolBlocking)', async () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        is_subagent: true,
      };

      await validateSubagentToolUsage(input);

      // The respond is called by handleSubagentToolBlocking, not validateSubagentToolUsage
      expect(mockedRespond).toHaveBeenCalledTimes(1);
    });

    it('should log debug when subagent uses allowed tool', async () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        is_subagent: true,
      };

      await validateSubagentToolUsage(input);

      expect(mockedDebug).toHaveBeenCalledWith(
        expect.stringContaining("Allowing tool 'Bash'")
      );
    });

    it('should not log for non-subagent context', async () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        is_subagent: false,
      };

      await validateSubagentToolUsage(input);

      expect(mockedDebug).not.toHaveBeenCalledWith(
        expect.stringContaining("Allowing tool")
      );
    });
  });

  describe('getBatchProcessingReminder', () => {
    it('should return reminder message', () => {
      const reminder = getBatchProcessingReminder();

      expect(reminder).toContain('REMINDER');
      expect(reminder).toContain('batch_read');
      expect(reminder).toContain('atomic_multi_edit');
      expect(reminder).toContain('smart_glob');
      expect(reminder).toContain('grep_with_content');
      expect(reminder).toContain('output_mode: "minimal"');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete blocking flow for Read in subagent', () => {
      const input: PreToolUseInput = {
        session_id: 'session-123',
        transcript_path: '/path/to/transcript',
        cwd: '/project/root',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/some/file.ts' },
        is_subagent: true,
        agent_type: 'test-engineer',
      };

      const wasBlocked = handleSubagentToolBlocking(input);

      expect(wasBlocked).toBe(true);

      // Verify the block message contains proper usage instructions
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringMatching(/batch_read.*output_mode/s)
      );

      // Verify debug was called with proper context
      expect(mockedDebug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agent_type: 'test-engineer',
          replacement: 'batch_read',
        })
      );
    });

    it('should allow MCP tools for subagents', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__plugin_goodvibes_goodvibes-tools__batch_read',
        is_subagent: true,
      };

      const wasBlocked = handleSubagentToolBlocking(input);

      expect(wasBlocked).toBe(false);
      expect(mockedRespond).not.toHaveBeenCalled();
    });
  });
});
