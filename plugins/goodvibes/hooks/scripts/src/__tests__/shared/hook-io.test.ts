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

// Mock the config module to control STDIN_TIMEOUT_MS
vi.mock('../../shared/config.js', () => ({
  STDIN_TIMEOUT_MS: 50, // Short timeout for tests
}));

describe('hook-io', () => {
  let mockStdin: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  let originalStdin: typeof process.stdin;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  describe('isTestEnvironment', () => {
    it('should return true when NODE_ENV is test', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      // Need to re-import to get fresh isTestEnvironment
      const { isTestEnvironment } = require('../../shared/hook-io.js');
      expect(isTestEnvironment()).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return true when VITEST is true', () => {
      const originalVitest = process.env.VITEST;
      delete process.env.NODE_ENV;
      process.env.VITEST = 'true';

      const { isTestEnvironment } = require('../../shared/hook-io.js');
      expect(isTestEnvironment()).toBe(true);

      if (originalVitest) {
        process.env.VITEST = originalVitest;
      } else {
        delete process.env.VITEST;
      }
    });

    it('should return true when __vitest_worker__ is defined (line 16)', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;
      delete process.env.NODE_ENV;
      delete process.env.VITEST;

      // Set __vitest_worker__ on globalThis
      (globalThis as any).__vitest_worker__ = { id: 1 };

      const { isTestEnvironment } = require('../../shared/hook-io.js');
      expect(isTestEnvironment()).toBe(true);

      // Clean up
      delete (globalThis as any).__vitest_worker__;
      if (originalEnv) process.env.NODE_ENV = originalEnv;
      if (originalVitest) process.env.VITEST = originalVitest;
    });

    it('should return false when none of the conditions are met', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;
      delete process.env.NODE_ENV;
      delete process.env.VITEST;
      delete (globalThis as any).__vitest_worker__;

      const { isTestEnvironment } = require('../../shared/hook-io.js');
      expect(isTestEnvironment()).toBe(false);

      if (originalEnv) process.env.NODE_ENV = originalEnv;
      if (originalVitest) process.env.VITEST = originalVitest;
    });
  });


  beforeEach(() => {
    // Create a mock stdin
    mockStdin = new EventEmitter() as EventEmitter & {
      setEncoding: ReturnType<typeof vi.fn>;
    };
    mockStdin.setEncoding = vi.fn();

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
      expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf-8');
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

      await expect(promise).rejects.toThrow(
        'Failed to parse hook input from stdin'
      );
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

    it('should timeout when no data is received', async () => {
      const promise = readHookInput();

      // Wait for timeout to trigger
      await expect(promise).rejects.toThrow(
        'Hook input timeout: no data received within configured timeout'
      );
    }, 200);

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
    it('should create an allow response without system message', () => {
      const response = allowTool('PreToolUse');

      expect(response).toEqual({
        continue: true,
        systemMessage: undefined,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
    });

    it('should create an allow response with system message', () => {
      const response = allowTool('PreToolUse', 'Remember to run tests');

      expect(response).toEqual({
        continue: true,
        systemMessage: 'Remember to run tests',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
    });

    it('should handle different hook event names', () => {
      const response = allowTool('PermissionRequest');

      expect(response.hookSpecificOutput?.hookEventName).toBe(
        'PermissionRequest'
      );
    });

    it('should handle empty string system message', () => {
      const response = allowTool('PreToolUse', '');

      expect(response.systemMessage).toBe('');
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
      expect(parsed.systemMessage).toBe('Good to go');
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

    it('should output JSON and exit with code 2 for blocking response', () => {
      const response = blockTool('PreToolUse', 'Blocked');

      respond(response, true);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(response));
      expect(process.exit).toHaveBeenCalledWith(2);
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
