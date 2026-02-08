/**
 * precision_exec handler - Execute shell commands with child_process
 * SPEC-v2 Section 13.1.7 compliant
 *
 * Features:
 * - safe_mode: Block destructive commands (rm -rf, etc.)
 * - exit_codes output mode
 * - expect.exit_code as number | number[]
 * - expect.stdout_matches regex matching
 * - expect.stderr_empty
 * - Command ID tracking
 * - truncated flag in results
 * - tokens_used tracking
 */

import { spawn, exec, execFile } from 'child_process';
import { startTimer, estimateTokens } from '../logging.js';
import type { OutputMode } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, parseJsonField } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { validateDirectoryPath } from '../utils/path-validation.js';

// Destructive command patterns for safe_mode
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[rf]+\s+)*[\/~]/i,                    // rm -rf /path
  /\brm\s+-[rf]*\s+--no-preserve-root/i,          // rm --no-preserve-root
  /\brmdir\s+[\/~]/i,                             // rmdir /path
  /\bmkfs\b/i,                                    // mkfs (format disk)
  /\bdd\s+.*of=\/dev/i,                           // dd to device
  /\b:\s*\(\s*\)\s*\{\s*:\s*\|/,                  // Fork bomb
  />\s*\/dev\/sd[a-z]/i,                          // Write to disk device
  /\bchmod\s+(-[rR]\s+)*[0-7]{3,4}\s+[\/~]/i,    // chmod on system paths
  /\bchown\s+(-[rR]\s+)*\S+\s+[\/~]/i,           // chown on system paths
  /\bgit\s+push\s+.*--force/i,                    // Force push
  /\bgit\s+reset\s+--hard/i,                      // Hard reset
  /\bnpm\s+publish/i,                             // npm publish without safeguards
  /\bsudo\s+rm/i,                                 // sudo rm
  /\|.*\bxargs\s+rm/i,                            // pipe to xargs rm
  /\bdrop\s+(database|table)/i,                   // SQL drop
  /\btruncate\s+table/i,                          // SQL truncate
  /\bdelete\s+from\s+\w+\s*;/i,                   // DELETE without WHERE
];

function isDestructiveCommand(cmd: string, args?: string[]): boolean {
  const fullCommand = args ? `${cmd} ${args.join(' ')}` : cmd;
  return DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(fullCommand));
}

interface ExpectSpec {
  exit_code?: number | number[];
  stdout_contains?: string;
  stdout_matches?: string;  // Regex pattern
  stderr_contains?: string;
  stderr_empty?: boolean;
}

interface CommandSpec {
  id?: string;
  cmd?: string;
  cmd_base64?: string;
  args?: string[];
  cwd?: string;
  timeout_ms?: number;
  timeout?: number;  // Legacy support
  env?: Record<string, string>;
  expect?: ExpectSpec;
}

interface OutputConfig {
  mode: 'count_only' | 'exit_codes' | 'minimal' | 'standard' | 'verbose';
  capture_stdout?: boolean;
  capture_stderr?: boolean;
  max_output_lines?: number;
  max_tokens?: number;
}

interface PrecisionExecInput {
  commands: CommandSpec[];
  parallel?: boolean;
  fail_fast?: boolean;
  stop_on_error?: boolean;  // Legacy support
  shell?: string;
  env?: Record<string, string>;
  working_dir?: string;
  safe_mode?: boolean;
  timeout_ms?: number;
  output?: OutputConfig;
  output_mode?: OutputMode;  // Legacy support
}

interface CommandResult {
  id?: string;
  cmd: string;
  exit_code: number;
  duration_ms: number;
  expectations_met: boolean;
  expectation_failures?: string[];
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  timed_out?: boolean;
}

const DEFAULT_TIMEOUT = 120000;        // was 30000 — match native Bash 120s
const DEFAULT_MAX_OUTPUT_LINES = 500;  // was 100 — capture full test/build output
const MAX_OUTPUT_CHARS = 50000;        // was 10000 — native is 30K, we do 50K

async function executeCommand(
  spec: CommandSpec,
  globalEnv?: Record<string, string>,
  globalWorkDir?: string,
  globalTimeout?: number,
  captureStdout = true,
  captureStderr = true,
  maxOutputLines = DEFAULT_MAX_OUTPUT_LINES
): Promise<CommandResult> {
  const startTime = Date.now();
  const timeout = spec.timeout_ms ?? spec.timeout ?? globalTimeout ?? DEFAULT_TIMEOUT;
  const args = spec.args ?? [];
  const cwd = spec.cwd
    ? await validateDirectoryPath(spec.cwd, process.cwd())
    : globalWorkDir;

  // Decode cmd_base64 if provided, otherwise use cmd
  const command = spec.cmd_base64
    ? Buffer.from(spec.cmd_base64, 'base64').toString('utf-8')
    : spec.cmd;

  // Should never happen due to validation in handler, but TypeScript safety
  if (!command) {
    return Promise.resolve({
      cmd: '(missing)',
      exit_code: 1,
      duration_ms: 0,
      expectations_met: false,
      expectation_failures: ['Command not provided'],
    });
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncatedStdout = false;
    let truncatedStderr = false;

    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...globalEnv, ...spec.env },
      shell: true,
      windowsHide: true,
    });

    const timeoutId = setTimeout(() => {
      // Check if process already exited to prevent race condition
      if (proc.exitCode !== null) return;

      timedOut = true;
      if (process.platform === 'win32') {
        // Use execFile instead of exec to avoid shell invocation (security)
        execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], (err) => {
          if (err && !proc.killed) {
            try {
              proc.kill();
            } catch {
              // Process may have already exited
            }
          }
        });
      } else {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 5000);
      }
    }, timeout);

    if (captureStdout) {
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length < MAX_OUTPUT_CHARS) {
          stdout += chunk;
          if (stdout.length > MAX_OUTPUT_CHARS) {
            stdout = stdout.slice(0, MAX_OUTPUT_CHARS);
            truncatedStdout = true;
          }
        } else {
          truncatedStdout = true;
        }
      });
    }

    if (captureStderr) {
      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length < MAX_OUTPUT_CHARS) {
          stderr += chunk;
          if (stderr.length > MAX_OUTPUT_CHARS) {
            stderr = stderr.slice(0, MAX_OUTPUT_CHARS);
            truncatedStderr = true;
          }
        } else {
          truncatedStderr = true;
        }
      });
    }

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const exitCode = code ?? (timedOut ? 124 : 1);
      const duration_ms = Date.now() - startTime;

      // Apply max_output_lines truncation
      if (maxOutputLines > 0) {
        const stdoutLines = stdout.split('\n');
        const stderrLines = stderr.split('\n');

        if (stdoutLines.length > maxOutputLines) {
          stdout = stdoutLines.slice(0, maxOutputLines).join('\n');
          truncatedStdout = true;
        }
        if (stderrLines.length > maxOutputLines) {
          stderr = stderrLines.slice(0, maxOutputLines).join('\n');
          truncatedStderr = true;
        }
      }

      // Check expectations
      const expectationFailures: string[] = [];
      let expectationsMet = true;

      if (spec.expect) {
        // exit_code check (supports number or number[])
        if (spec.expect.exit_code !== undefined) {
          const expectedCodes = Array.isArray(spec.expect.exit_code)
            ? spec.expect.exit_code
            : [spec.expect.exit_code];

          if (!expectedCodes.includes(exitCode)) {
            expectationFailures.push(
              `Expected exit_code in [${expectedCodes.join(', ')}], got ${exitCode}`
            );
            expectationsMet = false;
          }
        }

        // stdout_contains check
        if (spec.expect.stdout_contains && !stdout.includes(spec.expect.stdout_contains)) {
          expectationFailures.push(`Expected stdout to contain "${spec.expect.stdout_contains}"`);
          expectationsMet = false;
        }

        // stdout_matches regex check
        if (spec.expect.stdout_matches) {
          try {
            const regex = new RegExp(spec.expect.stdout_matches);
            if (!regex.test(stdout)) {
              expectationFailures.push(`Expected stdout to match /${spec.expect.stdout_matches}/`);
              expectationsMet = false;
            }
          } catch (e) {
            expectationFailures.push(`Invalid regex in stdout_matches: ${spec.expect.stdout_matches}`);
            expectationsMet = false;
          }
        }

        // stderr_contains check
        if (spec.expect.stderr_contains && !stderr.includes(spec.expect.stderr_contains)) {
          expectationFailures.push(`Expected stderr to contain "${spec.expect.stderr_contains}"`);
          expectationsMet = false;
        }

        // stderr_empty check
        if (spec.expect.stderr_empty && stderr.trim().length > 0) {
          expectationFailures.push(`Expected stderr to be empty, but got: "${stderr.slice(0, 100)}..."`);
          expectationsMet = false;
        }
      }

      const result: CommandResult = {
        cmd: command,
        exit_code: exitCode,
        duration_ms,
        expectations_met: expectationsMet,
      };

      if (spec.id) {
        result.id = spec.id;
      }

      if (captureStdout) {
        result.stdout = stdout.trim();
      }

      if (captureStderr) {
        result.stderr = stderr.trim();
      }

      if (truncatedStdout || truncatedStderr) {
        result.truncated = true;
      }

      if (timedOut) {
        result.timed_out = true;
      }

      if (expectationFailures.length > 0) {
        result.expectation_failures = expectationFailures;
      }

      resolve(result);
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const result: CommandResult = {
        cmd: command,
        exit_code: 1,
        duration_ms: Date.now() - startTime,
        expectations_met: false,
        expectation_failures: [`Command error: ${err.message}`],
      };

      if (spec.id) {
        result.id = spec.id;
      }

      if (captureStdout) {
        result.stdout = '';
      }

      if (captureStderr) {
        result.stderr = err.message;
      }

      resolve(result);
    });
  });
}

export const handlePrecisionExec: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionExecInput;
  const input = { ...rawInput, commands: parseJsonField(rawInput.commands) } as PrecisionExecInput;
  const outputMode = parseOutputMode(args, "precision_exec");

  // Parse options with defaults
  const parallel = input.parallel ?? false;
  const failFast = input.fail_fast ?? input.stop_on_error ?? true;
  const safeMode = input.safe_mode ?? true;
  const globalEnv = input.env;
  const globalWorkDir = input.working_dir
    ? await validateDirectoryPath(input.working_dir, process.cwd())
    : undefined;
  const globalTimeout = input.timeout_ms ?? DEFAULT_TIMEOUT;

  // Output configuration
  const captureStdout = input.output?.capture_stdout ?? true;
  const captureStderr = input.output?.capture_stderr ?? true;
  const maxOutputLines = input.output?.max_output_lines ?? DEFAULT_MAX_OUTPUT_LINES;

  try {
    if (!input.commands || !Array.isArray(input.commands) || input.commands.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_exec', 'commands', 'array of command objects'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Validate commands and check for destructive commands
    for (const cmd of input.commands) {
      // Ensure either cmd or cmd_base64 is provided
      if (!cmd.cmd && !cmd.cmd_base64) {
        return toCallToolResult(createErrorResult(
          formatMissingParamError('precision_exec', 'cmd or cmd_base64', 'at least one must be provided'),
          { output_mode: outputMode, execution_ms: getElapsed() }
        ));
      }

      // Safe mode: Check for destructive commands
      if (safeMode) {
        const command = cmd.cmd_base64
          ? Buffer.from(cmd.cmd_base64, 'base64').toString('utf-8')
          : cmd.cmd!;

        if (isDestructiveCommand(command, cmd.args)) {
          return toCallToolResult(errorResult(
            `Blocked by safe_mode: "${command}" appears destructive. Set safe_mode: false to override.`,
            outputMode,
            getElapsed()
          ));
        }
      }
    }

    let results: CommandResult[];

    if (parallel) {
      results = await Promise.all(
        input.commands.map(cmd =>
          executeCommand(cmd, globalEnv, globalWorkDir, globalTimeout, captureStdout, captureStderr, maxOutputLines)
        )
      );
    } else {
      results = [];
      for (const cmd of input.commands) {
        const result = await executeCommand(cmd, globalEnv, globalWorkDir, globalTimeout, captureStdout, captureStderr, maxOutputLines);
        results.push(result);

        if (failFast && (result.exit_code !== 0 || !result.expectations_met)) {
          break;
        }
      }
    }

    // Calculate summary
    const succeeded = results.filter(r => r.exit_code === 0 && r.expectations_met).length;
    const failed = results.filter(r => r.exit_code !== 0 || !r.expectations_met).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

    // Build response based on output mode
    let data: Record<string, unknown>;

    switch (outputMode) {
      case 'count_only':
        data = {
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;

      case 'exit_codes':
        data = {
          commands: results.map(r => ({
            ...(r.id && { id: r.id }),
            cmd: r.cmd,
            exit_code: r.exit_code,
          })),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;

      case 'minimal':
        data = {
          commands: results.map(r => ({
            ...(r.id && { id: r.id }),
            cmd: r.cmd,
            exit_code: r.exit_code,
            duration_ms: r.duration_ms,
            expectations_met: r.expectations_met,
          })),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;

      case 'standard':
        data = {
          commands: results.map(r => ({
            ...(r.id && { id: r.id }),
            cmd: r.cmd,
            exit_code: r.exit_code,
            duration_ms: r.duration_ms,
            expectations_met: r.expectations_met,
            ...(r.truncated && { truncated: r.truncated }),
            ...(r.timed_out && { timed_out: r.timed_out }),
            ...(r.stdout && { stdout: r.stdout.length > 500 ? r.stdout.slice(0, 500) + '...' : r.stdout }),
            ...(r.stderr && { stderr: r.stderr.length > 200 ? r.stderr.slice(0, 200) + '...' : r.stderr }),
            ...(r.expectation_failures && { expectation_failures: r.expectation_failures }),
          })),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;

      case 'verbose':
      default:
        data = {
          commands: results.map(r => ({
            ...(r.id && { id: r.id }),
            cmd: r.cmd,
            exit_code: r.exit_code,
            duration_ms: r.duration_ms,
            expectations_met: r.expectations_met,
            ...(r.truncated && { truncated: r.truncated }),
            ...(r.timed_out && { timed_out: r.timed_out }),
            ...(r.stdout !== undefined && { stdout: r.stdout }),
            ...(r.stderr !== undefined && { stderr: r.stderr }),
            ...(r.expectation_failures && { expectation_failures: r.expectation_failures }),
          })),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;
    }

    // Calculate tokens_used
    const responseJson = JSON.stringify(data);
    data.tokens_used = estimateTokens(responseJson);

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
