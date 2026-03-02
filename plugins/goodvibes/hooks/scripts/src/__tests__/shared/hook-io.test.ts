/**
 * Tests for shared/hook-io.ts
 * Target: 100% line and branch coverage
 */

import { EventEmitter } from 'events';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  readHookInput,
  allowTool,
  blockTool,
  formatResponse,
  respond,
  createResponse,
  createPermissionResponse,
  type HookInput,
  type HookResponse,
} from '../../shared/hook-io.js';

/**
 * Mock stdin that extends EventEmitter and implements the async iterator
 * protocol required by `for await (const chunk of process.stdin)`.
 */
class MockStdin extends EventEmitter {
  setEncoding = vi.fn().mockReturnThis();

  [Symbol.asyncIterator](): AsyncIterator<Buffer> {
    const emitter = this;
    const chunks: Buffer[] = [];
    let done = false;
    let pendingResolve: ((value: IteratorResult<Buffer>) => void) | null = null;
    let pendingReject: ((err: Error) => void) | null = null;

    const cleanup = () => {
      emitter.off('data', onData);
      emitter.off('end', onEnd);
      emitter.off('error', onError);
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        r({ value: buf, done: false });
      } else {
        chunks.push(buf);
      }
    };

    const onEnd = () => {
      done = true;
      cleanup();
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        r({ value: Buffer.alloc(0), done: true });
      }
    };

    const onError = (err: Error) => {
      done = true;
      cleanup();
      if (pendingReject) {
        const r = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        r(err);
      }
    };

    emitter.on('data', onData);
    emitter.on('end', onEnd);
    emitter.on('error', onError);

    return {
      next(): Promise<IteratorResult<Buffer>> {
        if (chunks.length > 0) {
          return Promise.resolve({ value: chunks.shift()!, done: false });
        }
        if (done) {
          return Promise.resolve({ value: Buffer.alloc(0), done: true });
        }
        return new Promise<IteratorResult<Buffer>>((resolve, reject) => {
          pendingResolve = resolve;
          pendingReject = reject;
        });
      },
      return(): Promise<IteratorResult<Buffer>> {
        cleanup();
        return Promise.resolve({ value: Buffer.alloc(0), done: true });
      },
    };
  }
}

describe('hook-io', () => {
  let mockStdin: MockStdin;
  let originalStdin: typeof process.stdin;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  // NOTE: isTestEnvironment() tests were removed because:
  // 1. The function is marked with /* v8 ignore */ - it's inherently untestable in a test environment
  // 2. Modifying __vitest_worker__ (Vitest's internal state) causes "failed to access internal state" errors
  // 3. When running in Vitest, the environment variables are always set making false branch unreachable


  beforeEach(() => {
    // Create a mock stdin with async iterator support
    mockStdin = new MockStdin();

    // Store original stdin and replace with mock
    originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });

    // Mock console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Note: process.exit is mocked globally in vitest.setup.ts
  });

  afterEach(() => {
    // Restore original stdin
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  describe('readHookInput', () => {
    it('should read and parse valid hook input from stdin', async () => {
      const validInput: HookInput = {
        session_id: 'test-session-123',
        transcript_path: '/path/to/transcript',
        cwd: '/test/cwd',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      };

      const promise = readHookInput();

      // Simulate stdin data and end
      mockStdin.emit('data', JSON.stringify(validInput));
      mockStdin.emit('end');

      const result = await promise;
      expect(result).toEqual(validInput);
    });

    it('should handle chunked input data', async () => {
      const validInput: HookInput = {
        session_id: 'chunked-session',
        transcript_path: '/path/to/transcript',
        cwd: '/test/cwd',
        permission_mode: 'default',
        hook_event_name: 'PostToolUse',
      };

      const jsonStr = JSON.stringify(validInput);
      const promise = readHookInput();

      // Send data in chunks
      mockStdin.emit('data', jsonStr.substring(0, 10));
      mockStdin.emit('data', jsonStr.substring(10, 30));
      mockStdin.emit('data', jsonStr.substring(30));
      mockStdin.emit('end');

      const result = await promise;
      expect(result).toEqual(validInput);
    });

    it('should reject on invalid JSON', async () => {
      const promise = readHookInput();

      mockStdin.emit('data', 'not valid json {{{');
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow(SyntaxError);
    });

    it('should reject when missing required session_id field', async () => {
      const invalidInput = {
        // missing session_id
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
      };

      const promise = readHookInput();

      mockStdin.emit('data', JSON.stringify(invalidInput));
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when missing required cwd field', async () => {
      const invalidInput = {
        session_id: 'test',
        transcript_path: '/path',
        // missing cwd
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
      };

      const promise = readHookInput();

      mockStdin.emit('data', JSON.stringify(invalidInput));
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when missing required hook_event_name field', async () => {
      const invalidInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        // missing hook_event_name
      };

      const promise = readHookInput();

      mockStdin.emit('data', JSON.stringify(invalidInput));
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input is not an object (null)', async () => {
      const promise = readHookInput();

      mockStdin.emit('data', 'null');
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input is not an object (array)', async () => {
      const promise = readHookInput();

      mockStdin.emit('data', '[1, 2, 3]');
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input is not an object (string)', async () => {
      const promise = readHookInput();

      mockStdin.emit('data', '"just a string"');
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input is not an object (number)', async () => {
      const promise = readHookInput();

      mockStdin.emit('data', '42');
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when session_id is not a string', async () => {
      const invalidInput = {
        session_id: 123, // not a string
        cwd: '/test',
        hook_event_name: 'PreToolUse',
      };

      const promise = readHookInput();

      mockStdin.emit('data', JSON.stringify(invalidInput));
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when cwd is not a string', async () => {
      const invalidInput = {
        session_id: 'test',
        cwd: { path: '/test' }, // not a string
        hook_event_name: 'PreToolUse',
      };

      const promise = readHookInput();

      mockStdin.emit('data', JSON.stringify(invalidInput));
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when hook_event_name is not a string', async () => {
      const invalidInput = {
        session_id: 'test',
        cwd: '/test',
        hook_event_name: ['PreToolUse'], // not a string
      };

      const promise = readHookInput();

      mockStdin.emit('data', JSON.stringify(invalidInput));
      mockStdin.emit('end');

      await expect(promise).rejects.toThrow('Invalid hook input structure');
    });

    it('should forward stdin errors', async () => {
      const promise = readHookInput();

      const testError = new Error('stdin read error');
      mockStdin.emit('error', testError);

      await expect(promise).rejects.toThrow('stdin read error');
    });

    it.skip('should timeout when no data is received', async () => {
      // NOTE: readHookInput was refactored to use `for await...of` which has no
      // built-in timeout. This test is skipped as the timeout behavior was removed.
    });

    it('should not timeout if data is received before timeout', async () => {
      const validInput: HookInput = {
        session_id: 'test',
        transcript_path: '/path',
        cwd: '/test',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
      };

      const promise = readHookInput();

      // Send data immediately
      mockStdin.emit('data', JSON.stringify(validInput));

      // Wait a bit but less than timeout
      await new Promise((resolve) => setTimeout(resolve, 30));

      // End the stream
      mockStdin.emit('end');

      const result = await promise;
      expect(result).toEqual(validInput);
    });
  });

  describe('allowTool', () => {
    it('should create an allow response without additional context', () => {
      const response = allowTool('PreToolUse');

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: undefined,
          updatedInput: undefined,
        },
      });
    });

    it('should create an allow response with additional context', () => {
      const response = allowTool('PreToolUse', 'Remember to run tests');

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: 'Remember to run tests',
          updatedInput: undefined,
        },
      });
    });

    it('should handle different hook event names', () => {
      const response = allowTool('PermissionRequest');

      expect(response.hookSpecificOutput?.hookEventName).toBe(
        'PermissionRequest'
      );
    });

    it('should handle empty string additional context', () => {
      const response = allowTool('PreToolUse', '');

      expect(response.hookSpecificOutput?.additionalContext).toBe('');
    });
  });

  describe('blockTool', () => {
    it('should create a block response with reason', () => {
      const response = blockTool('PreToolUse', 'Operation not permitted');

      expect(response).toEqual({
        continue: false,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Operation not permitted',
        },
      });
    });

    it('should handle different hook event names', () => {
      const response = blockTool('PermissionRequest', 'Access denied');

      expect(response.hookSpecificOutput?.hookEventName).toBe(
        'PermissionRequest'
      );
    });

    it('should handle empty reason string', () => {
      const response = blockTool('PreToolUse', '');

      expect(response.hookSpecificOutput?.permissionDecisionReason).toBe('');
    });

    it('should handle reason with special characters', () => {
      const response = blockTool(
        'PreToolUse',
        'Error: "quotes" and \'apostrophes\''
      );

      expect(response.hookSpecificOutput?.permissionDecisionReason).toBe(
        'Error: "quotes" and \'apostrophes\''
      );
    });
  });

  describe('formatResponse', () => {
    it('should format a simple response to JSON', () => {
      const response: HookResponse = { continue: true };

      const result = formatResponse(response);

      expect(result).toBe('{"continue":true}');
    });

    it('should format a response with all fields', () => {
      const response: HookResponse = {
        continue: true,
        stopReason: 'completed',
        suppressOutput: false,
        systemMessage: 'Test message',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: 'Approved',
          updatedInput: { key: 'value' },
        },
      };

      const result = formatResponse(response);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(response);
    });

    it('should format an allow response', () => {
      const response = allowTool('PreToolUse', 'Good to go');

      const result = formatResponse(response);
      const parsed = JSON.parse(result);

      expect(parsed.continue).toBe(true);
      expect(parsed.hookSpecificOutput?.additionalContext).toBe('Good to go');
    });

    it('should format a block response', () => {
      const response = blockTool('PreToolUse', 'Blocked');

      const result = formatResponse(response);
      const parsed = JSON.parse(result);

      expect(parsed.continue).toBe(false);
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    });
  });

  describe('respond', () => {
    it('should output JSON and exit with code 0 for non-blocking response', () => {
      const response = allowTool('PreToolUse');

      respond(response);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(response));
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should output JSON and exit with code 0 for blocking response', () => {
      const response = blockTool('PreToolUse', 'Blocked');

      respond(response, true);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(response));
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should default to non-blocking (exit 0) when block is not specified', () => {
      const response: HookResponse = { continue: true };

      respond(response);

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle false block parameter explicitly', () => {
      const response: HookResponse = { continue: true };

      respond(response, false);

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('createResponse', () => {
    it('should create a basic continue response with no options', () => {
      const response = createResponse();

      expect(response).toEqual({
        continue: true,
      });
    });

    it('should create a response with system message', () => {
      const response = createResponse({ systemMessage: 'Plugin initialized' });

      expect(response).toEqual({
        continue: true,
        systemMessage: 'Plugin initialized',
      });
    });

    it('should create a response with additional context', () => {
      const response = createResponse({
        additionalContext: 'Project context here',
      });

      expect(response).toEqual({
        continue: true,
        additionalContext: 'Project context here',
      });
    });

    it('should create a response with both system message and additional context', () => {
      const response = createResponse({
        systemMessage: 'GoodVibes ready',
        additionalContext: 'Project context string',
      });

      expect(response).toEqual({
        continue: true,
        systemMessage: 'GoodVibes ready',
        additionalContext: 'Project context string',
      });
    });

    it('should handle empty string system message', () => {
      const response = createResponse({ systemMessage: '' });

      expect(response).toEqual({
        continue: true,
        systemMessage: '',
      });
    });

    it('should handle empty string additional context', () => {
      const response = createResponse({ additionalContext: '' });

      expect(response).toEqual({
        continue: true,
        additionalContext: '',
      });
    });

    it('should not include undefined systemMessage in response', () => {
      const response = createResponse({ systemMessage: undefined });

      expect(response).toEqual({
        continue: true,
      });
      expect('systemMessage' in response).toBe(false);
    });

    it('should not include undefined additionalContext in response', () => {
      const response = createResponse({ additionalContext: undefined });

      expect(response).toEqual({
        continue: true,
      });
      expect('additionalContext' in response).toBe(false);
    });

    it('should handle empty options object', () => {
      const response = createResponse({});

      expect(response).toEqual({
        continue: true,
      });
    });
  });

  describe('createPermissionResponse', () => {
    it('should create an allow permission response by default', () => {
      const response = createPermissionResponse();

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });
    });

    it('should create an allow permission response explicitly', () => {
      const response = createPermissionResponse('allow');

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });
    });

    it('should create a deny permission response', () => {
      const response = createPermissionResponse('deny');

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'deny',
        },
      });
    });

    it('should create an ask permission response', () => {
      const response = createPermissionResponse('ask');

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });
    });

    it('should create a deny permission response with reason', () => {
      const response = createPermissionResponse('deny', 'Tool not permitted');

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Tool not permitted',
        },
      });
    });

    it('should create an allow permission response with reason', () => {
      const response = createPermissionResponse(
        'allow',
        'Auto-approved by policy'
      );

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
          permissionDecisionReason: 'Auto-approved by policy',
        },
      });
    });

    it('should create an ask permission response with reason', () => {
      const response = createPermissionResponse(
        'ask',
        'User confirmation required'
      );

      expect(response).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
          permissionDecisionReason: 'User confirmation required',
        },
      });
    });

    it('should not include reason when undefined', () => {
      const response = createPermissionResponse('deny', undefined);

      expect(
        response.hookSpecificOutput?.permissionDecisionReason
      ).toBeUndefined();
    });

    it('should not include reason when empty string (falsy)', () => {
      const response = createPermissionResponse('deny', '');

      // Empty string is falsy, so reason should not be included
      expect(
        response.hookSpecificOutput?.permissionDecisionReason
      ).toBeUndefined();
    });

    it('should handle reason with special characters', () => {
      const response = createPermissionResponse(
        'deny',
        'Error: "quotes" and newline\n'
      );

      expect(response.hookSpecificOutput?.permissionDecisionReason).toBe(
        'Error: "quotes" and newline\n'
      );
    });
  });
});
