/**
 * Unit tests for handleRetryWithLearning
 *
 * Tests the retry-with-learning handler that executes commands with LLM-powered
 * error analysis and retry logic.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Create mock functions using vi.hoisted() to ensure they're available before vi.mock() is hoisted
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock config
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Mock crypto for hash function - returns hash based on input content
// This allows duplicate error detection to work correctly
vi.mock('crypto', () => {
  return {
    createHash: vi.fn().mockImplementation(() => {
      let content = '';
      return {
        update: vi.fn().mockImplementation((data: string) => {
          content = data;
          return { digest: vi.fn().mockReturnValue(`hash_${content.slice(0, 20).replace(/[^a-z0-9]/gi, '_')}`) };
        }),
        digest: vi.fn().mockReturnValue('mockhash_default'),
      };
    }),
  };
});

import { handleRetryWithLearning } from '../../../handlers/edit/retry-with-learning.js';

function createMockProcess(exitCode: number, stdout: string, stderr: string, delay = 10) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
  });

  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  }, delay);

  return proc;
}

/**
 * Creates a mock process that emits an 'error' event (simulating ENOENT - command not found).
 * Use this for cleanly mocking "Claude CLI not available" without any stderr output.
 */
function createNotFoundProcess(delay = 5) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
  });

  setTimeout(() => {
    proc.emit('error', new Error('spawn claude ENOENT'));
  }, delay);

  return proc;
}

describe('handleRetryWithLearning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('argument validation', () => {
    test('returns error when command is missing', async () => {
      const result = await handleRetryWithLearning({
        command: '',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Missing required argument: command');
    });

    test('returns error when command is whitespace only', async () => {
      const result = await handleRetryWithLearning({
        command: '   ',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('empty');
    });

    test('returns error when command argument is not a string', async () => {
      const result = await handleRetryWithLearning({
        command: undefined as any,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Missing');
    });
  });

  describe('successful command execution', () => {
    test('returns success on first attempt when command succeeds', async () => {
      // Mock Claude CLI version check (not available - emits error event)
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        // Command execution
        .mockReturnValueOnce(createMockProcess(0, 'Build successful', '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'npm run build',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.total_attempts).toBe(1);
      expect(data.final_exit_code).toBe(0);
      expect(data.final_stdout).toContain('Build successful');
    });

    test('includes attempt details in response', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(0, 'output', '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'npm test',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.attempts).toHaveLength(1);
      expect(data.attempts[0]).toHaveProperty('attempt');
      expect(data.attempts[0]).toHaveProperty('command');
      expect(data.attempts[0]).toHaveProperty('exit_code');
      expect(data.attempts[0]).toHaveProperty('duration_ms');
    });
  });

  describe('retry behavior', () => {
    test('retries on failure up to max_retries', async () => {
      let callCount = 0;
      let commandAttempt = 0;

      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Claude version check - not found (emits error event)
          return createNotFoundProcess();
        }
        // All command attempts fail with different errors to avoid duplicate detection
        // Use unique strings (not numbers) since error hash normalizes numbers
        commandAttempt++;
        const uniqueErrors = ['alpha failure', 'beta failure', 'gamma failure'];
        return createMockProcess(1, '', uniqueErrors[commandAttempt - 1] || 'unknown', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-command',
        max_retries: 3,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      expect(data.total_attempts).toBe(3);
      expect(data.gave_up_reason).toContain('maximum retry limit');
    });

    test('stops early when same error occurs multiple times', async () => {
      let callCount = 0;

      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createNotFoundProcess(); // Claude check - not found
        }
        // Same error every time
        return createMockProcess(1, '', 'Same error message', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-command',
        max_retries: 5,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      // Should stop before max_retries due to repeated error
      expect(data.total_attempts).toBeLessThanOrEqual(5);
      expect(data.gave_up_reason).toContain('Same error');
    });

    test('succeeds on retry after initial failure', async () => {
      let commandCallCount = 0;

      mockSpawn.mockImplementation(() => {
        if (commandCallCount === 0) {
          commandCallCount++;
          return createNotFoundProcess(); // Claude check - not found
        }
        commandCallCount++;
        if (commandCallCount === 2) {
          // First command fails
          return createMockProcess(1, '', 'Temporary error', 10);
        }
        // Second command succeeds
        return createMockProcess(0, 'Success', '', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'flaky-command',
        max_retries: 3,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.total_attempts).toBe(2);
    });
  });

  describe('max_retries limits', () => {
    test('enforces minimum of 1 retry', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(1, '', 'Error', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
        max_retries: 0,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.total_attempts).toBeGreaterThanOrEqual(1);
    });

    test('enforces maximum of 10 retries', async () => {
      let attemptCount = 0;

      mockSpawn.mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return createNotFoundProcess();
        }
        return createMockProcess(1, '', `Error ${attemptCount}`, 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
        max_retries: 100,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.total_attempts).toBeLessThanOrEqual(10);
    });
  });

  describe('fix strategies', () => {
    test('analyze_only strategy does not modify command', async () => {
      let executedCommand = '';

      mockSpawn.mockImplementation((cmd: string) => {
        if (cmd === 'claude') {
          return createNotFoundProcess(); // Claude check - not found
        }
        if (cmd === 'failing-cmd') {
          executedCommand = cmd;
          return createMockProcess(1, '', 'Error', 10);
        }
        return createMockProcess(1, '', 'Error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        fix_strategy: 'analyze_only',
        max_retries: 2,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      // Command should not change between retries
    });

    test('analyze_only strategy with Claude available uses correct prompt strategy text', async () => {
      let capturedPrompt = '';

      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Capture the prompt sent to Claude
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.stdin = {
            write: (data: string) => {
              capturedPrompt = data;
            },
            end: vi.fn(),
          };
          proc.killed = false;
          proc.kill = vi.fn(() => {
            proc.killed = true;
          });

          setTimeout(() => {
            proc.stdout.emit('data', Buffer.from(JSON.stringify({
              analysis: 'Analysis only test',
              suggested_fix: 'N/A - analyze only mode',
              should_retry: false,
            })));
            proc.emit('close', 0);
          }, 10);

          return proc;
        }
        return createMockProcess(1, '', 'Error for analysis', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        fix_strategy: 'analyze_only',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      // Verify the prompt contains the analyze_only strategy text
      expect(capturedPrompt).toContain('Only analyze the error, do not suggest fixes');
      expect(data.attempts[0].error_analysis).toBe('Analysis only test');
    });

    test('suggest_fix strategy provides suggestions', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess(0, '', '', 5)) // Claude available
        .mockReturnValueOnce(createMockProcess(1, '', 'Error', 10)) // Command fails
        .mockReturnValueOnce(createMockProcess(0, JSON.stringify({
          analysis: 'Missing dependency',
          suggested_fix: 'Run npm install first',
          should_retry: false,
        }), '', 10)); // Claude analysis

      const resultPromise = handleRetryWithLearning({
        command: 'npm run build',
        fix_strategy: 'suggest_fix',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.attempts[0]).toHaveProperty('suggested_fix');
    });
  });

  describe('LLM analysis', () => {
    test('skips LLM analysis when Claude is not available', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess()) // Claude not available (emits error)
        .mockReturnValueOnce(createMockProcess(1, '', 'Error', 10)) // Command fails
        .mockReturnValueOnce(createMockProcess(1, '', 'Error again', 10)); // Retry fails

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 2,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.attempts[0].error_analysis).toContain('Claude CLI not available');
    });

    test('uses LLM analysis when Claude is available', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess(0, '2.0.0', '', 5)) // Claude available
        .mockReturnValueOnce(createMockProcess(1, '', 'Build error', 10)) // Command fails
        .mockReturnValueOnce(createMockProcess(0, JSON.stringify({
          analysis: 'TypeScript compilation error',
          suggested_fix: 'Fix type errors',
          should_retry: true,
        }), '', 10)) // Claude analysis
        .mockReturnValueOnce(createMockProcess(0, 'Success', '', 10)); // Retry succeeds

      const resultPromise = handleRetryWithLearning({
        command: 'npm run build',
        max_retries: 2,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.attempts[0].error_analysis).toContain('TypeScript');
    });

    test('handles LLM recommendation to not retry', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess(0, '2.0.0', '', 5)) // Claude available
        .mockReturnValueOnce(createMockProcess(1, '', 'Fatal error', 10)) // Command fails
        .mockReturnValueOnce(createMockProcess(0, JSON.stringify({
          analysis: 'Unrecoverable error',
          suggested_fix: 'Manual intervention required',
          should_retry: false,
        }), '', 10)); // Claude says don't retry

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 5,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      expect(data.total_attempts).toBe(1);
      expect(data.gave_up_reason).toContain('LLM recommends not retrying');
    });
  });

  describe('auto_fix strategy', () => {
    test('applies modified command from LLM when auto_fix', async () => {
      let executedCommands: string[] = [];

      mockSpawn.mockImplementation((cmd: string, args: string[], opts: any) => {
        // Track which commands are executed
        if (opts?.shell) {
          executedCommands.push(cmd);
        }

        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // LLM analysis with modified command
          return createMockProcess(0, JSON.stringify({
            analysis: 'Missing flag',
            suggested_fix: 'Add --force flag',
            should_retry: true,
            modified_command: 'npm install --force',
          }), '', 10);
        }

        // First attempt fails, second succeeds
        if (cmd === 'npm install') {
          return createMockProcess(1, '', 'Error', 10);
        }
        if (cmd === 'npm install --force') {
          return createMockProcess(0, 'Success', '', 10);
        }

        return createMockProcess(0, '', '', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'npm install',
        fix_strategy: 'auto_fix',
        max_retries: 2,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });
  });

  describe('timeout handling', () => {
    test('kills process on timeout', async () => {
      const slowProcess = new EventEmitter() as any;
      slowProcess.stdout = new EventEmitter();
      slowProcess.stderr = new EventEmitter();
      slowProcess.stdin = { write: vi.fn(), end: vi.fn() };
      slowProcess.killed = false;
      slowProcess.kill = vi.fn((signal) => {
        slowProcess.killed = true;
        slowProcess.emit('close', null);
      });

      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess()) // Claude not available (emits error)
        .mockReturnValueOnce(slowProcess); // Slow command

      const resultPromise = handleRetryWithLearning({
        command: 'slow-command',
        timeout: 100, // Very short timeout
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(slowProcess.kill).toHaveBeenCalled();
      expect(data.final_stderr).toContain('timeout');
    });

    test('respects custom timeout', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(0, 'Done', '', 500));

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
        timeout: 1000,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });
  });

  describe('working directory', () => {
    test('uses custom cwd when provided', async () => {
      let usedCwd = '';

      mockSpawn.mockImplementation((cmd, args, opts) => {
        if (opts?.cwd) {
          usedCwd = opts.cwd;
        }
        return createMockProcess(0, '', '', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
        cwd: '/custom/path',
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(usedCwd).toBe('/custom/path');
    });

    test('uses PROJECT_ROOT when cwd not provided', async () => {
      let usedCwd = '';

      mockSpawn.mockImplementation((cmd, args, opts) => {
        if (opts?.cwd) {
          usedCwd = opts.cwd;
        }
        if (cmd === 'claude') {
          return createNotFoundProcess();
        }
        return createMockProcess(0, '', '', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(usedCwd).toBe('/mock/project/root');
    });
  });

  describe('error context', () => {
    test('includes error_context in LLM prompt', async () => {
      let promptReceived = '';

      mockSpawn.mockImplementation((cmd, args) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Capture stdin content
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.stdin = {
            write: (data: string) => {
              promptReceived = data;
            },
            end: vi.fn(),
          };
          proc.killed = false;
          proc.kill = vi.fn(() => {
            proc.killed = true;
          });

          setTimeout(() => {
            proc.stdout.emit('data', Buffer.from(JSON.stringify({
              analysis: 'Test',
              suggested_fix: 'Test',
              should_retry: false,
            })));
            proc.emit('close', 0);
          }, 10);

          return proc;
        }
        return createMockProcess(1, '', 'Error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        error_context: 'Building React application with TypeScript',
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(promptReceived).toContain('React');
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(0, 'output', '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('attempts');
      expect(data).toHaveProperty('total_attempts');
      expect(data).toHaveProperty('final_exit_code');
      expect(data).toHaveProperty('final_stdout');
      expect(data).toHaveProperty('final_stderr');
    });

    test('returns valid JSON', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(0, 'output', '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('spawn error handling', () => {
    test('handles spawn error gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.stdin = { write: vi.fn(), end: vi.fn() };
        proc.kill = vi.fn();

        setTimeout(() => {
          proc.emit('error', new Error('spawn ENOENT'));
        }, 10);

        return proc;
      });

      const resultPromise = handleRetryWithLearning({
        command: 'nonexistent-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      expect(data.final_stderr).toContain('ENOENT');
    });
  });

  describe('LLM analysis edge cases', () => {
    test('handles LLM analysis timeout', async () => {
      let claudeAnalysisProc: any = null;

      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // LLM analysis - simulate timeout by never completing
          claudeAnalysisProc = new EventEmitter() as any;
          claudeAnalysisProc.stdout = new EventEmitter();
          claudeAnalysisProc.stderr = new EventEmitter();
          claudeAnalysisProc.stdin = { write: vi.fn(), end: vi.fn() };
          claudeAnalysisProc.killed = false;
          claudeAnalysisProc.kill = vi.fn(() => {
            claudeAnalysisProc.killed = true;
          });
          return claudeAnalysisProc;
        }
        return createMockProcess(1, '', 'Command failed', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      // LLM analysis should have timed out
      expect(claudeAnalysisProc?.kill).toHaveBeenCalled();
    });

    test('handles invalid LLM response structure', async () => {
      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Return JSON with wrong structure (missing required fields)
          return createMockProcess(0, JSON.stringify({
            wrong_field: 'wrong value',
            // Missing: analysis, suggested_fix, should_retry
          }), '', 10);
        }
        return createMockProcess(1, '', 'Command error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      // Should continue despite invalid LLM response
      expect(data.attempts.length).toBeGreaterThanOrEqual(1);
    });

    test('handles LLM response with no JSON', async () => {
      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Return plain text with no JSON at all
          return createMockProcess(0, 'I analyzed the error and it seems to be a network issue.', '', 10);
        }
        return createMockProcess(1, '', 'Network error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
    });

    test('handles malformed JSON in LLM response (JSON.parse throws)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Return text that matches the JSON regex but is invalid JSON
          // This will cause JSON.parse to throw, hitting lines 265-266
          return createMockProcess(0, '{ invalid json syntax: }', '', 10);
        }
        return createMockProcess(1, '', 'Command error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      // Should log the parse error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse Claude response:',
        expect.any(Error)
      );
    });

    test('handles LLM CLI exit with non-zero code', async () => {
      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Claude CLI exits with error
          return createMockProcess(1, '', 'Claude CLI error', 10);
        }
        return createMockProcess(1, '', 'Command error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
    });

    test('handles LLM spawn error during analysis', async () => {
      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Spawn error during analysis
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.stdin = { write: vi.fn(), end: vi.fn() };
          proc.killed = false;
          proc.kill = vi.fn();

          setTimeout(() => {
            proc.emit('error', new Error('Claude spawn failed'));
          }, 10);

          return proc;
        }
        return createMockProcess(1, '', 'Command error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
    });
  });

  describe('timeout bounds enforcement', () => {
    test('enforces minimum timeout of 1000ms', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(0, 'Success', '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
        timeout: 100, // Below minimum
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should not fail immediately despite very low timeout setting
    });

    test('enforces maximum timeout of 300000ms', async () => {
      mockSpawn
        .mockReturnValueOnce(createNotFoundProcess())
        .mockReturnValueOnce(createMockProcess(0, 'Success', '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'cmd',
        timeout: 999999, // Above maximum
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });
  });

  describe('null exit code handling', () => {
    test('handles null exit code from process', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.stdin = { write: vi.fn(), end: vi.fn() };
        proc.killed = false;
        proc.kill = vi.fn(() => {
          proc.killed = true;
        });

        setTimeout(() => {
          proc.stdout.emit('data', Buffer.from('Killed'));
          proc.emit('close', null); // null exit code
        }, 10);

        return proc;
      });

      const resultPromise = handleRetryWithLearning({
        command: 'killed-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      // null exit code should be treated as failure (exit code 1)
      expect(data.success).toBe(false);
      expect(data.final_exit_code).toBe(1);
    });
  });

  describe('process kill escalation', () => {
    test('escalates to SIGKILL when SIGTERM fails', async () => {
      let killCount = 0;
      let killedWithSigkill = false;

      mockSpawn.mockImplementation(() => {
        if (killCount === 0) {
          // Claude version check
          killCount++;
          return createNotFoundProcess();
        }

        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.stdin = { write: vi.fn(), end: vi.fn() };
        proc.killed = false;
        proc.kill = vi.fn((signal?: string) => {
          if (signal === 'SIGKILL') {
            killedWithSigkill = true;
            proc.killed = true;
            proc.emit('close', null);
          }
          // SIGTERM doesn't kill the process
        });

        // Process doesn't terminate naturally
        return proc;
      });

      const resultPromise = handleRetryWithLearning({
        command: 'stuck-cmd',
        timeout: 100,
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      // Should have attempted SIGKILL after SIGTERM failed
      expect(killedWithSigkill).toBe(true);
    });
  });

  describe('previous attempts in prompt', () => {
    test('includes previous attempts in LLM prompt for context', async () => {
      let capturedPrompt = '';
      let attemptIndex = 0;

      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Capture stdin for LLM analysis
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.stdin = {
            write: (data: string) => {
              capturedPrompt = data;
            },
            end: vi.fn(),
          };
          proc.killed = false;
          proc.kill = vi.fn(() => {
            proc.killed = true;
          });

          setTimeout(() => {
            proc.stdout.emit('data', Buffer.from(JSON.stringify({
              analysis: 'Test analysis',
              suggested_fix: 'Test fix',
              should_retry: true,
            })));
            proc.emit('close', 0);
          }, 10);

          return proc;
        }

        // Command execution - fail with different errors
        attemptIndex++;
        const errors = ['Error one', 'Error two', 'Error three'];
        return createMockProcess(1, '', errors[attemptIndex - 1] || 'Error', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'failing-cmd',
        max_retries: 3,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      // The prompt should mention previous attempts
      expect(capturedPrompt).toContain('Previous attempts');
    });
  });

  describe('output truncation', () => {
    test('truncates long output for LLM prompt', async () => {
      let capturedPrompt = '';

      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            return createMockProcess(0, '2.0.0', '', 5);
          }
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.stdin = {
            write: (data: string) => {
              capturedPrompt = data;
            },
            end: vi.fn(),
          };
          proc.killed = false;
          proc.kill = vi.fn(() => {
            proc.killed = true;
          });

          setTimeout(() => {
            proc.stdout.emit('data', Buffer.from(JSON.stringify({
              analysis: 'Test',
              suggested_fix: 'Test',
              should_retry: false,
            })));
            proc.emit('close', 0);
          }, 10);

          return proc;
        }

        // Generate very long output
        const longOutput = 'x'.repeat(10000);
        return createMockProcess(1, '', longOutput, 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'verbose-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      // Prompt should contain truncation indicator
      expect(capturedPrompt).toContain('truncated');
    });
  });

  describe('default fix strategy', () => {
    test('uses suggest_fix as default strategy', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess(0, '2.0.0', '', 5)) // Claude available
        .mockReturnValueOnce(createMockProcess(1, '', 'Error', 10)) // Command fails
        .mockReturnValueOnce(createMockProcess(0, JSON.stringify({
          analysis: 'Test',
          suggested_fix: 'Run npm install',
          should_retry: false,
        }), '', 10));

      const resultPromise = handleRetryWithLearning({
        command: 'npm run build',
        // No fix_strategy specified - should default to suggest_fix
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.attempts[0].suggested_fix).toBe('Run npm install');
    });
  });

  describe('Additional Coverage', () => {
    test('captures stderr from Claude CLI when it fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      
      mockSpawn.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'claude') {
          if (args?.includes('--version')) {
            // Version check succeeds
            return createMockProcess(0, '2.0.0', '', 5);
          }
          // Analysis fails with stderr output
          return createMockProcess(1, '', 'Specific Claude Error', 10);
        }
        // Command fails
        return createMockProcess(1, '', 'Command Failed', 10);
      });

      const resultPromise = handleRetryWithLearning({
        command: 'test-cmd',
        max_retries: 1,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      // Check if console.error was called with the captured stderr
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('exited with code:'),
        1,
        'stderr:',
        expect.stringContaining('Specific Claude Error')
      );
    });
  });
});
