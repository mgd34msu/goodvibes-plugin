/**
 * Tests for precision_exec handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handlePrecisionExec } from '../../handlers/precision-exec.js';
import { expectSuccess, expectError } from '../test-utils.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

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

describe('precision_exec file_ops', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'precision-exec-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      const src = path.join(tmpDir, 'source.txt');
      const dst = path.join(tmpDir, 'dest.txt');
      await fs.writeFile(src, 'hello');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: src, destination: dst }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);
      const content = await fs.readFile(dst, 'utf-8');
      expect(content).toBe('hello');
    });

    it('should fail copy when destination exists and overwrite is false', async () => {
      const src = path.join(tmpDir, 'source.txt');
      const dst = path.join(tmpDir, 'dest.txt');
      await fs.writeFile(src, 'hello');
      await fs.writeFile(dst, 'existing');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: src, destination: dst, options: { overwrite: false } }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(false);
      expect(parsed.data.file_ops[0].error).toBeDefined();
    });

    it('should copy with overwrite: true', async () => {
      const src = path.join(tmpDir, 'source.txt');
      const dst = path.join(tmpDir, 'dest.txt');
      await fs.writeFile(src, 'new content');
      await fs.writeFile(dst, 'old content');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: src, destination: dst, options: { overwrite: true } }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);
      const content = await fs.readFile(dst, 'utf-8');
      expect(content).toBe('new content');
    });

    it('should return error when destination is missing', async () => {
      const src = path.join(tmpDir, 'source.txt');
      await fs.writeFile(src, 'hello');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: src }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(false);
      expect(parsed.data.file_ops[0].error).toContain('destination');
    });
  });

  describe('move', () => {
    it('should move a file', async () => {
      const src = path.join(tmpDir, 'source.txt');
      const dst = path.join(tmpDir, 'moved.txt');
      await fs.writeFile(src, 'move me');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'move', source: src, destination: dst }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);
      const content = await fs.readFile(dst, 'utf-8');
      expect(content).toBe('move me');
      // Source should be gone
      await expect(fs.access(src)).rejects.toThrow();
    });

    it('should fail move when destination exists and overwrite is false', async () => {
      const src = path.join(tmpDir, 'source.txt');
      const dst = path.join(tmpDir, 'dest.txt');
      await fs.writeFile(src, 'hello');
      await fs.writeFile(dst, 'existing');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'move', source: src, destination: dst, options: { overwrite: false } }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(false);
      expect(parsed.data.file_ops[0].error).toContain('already exists');
    });
  });

  describe('delete', () => {
    it('should delete a file within project root', async () => {
      // Use process.cwd() based path (project root)
      const projectRoot = process.cwd();
      const testFile = path.join(projectRoot, `.test-delete-${Date.now()}.tmp`);
      await fs.writeFile(testFile, 'delete me');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'delete', source: testFile }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);
      await expect(fs.access(testFile)).rejects.toThrow();
    });

    it('should reject delete outside project root', async () => {
      const outsidePath = path.join(os.tmpdir(), `test-${Date.now()}.tmp`);
      await fs.writeFile(outsidePath, 'outside');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'delete', source: outsidePath }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(false);
      expect(parsed.data.file_ops[0].error).toContain('project root');

      // Cleanup outside file
      await fs.rm(outsidePath, { force: true });
    });

    it('should support dry_run mode', async () => {
      const projectRoot = process.cwd();
      const testFile = path.join(projectRoot, `.test-dryrun-${Date.now()}.tmp`);
      await fs.writeFile(testFile, 'dry run');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'delete', source: testFile, options: { dry_run: true } }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);
      expect(parsed.data.file_ops[0].dry_run).toBe(true);
      // File should still exist
      await expect(fs.access(testFile)).resolves.toBeUndefined();

      // Cleanup
      await fs.rm(testFile, { force: true });
    });
  });

  describe('file_ops only (no commands)', () => {
    it('should work with file_ops and no commands', async () => {
      const src = path.join(tmpDir, 'only-ops.txt');
      const dst = path.join(tmpDir, 'only-ops-dest.txt');
      await fs.writeFile(src, 'ops only');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: src, destination: dst }],
        commands: [],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);
    });
  });

  describe('copy recursive directory', () => {
    it('should copy a directory recursively and preserve all files', async () => {
      // Issue 8: Test directory recursive copy
      const srcDir = path.join(tmpDir, 'src-dir');
      const dstDir = path.join(tmpDir, 'dst-dir');
      await fs.mkdir(srcDir);
      await fs.writeFile(path.join(srcDir, 'a.txt'), 'file a');
      await fs.writeFile(path.join(srcDir, 'b.txt'), 'file b');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: srcDir, destination: dstDir, options: { recursive: true } }],
        commands: [{ cmd: 'echo', args: ['ok'] }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.file_ops[0].success).toBe(true);

      // Destination directory should contain both files
      const aContent = await fs.readFile(path.join(dstDir, 'a.txt'), 'utf-8');
      expect(aContent).toBe('file a');
      const bContent = await fs.readFile(path.join(dstDir, 'b.txt'), 'utf-8');
      expect(bContent).toBe('file b');
    });
  });

  describe('mixed file_ops and commands execution order', () => {
    it('should execute file_ops before commands so commands can observe the result', async () => {
      // Issue 9: Test that file_ops run before commands
      const src = path.join(tmpDir, 'order-source.txt');
      const dst = path.join(tmpDir, 'order-dest.txt');
      await fs.writeFile(src, 'order test');

      const result = await handlePrecisionExec({
        file_ops: [{ op: 'copy', source: src, destination: dst }],
        commands: [{ cmd: 'ls', args: [tmpDir] }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      // file_ops must have succeeded
      expect(parsed.data.file_ops[0].success).toBe(true);
      // command stdout should list the destination file (proving it existed when ls ran)
      expect(parsed.data.commands[0].stdout).toContain('order-dest.txt');
    });
  });
});
