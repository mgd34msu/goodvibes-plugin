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
  handleNativeToolBlocking,
  validateToolUsage,
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
      expect(TOOL_REPLACEMENTS.Read.replacement).toBe('precision_read');
      expect(TOOL_REPLACEMENTS.Read.usage).toContain('precision_read');
      expect(TOOL_REPLACEMENTS.Read.capabilities).toContain('extract modes');
    });

    it('should define replacement for Edit tool', () => {
      expect(TOOL_REPLACEMENTS.Edit).toBeDefined();
      expect(TOOL_REPLACEMENTS.Edit.replacement).toBe('precision_edit');
      expect(TOOL_REPLACEMENTS.Edit.usage).toContain('precision_edit');
      expect(TOOL_REPLACEMENTS.Edit.capabilities).toContain('atomic');
    });

    it('should define replacement for Write tool', () => {
      expect(TOOL_REPLACEMENTS.Write).toBeDefined();
      expect(TOOL_REPLACEMENTS.Write.replacement).toBe('precision_write');
      expect(TOOL_REPLACEMENTS.Write.usage).toContain('precision_write');
    });

    it('should define replacement for Glob tool', () => {
      expect(TOOL_REPLACEMENTS.Glob).toBeDefined();
      expect(TOOL_REPLACEMENTS.Glob.replacement).toBe('precision_glob');
      expect(TOOL_REPLACEMENTS.Glob.usage).toContain('precision_glob');
      expect(TOOL_REPLACEMENTS.Glob.capabilities).toContain('patterns');
    });

    it('should define replacement for Grep tool', () => {
      expect(TOOL_REPLACEMENTS.Grep).toBeDefined();
      expect(TOOL_REPLACEMENTS.Grep.replacement).toBe('precision_grep');
      expect(TOOL_REPLACEMENTS.Grep.usage).toContain('precision_grep');
      expect(TOOL_REPLACEMENTS.Grep.capabilities).toContain('regex');
    });

    it('should define replacement for WebFetch tool', () => {
      expect(TOOL_REPLACEMENTS.WebFetch).toBeDefined();
      expect(TOOL_REPLACEMENTS.WebFetch.replacement).toBe('precision_fetch');
      expect(TOOL_REPLACEMENTS.WebFetch.usage).toContain('precision_fetch');
      expect(TOOL_REPLACEMENTS.WebFetch.capabilities).toContain('extraction');
    });
  });

  describe('BLOCKED_NATIVE_TOOLS', () => {
    it('should include all tool replacement keys', () => {
      expect(BLOCKED_NATIVE_TOOLS).toContain('Read');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Edit');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Write');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Glob');
      expect(BLOCKED_NATIVE_TOOLS).toContain('Grep');
      expect(BLOCKED_NATIVE_TOOLS).toContain('WebFetch');
    });

    it('should have exactly 6 blocked tools', () => {
      expect(BLOCKED_NATIVE_TOOLS).toHaveLength(6);
    });
  });

  describe('formatBlockMessage', () => {
    it('should format block message with replacement and usage', () => {
      const message = formatBlockMessage('Read', TOOL_REPLACEMENTS.Read);

      expect(message).toContain('BLOCKED');
      expect(message).toContain('precision_read');
      expect(message).toContain("'Read'");
      expect(message).toContain('mcp__plugin_goodvibes_precision-engine__precision_read');
      expect(message).toContain('discover and batch');
    });

    it('should include MCP tool invocation syntax', () => {
      const message = formatBlockMessage('Edit', TOOL_REPLACEMENTS.Edit);

      expect(message).toContain('mcp__plugin_goodvibes_precision-engine__precision_edit');
      expect(message).toContain('discover');
      expect(message).toContain('batch');
    });

    it('should include capabilities description', () => {
      const message = formatBlockMessage('Glob', TOOL_REPLACEMENTS.Glob);

      expect(message).toContain('CAPABILITIES');
      expect(message).toContain('patterns');
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

    it('should return true for WebFetch', () => {
      expect(isBlockedNativeTool('WebFetch')).toBe(true);
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

  describe('handleNativeToolBlocking', () => {
    it('should block Read tool for main agent', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        is_subagent: false,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_read')
      );
    });

    it('should block Read tool for subagent', () => {
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

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_read')
      );
    });

    it('should block Edit tool', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_edit')
      );
    });

    it('should block Write tool', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_write')
      );
    });

    it('should block Glob tool', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Glob',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_glob')
      );
    });

    it('should block Grep tool', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_grep')
      );
    });

    it('should block WebFetch tool', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'WebFetch',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(true);
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringContaining('precision_fetch')
      );
    });

    it('should return false for non-blocked tool', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(false);
      expect(mockedRespond).not.toHaveBeenCalled();
    });

    it('should handle empty tool_name', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: '',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(false);
    });

    it('should handle undefined tool_name', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        is_subagent: true,
      };

      const result = handleNativeToolBlocking(input);

      expect(result).toBe(false);
    });
  });

  describe('validateToolUsage', () => {
    it('should block when tool is blocked', async () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        is_subagent: true,
      };

      await validateToolUsage(input);

      // blockTool is called by handleNativeToolBlocking
      expect(mockedBlockTool).toHaveBeenCalledTimes(1);
    });

    it('should not block allowed tools', async () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        is_subagent: true,
      };

      await validateToolUsage(input);

      // blockTool should not be called for allowed tools
      expect(mockedBlockTool).not.toHaveBeenCalled();
    });

    it('should not block MCP tools', async () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__plugin_goodvibes_precision-engine__precision_read',
        is_subagent: false,
      };

      await validateToolUsage(input);

      // blockTool should not be called for MCP tools
      expect(mockedBlockTool).not.toHaveBeenCalled();
    });
  });

  describe('getBatchProcessingReminder', () => {
    it('should return reminder message', () => {
      const reminder = getBatchProcessingReminder();

      expect(reminder).toContain('REMINDER');
      expect(reminder).toContain('precision_read');
      expect(reminder).toContain('precision_edit');
      expect(reminder).toContain('precision_write');
      expect(reminder).toContain('precision_glob');
      expect(reminder).toContain('precision_grep');
      expect(reminder).toContain('precision_fetch');
      expect(reminder).toContain('discover');
      expect(reminder).toContain('batch');
      expect(reminder).toContain('output.mode: "minimal"');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete blocking flow for Read', () => {
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

      const wasBlocked = handleNativeToolBlocking(input);

      expect(wasBlocked).toBe(true);

      // Verify the block message contains proper usage instructions
      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        expect.stringMatching(/precision_read.*discover.*batch/s)
      );
    });

    it('should allow MCP tools', () => {
      const input: PreToolUseInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__plugin_goodvibes_precision-engine__precision_read',
        is_subagent: true,
      };

      const wasBlocked = handleNativeToolBlocking(input);

      expect(wasBlocked).toBe(false);
      expect(mockedRespond).not.toHaveBeenCalled();
    });
  });
});
