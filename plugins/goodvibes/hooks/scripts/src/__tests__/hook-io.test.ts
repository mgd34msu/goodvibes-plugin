/**
 * Comprehensive unit tests for hook-io.ts
 *
 * Tests cover:
 * - readHookInput: stdin reading, parsing, validation, timeout
 * - allowTool: response creation with/without system message
 * - blockTool: response creation with reason
 * - respond: JSON output and process.exit calls
 * - createResponse: extended response creation
 * - createPermissionResponse: permission decisions
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Readable } from 'stream';

// Import types and functions to test
import type {
  HookInput,
  HookResponse,
  HookSpecificOutput,
  CreateResponseOptions,
  ExtendedHookResponse,
  PermissionDecision,
} from '../shared/hook-io.js';

// Create a mock stdin that extends EventEmitter
class MockStdin extends EventEmitter {
  encoding: BufferEncoding | null = null;

  setEncoding(encoding: BufferEncoding): this {
    this.encoding = encoding;
    return this;
  }

  // Simulate data coming in
  simulateData(data: string): void {
    this.emit('data', data);
  }

  // Simulate end of stream
  simulateEnd(): void {
    this.emit('end');
  }

  // Simulate error
  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

describe('hook-io', () => {
  let mockStdin: MockStdin;
  let originalStdin: Readable;
  let originalProcessExit: typeof process.exit;
  let originalConsoleLog: typeof console.log;
  let capturedOutput: string | null;
  let capturedExitCode: number | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Save originals
    originalStdin = process.stdin;
    originalProcessExit = process.exit;
    originalConsoleLog = console.log;

    // Reset captured values
    capturedOutput = null;
    capturedExitCode = null;

    // Create new mock stdin
    mockStdin = new MockStdin();

    // Replace process.stdin
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });

    // Mock console.log to capture output
    console.log = vi.fn((msg: string) => {
      capturedOutput = msg;
    });

    // Mock process.exit to capture exit code
    process.exit = vi.fn((code?: string | number | null) => {
      capturedExitCode = typeof code === 'number' ? code : 0;
      throw new Error('process.exit called');
    }) as never;
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
  });

  describe('readHookInput', () => {
    it('should successfully read and parse valid hook input from stdin', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const validInput: HookInput = {
        session_id: 'test-session-123',
        transcript_path: '/path/to/transcript.json',
        cwd: '/path/to/project',
        permission_mode: 'ask',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      };

      // Start the async read
      const readPromise = readHookInput();

      // Simulate stdin data after a brief delay
      setTimeout(() => {
        mockStdin.simulateData(JSON.stringify(validInput));
        mockStdin.simulateEnd();
      }, 10);

      const result = await readPromise;

      expect(result).toEqual(validInput);
      expect(mockStdin.encoding).toBe('utf-8');
    });

    it('should handle input without optional fields', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const minimalInput = {
        session_id: 'session-456',
        transcript_path: '/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'SessionStart',
      };

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData(JSON.stringify(minimalInput));
        mockStdin.simulateEnd();
      }, 10);

      const result = await readPromise;

      expect(result).toEqual(minimalInput);
      expect(result.tool_name).toBeUndefined();
      expect(result.tool_input).toBeUndefined();
    });

    it('should handle data coming in multiple chunks', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const validInput: HookInput = {
        session_id: 'test-session-789',
        transcript_path: '/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PostToolUse',
      };

      const jsonString = JSON.stringify(validInput);
      const chunk1 = jsonString.slice(0, jsonString.length / 2);
      const chunk2 = jsonString.slice(jsonString.length / 2);

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData(chunk1);
        mockStdin.simulateData(chunk2);
        mockStdin.simulateEnd();
      }, 10);

      const result = await readPromise;

      expect(result).toEqual(validInput);
    });

    it('should reject when input is not valid JSON', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData('not valid json {{{');
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow(
        'Failed to parse hook input from stdin'
      );
    });

    it('should reject when input structure is invalid - missing session_id', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const invalidInput = {
        transcript_path: '/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        // missing session_id
      };

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData(JSON.stringify(invalidInput));
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input structure is invalid - missing cwd', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const invalidInput = {
        session_id: 'test-session',
        transcript_path: '/transcript.json',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        // missing cwd
      };

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData(JSON.stringify(invalidInput));
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input structure is invalid - missing hook_event_name', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const invalidInput = {
        session_id: 'test-session',
        transcript_path: '/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        // missing hook_event_name
      };

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData(JSON.stringify(invalidInput));
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input is null', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData('null');
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input is not an object', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData('"just a string"');
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject when input fields have wrong types', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const invalidInput = {
        session_id: 123, // should be string
        transcript_path: '/transcript.json',
        cwd: '/project',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
      };

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateData(JSON.stringify(invalidInput));
        mockStdin.simulateEnd();
      }, 10);

      await expect(readPromise).rejects.toThrow('Invalid hook input structure');
    });

    it('should reject on stdin error', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      const readPromise = readHookInput();

      setTimeout(() => {
        mockStdin.simulateError(new Error('stdin error'));
      }, 10);

      await expect(readPromise).rejects.toThrow('stdin error');
    });

    it('should reject when no stdin is provided (timeout)', async () => {
      const { readHookInput } = await import('../shared/hook-io.js');

      // Don't send any data - let it timeout
      const readPromise = readHookInput();

      await expect(readPromise).rejects.toThrow(
        'Hook input timeout: no data received within configured timeout'
      );
    }, 200); // Give enough time for timeout
  });

  describe('allowTool', () => {
    it('should create response allowing tool without system message', async () => {
      const { allowTool } = await import('../shared/hook-io.js');

      const result = allowTool('PreToolUse');

      expect(result).toEqual({
        continue: true,
        systemMessage: undefined,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
    });

    it('should create response allowing tool with system message', async () => {
      const { allowTool } = await import('../shared/hook-io.js');

      const result = allowTool(
        'PreToolUse',
        'Remember to run tests after this change'
      );

      expect(result).toEqual({
        continue: true,
        systemMessage: 'Remember to run tests after this change',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
    });

    it('should work with different hook event names', async () => {
      const { allowTool } = await import('../shared/hook-io.js');

      const result = allowTool('PermissionRequest', 'Approved');

      expect(result.hookSpecificOutput?.hookEventName).toBe(
        'PermissionRequest'
      );
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
    });
  });

  describe('blockTool', () => {
    it('should create response blocking tool with reason', async () => {
      const { blockTool } = await import('../shared/hook-io.js');

      const result = blockTool(
        'PreToolUse',
        'rm -rf commands are not permitted'
      );

      expect(result).toEqual({
        continue: false,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'rm -rf commands are not permitted',
        },
      });
    });

    it('should work with different hook event names', async () => {
      const { blockTool } = await import('../shared/hook-io.js');

      const result = blockTool(
        'PermissionRequest',
        'Access to .env files is restricted'
      );

      expect(result.continue).toBe(false);
      expect(result.hookSpecificOutput?.hookEventName).toBe(
        'PermissionRequest'
      );
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(result.hookSpecificOutput?.permissionDecisionReason).toBe(
        'Access to .env files is restricted'
      );
    });
  });

  describe('formatResponse', () => {
    it('should format minimal response as JSON', async () => {
      const { formatResponse } = await import('../shared/hook-io.js');

      const response: HookResponse = { continue: true };
      const result = formatResponse(response);

      expect(result).toBe('{"continue":true}');
      expect(typeof result).toBe('string');
    });

    it('should format allowTool response as JSON', async () => {
      const { formatResponse, allowTool } =
        await import('../shared/hook-io.js');

      const response = allowTool('PreToolUse', 'Test message');
      const result = formatResponse(response);

      expect(result).toBe(JSON.stringify(response));
      expect(JSON.parse(result)).toEqual(response);
    });

    it('should format blockTool response as JSON', async () => {
      const { formatResponse, blockTool } =
        await import('../shared/hook-io.js');

      const response = blockTool('PreToolUse', 'Blocked for security');
      const result = formatResponse(response);

      expect(result).toBe(JSON.stringify(response));
      expect(JSON.parse(result)).toEqual(response);
    });

    it('should format response with all fields', async () => {
      const { formatResponse } = await import('../shared/hook-io.js');

      const complexResponse: HookResponse = {
        continue: true,
        stopReason: 'test-stop',
        suppressOutput: true,
        systemMessage: 'Test system message',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: 'All good',
          updatedInput: { modified: true },
        },
      };

      const result = formatResponse(complexResponse);

      expect(result).toBe(JSON.stringify(complexResponse));
      expect(JSON.parse(result)).toEqual(complexResponse);
    });

    it('should be a pure function (no side effects)', async () => {
      const { formatResponse } = await import('../shared/hook-io.js');

      const response: HookResponse = { continue: true, systemMessage: 'Test' };

      // Call multiple times should produce same result
      const result1 = formatResponse(response);
      const result2 = formatResponse(response);

      expect(result1).toBe(result2);
      expect(result1).toBe('{"continue":true,"systemMessage":"Test"}');

      // Should not have modified capturedOutput or capturedExitCode
      expect(capturedOutput).toBeNull();
      expect(capturedExitCode).toBeNull();
    });

    it('should handle createResponse output', async () => {
      const { formatResponse, createResponse } =
        await import('../shared/hook-io.js');

      const response = createResponse({
        systemMessage: 'GoodVibes ready',
        additionalContext: 'Project context',
      });

      const result = formatResponse(response);

      expect(result).toBe(JSON.stringify(response));
      const parsed = JSON.parse(result);
      expect(parsed.continue).toBe(true);
      expect(parsed.systemMessage).toBe('GoodVibes ready');
      expect(parsed.additionalContext).toBe('Project context');
    });

    it('should handle createPermissionResponse output', async () => {
      const { formatResponse, createPermissionResponse } =
        await import('../shared/hook-io.js');

      const response = createPermissionResponse('deny', 'Not allowed');
      const result = formatResponse(response);

      expect(result).toBe(JSON.stringify(response));
      const parsed = JSON.parse(result);
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput?.permissionDecisionReason).toBe(
        'Not allowed'
      );
    });

    it('should handle response with nested objects', async () => {
      const { formatResponse } = await import('../shared/hook-io.js');

      const response: HookResponse = {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            nested: {
              deeply: {
                value: 42,
                array: [1, 2, 3],
              },
            },
          },
        },
      };

      const result = formatResponse(response);
      const parsed = JSON.parse(result);

      expect(
        parsed.hookSpecificOutput?.updatedInput?.nested?.deeply?.value
      ).toBe(42);
      expect(
        parsed.hookSpecificOutput?.updatedInput?.nested?.deeply?.array
      ).toEqual([1, 2, 3]);
    });
  });

  describe('respond', () => {
    it('should output JSON and exit with code 0 when not blocking', async () => {
      const { respond, allowTool } = await import('../shared/hook-io.js');

      const response = allowTool('PreToolUse', 'Test message');

      expect(() => respond(response)).toThrow('process.exit called');
      expect(capturedOutput).toBe(JSON.stringify(response));
      expect(capturedExitCode).toBe(0);
    });

    it('should output JSON and exit with code 2 when blocking', async () => {
      const { respond, blockTool } = await import('../shared/hook-io.js');

      const response = blockTool('PreToolUse', 'Blocked for security');

      expect(() => respond(response, true)).toThrow('process.exit called');
      expect(capturedOutput).toBe(JSON.stringify(response));
      expect(capturedExitCode).toBe(2);
    });

    it('should handle response with all fields', async () => {
      const { respond } = await import('../shared/hook-io.js');

      const complexResponse: HookResponse = {
        continue: true,
        stopReason: 'test-stop',
        suppressOutput: true,
        systemMessage: 'Test system message',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: 'All good',
          updatedInput: { modified: true },
        },
      };

      expect(() => respond(complexResponse)).toThrow('process.exit called');
      expect(capturedOutput).toBe(JSON.stringify(complexResponse));
      expect(capturedExitCode).toBe(0);
    });

    it('should default to block=false when parameter not provided', async () => {
      const { respond } = await import('../shared/hook-io.js');

      const response = { continue: true };

      expect(() => respond(response)).toThrow('process.exit called');
      expect(capturedExitCode).toBe(0);
    });

    it('should explicitly handle block=false', async () => {
      const { respond } = await import('../shared/hook-io.js');

      const response = { continue: true };

      expect(() => respond(response, false)).toThrow('process.exit called');
      expect(capturedExitCode).toBe(0);
    });

    it('should use formatResponse internally for formatting', async () => {
      const { respond, formatResponse } = await import('../shared/hook-io.js');

      const response = {
        continue: true,
        systemMessage: 'Using formatResponse internally',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow' as const,
        },
      };

      const expectedOutput = formatResponse(response);

      expect(() => respond(response)).toThrow('process.exit called');
      expect(capturedOutput).toBe(expectedOutput);
    });
  });

  describe('createResponse', () => {
    it('should create minimal response with no options', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse();

      expect(result).toEqual({
        continue: true,
      });
    });

    it('should create response with system message', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse({
        systemMessage: 'Plugin initialized',
      });

      expect(result).toEqual({
        continue: true,
        systemMessage: 'Plugin initialized',
      });
    });

    it('should create response with additional context', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse({
        additionalContext: 'Project context data',
      });

      expect(result).toEqual({
        continue: true,
        additionalContext: 'Project context data',
      });
    });

    it('should create response with both system message and additional context', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse({
        systemMessage: 'GoodVibes ready',
        additionalContext: 'Project: TypeScript, React',
      });

      expect(result).toEqual({
        continue: true,
        systemMessage: 'GoodVibes ready',
        additionalContext: 'Project: TypeScript, React',
      });
    });

    it('should handle empty string system message', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse({
        systemMessage: '',
      });

      expect(result.systemMessage).toBe('');
    });

    it('should handle empty string additional context', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse({
        additionalContext: '',
      });

      expect(result.additionalContext).toBe('');
    });

    it('should not include undefined fields in response', async () => {
      const { createResponse } = await import('../shared/hook-io.js');

      const result = createResponse({});

      expect('systemMessage' in result).toBe(false);
      expect('additionalContext' in result).toBe(false);
      expect(result.continue).toBe(true);
    });
  });

  describe('createPermissionResponse', () => {
    it('should create allow response with default decision', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse();

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });
    });

    it('should create allow response explicitly', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('allow');

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
        },
      });
    });

    it('should create deny response', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('deny');

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'deny',
        },
      });
    });

    it('should create ask response', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('ask');

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
        },
      });
    });

    it('should include reason when provided with allow', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('allow', 'Pre-approved tool');

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'allow',
          permissionDecisionReason: 'Pre-approved tool',
        },
      });
    });

    it('should include reason when provided with deny', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse(
        'deny',
        'Tool not permitted in this context'
      );

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Tool not permitted in this context',
        },
      });
    });

    it('should include reason when provided with ask', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('ask', 'User approval needed');

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: 'ask',
          permissionDecisionReason: 'User approval needed',
        },
      });
    });

    it('should not include empty reason string (treated as falsy)', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('deny', '');

      // Empty string is falsy, so reason won't be added
      expect(
        'permissionDecisionReason' in (result.hookSpecificOutput || {})
      ).toBe(false);
    });

    it('should not include reason when undefined', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('allow', undefined);

      expect(
        'permissionDecisionReason' in (result.hookSpecificOutput || {})
      ).toBe(false);
    });
  });
});
