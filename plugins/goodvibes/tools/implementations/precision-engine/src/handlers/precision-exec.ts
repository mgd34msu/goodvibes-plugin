/**
 * precision_exec handler - Execute shell commands with child_process
 * Supports batch command execution, timeout, and expectations checking
 */

import { spawn } from 'child_process';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode } from '../utils/index.js';

interface CommandSpec {
  cmd: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  expect?: {
    exit_code?: number;
    stdout_contains?: string;
    stderr_contains?: string;
  };
}

interface PrecisionExecInput {
  commands: CommandSpec[];
  parallel?: boolean;
  stop_on_error?: boolean;
  output_mode?: OutputMode;
}

interface CommandResult {
  cmd: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  expectations_met: boolean;
  expectation_failures?: string[];
}

const DEFAULT_TIMEOUT = 60000;

async function executeCommand(spec: CommandSpec): Promise<CommandResult> {
  const startTime = Date.now();
  const timeout = spec.timeout ?? DEFAULT_TIMEOUT;
  const args = spec.args ?? [];

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(spec.cmd, args, {
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      shell: true,
      windowsHide: true,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    }, timeout);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const exitCode = code ?? (timedOut ? 124 : 1);
      const duration_ms = Date.now() - startTime;

      // Check expectations
      const expectationFailures: string[] = [];
      let expectationsMet = true;

      if (spec.expect) {
        if (spec.expect.exit_code !== undefined && exitCode !== spec.expect.exit_code) {
          expectationFailures.push(`Expected exit_code ${spec.expect.exit_code}, got ${exitCode}`);
          expectationsMet = false;
        }
        if (spec.expect.stdout_contains && !stdout.includes(spec.expect.stdout_contains)) {
          expectationFailures.push(`Expected stdout to contain "${spec.expect.stdout_contains}"`);
          expectationsMet = false;
        }
        if (spec.expect.stderr_contains && !stderr.includes(spec.expect.stderr_contains)) {
          expectationFailures.push(`Expected stderr to contain "${spec.expect.stderr_contains}"`);
          expectationsMet = false;
        }
      }

      resolve({
        cmd: spec.cmd,
        exit_code: exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration_ms,
        timed_out: timedOut,
        expectations_met: expectationsMet,
        ...(expectationFailures.length > 0 && { expectation_failures: expectationFailures }),
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        cmd: spec.cmd,
        exit_code: 1,
        stdout: '',
        stderr: err.message,
        duration_ms: Date.now() - startTime,
        timed_out: false,
        expectations_met: false,
        expectation_failures: [`Command error: ${err.message}`],
      });
    });
  });
}

export const handlePrecisionExec: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionExecInput;
  const outputMode = parseOutputMode(args);
  const parallel = input.parallel ?? false;
  const stopOnError = input.stop_on_error ?? true;

  try {
    if (!input.commands || !Array.isArray(input.commands) || input.commands.length === 0) {
      return toCallToolResult(errorResult('commands array is required', outputMode, getElapsed()));
    }

    let results: CommandResult[];

    if (parallel) {
      results = await Promise.all(input.commands.map(executeCommand));
    } else {
      results = [];
      for (const cmd of input.commands) {
        const result = await executeCommand(cmd);
        results.push(result);
        if (stopOnError && (result.exit_code !== 0 || !result.expectations_met)) {
          break;
        }
      }
    }

    const succeeded = results.filter(r => r.exit_code === 0 && r.expectations_met).length;
    const failed = results.filter(r => r.exit_code !== 0 || !r.expectations_met).length;

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { commands_executed: results.length, commands_succeeded: succeeded, commands_failed: failed };
        break;
      case 'minimal':
        data = { commands_executed: results.length, results: results.map(r => ({ cmd: r.cmd, exit_code: r.exit_code, expectations_met: r.expectations_met })) };
        break;
      default:
        data = {
          commands_executed: results.length,
          commands_succeeded: succeeded,
          commands_failed: failed,
          results: results.map(r => ({
            ...r,
            stdout: r.stdout.length > 1000 ? r.stdout.slice(0, 1000) + '...' : r.stdout,
            stderr: r.stderr.length > 500 ? r.stderr.slice(0, 500) + '...' : r.stderr,
          })),
        };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
