/**
 * Unit tests for user-prompt-submit hook
 *
 * Tests cover:
 * - Hook initialization and debug logging
 * - Reading hook input from stdin
 * - Successful response with createResponse
 * - Error handling in catch block
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original process.exit
const originalProcessExit = process.exit;

describe('user-prompt-submit hook', () => {
  // Mock functions
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockCreateResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockCreateResponse = vi.fn();

    // Mock process.exit to prevent actual exit
    process.exit = vi.fn() as never;

    // Default mock for respond - just records the call
    mockRespond.mockReturnValue(undefined);

    // Default mock for createResponse
    mockCreateResponse.mockImplementation(() => ({
      continue: true,
    }));
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock shared module
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      debug: mockDebug,
      logError: mockLogError,
      createResponse: mockCreateResponse,
    }));

    // Import the module (this triggers runUserPromptSubmitHook)
    await import('../user-prompt-submit.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('successful execution', () => {
    it('should read input and respond with createResponse', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'UserPromptSubmit',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      });

      await setupMocksAndImport();

      // Verify debug was called with starting message
      expect(mockDebug).toHaveBeenCalledWith('UserPromptSubmit hook starting');

      // Verify input was read
      expect(mockReadHookInput).toHaveBeenCalled();

      // Verify debug was called with input details
      expect(mockDebug).toHaveBeenCalledWith('UserPromptSubmit received input', {
        session_id: 'test-session-123',
      });

      // Verify createResponse was called with no options
      expect(mockCreateResponse).toHaveBeenCalledWith();

      // Verify respond was called with the created response
      expect(mockRespond).toHaveBeenCalledWith({ continue: true });
    });

    it('should work with different session IDs', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'another-session-456',
        cwd: '/another/project',
        hook_event_name: 'UserPromptSubmit',
        transcript_path: '/another/transcript',
        permission_mode: 'default',
      });

      await setupMocksAndImport();

      // Verify debug was called with correct session_id
      expect(mockDebug).toHaveBeenCalledWith('UserPromptSubmit received input', {
        session_id: 'another-session-456',
      });
    });
  });

  describe('error handling', () => {
    it('should handle Error instances and respond with createResponse', async () => {
      const testError = new Error('Test error during user prompt submit');
      mockReadHookInput.mockRejectedValue(testError);

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith('UserPromptSubmit main', testError);

      // Verify createResponse was called (in catch block)
      expect(mockCreateResponse).toHaveBeenCalledWith();

      // Verify respond was called with the created response
      expect(mockRespond).toHaveBeenCalledWith({ continue: true });
    });

    it('should handle non-Error objects in catch block', async () => {
      const stringError = 'String error message';
      mockReadHookInput.mockRejectedValue(stringError);

      await setupMocksAndImport();

      // Verify error was logged with the string error
      expect(mockLogError).toHaveBeenCalledWith('UserPromptSubmit main', stringError);

      // Verify createResponse was called
      expect(mockCreateResponse).toHaveBeenCalledWith();

      // Verify respond was called
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should handle undefined errors', async () => {
      mockReadHookInput.mockRejectedValue(undefined);

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith('UserPromptSubmit main', undefined);

      // Verify createResponse was called
      expect(mockCreateResponse).toHaveBeenCalledWith();

      // Verify respond was called
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('debug logging', () => {
    it('should log hook starting message first', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'UserPromptSubmit',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      });

      await setupMocksAndImport();

      // Verify the order of debug calls
      const debugCalls = mockDebug.mock.calls;
      expect(debugCalls[0][0]).toBe('UserPromptSubmit hook starting');
      expect(debugCalls[1][0]).toBe('UserPromptSubmit received input');
    });
  });
});
