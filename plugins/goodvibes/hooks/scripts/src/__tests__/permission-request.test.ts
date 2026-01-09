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

// Store original values
const originalProcessExit = process.exit;

describe('permission-request', () => {
  // Mock functions
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockCreatePermissionResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockReadHookInput = vi.fn();
    mockRespond = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockCreatePermissionResponse = vi.fn();

    // Mock process.exit to prevent actual exit
    process.exit = vi.fn() as never;

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
    mockCreatePermissionResponse.mockImplementation((decision: string) => ({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        permissionDecision: decision,
      },
    }));
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      readHookInput: mockReadHookInput,
      respond: mockRespond,
      debug: mockDebug,
      logError: mockLogError,
      createPermissionResponse: mockCreatePermissionResponse,
      isTestEnvironment: () => false,
    }));

    // Import the module (this triggers the hook)
    await import('../permission-request.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('runPermissionRequestHook', () => {
    it('should auto-approve when tool_name includes "goodvibes"', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        tool_name: 'plugin_goodvibes_goodvibes-tools/search_skills',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest received', {
        tool_name: 'plugin_goodvibes_goodvibes-tools/search_skills',
      });
      expect(mockDebug).toHaveBeenCalledWith(
        'Auto-approving GoodVibes tool permission'
      );
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
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        tool_name: 'slack/post_message',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest received', {
        tool_name: 'slack/post_message',
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
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        // tool_name is undefined
      });

      await setupMocksAndImport();

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

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(mockLogError).toHaveBeenCalledWith(
        'PermissionRequest main',
        testError
      );
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
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session',
        transcript_path: '/path/to/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PermissionRequest',
        tool_name: 'mcp_server_goodvibes_detect_stack',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'Auto-approving GoodVibes tool permission'
      );
      expect(mockCreatePermissionResponse).toHaveBeenCalledWith('allow');
    });
  });
});
