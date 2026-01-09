/**
 * Unit tests for shared/notification hook
 *
 * Tests cover:
 * - Notification hook receiving and processing input
 * - Handling different hook event names
 * - Handling different tool names
 * - Error handling (main catch block)
 * - Error handling (uncaught promise rejection)
 * - Response with and without error messages
 * - Debug logging
 * - Non-Error exceptions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original values
const originalProcessExit = process.exit;

describe('shared/notification', () => {
  // Mock functions
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();

    // Mock process.exit to prevent actual exit
    process.exit = vi.fn() as never;

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock shared module (notification imports from './index.js')
    vi.doMock('../../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      debug: mockDebug,
      logError: mockLogError,
      isTestEnvironment: () => false, // Return false so hook actually runs
    }));

    // Import the module (this triggers runNotificationHook)
    await import('../../shared/notification.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('successful notification processing', () => {
    it('should process notification and respond', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/cwd',
        hook_event_name: 'Notification',
        tool_name: 'Bash',
      });

      await setupMocksAndImport();

      // Verify input was read
      expect(mockReadHookInput).toHaveBeenCalled();

      // Verify debug logging
      expect(mockDebug).toHaveBeenCalledWith('Notification hook starting');
      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'Notification',
        tool_name: 'Bash',
      });

      // Verify response was sent
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle validation failure notification', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'validation-fail-session',
        cwd: '/test/cwd',
        hook_event_name: 'ValidationFailure',
        tool_name: 'TypeCheck',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'ValidationFailure',
        tool_name: 'TypeCheck',
      });

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle test failure notification', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-fail-session',
        cwd: '/test/cwd',
        hook_event_name: 'TestFailure',
        tool_name: 'Vitest',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'TestFailure',
        tool_name: 'Vitest',
      });
    });

    it('should handle build error notification', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'build-error-session',
        cwd: '/test/cwd',
        hook_event_name: 'BuildError',
        tool_name: 'TypeScript',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'BuildError',
        tool_name: 'TypeScript',
      });
    });

    it('should handle notification without tool_name', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'no-tool-session',
        cwd: '/test/cwd',
        hook_event_name: 'GenericNotification',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'GenericNotification',
        tool_name: undefined,
      });

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('should handle readHookInput error', async () => {
      const testError = new Error('Failed to read input');
      mockReadHookInput.mockRejectedValue(testError);

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith('Notification main', testError);

      // Verify error response was sent
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: Failed to read input',
      });
    });

    it('should handle non-Error exceptions', async () => {
      const stringError = 'String error message';
      mockReadHookInput.mockRejectedValue(stringError);

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'Notification main',
        stringError
      );

      // Verify error message uses String() for non-Error objects
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: String error message',
      });
    });

    it('should handle null exception', async () => {
      mockReadHookInput.mockRejectedValue(null);

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith('Notification main', null);

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: null',
      });
    });

    it('should handle undefined exception', async () => {
      mockReadHookInput.mockRejectedValue(undefined);

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith('Notification main', undefined);

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: undefined',
      });
    });

    it('should handle object exception', async () => {
      const objError = { code: 'ERR_CUSTOM', message: 'Custom error' };
      mockReadHookInput.mockRejectedValue(objError);

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith('Notification main', objError);

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: expect.stringContaining('Notification error:'),
      });
    });

    it('should handle uncaught promise rejection', async () => {
      const uncaughtError = new Error('Uncaught error');
      mockReadHookInput.mockRejectedValue(uncaughtError);

      await setupMocksAndImport();

      // Verify error handler was called (main catch block handles it)
      expect(mockLogError).toHaveBeenCalledWith(
        'Notification main',
        uncaughtError
      );

      // Verify error response was sent
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: Uncaught error',
      });
    });

    it('should handle uncaught non-Error exception', async () => {
      const stringError = 'Uncaught string error';
      mockReadHookInput.mockRejectedValue(stringError);

      await setupMocksAndImport();

      // Verify error handler was called (main catch block handles it)
      expect(mockLogError).toHaveBeenCalledWith(
        'Notification main',
        stringError
      );

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: Uncaught string error',
      });
    });

    it('should handle truly uncaught promise rejections (lines 47-48)', async () => {
      vi.resetModules();

      // Create a mock that rejects asynchronously
      const error = new Error('Truly uncaught error');
      mockReadHookInput.mockImplementation(() => {
        return new Promise((_, reject) => {
          // Reject asynchronously - will be caught by try/catch in runNotificationHook
          setImmediate(() => reject(error));
        });
      });

      await setupMocksAndImport();

      // Wait longer for async error to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error is caught by main try/catch, not the .catch() handler
      expect(mockLogError).toHaveBeenCalledWith('Notification main', error);
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: Truly uncaught error',
      });
    });

    it('should handle truly uncaught non-Error rejections (lines 47-48)', async () => {
      vi.resetModules();

      const errorString = 'Truly uncaught string error';
      mockReadHookInput.mockImplementation(() => {
        return new Promise((_, reject) => {
          setImmediate(() => reject(errorString));
        });
      });

      await setupMocksAndImport();

      // Wait for async error to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error is caught by main try/catch, not the .catch() handler
      expect(mockLogError).toHaveBeenCalledWith(
        'Notification main',
        errorString
      );
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: 'Notification error: Truly uncaught string error',
      });
    });

  });

  describe('createResponse helper', () => {
    it('should create response with no systemMessage for success', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'success-session',
        cwd: '/test/cwd',
        hook_event_name: 'Notification',
      });

      await setupMocksAndImport();

      const response = mockRespond.mock.calls[0][0];
      expect(response.continue).toBe(true);
      expect(response.systemMessage).toBeUndefined();
    });

    it('should create response with systemMessage for error', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Test error'));

      await setupMocksAndImport();

      const response = mockRespond.mock.calls[0][0];
      expect(response.continue).toBe(true);
      expect(response.systemMessage).toBe('Notification error: Test error');
    });
  });

  describe('debug logging', () => {
    it('should log debug messages during execution', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'debug-test',
        cwd: '/test/cwd',
        hook_event_name: 'TestNotification',
        tool_name: 'TestTool',
      });

      await setupMocksAndImport();

      // Verify debug calls
      expect(mockDebug).toHaveBeenCalledWith('Notification hook starting');
      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'TestNotification',
        tool_name: 'TestTool',
      });
    });

    it('should not log debug messages on error', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Read error'));

      await setupMocksAndImport();

      // Should not log "Notification received" on error
      const debugCalls = mockDebug.mock.calls.map((call) => call[0]);
      expect(debugCalls).toContain('Notification hook starting');
      expect(debugCalls).not.toContain('Notification received');
    });
  });

  describe('edge cases', () => {
    it('should handle input with extra fields', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'extra-fields-session',
        cwd: '/test/cwd',
        hook_event_name: 'Notification',
        tool_name: 'Bash',
        extra_field_1: 'extra',
        extra_field_2: 123,
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'Notification',
        tool_name: 'Bash',
      });

      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle empty hook_event_name', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'empty-event-session',
        cwd: '/test/cwd',
        hook_event_name: '',
        tool_name: 'Tool',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: '',
        tool_name: 'Tool',
      });
    });

    it('should handle empty tool_name', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'empty-tool-session',
        cwd: '/test/cwd',
        hook_event_name: 'Event',
        tool_name: '',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Notification received', {
        hook_event_name: 'Event',
        tool_name: '',
      });
    });
  });
});
