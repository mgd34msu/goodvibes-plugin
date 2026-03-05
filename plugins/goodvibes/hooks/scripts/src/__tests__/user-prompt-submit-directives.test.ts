/**
 * Unit tests for user-prompt-submit-directives hook
 *
 * Tests cover:
 * - Fire-and-forget hook_event IPC path for regular human prompts
 * - is_subagent guard prevents IPC emission
 * - Empty prompts do not emit IPC
 * - Tick commands hit the tick path, not the hook_event path
 * - Fire-and-forget does not block respond() (process exits cleanly)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Store original process.exit
const originalProcessExit = process.exit;

/**
 * Build a mock process.stdin that emits the given JSON object as stdin data,
 * then emits 'end'.
 */
function buildMockStdin(payload: unknown) {
  const emitter = new EventEmitter() as NodeJS.ReadableStream & {
    resume: () => void;
    destroy: () => void;
    readable: boolean;
  };
  (emitter as { readable: boolean }).readable = true;
  emitter.resume = () => {
    // Defer to allow event listeners to be attached before data fires
    setImmediate(() => {
      const chunk = Buffer.from(JSON.stringify(payload));
      emitter.emit('data', chunk);
      emitter.emit('end');
    });
  };
  emitter.destroy = () => {};
  return emitter;
}

function filterHookEvents(sent: Array<{ path: string; data: string }>) {
  return sent.filter((m) => {
    try {
      return JSON.parse(m.data.trim()).type === 'hook_event';
    } catch { return false; }
  });
}

describe('user-prompt-submit-directives hook — fire-and-forget path', () => {
  let mockProcessExit: ReturnType<typeof vi.fn>;
  let mockConsoleLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockProcessExit = vi.fn();
    mockConsoleLog = vi.fn();
    process.exit = mockProcessExit as never;
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.resetModules();
  });

  /**
   * Helper: mock node:fs, node:net, queue-auditor, and stdin, then import the .mjs hook.
   * Returns the list of IPC messages sent via net.createConnection.
   */
  async function runHook(options: {
    stdinPayload: unknown;
    socketExists?: boolean;
    socketPath?: string;
  }) {
    const socketExists = options.socketExists ?? true;
    const socketPath = options.socketPath ?? '/tmp/test.sock';
    const localSentMessages: Array<{ path: string; data: string }> = [];

    // Mock node:fs — control existsSync for the socket path
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        existsSync: (p: string) => {
          // Return true for our fake socket path
          if (p === socketPath) return socketExists;
          // Return false for state dir socket discovery to avoid real FS interactions
          if (typeof p === 'string' && p.includes('.goodvibes')) return false;
          return false;
        },
      };
    });

    // Mock node:net — capture messages sent without opening a real socket.
    // After the write, we emit a close event so sendMessage resolves quickly
    // (rather than waiting for the 500ms timeout). This keeps tests fast.
    vi.doMock('node:net', () => {
      const makeSocket = () => {
        const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

        const emit = (event: string, ...args: unknown[]) => {
          (listeners[event] || []).forEach((cb) => cb(...args));
        };

        const mockSocket = {
          once: function (event: string, cb: (...args: unknown[]) => void) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
            if (event === 'connect') {
              // Simulate immediate connection
              setImmediate(() => emit('connect'));
            }
            return mockSocket;
          },
          on: function (event: string, cb: (...args: unknown[]) => void) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
            return mockSocket;
          },
          write: function (data: string) {
            localSentMessages.push({ path: socketPath, data });
            // Resolve sendMessage quickly by triggering close
            setImmediate(() => emit('close'));
          },
          destroy: vi.fn(),
        };
        return mockSocket;
      };

      return {
        createConnection: (_opts: { path: string }) => makeSocket(),
      };
    });

    // Mock queue-auditor.mjs — not relevant for fast path, just prevent real FS calls
    vi.doMock('../queue-auditor.mjs', () => ({
      markDelivered: vi.fn(),
      audit: vi.fn(),
      getTranscriptPath: vi.fn().mockReturnValue('/tmp/fake-transcript'),
    }));

    // Set GOODVIBES_RUNTIME_SOCKET env var so socket discovery returns our fake path
    process.env['GOODVIBES_RUNTIME_SOCKET'] = socketPath;

    // Swap process.stdin for our mock
    const mockStdin = buildMockStdin(options.stdinPayload);
    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true, configurable: true });

    // Mock console.log to capture respond() output
    const originalConsoleLog = console.log;
    console.log = mockConsoleLog;

    try {
      // Dynamic import triggers the IIFE
      await import('../user-prompt-submit-directives.mjs');
      // Allow async operations (setImmediate, setTimeout) to settle
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true });
      console.log = originalConsoleLog;
      delete process.env['GOODVIBES_RUNTIME_SOCKET'];
    }

    return localSentMessages;
  }

  describe('hook_event emission for regular human prompts', () => {
    it('emits hook_event IPC message when socket is available and prompt is non-empty', async () => {
      const sent = await runHook({
        stdinPayload: {
          prompt: 'Hello, how are you?',
          session_id: 'sess-123',
          cwd: '/test/project',
          is_subagent: false,
        },
        socketExists: true,
      });

      // At least one message should have been sent
      expect(sent.length).toBeGreaterThan(0);

      // The sent message should be a hook_event with type 'hook_event'
      const parsed = JSON.parse(sent[0].data.trim());
      expect(parsed.type).toBe('hook_event');
      expect(parsed.hook_name).toBe('user_prompt_submit');
      expect(parsed.hook_input.prompt).toBe('Hello, how are you?');
      expect(parsed.hook_input.session_id).toBe('sess-123');
    });

    it('calls respond() after fire-and-forget (process exits cleanly)', async () => {
      await runHook({
        stdinPayload: {
          prompt: 'Do something',
          session_id: 'sess-456',
          cwd: '/test/project',
          is_subagent: false,
        },
        socketExists: true,
      });

      // respond() calls console.log(JSON.stringify(response)) then process.exit(0)
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('is_subagent guard', () => {
    it('does NOT emit hook_event when is_subagent is true', async () => {
      const sent = await runHook({
        stdinPayload: {
          prompt: 'Hello from subagent',
          session_id: 'sess-sub',
          cwd: '/test/project',
          is_subagent: true,
        },
        socketExists: true,
      });

      // No hook_event messages should have been sent
      const hookEvents = filterHookEvents(sent);
      expect(hookEvents.length).toBe(0);

      // But respond() should still be called so the hook completes cleanly
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('empty prompt guard', () => {
    it('does NOT emit hook_event when prompt is empty', async () => {
      const sent = await runHook({
        stdinPayload: {
          prompt: '',
          session_id: 'sess-empty',
          cwd: '/test/project',
          is_subagent: false,
        },
        socketExists: true,
      });

      const hookEvents = filterHookEvents(sent);
      expect(hookEvents.length).toBe(0);

      // Hook should still exit cleanly
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('does NOT emit hook_event when prompt is whitespace-only', async () => {
      const sent = await runHook({
        stdinPayload: {
          prompt: '   \t\n',
          session_id: 'sess-ws',
          cwd: '/test/project',
          is_subagent: false,
        },
        socketExists: true,
      });

      const hookEvents = filterHookEvents(sent);
      expect(hookEvents.length).toBe(0);
    });
  });

  describe('tick command guard', () => {
    it('does NOT emit hook_event for the tick command (takes tick path instead)', async () => {
      // Default tick command is 'tick'
      const sent = await runHook({
        stdinPayload: {
          prompt: 'tick',
          session_id: 'sess-tick',
          cwd: '/test/project',
          is_subagent: false,
        },
        socketExists: true,
      });

      // Tick path sends a process_tick query, not a hook_event
      const hookEvents = filterHookEvents(sent);
      expect(hookEvents.length).toBe(0);

      // Hook should still exit cleanly
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('does NOT emit hook_event for custom tick command set via env var', async () => {
      process.env['GOODVIBES_TICK_COMMAND'] = 'heartbeat';
      try {
        const sent = await runHook({
          stdinPayload: {
            prompt: 'heartbeat',
            session_id: 'sess-custom-tick',
            cwd: '/test/project',
            is_subagent: false,
          },
          socketExists: true,
        });

        const hookEvents = filterHookEvents(sent);
        expect(hookEvents.length).toBe(0);
      } finally {
        delete process.env['GOODVIBES_TICK_COMMAND'];
      }
    });
  });

  describe('no socket available', () => {
    it('does NOT emit hook_event when socket does not exist', async () => {
      const sent = await runHook({
        stdinPayload: {
          prompt: 'Hello without daemon',
          session_id: 'sess-nosock',
          cwd: '/test/project',
          is_subagent: false,
        },
        socketExists: false,
      });

      const hookEvents = filterHookEvents(sent);
      expect(hookEvents.length).toBe(0);

      // Hook should still exit cleanly without blocking
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });
});
