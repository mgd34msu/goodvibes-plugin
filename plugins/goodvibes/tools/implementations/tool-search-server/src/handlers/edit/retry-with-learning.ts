/**
 * Retry with Learning Handler
 *
 * Retries failed commands/actions with LLM-powered error analysis.
 * Uses Claude CLI to analyze errors and suggest fixes.
 *
 * @module handlers/edit/retry-with-learning
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as crypto from 'crypto';

import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Fix strategy for how the tool should respond to errors.
 */
export type FixStrategy = 'analyze_only' | 'suggest_fix' | 'auto_fix';

/**
 * Arguments for the retry_with_learning tool.
 */
export interface RetryWithLearningArgs {
  /** Command to run */
  command: string;
  /** Maximum number of retry attempts (default: 3) */
  max_retries?: number;
  /** Additional context for LLM analysis */
  error_context?: string;
  /** Fix strategy: analyze_only, suggest_fix, or auto_fix (default: suggest_fix) */
  fix_strategy?: FixStrategy;
  /** Working directory for command execution */
  cwd?: string;
  /** Per-attempt timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Information about a single retry attempt.
 */
export interface AttemptInfo {
  /** Attempt number (1-based) */
  attempt: number;
  /** Command that was executed */
  command: string;
  /** Process exit code */
  exit_code: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** LLM analysis of the error (if applicable) */
  error_analysis?: string;
  /** LLM suggested fix (if applicable) */
  suggested_fix?: string;
  /** Duration of this attempt in milliseconds */
  duration_ms: number;
}

/**
 * Result from the retry_with_learning tool.
 */
export interface RetryWithLearningResult {
  /** Whether the command ultimately succeeded */
  success: boolean;
  /** Details of each attempt */
  attempts: AttemptInfo[];
  /** Total number of attempts made */
  total_attempts: number;
  /** Exit code of the final attempt */
  final_exit_code: number;
  /** Stdout from the final attempt */
  final_stdout: string;
  /** Stderr from the final attempt */
  final_stderr: string;
  /** Reason for giving up (if applicable) */
  gave_up_reason?: string;
}

/**
 * LLM analysis response structure.
 */
interface LLMAnalysis {
  analysis: string;
  suggested_fix: string;
  should_retry: boolean;
  modified_command?: string;
}

/**
 * Standard MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default max retries */
const DEFAULT_MAX_RETRIES = 3;

/** Default timeout per attempt (60 seconds) */
const DEFAULT_TIMEOUT = 60000;

/** Timeout for LLM analysis (30 seconds) */
const LLM_ANALYSIS_TIMEOUT = 30000;

/** Maximum output size to send to LLM (characters) */
const MAX_OUTPUT_SIZE = 4000;

/** Maximum previous attempts to include in LLM prompt */
const MAX_PREVIOUS_ATTEMPTS_IN_PROMPT = 3;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a hash of error content to detect repeated errors.
 */
function hashError(stderr: string, exitCode: number): string {
  const normalizedStderr = stderr
    .replace(/\d+/g, 'N')          // Normalize numbers
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .replace(/[a-f0-9]{8,}/gi, 'H') // Normalize hashes
    .trim()
    .slice(0, 500);                 // Limit size

  const content = `${exitCode}:${normalizedStderr}`;
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

/**
 * Truncate text to a maximum size, keeping the end (most relevant for errors).
 */
function truncateFromStart(text: string, maxSize: number): string {
  if (text.length <= maxSize) {
    return text;
  }
  return '...[truncated]...\n' + text.slice(-maxSize);
}

/**
 * Check if Claude CLI is available.
 */
async function isClaudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version'], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));

    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Analyze error with Claude CLI.
 */
async function analyzeWithLLM(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  errorContext: string | undefined,
  previousAttempts: AttemptInfo[],
  fixStrategy: FixStrategy
): Promise<LLMAnalysis | null> {
  // Build previous attempts summary
  const previousSummary = previousAttempts
    .slice(-MAX_PREVIOUS_ATTEMPTS_IN_PROMPT)
    .map((a) => `Attempt ${a.attempt}: exit code ${a.exit_code}, error: ${a.stderr.slice(0, 200)}`)
    .join('\n');

  const prompt = `Analyze this command failure and suggest a fix:

Command: ${command}
Exit code: ${exitCode}
Stdout: ${truncateFromStart(stdout, MAX_OUTPUT_SIZE / 2)}
Stderr: ${truncateFromStart(stderr, MAX_OUTPUT_SIZE / 2)}

${errorContext ? `Additional context: ${errorContext}` : ''}

${previousSummary ? `Previous attempts:\n${previousSummary}` : 'This is the first attempt.'}

Strategy: ${fixStrategy === 'analyze_only' ? 'Only analyze the error, do not suggest fixes' : fixStrategy === 'auto_fix' ? 'Suggest a modified command if possible' : 'Analyze and suggest what to fix'}

Provide your response as JSON with this exact structure:
{
  "analysis": "Brief explanation of what went wrong",
  "suggested_fix": "What the user should do to fix this",
  "should_retry": true or false,
  "modified_command": "Only if the command should change and strategy is auto_fix"
}

Respond ONLY with the JSON object, no markdown code blocks or other text.`;

  return new Promise((resolve) => {
    const proc = spawn('claude', ['--print', '-p', '-'], {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout_data = '';
    let stderr_data = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout_data += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr_data += data.toString();
    });

    proc.on('error', (err) => {
      console.error('Claude CLI error:', err.message);
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('Claude CLI exited with code:', code, 'stderr:', stderr_data);
        resolve(null);
        return;
      }

      try {
        // Try to extract JSON from the response
        const jsonMatch = stdout_data.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('No JSON found in Claude response');
          resolve(null);
          return;
        }

        const parsed = JSON.parse(jsonMatch[0]) as LLMAnalysis;

        // Validate required fields
        if (
          typeof parsed.analysis !== 'string' ||
          typeof parsed.suggested_fix !== 'string' ||
          typeof parsed.should_retry !== 'boolean'
        ) {
          console.error('Invalid LLM response structure');
          resolve(null);
          return;
        }

        resolve(parsed);
      } catch (err) {
        console.error('Failed to parse Claude response:', err);
        resolve(null);
      }
    });

    // Write prompt to stdin
    proc.stdin?.write(prompt);
    proc.stdin?.end();

    // Timeout
    setTimeout(() => {
      proc.kill();
      resolve(null);
    }, LLM_ANALYSIS_TIMEOUT);
  });
}

/**
 * Execute a command and capture output.
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    // Determine shell based on platform
    const isWindows = process.platform === 'win32';

    const spawnOptions: SpawnOptions = {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0', // Disable colors for cleaner output parsing
      },
    };

    const proc = spawn(command, [], spawnOptions);

    let stdout = '';
    let stderr = '';
    let killed = false;

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Timeout handler
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 1000);
    }, timeout);

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
        durationMs: Date.now() - startTime,
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (killed) {
        stderr += `\n[Process killed after ${timeout}ms timeout]`;
      }

      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Create a success response.
 */
function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error response.
 */
function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the retry_with_learning MCP tool call.
 *
 * Executes a command and retries with LLM-powered error analysis if it fails.
 * Uses Claude CLI to analyze errors and suggest fixes.
 *
 * @param args - The retry_with_learning tool arguments
 * @returns MCP tool response with execution results and analysis
 *
 * @example
 * ```typescript
 * const result = await handleRetryWithLearning({
 *   command: 'npm run build',
 *   max_retries: 3,
 *   error_context: 'Building a React app',
 *   fix_strategy: 'suggest_fix'
 * });
 * ```
 */
export async function handleRetryWithLearning(
  args: RetryWithLearningArgs
): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.command || typeof args.command !== 'string') {
    return createErrorResponse('Missing required argument: command');
  }

  const command = args.command.trim();
  if (!command) {
    return createErrorResponse('Command cannot be empty');
  }

  // Parse arguments with defaults
  const maxRetries = Math.min(Math.max(args.max_retries ?? DEFAULT_MAX_RETRIES, 1), 10);
  const timeout = Math.min(Math.max(args.timeout ?? DEFAULT_TIMEOUT, 1000), 300000);
  const cwd = args.cwd || PROJECT_ROOT;
  const fixStrategy: FixStrategy = args.fix_strategy ?? 'suggest_fix';
  const errorContext = args.error_context;

  // Check if Claude CLI is available (only needed for non-analyze_only)
  const claudeAvailable = await isClaudeCliAvailable();
  if (!claudeAvailable && fixStrategy !== 'analyze_only') {
    console.warn('Claude CLI not available. Error analysis will be limited.');
  }

  const attempts: AttemptInfo[] = [];
  const seenErrorHashes = new Set<string>();
  let currentCommand = command;
  let gaveUpReason: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Execute the command
    const result = await executeCommand(currentCommand, cwd, timeout);

    const attemptInfo: AttemptInfo = {
      attempt,
      command: currentCommand,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.durationMs,
    };

    // Success - command completed with exit code 0
    if (result.exitCode === 0) {
      attempts.push(attemptInfo);

      return createSuccessResponse<RetryWithLearningResult>({
        success: true,
        attempts,
        total_attempts: attempt,
        final_exit_code: 0,
        final_stdout: result.stdout,
        final_stderr: result.stderr,
      });
    }

    // Check for repeated error
    const errorHash = hashError(result.stderr, result.exitCode);
    if (seenErrorHashes.has(errorHash)) {
      gaveUpReason = 'Same error occurred multiple times - giving up to prevent infinite loop';
      attemptInfo.error_analysis = gaveUpReason;
      attempts.push(attemptInfo);
      break;
    }
    seenErrorHashes.add(errorHash);

    // Analyze error with LLM if available
    if (claudeAvailable) {
      const analysis = await analyzeWithLLM(
        currentCommand,
        result.exitCode,
        result.stdout,
        result.stderr,
        errorContext,
        attempts,
        fixStrategy
      );

      if (analysis) {
        attemptInfo.error_analysis = analysis.analysis;
        attemptInfo.suggested_fix = analysis.suggested_fix;

        // Check if we should give up
        if (!analysis.should_retry) {
          gaveUpReason = `LLM recommends not retrying: ${analysis.analysis}`;
          attempts.push(attemptInfo);
          break;
        }

        // Apply modified command if auto_fix and provided
        if (fixStrategy === 'auto_fix' && analysis.modified_command) {
          currentCommand = analysis.modified_command;
        }
      } else {
        attemptInfo.error_analysis = 'LLM analysis failed or timed out';
      }
    } else {
      attemptInfo.error_analysis = 'Claude CLI not available for error analysis';
    }

    attempts.push(attemptInfo);

    // Check if we've reached max retries
    if (attempt >= maxRetries) {
      gaveUpReason = `Reached maximum retry limit (${maxRetries} attempts)`;
      break;
    }
  }

  // All retries exhausted or gave up
  const lastAttempt = attempts[attempts.length - 1];

  return createSuccessResponse<RetryWithLearningResult>({
    success: false,
    attempts,
    total_attempts: attempts.length,
    final_exit_code: lastAttempt?.exit_code ?? 1,
    final_stdout: lastAttempt?.stdout ?? '',
    final_stderr: lastAttempt?.stderr ?? '',
    gave_up_reason: gaveUpReason,
  });
}
