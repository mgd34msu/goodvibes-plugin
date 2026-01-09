/**
 * Unit tests for lifecycle/permission-request.ts
 *
 * Tests cover:
 * - Auto-approving GoodVibes tool permissions
 * - Asking user for non-GoodVibes tools
 * - Error handling and uncaught promise rejections
 *
 * Target: 100% line and branch coverage including lines 41-42
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../shared/index.js', () => ({
  respond: vi.fn(),
  readHookInput: vi.fn(),
  debug: vi.fn(),
  logError: vi.fn(),
  createPermissionResponse: vi.fn((decision: string) => ({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      permissionDecision: decision,
    },
  })),
  isTestEnvironment: () => false,
}));

// Import mocked functions
import {
  respond,
  readHookInput,
  debug,
  logError,
  createPermissionResponse,
} from '../../shared/index.js';

// Mock process.argv to simulate module execution
const originalArgv = process.argv;

describe('permission-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.argv = originalArgv;
  });

  describe('runPermissionRequestHook', () => {
    it('should auto-approve GoodVibes tool permissions', async () => {
      const mockInput = {
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
        cwd: '/test/cwd',
        permission_mode: 'ask',
        hook_event_name: 'PermissionRequest',
        tool_name: 'plugin_goodvibes_goodvibes-tools/search_skills',
      };

      vi.mocked(readHookInput).mockResolvedValue(mockInput);
      vi.mocked(createPermissionResponse).mockReturnValue({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });

      // Import and execute module
      await import('../../lifecycle/permission-request.js');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(debug).toHaveBeenCalledWith('PermissionRequest hook starting');
      expect(debug).toHaveBeenCalledWith('PermissionRequest received', {
        tool_name: 'plugin_goodvibes_goodvibes-tools/search_skills',
      });
      expect(debug).toHaveBeenCalledWith(
        'Auto-approving GoodVibes tool permission'
      );
      expect(createPermissionResponse).toHaveBeenCalledWith('allow');
      expect(respond).toHaveBeenCalledWith({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });
    });

    it('should ask user for non-GoodVibes tool permissions', async () => {
      vi.resetModules();

      const mockInput = {
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
        cwd: '/test/cwd',
        permission_mode: 'ask',
        hook_event_name: 'PermissionRequest',
        tool_name: 'slack/send_message',
      };

      vi.mocked(readHookInput).mockResolvedValue(mockInput);
      vi.mocked(createPermissionResponse).mockReturnValue({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });

      // Import and execute module
      await import('../../lifecycle/permission-request.js?version=1');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(createPermissionResponse).toHaveBeenCalledWith('ask');
      expect(respond).toHaveBeenCalledWith({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });
    });

    it('should handle errors and respond with ask permission', async () => {
      vi.resetModules();

      const error = new Error('Failed to read input');
      vi.mocked(readHookInput).mockRejectedValue(error);
      vi.mocked(createPermissionResponse).mockReturnValue({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });

      // Import and execute module
      await import('../../lifecycle/permission-request.js?version=2');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logError).toHaveBeenCalledWith('PermissionRequest main', error);
      expect(createPermissionResponse).toHaveBeenCalledWith('ask');
      expect(respond).toHaveBeenCalled();
    });

    it('should handle uncaught promise rejections (lines 41-42)', async () => {
      vi.resetModules();

      // Create a mock that throws after the initial promise resolves
      // Error is caught by main try/catch, not the .catch() handler
      const error = new Error('Uncaught async error');
      vi.mocked(readHookInput).mockImplementation(() => {
        return new Promise((_, reject) => {
          // Reject asynchronously - caught by try/catch in runPermissionRequestHook
          setImmediate(() => reject(error));
        });
      });

      vi.mocked(createPermissionResponse).mockReturnValue({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });

      // Import and execute module
      await import('../../lifecycle/permission-request.js?version=3');

      // Wait for async error to propagate
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Error is caught by main try/catch, not the .catch() handler
      expect(logError).toHaveBeenCalledWith(
        'PermissionRequest main',
        error
      );
      expect(createPermissionResponse).toHaveBeenCalledWith('ask');
      expect(respond).toHaveBeenCalled();
    });
  });
});
