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

import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer, estimateTokens } from '../logging.js';
import type { OutputMode } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, parseJsonField, handleOverflow, cleanupOverflowFiles, interpretExitCode, detectIssue, createProgressCollector } from '../utils/index.js';
import type { OverflowResult, ExitInterpretation, DetectedIssue, ProgressMilestone } from '../utils/index.js';
import { parseRetryConfig, shouldRetry, computeDelay } from '../utils/retry-engine.js';
import type { RetryConfig, RetryResult } from '../utils/retry-engine.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { validateDirectoryPath } from '../utils/path-validation.js';
import { getExecDefaultTimeout, getExecMaxOutputLines, getExecMaxOutputChars, getExecHistoryMax, getExecMaxBackground, getExecOverflowDir } from '../runtime-config.js';
import { commandHistory, sessionState, processManager } from '../state/index.js';
import type { BgStartResult } from '../state/index.js';
import { warnDeprecatedParam } from '../utils/deprecation.js';

/**
 * Buffer capacity multiplier: allows overflow handler to capture full output.
 * Set to 5x the normal threshold to prevent premature truncation during capture.
 */
const OVERFLOW_BUFFER_MULTIPLIER = 5;

/** Destructive command patterns for safe_mode */
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

// Timeout and threshold constants
/** Default command timeout in milliseconds when not explicitly specified */
const DEFAULT_TIMEOUT_MS = 30000;
/** Delay in milliseconds between SIGTERM and SIGKILL when terminating processes */
const KILL_SIGNAL_DELAY_MS = 5000;
/** Exit code indicating the command was killed due to timeout. */
const TIMEOUT_EXIT_CODE = 124;
/** Maximum characters of stderr to include in error preview messages. */
const STDERR_ERROR_PREVIEW_CHARS = 100;
/** Exit code indicating the process is still running in background. */
const BG_RUNNING_EXIT_CODE = -1;
/** Maximum number of lines to preview from background process output */
const BG_OUTPUT_PREVIEW_LINES = 50;
/** Maximum characters to display in stdout preview for minimal output mode */
const MINIMAL_STDOUT_PREVIEW_CHARS = 500;
/** Maximum characters to display in stderr preview for minimal output mode */
const MINIMAL_STDERR_PREVIEW_CHARS = 200;
/** Silence gap threshold in milliseconds for progress milestone collection */
const PROGRESS_SILENCE_GAP_MS = 2000;
/** Maximum number of progress milestones to collect per command */
const PROGRESS_MAX_MILESTONES = 20;
/** Minimum duration in milliseconds to include progress in command result */
const PROGRESS_DURATION_THRESHOLD_MS = 10000;

/**
 * Check if a command is potentially destructive and should be blocked in safe mode.
 * @param cmd - The base command to check
 * @param args - Optional command arguments
 * @returns true if the command matches any destructive pattern, false otherwise
 */
function isDestructiveCommand(cmd: string, args?: string[]): boolean {
  const fullCommand = args ? `${cmd} ${args.join(' ')}` : cmd;
  return DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(fullCommand));
}

/**
 * Shell-escape a single argument for safe concatenation.
 * Wraps arguments containing special characters in single quotes,
 * escaping any single quotes within the argument.
 * @param arg - The shell argument to escape
 * @returns The escaped argument safe for shell concatenation
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
 * 
 * Supported syntax:
 * - `cd /path` - absolute path
 * - `cd ./path` - relative path
 * - `cd ../path` - parent directory path
 * - `cd ~` or `cd ~/path` - home directory expansion
 * - `pushd <path>` - push directory onto stack
 * - Chained commands: `git clone repo && cd repo`, `command1 ; cd dir`, `command1 || cd fallback`
 * 
 * @param command The full command string to analyze
 * @returns The detected directory path, or null if no cd/pushd found or unsupported syntax (e.g., `cd -`)
 */
function detectCdFromCommand(command: string): string | null {
  // Regex breakdown:
  // (?:^|&&|;|\|\|) - Start of string OR command separator (&&, ;, ||)
  // \s* - Optional whitespace
  // (cd|pushd) - Capture cd or pushd command
  // \s+ - Required whitespace
  // ([^;&|]+) - Capture everything except command separators (the directory argument)
  // \s*$ - Optional trailing whitespace, then end of string
  const cdMatch = command.match(/(?:^|&&|;|\|\|)\s*(cd|pushd)\s+([^;&|]+)\s*$/);
  if (cdMatch) {
    let newDir = cdMatch[2].trim();
    
    // Filter out `cd -` (return to previous directory)
    // This requires tracking directory stack history, which is too complex for simple detection
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

/**
 * Expectation specification for command validation.
 * Used to verify command output and exit codes meet requirements.
 */
interface ExpectSpec {
  /** Expected exit code(s) - single number or array of acceptable codes */
  exit_code?: number | number[];
  /** Substring that must appear in stdout */
  stdout_contains?: string;
  /** Regex pattern that stdout must match */
  stdout_matches?: string;
  /** Substring that must appear in stderr */
  stderr_contains?: string;
  /** Whether stderr must be empty */
  stderr_empty?: boolean;
}

/**
 * Pattern-based early termination specification.
 * Allows commands to exit early when a specific pattern appears in output.
 */
interface UntilSpec {
  /** Regex pattern to watch for in stdout/stderr */
  pattern: string;
  /** Maximum wait time in milliseconds (default: command timeout) */
  timeout_ms?: number;
  /** Whether to kill process after pattern match (default: false - leave running) */
  kill_after?: boolean;
}

/**
 * Specification for a single command execution.
 * Defines the command, environment, timeouts, expectations, and special features.
 */
interface CommandSpec {
  /** Optional identifier for tracking this command */
  id?: string;
  /** Command to execute (plain text) */
  cmd?: string;
  /** Base64-encoded command (alternative to cmd) */
  cmd_base64?: string;
  /** Command arguments array */
  args?: string[];
  /** Working directory for command execution */
  cwd?: string;
  /** Command timeout in milliseconds */
  timeout_ms?: number;
  /** @deprecated Use timeout_ms instead */
  timeout?: number;
  /** Environment variables for command */
  env?: Record<string, string>;
  /** Expectations to validate after execution */
  expect?: ExpectSpec;
  /** Run command in background (Part E) */
  background?: boolean;
  /** Enable Tier 1 inline progress reporting (Part F) */
  progress?: boolean;
  /** Enable Tier 2 live progress file (Part F) */
  progress_file?: boolean;
  /** Pattern-based early termination specification (Part J) */
  until?: UntilSpec;
  /** Retry configuration for failed commands */
  retry?: {
    /** Maximum number of retry attempts */
    max?: number;
    /** Delay between retries in milliseconds */
    delay_ms?: number;
    /** Backoff strategy: fixed or exponential */
    backoff?: 'fixed' | 'exponential';
    /** Exit codes that trigger retry */
    on?: string[];
  };
}

/**
 * Output configuration for command results.
 * Controls verbosity and output capture behavior.
 */
interface OutputConfig {
  /** Verbosity level for output */
  mode: 'count_only' | 'exit_codes' | 'minimal' | 'standard' | 'verbose';
  /** Whether to capture stdout (default: true) */
  capture_stdout?: boolean;
  /** Whether to capture stderr (default: true) */
  capture_stderr?: boolean;
  /** Maximum lines to include in output */
  max_output_lines?: number;
  /** Maximum tokens to include in output */
  max_tokens?: number;
}

/**
 * Options for file operations.
 */
interface FileOpOptions {
  /** Copy/move: whether to recursively copy directories (default: false) */
  recursive?: boolean;
  /** Copy/move: whether to overwrite existing destination (default: false) */
  overwrite?: boolean;
  /** Move: whether to rewrite import paths in affected TS/JS files (default: false — stub) */
  update_imports?: boolean;
  /** Preview what would be deleted without actually deleting (default: false) */
  dry_run?: boolean;
}

/**
 * Specification for a single file operation.
 */
interface FileOpSpec {
  /** Operation type */
  op: 'copy' | 'move' | 'delete';
  /** Source path (absolute) */
  source: string;
  /** Destination path (required for copy/move) */
  destination?: string;
  /** Operation options */
  options?: FileOpOptions;
}

/**
 * Result of a single file operation.
 */
interface FileOpResult {
  op: string;
  source: string;
  destination?: string;
  success: boolean;
  error?: string;
  dry_run?: boolean;
  affected_paths?: string[];
}

/**
 * Input specification for precision_exec tool.
 * Defines batch command execution with global settings and output configuration.
 */
interface PrecisionExecInput {
  /** File operations to execute BEFORE commands */
  file_ops?: FileOpSpec[];
  /** Array of commands to execute */
  commands: CommandSpec[];
  /** Execute commands in parallel (default: sequential) */
  parallel?: boolean;
  /** Stop execution on first failure (default: false) */
  fail_fast?: boolean;
  /** @deprecated Use fail_fast instead */
  stop_on_error?: boolean;
  /** Shell to use for execution (default: /bin/bash or cmd.exe) */
  shell?: string;
  /** Global environment variables for all commands */
  env?: Record<string, string>;
  /** Global working directory for all commands */
  working_dir?: string;
  /** Block potentially destructive commands (default: false) */
  safe_mode?: boolean;
  /** Global timeout for all commands in milliseconds */
  timeout_ms?: number;
  /** Output configuration */
  output?: OutputConfig;
  /** @deprecated Legacy output mode support */
  output_mode?: OutputMode;
}

/**
 * Result of executing a single command.
 */
interface CommandResult {
  /** Optional command ID for tracking */
  id?: string;
  /** The command that was executed */
  cmd: string;
  /** Process exit code (0 = success, non-zero = error) */
  exit_code: number;
  /** Command execution duration in milliseconds */
  duration_ms: number;
  /** Whether all expectations were met */
  expectations_met: boolean;
  /** List of expectation failures, if any */
  expectation_failures?: string[];
  /** Captured stdout output */
  stdout?: string;
  /** Captured stderr output */
  stderr?: string;
  /** Overflow file info for stdout if output exceeded limits */
  stdout_overflow?: OverflowResult;
  /** Overflow file info for stderr if output exceeded limits */
  stderr_overflow?: OverflowResult;
  /** Whether output was truncated */
  truncated?: boolean;
  /** Whether command exceeded timeout */
  timed_out?: boolean;
  /** Human-readable interpretation of non-zero exit codes (Part D) */
  exit_interpretation?: ExitInterpretation;
  /** Detected issue type from stderr analysis */
  detected_issue?: DetectedIssue;
  /** Tier 1 progress milestones (Part F) */
  progress?: ProgressMilestone[];
  /** Tier 2 path to live log file (Part F) */
  progress_file?: string;
  /** Retry attempt information */
  retries?: RetryResult;
  /** Pattern termination status (Part J) */
  until_status?: 'pattern_matched' | 'timeout' | 'exited_before_match';
  /** The line that matched the until pattern (Part J) */
  matched_line?: string;
  /** Time from start to pattern match in milliseconds (Part J) */
  matched_at_ms?: number;
  /** Background process info when promoted (Part J) */
  background?: {
    /** Background process ID */
    process_id: string;
    /** System process ID */
    pid: number;
    /** Path to log file for background process */
    log_file: string;
    /** Usage hint for the user */
    hint: string;
  };
}

// Config defaults are now retrieved from runtime-config getters

/**
 * Handle until pattern match in stdout or stderr.
 * Extracts common logic for pattern matching, timeout clearing, and background process promotion.
 * @param child - The child process
 * @param clearTimeouts - Function to clear all timeouts
 * @param matchedOutput - The line that matched the pattern
 * @param spec - Command specification
 * @param stdout - Accumulated stdout
 * @param stderr - Accumulated stderr
 * @param startTime - Command start timestamp
 * @param progressCollector - Progress collector instance
 * @param resolve - Promise resolve function
 * @param untilKillAfter - Whether to kill process after match
 * @param fullCommand - Full command string for logging
 * @param cwd - Current working directory
 * @param command - Original command for result
 * @returns true if the handler resolved the promise, false otherwise
 */
function handleUntilMatch(
  child: ChildProcess,
  clearTimeouts: () => void,
  matchedOutput: string,
  spec: CommandSpec,
  stdout: string,
  stderr: string,
  startTime: number,
  progressCollector: ReturnType<typeof createProgressCollector>,
  resolve: (value: CommandResult) => void,
  untilKillAfter: boolean,
  fullCommand: string,
  cwd: string,
  command: string
): boolean {
  const matchedLine = matchedOutput;
  const matchedAtMs = Date.now() - startTime;
  
  clearTimeouts();
  
  if (untilKillAfter) {
    // Kill the process - wait for it to exit naturally via close handler
    child.kill('SIGTERM');
    return false; // Don't resolve yet, wait for close
  } else {
    // Promote to background and resolve immediately
    const bgId = processManager.generateId();
    try {
      const backgroundResult = processManager.adopt(bgId, child, fullCommand, cwd);
      
      // Build result and resolve immediately
      progressCollector.dispose();
      
      const result: CommandResult = {
        cmd: command,
        exit_code: BG_RUNNING_EXIT_CODE, // Still running in background
        duration_ms: Date.now() - startTime,
        expectations_met: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        until_status: 'pattern_matched',
        matched_line: matchedLine,
        matched_at_ms: matchedAtMs,
        background: {
          process_id: backgroundResult.process_id,
          pid: backgroundResult.pid,
          log_file: backgroundResult.log_file,
          hint: backgroundResult.hint,
        },
      };
      
      if (spec.id) {
        result.id = spec.id;
      }
      
      resolve(result);
      return true; // Resolved
    } catch (err) {
      // Adoption failed - fall through to normal handling
      return false;
    }
  }
}

/**
 * Execute a single command with full feature support.
 * Handles timeout, expectations, progress tracking, pattern matching, and background execution.
 * @param spec - Command specification
 * @param globalEnv - Global environment variables
 * @param globalWorkDir - Global working directory
 * @param globalTimeout - Global timeout in milliseconds
 * @param captureStdout - Whether to capture stdout
 * @param captureStderr - Whether to capture stderr
 * @param maxOutputLines - Maximum output lines to capture
 * @param isParallel - Whether executing in parallel mode
 * @returns Promise resolving to command result
 * @throws Never throws - all errors captured in result
 */
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
  // Warn about deprecated timeout parameter
  if (spec.timeout !== undefined && spec.timeout_ms === undefined) {
    warnDeprecatedParam('commands[].timeout', 'commands[].timeout_ms', 'precision_exec');
  }
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

    // Part J: Pattern-based early termination
    let untilPattern: RegExp | null = null;
    let untilTimeout: number | null = null;
    let untilKillAfter = false;
    let untilMatched = false;
    let untilTimedOut = false;
    let matchedLine: string | null = null;
    let matchedAtMs: number | null = null;
    let backgroundResult: BgStartResult | null = null;
    let untilTimeoutId: NodeJS.Timeout | null = null;

    if (spec.until) {
      try {
        untilPattern = new RegExp(spec.until.pattern);
        untilTimeout = spec.until.timeout_ms ?? timeout;
        untilKillAfter = spec.until.kill_after ?? false;
      } catch (err) {
        // Invalid regex pattern - return error immediately
        return resolve({
          cmd: command,
          exit_code: 1,
          duration_ms: 0,
          expectations_met: false,
          expectation_failures: [`Invalid until pattern: ${(err as Error).message}`],
        });
      }
    }

    // Buffer cap: Use multiplier to allow overflow handler to save full output
    const bufferCap = maxOutputChars * OVERFLOW_BUFFER_MULTIPLIER;

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

    // Initialize progress collector (Part F)
    // Tier 1: Always enabled (costs nothing, filter later based on duration)
    // Tier 2: Enabled when progress_file=true OR timeout > 30s
    const commandId = spec.id || `cmd-${startTime}`;
    const overflowDir = getExecOverflowDir();
    const tier2Enabled = spec.progress_file === true || timeout > DEFAULT_TIMEOUT_MS;
    const progressCollector = createProgressCollector(
      {
        enabled: true,  // Always collect
        progress_file: tier2Enabled,
        silence_gap_ms: PROGRESS_SILENCE_GAP_MS,
        max_milestones: PROGRESS_MAX_MILESTONES,
      },
      commandId,
      overflowDir
    );

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
        }, KILL_SIGNAL_DELAY_MS);
      }
    }, timeout);

    // Part J: Set up separate timeout for until pattern matching
    if (untilTimeout !== null && untilTimeout !== timeout) {
      untilTimeoutId = setTimeout(() => {
        // Check if process already exited or pattern already matched
        if (proc.exitCode !== null || untilMatched) return;

        untilTimedOut = true;
        // Clear the main timeout since we're handling it here
        clearTimeout(timeoutId);
        
        if (process.platform === 'win32') {
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
          }, KILL_SIGNAL_DELAY_MS);
        }
      }, untilTimeout);
    }

    if (captureStdout) {
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        // Feed to progress collector (Part F)
        progressCollector.onData(chunk);
        
        // Part J: Check for until pattern match
        if (untilPattern && !untilMatched) {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (untilPattern.test(line)) {
              untilMatched = true;
              const resolved = handleUntilMatch(
                proc,
                () => {
                  clearTimeout(timeoutId);
                  if (untilTimeoutId) clearTimeout(untilTimeoutId);
                },
                line,
                spec,
                stdout,
                stderr,
                startTime,
                progressCollector,
                resolve,
                untilKillAfter,
                fullCommand,
                cwd,
                command
              );
              if (resolved) {
                return; // Exit the data handler
              }
              break;
            }
          }
        }
        
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
        
        // Part J: Check for until pattern match in stderr too
        if (untilPattern && !untilMatched) {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (untilPattern.test(line)) {
              untilMatched = true;
              const resolved = handleUntilMatch(
                proc,
                () => {
                  clearTimeout(timeoutId);
                  if (untilTimeoutId) clearTimeout(untilTimeoutId);
                },
                line,
                spec,
                stdout,
                stderr,
                startTime,
                progressCollector,
                resolve,
                untilKillAfter,
                fullCommand,
                cwd,
                command
              );
              if (resolved) {
                return; // Exit the data handler
              }
              break;
            }
          }
        }
        
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
      // Guard: If pattern matched with kill_after: false, resolve was already called
      if (untilMatched && spec.until && !spec.until.kill_after) {
        clearTimeout(timeoutId);
        if (untilTimeoutId) clearTimeout(untilTimeoutId);
        return;
      }
      
      clearTimeout(timeoutId);
      if (untilTimeoutId) clearTimeout(untilTimeoutId);
      const exitCode = code ?? (timedOut ? TIMEOUT_EXIT_CODE : 1);
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
          expectationFailures.push(`Expected stderr to be empty, but got: "${stderr.slice(0, STDERR_ERROR_PREVIEW_CHARS)}..."`);
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

      // Finalize progress collection (Part F)
      const milestones = progressCollector.finalize(duration_ms);
      // Tier 1: Include progress if duration > 10s OR explicitly requested
      if (duration_ms > PROGRESS_DURATION_THRESHOLD_MS || spec.progress === true) {
        result.progress = milestones;
      }
      // Tier 2: Include progress file path if available
      const progressFilePath = progressCollector.getProgressFilePath();
      if (progressFilePath) {
        result.progress_file = progressFilePath;
      }
      // Dispose collector
      progressCollector.dispose();

      // Part J: Add until pattern status to result
      if (spec.until) {
        if (untilMatched) {
          result.until_status = 'pattern_matched';
          result.matched_line = matchedLine ?? undefined;
          result.matched_at_ms = matchedAtMs ?? undefined;
          
          // Add background info if process was promoted
          if (backgroundResult) {
            result.background = {
              process_id: backgroundResult.process_id,
              pid: backgroundResult.pid,
              log_file: backgroundResult.log_file,
              hint: backgroundResult.hint,
            };
          }
        } else if (timedOut || untilTimedOut) {
          result.until_status = 'timeout';
        } else {
          result.until_status = 'exited_before_match';
        }
      }

      /**
       * Detect cd command and update session state.
       * Only update on successful commands (exit_code === 0) to avoid tracking failed cd attempts.
       * Skip when running in parallel to avoid race conditions on sessionState.setCwd().
       */
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
      if (untilTimeoutId) clearTimeout(untilTimeoutId);
      progressCollector.dispose();
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

/**
 * Execute a command with automatic retry logic.
 * Retries failed commands based on exit codes with configurable backoff strategy.
 * @param spec - Command specification
 * @param retryConfig - Retry configuration (null for no retries)
 * @param globalEnv - Global environment variables
 * @param globalWorkDir - Global working directory
 * @param globalTimeout - Global timeout in milliseconds
 * @param captureStdout - Whether to capture stdout
 * @param captureStderr - Whether to capture stderr
 * @param maxOutputLines - Maximum output lines to capture
 * @param isParallel - Whether executing in parallel mode
 * @returns Promise resolving to final command result with retry metadata
 */
async function executeWithRetry(
  spec: CommandSpec,
  retryConfig: RetryConfig | null,
  globalEnv: Record<string, string> | undefined,
  globalWorkDir: string | undefined,
  globalTimeout: number | undefined,
  captureStdout: boolean,
  captureStderr: boolean,
  maxOutputLines: number | undefined,
  isParallel: boolean
): Promise<CommandResult> {
  // No retry config - execute once
  if (!retryConfig) {
    return executeCommand(
      spec,
      globalEnv,
      globalWorkDir,
      globalTimeout,
      captureStdout,
      captureStderr,
      maxOutputLines,
      isParallel
    );
  }

  let attempt = 0;
  let lastResult: CommandResult;
  const delays: number[] = [];

  while (true) {
    lastResult = await executeCommand(
      spec,
      globalEnv,
      globalWorkDir,
      globalTimeout,
      captureStdout,
      captureStderr,
      maxOutputLines,
      isParallel
    );

    // Success — no retry needed
    if (lastResult.exit_code === 0 && lastResult.expectations_met) {
      if (attempt > 0) {
        lastResult.retries = {
          attempts: attempt + 1,
          delays,
          reason: 'succeeded after retry',
        };
      }
      return lastResult;
    }

    // Check if we should retry
    const issue = detectIssue(lastResult.stderr || '', lastResult.stdout);
    const decision = shouldRetry(issue, retryConfig, attempt);

    if (!decision.retry || attempt >= retryConfig.max) {
      if (attempt > 0) {
        lastResult.retries = {
          attempts: attempt + 1,
          delays,
          reason: decision.reason,
          final_issue: issue?.type,
        };
      }
      return lastResult;
    }

    // Wait and retry
    const delay = computeDelay(retryConfig, attempt);
    delays.push(delay);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
}

/**
 * Map command results to output format.
 * Extracts common result mapping logic for standard and verbose output modes.
 * @param results - Array of command results
 * @param commandsWithContext - Array of commands with historical context
 * @param truncateOutput - Whether to truncate stdout/stderr (true for standard, false for verbose)
 * @returns Array of mapped results
 */
function mapCommandResults(
  results: CommandResult[],
  commandsWithContext: Array<{ cmd: string; previousRun?: { exit_code: number; duration_ms: number; timestamp: string } }>,
  truncateOutput: boolean
) {
  return results.map((r, i) => {
    const context = commandsWithContext[i];
    return {
      ...(r.id && { id: r.id }),
      cmd: r.cmd,
      exit_code: r.exit_code,
      duration_ms: r.duration_ms,
      expectations_met: r.expectations_met,
      ...(r.truncated && { truncated: r.truncated }),
      ...(r.timed_out && { timed_out: r.timed_out }),
      ...(truncateOutput && r.stdout && { stdout: r.stdout.length > MINIMAL_STDOUT_PREVIEW_CHARS ? r.stdout.slice(0, MINIMAL_STDOUT_PREVIEW_CHARS) + '...' : r.stdout }),
      ...(!truncateOutput && r.stdout !== undefined && { stdout: r.stdout }),
      ...(truncateOutput && r.stderr && { stderr: r.stderr.length > MINIMAL_STDERR_PREVIEW_CHARS ? r.stderr.slice(0, MINIMAL_STDERR_PREVIEW_CHARS) + '...' : r.stderr }),
      ...(!truncateOutput && r.stderr !== undefined && { stderr: r.stderr }),
      ...(r.stdout_overflow && { stdout_overflow: r.stdout_overflow }),
      ...(r.stderr_overflow && { stderr_overflow: r.stderr_overflow }),
      ...(r.expectation_failures && { expectation_failures: r.expectation_failures }),
      ...(r.exit_code !== 0 && { exit_interpretation: interpretExitCode(r.exit_code) }),
      ...(r.exit_code !== 0 && r.stderr && { detected_issue: detectIssue(r.stderr, r.stdout) }),
      ...(r.retries && { retries: r.retries }),
      ...(r.progress && r.progress.length > 0 && { progress: r.progress }),
      ...(r.progress_file && { progress_file: r.progress_file }),
      ...(r.until_status && { until_status: r.until_status }),
      ...(r.matched_line && { matched_line: r.matched_line }),
      ...(r.matched_at_ms !== undefined && { matched_at_ms: r.matched_at_ms }),
      ...(r.background && { background: r.background }),
      ...(context?.previousRun && {
        same_command_last_run: {
          exit_code: context.previousRun.exit_code,
          duration_ms: context.previousRun.duration_ms,
          timestamp: context.previousRun.timestamp,
        },
      }),
    };
  });
}

const execFileAsync = promisify(execFile);

/**
 * Get project root via git, falling back to process.cwd().
 * @returns Absolute path to project root
 */
async function getProjectRoot(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' });
    return stdout.trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Execute file operations sequentially.
 * copy and move are unrestricted. delete is restricted to the project root.
 * @param fileOps - Array of file operation specs
 * @returns Array of file operation results
 */
async function handleFileOps(fileOps: FileOpSpec[]): Promise<FileOpResult[]> {
  const results: FileOpResult[] = [];

  // Cache project root once for the entire batch (Issue 4: avoid spawning git per delete)
  let cachedProjectRoot: string | null = null;

  for (const op of fileOps) {
    const result: FileOpResult = { op: op.op, source: op.source, success: false };
    if (op.destination) result.destination = op.destination;

    try {
      const opts = op.options ?? {};

      if (op.op === 'copy') {
        if (!op.destination) {
          result.error = 'copy requires destination';
          results.push(result);
          continue;
        }
        // Issue 5: Validate source exists before attempting copy
        try {
          await fs.access(op.source);
        } catch {
          result.error = `Source does not exist: ${op.source}`;
          results.push(result);
          continue;
        }
        const recursive = opts.recursive ?? false;
        const overwrite = opts.overwrite ?? false;
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(op.destination), { recursive: true });
        await fs.cp(op.source, op.destination, { recursive, force: overwrite, errorOnExist: !overwrite });
        result.success = true;
      } else if (op.op === 'move') {
        if (!op.destination) {
          result.error = 'move requires destination';
          results.push(result);
          continue;
        }
        // Issue 5: Validate source exists before attempting move
        try {
          await fs.access(op.source);
        } catch {
          result.error = `Source does not exist: ${op.source}`;
          results.push(result);
          continue;
        }
        const overwrite = opts.overwrite ?? false;
        if (!overwrite) {
          try {
            await fs.access(op.destination);
            result.error = `Destination already exists: ${op.destination}. Set overwrite: true to override.`;
            results.push(result);
            continue;
          } catch {
            // Destination does not exist — OK to proceed
          }
        }
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(op.destination), { recursive: true });
        try {
          await fs.rename(op.source, op.destination);
        } catch (renameErr) {
          // Cross-device rename — fallback to copy + delete
          if ((renameErr as NodeJS.ErrnoException).code === 'EXDEV') {
            await fs.cp(op.source, op.destination, { recursive: true, force: overwrite });
            await fs.rm(op.source, { recursive: true, force: true });
          } else {
            throw renameErr;
          }
        }
        if (opts.update_imports) {
          // Stub: import path rewriting is a future enhancement
          result.affected_paths = [];
        }
        result.success = true;
      } else if (op.op === 'delete') {
        // Safety: restrict delete to project root (Issue 4: cache projectRoot)
        if (!cachedProjectRoot) cachedProjectRoot = await getProjectRoot();
        const projectRoot = cachedProjectRoot;
        const resolvedPath = path.resolve(op.source);
        const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
        // Issue 6: Resolve symlinks before boundary check to prevent symlink escapes
        const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
        // Issue 2: Only allow paths WITHIN root (never the root itself)
        if (!realPath.startsWith(rootWithSep)) {
          result.error = `Delete restricted to project root (${projectRoot}). Use Bash rm for paths outside project.`;
          results.push(result);
          continue;
        }
        const recursive = opts.recursive ?? false;
        const dryRun = opts.dry_run ?? false;
        if (dryRun) {
          // Collect what would be deleted without actually deleting
          result.dry_run = true;
          try {
            const stat = await fs.stat(resolvedPath);
            if (stat.isDirectory() && recursive) {
              // Issue 11: Remove unnecessary 'as string[]' cast
              const entries = await fs.readdir(resolvedPath, { recursive: true, encoding: 'utf-8' });
              result.affected_paths = entries.map(e => path.join(resolvedPath, e));
            } else {
              result.affected_paths = [resolvedPath];
            }
          } catch {
            result.affected_paths = [];
          }
          result.success = true;
        } else {
          // Issue 3: Only use force when recursive (to handle non-empty dirs), not for single files
          await fs.rm(resolvedPath, { recursive, force: recursive });
          result.success = true;
        }
      } else {
        // Issue 10: op is already typed as FileOpSpec, remove unnecessary cast
        result.error = `Unknown op: ${op.op}`;
      }
    } catch (err) {
      result.error = (err as Error).message;
    }

    results.push(result);
  }

  return results;
}

/**
 * Main handler for precision_exec tool.
 * Executes shell commands with child_process, supporting batch execution,
 * expectations, retries, background processes, and until patterns.
 * @param args - Tool input containing commands, environment, options, and output mode
 * @returns Tool result with command results and execution metadata
 */
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
        const { output } = processManager.getOutput(id, BG_OUTPUT_PREVIEW_LINES, true);  // peek=true to not consume output
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

  // Warn about deprecated stop_on_error parameter
  if (input.stop_on_error !== undefined && input.fail_fast === undefined) {
    warnDeprecatedParam('stop_on_error', 'fail_fast', 'precision_exec');
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

  // Execute file_ops FIRST (before commands)
  let fileOpResults: FileOpResult[] = [];
  if (input.file_ops && Array.isArray(input.file_ops) && input.file_ops.length > 0) {
    try {
      fileOpResults = await handleFileOps(input.file_ops);
    } catch (err) {
      return toCallToolResult(errorResult(`file_ops error: ${(err as Error).message}`, outputMode, getElapsed()));
    }
  }

  try {
    const hasCommands = input.commands && Array.isArray(input.commands) && input.commands.length > 0;
    const hasFileOps = fileOpResults.length > 0;
    if (!hasCommands && !hasFileOps) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_exec', 'commands', 'array of command objects'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }
    // If only file_ops with no commands, return file_ops results directly
    if (!hasCommands) {
      const succeeded = fileOpResults.filter(r => r.success).length;
      const failed = fileOpResults.filter(r => !r.success).length;
      const data: Record<string, unknown> = {
        file_ops: fileOpResults,
        summary: { total: fileOpResults.length, succeeded, failed },
      };
      const responseJson = JSON.stringify(data);
      data.tokens_used = estimateTokens(responseJson);
      return toCallToolResult(successResult(data, outputMode, getElapsed()));
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

      // Part J: Cannot use both until and background
      if (cmd.until && cmd.background) {
        return toCallToolResult(errorResult(
          'Cannot use both "until" and "background" on the same command. "until" promotes to background automatically on pattern match.',
          outputMode,
          getElapsed()
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
            exit_code: BG_RUNNING_EXIT_CODE, // Still running
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
        input.commands.map((cmd) => {
          const retryConfig = parseRetryConfig(cmd.retry);
          return executeWithRetry(
            cmd,
            retryConfig,
            globalEnv,
            globalWorkDir,
            globalTimeout,
            captureStdout,
            captureStderr,
            maxOutputLines,
            true
          );
        })
      );
    } else {
      results = [];
      for (const cmd of input.commands) {
        const retryConfig = parseRetryConfig(cmd.retry);
        const result = await executeWithRetry(
          cmd,
          retryConfig,
          globalEnv,
          globalWorkDir,
          globalTimeout,
          captureStdout,
          captureStderr,
          maxOutputLines,
          false
        );
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
            ...(r.retries && { retry_attempts: r.retries.attempts }),
            ...(r.until_status && { until_status: r.until_status }),
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
            ...(r.retries && { retry_attempts: r.retries.attempts }),
            ...(r.until_status && { until_status: r.until_status }),
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
          commands: mapCommandResults(results, commandsWithContext, true),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;

      case 'verbose':
        data = {
          commands: mapCommandResults(results, commandsWithContext, false),
          summary: {
            total: results.length,
            succeeded,
            failed,
            total_duration_ms: totalDuration,
          },
        };
        break;
    }

    // Include file_ops results in response if any were executed
    if (fileOpResults.length > 0) {
      data.file_ops = fileOpResults;
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
