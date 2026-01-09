/**
 * Tests for shared/hook-runner.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../shared/hook-io.js', () => ({
  readHookInput: vi.fn(),
  respond: vi.fn(),
  createResponse: vi.fn((options = {}) => ({
    continue: true,
    ...options,
  })),
}));

vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
  logError: vi.fn(),
}));

// Get mocked functions
import { readHookInput, respond, createResponse } from '../../shared/hook-io.js';
import {
  runHook,
  runHookSync,
  isMainModule,
  type HookHandler,
  type RunHookOptions as _RunHookOptions,
  type HookInput,
  type HookResponse,
} from '../../shared/hook-runner.js';
import { debug, logError } from '../../shared/logging.js';

const mockedReadHookInput = vi.mocked(readHookInput);
const mockedRespond = vi.mocked(respond);
const mockedCreateResponse = vi.mocked(createResponse);
const mockedDebug = vi.mocked(debug);
const mockedLogError = vi.mocked(logError);

describe('hook-runner', () => {
  let mockInput: HookInput;

  beforeEach(() => {
    // Setup default mock input
    mockInput = {
      session_id: 'test-session-123',
      transcript_path: '/path/to/transcript',
      cwd: '/test/cwd',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isMainModule', () => {
    const originalArgv = process.argv;

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('should return true when import.meta.url matches process.argv[1]', () => {
      process.argv = ['node', '/c/test/path/script.js'];
      const importMetaUrl = 'file:///c/test/path/script.js';
      expect(isMainModule(importMetaUrl)).toBe(true);
    });

    it('should return false when import.meta.url does not match process.argv[1]', () => {
      process.argv = ['node', '/c/test/path/other.js'];
      const importMetaUrl = 'file:///c/test/path/script.js';
      expect(isMainModule(importMetaUrl)).toBe(false);
    });

    it('should normalize Windows-style backslashes in paths', () => {
      process.argv = ['node', 'C:\\test\\path\\script.js'];
      const importMetaUrl = 'file:///C:/test/path/script.js';
      expect(isMainModule(importMetaUrl)).toBe(true);
    });

    it('should normalize backslashes in import.meta.url', () => {
      process.argv = ['node', '/c/test/path/script.js'];
      const importMetaUrl = 'file:///c\\test\\path\\script.js';
      expect(isMainModule(importMetaUrl)).toBe(true);
    });

    it('should handle when process.argv[1] is undefined', () => {
      process.argv = ['node'];
      const importMetaUrl = 'file:///c/test/path/script.js';
      expect(isMainModule(importMetaUrl)).toBe(false);
    });

    it('should handle empty process.argv', () => {
      process.argv = [];
      const importMetaUrl = 'file:///c/test/path/script.js';
      expect(isMainModule(importMetaUrl)).toBe(false);
    });

    it('should add file:// prefix to Unix paths (line 76-77 branch)', () => {
      // Unix path without drive letter - triggers else-if branch
      process.argv = ['node', '/home/user/project/script.js'];
      const importMetaUrl = 'file:///home/user/project/script.js';
      expect(isMainModule(importMetaUrl)).toBe(true);
    });

    it('should not add prefix when path already starts with file://', () => {
      // Path already has file:// prefix - neither branch is taken
      process.argv = ['node', 'file:///home/user/project/script.js'];
      const importMetaUrl = 'file:///home/user/project/script.js';
      expect(isMainModule(importMetaUrl)).toBe(true);
    });
  });

  describe('runHook', () => {
    it('should successfully run hook and respond with handler result', async () => {
      const response: HookResponse = { continue: true, systemMessage: 'Success' };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      // Use catchUncaught: false to await the promise
      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedDebug).toHaveBeenCalledWith('TestHook hook starting');
      expect(mockedDebug).toHaveBeenCalledWith('TestHook received input', {
        hook_event_name: 'PreToolUse',
        session_id: 'test-session-123',
        tool_name: 'Bash',
      });
      expect(mockedReadHookInput).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(mockInput);
      expect(mockedRespond).toHaveBeenCalledWith(response);
      expect(mockedLogError).not.toHaveBeenCalled();
    });

    it('should handle handler errors and create error response', async () => {
      const error = new Error('Handler failed');
      const handler: HookHandler = vi.fn().mockRejectedValue(error);
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Handler failed',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(mockedCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'TestHook error: Handler failed',
      });
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle readHookInput errors', async () => {
      const error = new Error('Failed to read input');
      const handler: HookHandler = vi.fn();
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Failed to read input',
      };

      mockedReadHookInput.mockRejectedValue(error);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(handler).not.toHaveBeenCalled();
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should use custom onError handler when provided', async () => {
      const error = new Error('Custom error');
      const handler: HookHandler = vi.fn().mockRejectedValue(error);
      const customErrorResponse: HookResponse = {
        continue: false,
        systemMessage: 'Custom error handling',
      };
      const onError = vi.fn().mockReturnValue(customErrorResponse);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHook('TestHook', handler, { onError, catchUncaught: false });

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(onError).toHaveBeenCalledWith(error);
      expect(mockedCreateResponse).not.toHaveBeenCalled();
      expect(mockedRespond).toHaveBeenCalledWith(customErrorResponse);
    });

    it('should handle non-Error thrown values', async () => {
      const errorValue = 'String error message';
      const handler: HookHandler = vi.fn().mockRejectedValue(errorValue);
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: String error message',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', errorValue);
      expect(mockedCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'TestHook error: String error message',
      });
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle catchUncaught: true (default)', async () => {
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      // Don't await - catchUncaught mode
      void runHook('TestHook', handler);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(mockInput);
      expect(mockedRespond).toHaveBeenCalledWith(response);
    });

    it('should handle uncaught errors with catchUncaught: true', async () => {
      const error = new Error('Uncaught error');
      const handler: HookHandler = vi.fn().mockRejectedValue(error);
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Uncaught error',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      // Don't await - catchUncaught mode
      void runHook('TestHook', handler);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle uncaught promise rejections with catchUncaught: true', async () => {
      const error = new Error('Promise rejection');
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Promise rejection',
      };

      // Create a handler that throws after a delay to trigger the .catch() handler
      const handler: HookHandler = vi.fn().mockImplementation(async () => {
        // Simulate async operation that throws after promise chain is set up
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw error;
      });

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      // Call with catchUncaught: true - don't await
      void runHook('TestHook', handler, { catchUncaught: true });

      // Wait for error to propagate through .catch() handler
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should call handleError with 'main' context first, then potentially 'uncaught'
      expect(mockedLogError).toHaveBeenCalled();
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should trigger uncaught handler for errors after execute() returns', async () => {
      const error = new Error('Truly uncaught error');
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Truly uncaught error',
      };

      // Mock readHookInput to succeed initially
      mockedReadHookInput.mockResolvedValue(mockInput);

      // Create a promise that rejects asynchronously to test .catch() path
      const handler: HookHandler = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          // Reject asynchronously to ensure it goes through .catch()
          setImmediate(() => reject(error));
        });
      });

      mockedCreateResponse.mockReturnValue(errorResponse);

      // Call without awaiting (catchUncaught: true)
      void runHook('TestHook', handler, { catchUncaught: true });

      // Wait for async rejection
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should call uncaught error handler (line 155) for unhandled rejections', async () => {
      const error = new Error('Uncaught handler test');
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Uncaught handler test',
      };

      // Create a handler that returns a promise that rejects after
      // execute() completes, triggering the .catch() on line 154-156
      const handler: HookHandler = vi.fn().mockImplementation(() => {
        return Promise.reject(error);
      });

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      // Don't await - let it run with catchUncaught: true
      void runHook('TestHook', handler, { catchUncaught: true });

      // Wait for the error to propagate through the .catch() handler
      await new Promise((resolve) => setTimeout(resolve, 30));

      // The error should be caught by the main handler first
      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should pass input without tool_name correctly', async () => {
      const inputWithoutTool = { ...mockInput };
      delete inputWithoutTool.tool_name;
      delete inputWithoutTool.tool_input;

      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(inputWithoutTool);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedDebug).toHaveBeenCalledWith('TestHook received input', {
        hook_event_name: 'PreToolUse',
        session_id: 'test-session-123',
        tool_name: undefined,
      });
      expect(handler).toHaveBeenCalledWith(inputWithoutTool);
    });

    it('should handle empty options object', async () => {
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      // Empty options defaults to catchUncaught: true, so we need to wait
      void runHook('TestHook', handler, {});
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(handler).toHaveBeenCalledWith(mockInput);
      expect(mockedRespond).toHaveBeenCalledWith(response);
    });

    it('should handle complex hook responses', async () => {
      const complexResponse: HookResponse = {
        continue: false,
        stopReason: 'Test stopped',
        suppressOutput: true,
        systemMessage: 'Complex response',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Test reason',
          updatedInput: { modified: true },
        },
      };
      const handler: HookHandler = vi.fn().mockResolvedValue(complexResponse);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedRespond).toHaveBeenCalledWith(complexResponse);
    });
  });

  describe('runHookSync', () => {
    it('should run hook synchronously with catchUncaught: false', async () => {
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHookSync('SyncHook', handler);

      expect(mockedReadHookInput).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(mockInput);
      expect(mockedRespond).toHaveBeenCalledWith(response);
    });

    it('should handle errors in synchronous mode', async () => {
      const error = new Error('Sync error');
      const handler: HookHandler = vi.fn().mockRejectedValue(error);
      const errorResponse: HookResponse = {
        systemMessage: 'SyncHook error: Sync error',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHookSync('SyncHook', handler);

      expect(mockedLogError).toHaveBeenCalledWith('SyncHook main', error);
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should accept and pass through onError option', async () => {
      const error = new Error('Custom sync error');
      const handler: HookHandler = vi.fn().mockRejectedValue(error);
      const customErrorResponse: HookResponse = {
        systemMessage: 'Custom sync error response',
      };
      const onError = vi.fn().mockReturnValue(customErrorResponse);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHookSync('SyncHook', handler, { onError });

      expect(onError).toHaveBeenCalledWith(error);
      expect(mockedRespond).toHaveBeenCalledWith(customErrorResponse);
    });

    it('should ignore catchUncaught if somehow passed', async () => {
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      // TypeScript won't allow this, but test runtime behavior
      await runHookSync('SyncHook', handler, {} as Parameters<typeof runHookSync>[2]);

      expect(handler).toHaveBeenCalledWith(mockInput);
      expect(mockedRespond).toHaveBeenCalledWith(response);
    });

    it('should be awaitable and complete execution', async () => {
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);
      let completed = false;

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHookSync('SyncHook', handler);
      completed = true;

      expect(completed).toBe(true);
      expect(handler).toHaveBeenCalledWith(mockInput);
    });
  });

  describe('edge cases', () => {
    it('should handle handler that throws synchronously', async () => {
      const error = new Error('Sync throw');
      const handler: HookHandler = vi.fn().mockImplementation(() => {
        throw error;
      });
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: Sync throw',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedLogError).toHaveBeenCalledWith('TestHook main', error);
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle null/undefined errors gracefully', async () => {
      const handler: HookHandler = vi.fn().mockRejectedValue(null);
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: null',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'TestHook error: null',
      });
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle object errors', async () => {
      const objectError = { code: 'ERR_TEST', message: 'Object error' };
      const handler: HookHandler = vi.fn().mockRejectedValue(objectError);
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: [object Object]',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'TestHook error: [object Object]',
      });
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle number errors', async () => {
      const numberError = 42;
      const handler: HookHandler = vi.fn().mockRejectedValue(numberError);
      const errorResponse: HookResponse = {
        systemMessage: 'TestHook error: 42',
      };

      mockedReadHookInput.mockResolvedValue(mockInput);
      mockedCreateResponse.mockReturnValue(errorResponse);

      await runHook('TestHook', handler, { catchUncaught: false });

      expect(mockedCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'TestHook error: 42',
      });
      expect(mockedRespond).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle very long hook names', async () => {
      const longName = 'A'.repeat(200);
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHook(longName, handler, { catchUncaught: false });

      expect(mockedDebug).toHaveBeenCalledWith(`${longName} hook starting`);
      expect(handler).toHaveBeenCalledWith(mockInput);
    });

    it('should handle special characters in hook names', async () => {
      const specialName = 'Test-Hook_123.v2';
      const response: HookResponse = { continue: true };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHook(specialName, handler, { catchUncaught: false });

      expect(mockedDebug).toHaveBeenCalledWith(`${specialName} hook starting`);
      expect(handler).toHaveBeenCalledWith(mockInput);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete workflow with all logging', async () => {
      const response: HookResponse = {
        continue: true,
        systemMessage: 'Workflow complete',
      };
      const handler: HookHandler = vi.fn().mockResolvedValue(response);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHook('WorkflowHook', handler, { catchUncaught: false });

      // Verify logging calls
      expect(mockedDebug).toHaveBeenNthCalledWith(1, 'WorkflowHook hook starting');
      expect(mockedDebug).toHaveBeenNthCalledWith(2, 'WorkflowHook received input', {
        hook_event_name: 'PreToolUse',
        session_id: 'test-session-123',
        tool_name: 'Bash',
      });

      // Verify handler called with correct input
      expect(handler).toHaveBeenCalledWith(mockInput);

      // Verify response sent
      expect(mockedRespond).toHaveBeenCalledWith(response);

      // Verify no errors
      expect(mockedLogError).not.toHaveBeenCalled();
    });

    it('should handle multiple sequential hook runs', async () => {
      const response1: HookResponse = { continue: true };
      const response2: HookResponse = { continue: false };
      const handler1: HookHandler = vi.fn().mockResolvedValue(response1);
      const handler2: HookHandler = vi.fn().mockResolvedValue(response2);

      mockedReadHookInput.mockResolvedValue(mockInput);

      await runHook('Hook1', handler1, { catchUncaught: false });
      await runHook('Hook2', handler2, { catchUncaught: false });

      expect(handler1).toHaveBeenCalledWith(mockInput);
      expect(handler2).toHaveBeenCalledWith(mockInput);
      expect(mockedRespond).toHaveBeenNthCalledWith(1, response1);
      expect(mockedRespond).toHaveBeenNthCalledWith(2, response2);
    });
  });
});
