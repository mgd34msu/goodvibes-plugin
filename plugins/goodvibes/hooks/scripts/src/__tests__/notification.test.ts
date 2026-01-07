/**
 * Unit tests for notification hook
 *
 * Tests cover:
 * - Hook initialization and response
 * - createResponse function behavior
 * - Success path with valid input
 * - Error handling with Error instance
 * - Error handling with non-Error thrown value
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
}));

describe('notification hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('runNotificationHook', () => {
    it('should call debug on startup', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'Notification',
        tool_name: 'test-tool',
      });

      await import('../notification.js');

      // Wait for the async hook to complete
      await vi.waitFor(() => {
        expect(mockDebug).toHaveBeenCalledWith('Notification hook starting');
      });
    });

    it('should read hook input and log notification details', async () => {
      const mockInput = {
        hook_event_name: 'Notification',
        tool_name: 'Write',
        session_id: 'test-session-123',
      };
      mockReadHookInput.mockResolvedValue(mockInput);

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockReadHookInput).toHaveBeenCalled();
        expect(mockDebug).toHaveBeenCalledWith('Notification received', {
          hook_event_name: 'Notification',
          tool_name: 'Write',
        });
      });
    });

    it('should respond with continue: true and no system message on success', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'Notification',
        tool_name: 'Bash',
      });

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: undefined,
        });
      });
    });

    it('should handle Error instance in catch block', async () => {
      const testError = new Error('Test error message');
      mockReadHookInput.mockRejectedValue(testError);

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification main',
          testError
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification error: Test error message',
        });
      });
    });

    it('should handle non-Error value in catch block', async () => {
      const nonErrorValue = 'string error';
      mockReadHookInput.mockRejectedValue(nonErrorValue);

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification main',
          nonErrorValue
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification error: string error',
        });
      });
    });

    it('should handle object thrown as error', async () => {
      const objectError = { code: 'ERR_UNKNOWN', message: 'Something failed' };
      mockReadHookInput.mockRejectedValue(objectError);

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification main',
          objectError
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification error: [object Object]',
        });
      });
    });

    it('should handle null thrown as error', async () => {
      mockReadHookInput.mockRejectedValue(null);

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith('Notification main', null);
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification error: null',
        });
      });
    });

    it('should handle undefined thrown as error', async () => {
      mockReadHookInput.mockRejectedValue(undefined);

      await import('../notification.js');

      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          'Notification main',
          undefined
        );
        expect(mockRespond).toHaveBeenCalledWith({
          continue: true,
          systemMessage: 'Notification error: undefined',
        });
      });
    });
  });

  describe('createResponse', () => {
    it('should create response with systemMessage when provided', async () => {
      const errorMessage = 'Custom error occurred';
      mockReadHookInput.mockRejectedValue(new Error(errorMessage));

      await import('../notification.js');

      await vi.waitFor(() => {
        const respondCall = mockRespond.mock.calls[0][0];
        expect(respondCall.continue).toBe(true);
        expect(respondCall.systemMessage).toBe(
          `Notification error: ${errorMessage}`
        );
      });
    });

    it('should create response without systemMessage when not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'Notification',
        tool_name: 'Read',
      });

      await import('../notification.js');

      await vi.waitFor(() => {
        const respondCall = mockRespond.mock.calls[0][0];
        expect(respondCall.continue).toBe(true);
        expect(respondCall.systemMessage).toBeUndefined();
      });
    });
  });
});
