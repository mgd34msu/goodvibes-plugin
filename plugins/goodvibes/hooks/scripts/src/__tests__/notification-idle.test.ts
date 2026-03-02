/**
 * Unit tests for notification-idle hook
 *
 * Tests cover:
 * - Hook initialization and response
 * - createResponse function behavior
 * - Success path with valid input
 * - Error handling with Error instance
 * - Error handling with non-Error thrown value
 * - IDLE_PROMPT_MESSAGE constant
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the shared module before any imports
const mockRespond = vi.fn();
const mockReadHookInput = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();

vi.mock('../shared/index.js', () => ({
  respond: mockRespond,
  readHookInput: mockReadHookInput,
  debug: mockDebug,
  logError: mockLogError,
  isTestEnvironment: () => false,
}));

describe('notification-idle hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('runNotificationIdleHook', () => {
    it('should call debug on startup', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'Notification',
        tool_name: 'test-tool',
      });

      await import('../shared/notification-idle.js');

      // Wait for the async hook to complete
      await vi.waitFor(() => {
        expect(mockDebug).toHaveBeenCalledWith(
          'Notification idle hook starting'
        );
      });
    });

    it('should read hook input and log notification details', async () => {
      const mockInput = {
        hook_event_name: 'Notification',
        tool_name: 'idle_prompt',
        session_id: 'test-session-123',
      };
      mockReadHookInput.mockResolvedValue(mockInput);

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockReadHookInput).toHaveBeenCalled();
        expect(mockDebug).toHaveBeenCalledWith('Idle notification received', {
          hook_event_name: 'Notification',
          tool_name: 'idle_prompt',
        });
      });
    });

    it('should respond with WRFC loop reminder message', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'Notification',
        tool_name: 'idle_prompt',
      });

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage:
            'CRITICAL: IF YOU ARE WORKING ON A LONG TASK CHECK IF AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!',
        });
      });
    });

    it('should handle Error instance in catch block', async () => {
      const testError = new Error('Test error message');
      mockReadHookInput.mockRejectedValue(testError);

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification idle main',
          testError
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification idle error: Test error message',
        });
      });
    });

    it('should handle non-Error value in catch block', async () => {
      const nonErrorValue = 'string error';
      mockReadHookInput.mockRejectedValue(nonErrorValue);

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification idle main',
          nonErrorValue
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification idle error: string error',
        });
      });
    });

    it('should handle object thrown as error', async () => {
      const objectError = { code: 'ERR_UNKNOWN', message: 'Something failed' };
      mockReadHookInput.mockRejectedValue(objectError);

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification idle main',
          objectError
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification idle error: [object Object]',
        });
      });
    });

    it('should handle null thrown as error', async () => {
      mockReadHookInput.mockRejectedValue(null);

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification idle main',
          null
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification idle error: null',
        });
      });
    });

    it('should handle undefined thrown as error', async () => {
      mockReadHookInput.mockRejectedValue(undefined);

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification idle main',
          undefined
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification idle error: undefined',
        });
      });
    });
  });

  describe('createResponse', () => {
    it('should create response with systemMessage when provided', async () => {
      const errorMessage = 'Custom error occurred';
      mockReadHookInput.mockRejectedValue(new Error(errorMessage));

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        const respondCall = mockRespond.mock.calls[0][0];
        expect(respondCall.continue).toBe(true);
        expect(respondCall.systemMessage).toBe(
          `Notification idle error: ${errorMessage}`
        );
      });
    });

    it('should create response with WRFC message on success', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'Notification',
        tool_name: 'idle_prompt',
      });

      await import('../shared/notification-idle.js');

      await vi.waitFor(() => {
        const respondCall = mockRespond.mock.calls[0][0];
        expect(respondCall.continue).toBe(true);
        expect(respondCall.systemMessage).toBe(
          'CRITICAL: IF YOU ARE WORKING ON A LONG TASK CHECK IF AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!'
        );
      });
    });
  });

  describe('IDLE_PROMPT_MESSAGE', () => {
    it('should export the correct message constant', async () => {
      const module = await import('../shared/notification-idle.js');
      expect(module.IDLE_PROMPT_MESSAGE).toBe(
        'CRITICAL: IF YOU ARE WORKING ON A LONG TASK CHECK IF AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!'
      );
    });
  });
});
