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

import { spawn, execFile } from 'child_process';
import { homedir } from 'os';
import { startTimer, estimateTokens } from '../logging.js';
import type { OutputMode } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, parseJsonField, handleOverflow, cleanupOverflowFiles, type OverflowResult, interpretExitCode, type ExitInterpretation, detectIssue, type DetectedIssue } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { validateDirectoryPath } from '../utils/path-validation.js';
import { getExecDefaultTimeout, getExecMaxOutputLines, getExecMaxOutputChars, getExecHistoryMax, getExecMaxBackground } from '../runtime-config.js';
import { commandHistory, sessionState, processManager, type BgStartResult } from '../state/index.js';

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

/**
 * Shell-escape a single argument for safe concatenation.
 * Wraps arguments containing special characters in single quotes,
 * escaping any single quotes within the argument.
 */
function shellEscape(arg: string): string {
  // If the argument contains no special characters, return as-is
  if (/^[a-zA-Z0-9_\/.,-]+$/.test(arg)) {
    return arg;
  }
  
  // Otherwise, wrap in single quotes and escape any single quotes
  return `'${arg.replace(/'/g, "'\\''")}' `;
}

/**
 * Detect cd command from command string and return new directory if found.
 * Handles: cd <path>, pushd <path>, cd ~ , cd ..
 * Matches the LAST cd/pushd in a command chain (e.g., git clone repo && cd repo)
 */
function detectCdFromCommand(command: string): string | null {
  // Match the LAST cd or pushd in a command chain
  // Handles: cd /path, cd ./path, cd ../path, cd ~, cd ~/path, pushd /path
  // Also handles chained commands: git clone repo && cd repo
  const cdMatch = command.match(/(?:^|&&|;|\|\|)\s*(cd|pushd)\s+([^;&|]+)\s*$/);
  if (cdMatch) {
    let newDir = cdMatch[2].trim();
    
    // Filter out cd - (return to previous directory - too complex to track)
    if (newDir === '-') return null;
    
    // Remove paired quotes if present
    const unquoted = newDir.replace(/^"(.*)"$|^'(.*)'$/, '$1$2');
    newDir = unquoted || newDir;
    
    // Expand ~ to home directory
    if (newDir.startsWith('~')) {
      newDir = newDir === '~' ? homedir() : newDir.replace(/^~/, homedir());
    }
    
    return newDir;
  }
  return null;
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
  background?: boolean;  // Run in background (Part E)
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
  stdout_overflow?: OverflowResult;
  stderr_overflow?: OverflowResult;
  truncated?: boolean;
  timed_out?: boolean;
  exit_interpretation?: ExitInterpretation;
  detected_issue?: DetectedIssue;
}

// Config defaults are now retrieved from runtime-config getters

async function executeCommand(
  spec: CommandSpec,
  globalEnv?: Record<string, string>,
  globalWorkDir?: string,
  globalTimeout?: number,
  captureStdout = true,
  captureStderr = true,
  maxOutputLines?: number,
  isParallel = false
): Promise<CommandResult> {
  const startTime = Date.now();
  const timeout = spec.timeout_ms ?? spec.timeout ?? globalTimeout ?? getExecDefaultTimeout();
  const effectiveMaxOutputLines = maxOutputLines ?? getExecMaxOutputLines();
  const maxOutputChars = getExecMaxOutputChars();
  const args = spec.args ?? [];
  
  // CWD resolution priority:
  // 1. Per-command cwd field (explicit override)
  // 2. Request-level working_dir (globalWorkDir) - also updates session
  // 3. Session state (persisted from previous calls)
  const cwd = spec.cwd
    ? await validateDirectoryPath(spec.cwd, process.cwd())
    : globalWorkDir ?? sessionState.cwd;

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

    // Buffer cap: 5x the normal threshold to allow overflow handler to save full output
    const bufferCap = maxOutputChars * 5;

    // When shell: true, we need to pass the full command as a single string to avoid
    // the deprecation warning and ensure proper command execution.
    // Properly escape arguments to prevent shell interpretation issues.
    const fullCommand = args.length > 0 
      ? `${command} ${args.map(shellEscape).join(' ')}`.trim()
      : command;

    const proc = spawn(fullCommand, [], {
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
        if (stdout.length < bufferCap) {
          stdout += chunk;
          if (stdout.length > bufferCap) {
            stdout = stdout.slice(0, bufferCap);
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
        if (stderr.length < bufferCap) {
          stderr += chunk;
          if (stderr.length > bufferCap) {
            stderr = stderr.slice(0, bufferCap);
            truncatedStderr = true;
          }
        } else {
          truncatedStderr = true;
        }
      });
    }

    proc.on('close', async (code) => {
      clearTimeout(timeoutId);
      const exitCode = code ?? (timedOut ? 124 : 1);
      const duration_ms = Date.now() - startTime;

      // Apply max_output_lines truncation
      if (effectiveMaxOutputLines > 0) {
        const stdoutLines = stdout.split('\n');
        const stderrLines = stderr.split('\n');

        if (stdoutLines.length > effectiveMaxOutputLines) {
          stdout = stdoutLines.slice(0, effectiveMaxOutputLines).join('\n');
          truncatedStdout = true;
        }
        if (stderrLines.length > effectiveMaxOutputLines) {
          stderr = stderrLines.slice(0, effectiveMaxOutputLines).join('\n');
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

      // Handle stdout overflow
      if (captureStdout && stdout.length > maxOutputChars) {
        try {
          const commandId = spec.id || `cmd-${startTime}`;
          const overflowResult = await handleOverflow(stdout, commandId, maxOutputChars);
          result.stdout_overflow = overflowResult;
          result.stdout = overflowResult.head.trim();
        } catch {
          // Fallback to simple truncation if overflow file write fails
          result.stdout = stdout.slice(0, maxOutputChars).trim();
          result.truncated = true;
        }
      } else if (captureStdout) {
        result.stdout = stdout.trim();
      }

      // Handle stderr overflow
      if (captureStderr && stderr.length > maxOutputChars) {
        try {
          const commandId = spec.id || `cmd-${startTime}`;
          const overflowResult = await handleOverflow(stderr, `${commandId}-stderr`, maxOutputChars);
          result.stderr_overflow = overflowResult;
          result.stderr = overflowResult.head.trim();
        } catch {
          // Fallback to simple truncation if overflow file write fails
          result.stderr = stderr.slice(0, maxOutputChars).trim();
          result.truncated = true;
        }
      } else if (captureStderr) {
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

      // Detect cd command and update session state
      // Skip cd detection when running in parallel to avoid race conditions
      if (exitCode === 0 && !isParallel) {
        const detectedCd = detectCdFromCommand(fullCommand);
        if (detectedCd) {
          sessionState.setCwd(detectedCd);
        }
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

  // Initialize command history max entries from config
  commandHistory.setMaxEntries(getExecHistoryMax());

  // Handle built-in exec_history command
  if (input.commands && input.commands.length === 1 && (input.commands[0].cmd === 'exec_history' || input.commands[0].cmd_base64 === Buffer.from('exec_history').toString('base64'))) {
    const history = commandHistory.getAll();
    const stats = commandHistory.getStats();
    const data: Record<string, unknown> = {
      history,
      stats,
    };
    const responseJson = JSON.stringify(data);
    data.tokens_used = estimateTokens(responseJson);
    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  }

  // Handle background management commands
  if (input.commands && input.commands.length === 1) {
    const cmd = input.commands[0].cmd_base64
      ? Buffer.from(input.commands[0].cmd_base64, 'base64').toString('utf-8')
      : input.commands[0].cmd;

    if (cmd) {
      // bg_list command
      if (cmd === 'bg_list') {
        const processes = processManager.list();
        const data: Record<string, unknown> = {
          processes: processes.map(p => ({
            id: p.id,
            pid: p.pid,
            command: p.command,
            status: p.status,
            exit_code: p.exit_code,
            started_at: p.started_at,
            duration_ms: Date.now() - p.started_at,
          })),
          count: processes.length,
        };
        const responseJson = JSON.stringify(data);
        data.tokens_used = estimateTokens(responseJson);
        return toCallToolResult(successResult(data, outputMode, getElapsed()));
      }

      // bg_status <id> command
      const statusMatch = cmd.match(/^bg_status\s+(\S+)$/);
      if (statusMatch) {
        const id = statusMatch[1];
        const proc = processManager.getStatus(id);
        if (!proc) {
          return toCallToolResult(errorResult(
            `Background process ${id} not found. Use bg_list to see all processes.`,
            outputMode,
            getElapsed()
          ));
        }
        const { output } = processManager.getOutput(id, 50, true);  // peek=true to not consume output
        const data: Record<string, unknown> = {
          process: {
            id: proc.id,
            pid: proc.pid,
            command: proc.command,
            status: proc.status,
            exit_code: proc.exit_code,
            started_at: proc.started_at,
            duration_ms: Date.now() - proc.started_at,
            log_file: proc.log_file,
          },
          recent_output: output || '(no output yet)',
        };
        const responseJson = JSON.stringify(data);
        data.tokens_used = estimateTokens(responseJson);
        return toCallToolResult(successResult(data, outputMode, getElapsed()));
      }

      // bg_output <id> command
      const outputMatch = cmd.match(/^bg_output\s+(\S+)$/);
      if (outputMatch) {
        const id = outputMatch[1];
        try {
          const { output, complete } = processManager.getOutput(id);
          const data: Record<string, unknown> = {
            process_id: id,
            output: output || '(no new output)',
            complete,
          };
          const responseJson = JSON.stringify(data);
          data.tokens_used = estimateTokens(responseJson);
          return toCallToolResult(successResult(data, outputMode, getElapsed()));
        } catch (err) {
          return toCallToolResult(errorResult((err as Error).message, outputMode, getElapsed()));
        }
      }

      // bg_stop <id> command
      const stopMatch = cmd.match(/^bg_stop\s+(\S+)$/);
      if (stopMatch) {
        const id = stopMatch[1];
        try {
          const result = await processManager.stop(id);
          const data: Record<string, unknown> = result;
          const responseJson = JSON.stringify(data);
          data.tokens_used = estimateTokens(responseJson);
          return toCallToolResult(successResult(data, outputMode, getElapsed()));
        } catch (err) {
          return toCallToolResult(errorResult((err as Error).message, outputMode, getElapsed()));
        }
      }
    }
  }

  // Clean up old overflow files (non-blocking, fire-and-forget)
  cleanupOverflowFiles().catch(() => {});

  // Parse options with defaults
  const parallel = input.parallel ?? false;
  const failFast = input.fail_fast ?? input.stop_on_error ?? true;
  const safeMode = input.safe_mode ?? true;
  const globalEnv = input.env;
  
  // Track previous cwd for session metadata
  const previousCwd = sessionState.cwd;
  
  const globalWorkDir = input.working_dir
    ? await validateDirectoryPath(input.working_dir, process.cwd())
    : undefined;
  
  // Update session state if working_dir is provided
  if (globalWorkDir) {
    sessionState.setCwd(globalWorkDir);
  }
  
  const globalTimeout = input.timeout_ms;

  // Output configuration
  const captureStdout = input.output?.capture_stdout ?? true;
  const captureStderr = input.output?.capture_stderr ?? true;
  const maxOutputLines = input.output?.max_output_lines;

  try {
    if (!input.commands || !Array.isArray(input.commands) || input.commands.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_exec', 'commands', 'array of command objects'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Check for previous runs and add inline context hints
    const commandsWithContext: Array<{ spec: CommandSpec; previousRun?: { exit_code: number; duration_ms: number; timestamp: number } }> = [];
    for (const cmd of input.commands) {
      const command = cmd.cmd_base64
        ? Buffer.from(cmd.cmd_base64, 'base64').toString('utf-8')
        : cmd.cmd;
      
      if (command) {
        const previousRun = commandHistory.findByCommand(command);
        commandsWithContext.push({
          spec: cmd,
          previousRun: previousRun ? {
            exit_code: previousRun.exit_code,
            duration_ms: previousRun.duration_ms,
            timestamp: previousRun.timestamp,
          } : undefined,
        });
      } else {
        commandsWithContext.push({ spec: cmd });
      }
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

    // Handle background execution
    const hasBackgroundCommands = input.commands.some(cmd => cmd.background);
    if (hasBackgroundCommands) {
      // Background commands - spawn and return immediately
      const bgResults: BgStartResult[] = [];
      
      for (const cmd of input.commands) {
        const command = cmd.cmd_base64
          ? Buffer.from(cmd.cmd_base64, 'base64').toString('utf-8')
          : cmd.cmd;
        
        // Guard against empty command
        if (!command) {
          return toCallToolResult(errorResult(
            'Background command requires cmd or cmd_base64',
            outputMode,
            getElapsed()
          ));
        }
        
        const args = cmd.args ?? [];
        
        // Resolve cwd
        const cwd = cmd.cwd
          ? await validateDirectoryPath(cmd.cwd, process.cwd())
          : globalWorkDir ?? sessionState.cwd;
        
        try {
          const bgResult = processManager.spawn(command, args, {
            cwd,
            env: { ...globalEnv, ...cmd.env },
          });
          
          // Record in command history with background: true
          commandHistory.add({
            id: bgResult.process_id,
            timestamp: Date.now(),
            command: bgResult.command,
            cwd,
            exit_code: -1, // Still running
            duration_ms: 0,
            stdout_lines: 0,
            stderr_lines: 0,
            truncated: false,
            background: true,
          });
          
          bgResults.push(bgResult);
        } catch (err) {
          return toCallToolResult(errorResult((err as Error).message, outputMode, getElapsed()));
        }
      }
      
      // Return immediately with background process info
      const data: Record<string, unknown> = {
        processes: bgResults,
        count: bgResults.length,
      };
      const responseJson = JSON.stringify(data);
      data.tokens_used = estimateTokens(responseJson);
      return toCallToolResult(successResult(data, outputMode, getElapsed()));
    }

    let results: CommandResult[];

    if (parallel) {
      results = await Promise.all(
        input.commands.map(cmd =>
          executeCommand(cmd, globalEnv, globalWorkDir, globalTimeout, captureStdout, captureStderr, maxOutputLines, true)
        )
      );
    } else {
      results = [];
      for (const cmd of input.commands) {
        const result = await executeCommand(cmd, globalEnv, globalWorkDir, globalTimeout, captureStdout, captureStderr, maxOutputLines, false);
        results.push(result);

        if (failFast && (result.exit_code !== 0 || !result.expectations_met)) {
          break;
        }
      }
    }

    // Add commands to history
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const cmd = input.commands[i];
      const stdoutLines = result.stdout ? result.stdout.split('\n').length : 0;
      const stderrLines = result.stderr ? result.stderr.split('\n').length : 0;
      
      // Resolve actual cwd the command ran in (same logic as executeCommand)
      const resolvedCwd = cmd.cwd
        ? (await validateDirectoryPath(cmd.cwd, process.cwd()).catch(() => cmd.cwd!))
        : globalWorkDir ?? sessionState.cwd;
      
      commandHistory.add({
        id: result.id || `cmd-${Date.now()}-${i}`,
        timestamp: Date.now(),
        command: result.cmd,
        cwd: resolvedCwd,
        exit_code: result.exit_code,
        duration_ms: result.duration_ms,
        stdout_lines: stdoutLines,
        stderr_lines: stderrLines,
        truncated: result.truncated || false,
      });
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
            ...(r.exit_code !== 0 && { exit_interpretation: interpretExitCode(r.exit_code) }),
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
          commands: results.map((r, i) => {
            // Safe: results is a subset of input.commands in order (fail_fast may truncate), so i < commandsWithContext.length always holds
            const context = commandsWithContext[i];
            return {
              ...(r.id && { id: r.id }),
              cmd: r.cmd,
              exit_code: r.exit_code,
              duration_ms: r.duration_ms,
              expectations_met: r.expectations_met,
              ...(r.truncated && { truncated: r.truncated }),
              ...(r.timed_out && { timed_out: r.timed_out }),
              ...(r.stdout && { stdout: r.stdout.length > 500 ? r.stdout.slice(0, 500) + '...' : r.stdout }),
              ...(r.stderr && { stderr: r.stderr.length > 200 ? r.stderr.slice(0, 200) + '...' : r.stderr }),
              ...(r.stdout_overflow && { stdout_overflow: r.stdout_overflow }),
              ...(r.stderr_overflow && { stderr_overflow: r.stderr_overflow }),
              ...(r.expectation_failures && { expectation_failures: r.expectation_failures }),
              ...(r.exit_code !== 0 && { exit_interpretation: interpretExitCode(r.exit_code) }),
              ...(r.exit_code !== 0 && r.stderr && { detected_issue: detectIssue(r.stderr, r.stdout) }),
              ...(context?.previousRun && {
                same_command_last_run: {
                  exit_code: context.previousRun.exit_code,
                  duration_ms: context.previousRun.duration_ms,
                  timestamp: context.previousRun.timestamp,
                },
              }),
            };
          }),
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
          commands: results.map((r, i) => {
            // Safe: results is a subset of input.commands in order (fail_fast may truncate), so i < commandsWithContext.length always holds
            const context = commandsWithContext[i];
            return {
              ...(r.id && { id: r.id }),
              cmd: r.cmd,
              exit_code: r.exit_code,
              duration_ms: r.duration_ms,
              expectations_met: r.expectations_met,
              ...(r.truncated && { truncated: r.truncated }),
              ...(r.timed_out && { timed_out: r.timed_out }),
              ...(r.stdout !== undefined && { stdout: r.stdout }),
              ...(r.stderr !== undefined && { stderr: r.stderr }),
              ...(r.stdout_overflow && { stdout_overflow: r.stdout_overflow }),
              ...(r.stderr_overflow && { stderr_overflow: r.stderr_overflow }),
              ...(r.expectation_failures && { expectation_failures: r.expectation_failures }),
              ...(r.exit_code !== 0 && { exit_interpretation: interpretExitCode(r.exit_code) }),
              ...(r.exit_code !== 0 && r.stderr && { detected_issue: detectIssue(r.stderr, r.stdout) }),
              ...(context?.previousRun && {
                same_command_last_run: {
                  exit_code: context.previousRun.exit_code,
                  duration_ms: context.previousRun.duration_ms,
                  timestamp: context.previousRun.timestamp,
                },
              }),
            };
          }),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;
    }

    // Add session metadata
    const currentCwd = sessionState.cwd;
    data.session = {
      cwd: currentCwd,
      cwd_changed: currentCwd !== previousCwd,
      ...(currentCwd !== previousCwd && { previous_cwd: previousCwd }),
    };
    
    // Calculate tokens_used
    const responseJson = JSON.stringify(data);
    data.tokens_used = estimateTokens(responseJson);

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
