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

import { EventEmitter } from 'events';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import types and functions to test
import type {
  HookInput,
  HookResponse,
} from '../shared/hook-io.js';
import type { Readable } from 'stream';

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

  // Async iterator support for `for await (const chunk of stdin)`
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

      await expect(readPromise).rejects.toThrow(SyntaxError);
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

    it.skip('should reject when no stdin is provided (timeout)', async () => {
      // NOTE: readHookInput was refactored to use `for await...of` which has no
      // built-in timeout. This test is skipped as the timeout behavior was removed.
    });
  });

  describe('allowTool', () => {
    it('should create response allowing tool without additional context', async () => {
      const { allowTool } = await import('../shared/hook-io.js');

      const result = allowTool('PreToolUse');

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: undefined,
          updatedInput: undefined,
        },
      });
    });

    it('should create response allowing tool with additional context', async () => {
      const { allowTool } = await import('../shared/hook-io.js');

      const result = allowTool(
        'PreToolUse',
        'Remember to run tests after this change'
      );

      expect(result).toEqual({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: 'Remember to run tests after this change',
          updatedInput: undefined,
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

    it('should output JSON and exit with code 0 when blocking', async () => {
      const { respond, blockTool } = await import('../shared/hook-io.js');

      const response = blockTool('PreToolUse', 'Blocked for security');

      expect(() => respond(response, true)).toThrow('process.exit called');
      expect(capturedOutput).toBe(JSON.stringify(response));
      expect(capturedExitCode).toBe(0);
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
        'permissionDecisionReason' in (result.hookSpecificOutput ?? {})
      ).toBe(false);
    });

    it('should not include reason when undefined', async () => {
      const { createPermissionResponse } = await import('../shared/hook-io.js');

      const result = createPermissionResponse('allow', undefined);

      expect(
        'permissionDecisionReason' in (result.hookSpecificOutput ?? {})
      ).toBe(false);
    });
  });
});
