/**
 * Tests for precision_exec handler.
 */

import { describe, it, expect } from 'vitest';
import { handlePrecisionExec } from '../../handlers/precision-exec.js';
import { expectSuccess, expectError } from '../test-utils.js';

describe('precision_exec handler', () => {
  describe('input validation', () => {
    it('should return error when commands array is missing', async () => {
      const result = await handlePrecisionExec({});
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'commands'");
    });

    it('should return error when commands array is empty', async () => {
      const result = await handlePrecisionExec({ commands: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'commands'");
    });
  });

  describe('basic command execution', () => {
    it('should execute a simple command', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['hello'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.succeeded).toBe(1);
      expect(parsed.data.commands[0].exit_code).toBe(0);
    });

    it('should capture stdout', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test output'] }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].stdout).toContain('test output');
    });

    it('should capture exit code', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'node', args: ['-e', 'process.exit(42)'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].exit_code).toBe(42);
      expect(parsed.data.summary.failed).toBe(1);
    });

    it('should track duration', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('multiple commands', () => {
    it('should execute multiple commands sequentially', async () => {
      const result = await handlePrecisionExec({
        commands: [
          { cmd: 'echo', args: ['first'] },
          { cmd: 'echo', args: ['second'] },
        ],
        parallel: false,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total).toBe(2);
      expect(parsed.data.summary.succeeded).toBe(2);
    });

    it('should execute multiple commands in parallel', async () => {
      const result = await handlePrecisionExec({
        commands: [
          { cmd: 'echo', args: ['first'] },
          { cmd: 'echo', args: ['second'] },
        ],
        parallel: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total).toBe(2);
      expect(parsed.data.summary.succeeded).toBe(2);
    });

    it('should stop on error when fail_fast=true', async () => {
      const result = await handlePrecisionExec({
        commands: [
          { cmd: 'node', args: ['-e', 'process.exit(1)'] },
          { cmd: 'echo', args: ['should not run'] },
        ],
        parallel: false,
        fail_fast: true,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total).toBeLessThanOrEqual(2);
      expect(parsed.data.summary.failed).toBe(1);
    });
  });

  describe('expectations', () => {
    it('should validate exit_code expectation', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['test'],
          expect: { exit_code: 0 },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].expectations_met).toBe(true);
    });

    it('should fail when exit_code does not match', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['test'],
          expect: { exit_code: 1 },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].expectations_met).toBe(false);
      expect(parsed.data.commands[0].expectation_failures).toBeDefined();
    });

    it('should validate stdout_contains expectation', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['hello world'],
          expect: { stdout_contains: 'hello' },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].expectations_met).toBe(true);
    });

    it('should fail when stdout_contains does not match', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['hello'],
          expect: { stdout_contains: 'goodbye' },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].expectations_met).toBe(false);
    });

    it('should validate stdout_matches regex expectation', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['test123'],
          expect: { stdout_matches: 'test\\d+' },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].expectations_met).toBe(true);
    });

    it('should support exit_code as array', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'node',
          args: ['-e', 'process.exit(2)'],
          expect: { exit_code: [0, 1, 2] },
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].expectations_met).toBe(true);
    });
  });

  describe('safe_mode', () => {
    it('should block destructive commands by default', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'rm',
          args: ['-rf', '/'],
        }],
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('safe_mode');
    });

    it('should allow destructive commands when safe_mode=false', async () => {
      // Use a safe command that looks destructive but isn't
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['rm -rf /'], // Just echoing, not executing
        }],
        safe_mode: false,
      });

      const parsed = expectSuccess(result);
      // Should not be blocked
    });

    it('should block git push --force', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'git',
          args: ['push', '--force'],
        }],
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('safe_mode');
    });
  });

  describe('timeout', () => {
    it('should timeout long-running commands', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'node',
          args: ['-e', 'setTimeout(() => {}, 10000)'],
          timeout_ms: 100,
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].timed_out).toBe(true);
      expect(parsed.data.commands[0].exit_code).toBe(124); // Timeout exit code
    });
  });

  describe('output modes', () => {
    it('should return count_only output', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test'] }],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('summary');
      expect(parsed.data).not.toHaveProperty('commands');
    });

    it('should return exit_codes output', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test'] }],
        output_mode: 'exit_codes',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0]).toHaveProperty('cmd');
      expect(parsed.data.commands[0]).toHaveProperty('exit_code');
      expect(parsed.data.commands[0]).not.toHaveProperty('stdout');
    });

    it('should return minimal output', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test'] }],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0]).toHaveProperty('cmd');
      expect(parsed.data.commands[0]).toHaveProperty('exit_code');
      expect(parsed.data.commands[0]).toHaveProperty('duration_ms');
      expect(parsed.data.commands[0]).toHaveProperty('expectations_met');
    });

    it('should return verbose output with full stdout/stderr', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['verbose test'] }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0]).toHaveProperty('stdout');
    });
  });

  describe('command ID tracking', () => {
    it('should include command ID in results', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          id: 'my-command',
          cmd: 'echo',
          args: ['test'],
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].id).toBe('my-command');
    });
  });

  describe('output truncation', () => {
    it('should truncate long output', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: process.platform === 'win32'
            ? 'for /L %i in (1,1,100) do @echo line%i'
            : 'for i in {1..100}; do echo line$i; done',
        }],
        output: { max_output_lines: 10 },
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].truncated).toBe(true);
    });
  });

  describe('metadata', () => {
    it('should include tokens_used', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionExec({
        commands: [{ cmd: 'echo', args: ['test'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include total_duration_ms in summary', async () => {
      const result = await handlePrecisionExec({
        commands: [
          { cmd: 'echo', args: ['a'] },
          { cmd: 'echo', args: ['b'] },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('base64 alternatives', () => {
    it('should decode cmd_base64 parameter', async () => {
      const cmdText = 'echo';
      const cmdBase64 = Buffer.from(cmdText).toString('base64');

      const result = await handlePrecisionExec({
        commands: [{
          cmd_base64: cmdBase64,
          args: ['base64 test']
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].exit_code).toBe(0);
    });

    it('should prefer cmd_base64 over cmd when both provided', async () => {
      const cmdBase64 = Buffer.from('echo').toString('base64');

      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'invalidcmd',
          cmd_base64: cmdBase64,
          args: ['test']
        }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].exit_code).toBe(0);
      expect(parsed.data.commands[0].stdout).toContain('test');
    });

    it('should handle complex commands with special characters via base64', async () => {
      const cmdText = 'echo';
      const cmdBase64 = Buffer.from(cmdText).toString('base64');

      const result = await handlePrecisionExec({
        commands: [{
          cmd_base64: cmdBase64,
          args: ['test output']
        }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].exit_code).toBe(0);
      expect(parsed.data.commands[0].stdout).toContain('test output');
    });
  });

  describe('parameter aliasing - timeout', () => {
    it('should accept timeout_ms parameter (new name)', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'node',
          args: ['-e', 'setTimeout(() => {}, 10000)'],
          timeout_ms: 100,
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].timed_out).toBe(true);
    });

    it('should accept timeout parameter (deprecated name)', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'node',
          args: ['-e', 'setTimeout(() => {}, 10000)'],
          timeout: 100,
        }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.commands[0].timed_out).toBe(true);
    });

    it('should prefer timeout_ms when both timeout and timeout_ms are provided', async () => {
      const result = await handlePrecisionExec({
        commands: [{
          cmd: 'echo',
          args: ['test'],
          timeout: 10000, // Should be ignored
          timeout_ms: 5000, // Should be used - needs to be long enough for echo on Windows
        }],
      });

      const parsed = expectSuccess(result);
      // Command should complete quickly, not timeout
      expect(parsed.data.commands[0].exit_code).toBe(0);
    });
  });
});
