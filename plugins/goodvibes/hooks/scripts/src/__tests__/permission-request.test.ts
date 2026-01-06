/**
 * Unit tests for permission-request.ts
 *
 * Tests cover:
 * - Auto-approval of GoodVibes MCP tool permissions
 * - Prompting user for non-GoodVibes tools
 * - Error handling with fallback to 'ask'
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the shared module before importing the module under test
const mockReadHookInput = vi.fn();
const mockRespond = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockCreatePermissionResponse = vi.fn();

vi.mock('../shared/index.js', () => ({
  readHookInput: mockReadHookInput,
  respond: mockRespond,
  debug: mockDebug,
  logError: mockLogError,
  createPermissionResponse: mockCreatePermissionResponse,
}));

describe('permission-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Set up default mock returns
    mockCreatePermissionResponse.mockImplementation((decision: string) => ({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        permissionDecision: decision,
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runPermissionRequestHook', () => {
    it('should auto-approve when tool_name includes "goodvibes"', async () => {
      const mockInput = {
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        tool_name: 'plugin_goodvibes_goodvibes-tools/search_skills',
      };

      mockReadHookInput.mockResolvedValue(mockInput);

      // Import the module - this triggers runPermissionRequestHook()
      await import('../permission-request.js');

      // Wait for async operations to complete
      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest received', {
        tool_name: mockInput.tool_name,
      });
      expect(mockDebug).toHaveBeenCalledWith('Auto-approving GoodVibes tool permission');
      expect(mockCreatePermissionResponse).toHaveBeenCalledWith('allow');
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });
    });

    it('should ask user when tool_name does not include "goodvibes"', async () => {
      const mockInput = {
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        tool_name: 'slack/post_message',
      };

      mockReadHookInput.mockResolvedValue(mockInput);

      await import('../permission-request.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest received', {
        tool_name: mockInput.tool_name,
      });
      expect(mockCreatePermissionResponse).toHaveBeenCalledWith('ask');
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });
    });

    it('should ask user when tool_name is undefined', async () => {
      const mockInput = {
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        // tool_name is undefined
      };

      mockReadHookInput.mockResolvedValue(mockInput);

      await import('../permission-request.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest received', {
        tool_name: undefined,
      });
      expect(mockCreatePermissionResponse).toHaveBeenCalledWith('ask');
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });
    });

    it('should handle errors and respond with ask', async () => {
      const testError = new Error('Failed to read stdin');
      mockReadHookInput.mockRejectedValue(testError);

      await import('../permission-request.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(mockLogError).toHaveBeenCalledWith('PermissionRequest main', testError);
      expect(mockCreatePermissionResponse).toHaveBeenCalledWith('ask');
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });
    });

    it('should auto-approve when tool_name contains "goodvibes" anywhere', async () => {
      const mockInput = {
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        tool_name: 'mcp_server_goodvibes_detect_stack',
      };

      mockReadHookInput.mockResolvedValue(mockInput);

      await import('../permission-request.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('Auto-approving GoodVibes tool permission');
      expect(mockCreatePermissionResponse).toHaveBeenCalledWith('allow');
    });
  });
});
