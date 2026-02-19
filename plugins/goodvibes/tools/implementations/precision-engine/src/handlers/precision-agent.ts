/**
 * precision_agent handler - Spawn headless AI sessions across providers.
 * Phase 5I: Orchestration-level agent spawning from MCP tool layer.
 *
 * Supports:
 * - Multiple AI providers: claude, gemini, codex
 * - Background (non-blocking) and foreground (blocking) execution
 * - Context file injection into agent prompt
 * - Dossier integration (project context, memory, decisions)
 * - Structured response with agent_id, status, result
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { toCallToolResult, ToolHandler, successResult, errorResult } from '../utils/index.js';
import { processManager } from '../state/index.js';
import { DossierGenerator } from '../state/dossier.js';
import { ProjectIndex } from '../state/project-index.js';
import { PrecisionRuntime } from '../state/precision-runtime.js';
import { startTimer, logger } from '../logging.js';

const execFileAsync = promisify(execFile);

/** Default output mode for this tool. */
const DEFAULT_OUTPUT_MODE = 'standard' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default max turns for Claude headless sessions. */
const CLAUDE_DEFAULT_MAX_TURNS = 30;

/** Supported provider identifiers. */
const SUPPORTED_PROVIDERS = ['claude', 'gemini', 'codex'] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dossier inclusion options for agent context injection.
 */
export interface DossierOptions {
  /** Whether to include dossier context (default: true). */
  include?: boolean;
  /** Extra reminder strings appended to dossier reminders. */
  extra_reminders?: string[];
}

/**
 * Options for the precision_agent tool call.
 */
export interface AgentOptions {
  /** Provider to use: claude (default), gemini, or codex. */
  provider?: Provider;
  /** Model override — provider-specific (e.g. "sonnet", "opus", "gemini-2.5-pro"). */
  model?: string;
  /** Provider-specific CLI flags passed through as-is. */
  cli_flags?: Record<string, unknown>;
  /** Maximum cost USD — placeholder for future budget engine. */
  max_cost?: number | null;
  /** Maximum tokens — placeholder for future budget engine. */
  max_tokens?: number | null;
  /** Run in background (non-blocking). Defaults: main conversation = true, subagent = false. */
  background?: boolean;
  /** Dossier integration options. */
  dossier?: DossierOptions;
}

/**
 * Input specification for the precision_agent tool.
 */
export interface PrecisionAgentInput {
  /** Task prompt for the agent. Required. */
  prompt: string;
  /** File paths whose content is read and injected into the prompt. */
  context_files?: string[];
  /** Execution and provider options. */
  options?: AgentOptions;
}

/**
 * Response when agent is started in background mode.
 */
export interface AgentRunningResponse {
  agent_id: string;
  status: 'running';
  provider: Provider;
  model: string;
  started_at: string;
  process_id: string;
  log_file: string;
  hint: string;
}

/**
 * Response when agent completes (blocking mode).
 */
export interface AgentCompletedResponse {
  agent_id: string;
  status: 'completed' | 'failed';
  provider: Provider;
  model: string;
  result: string;
  tokens_used: number | null;
  cost: number | null;
  duration_ms: number;
  exit_code: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique agent ID.
 * Format: agent_{session_short}_{unique8hex}
 * @param sessionId - 8-char hex session identifier (from PrecisionRuntime)
 * @returns Unique agent ID string
 */
export function generateAgentId(sessionId?: string): string {
  const session = (sessionId ?? 'xxxxxxxx').slice(0, 8);
  const unique = crypto.randomBytes(4).toString('hex');
  return `agent_${session}_${unique}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context file injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read context files and format them for injection into the agent prompt.
 * Silently skips files that cannot be read, logging warnings for each failure.
 * @param files - Absolute or relative file paths to read
 * @returns Formatted context string, or empty string if no files are readable
 */
export async function readContextFiles(files: string[]): Promise<string> {
  if (!files || files.length === 0) return '';

  const parts: string[] = [];
  for (const filePath of files) {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
      const content = await fs.readFile(resolvedPath, 'utf-8');
      parts.push(`--- File: ${resolvedPath} ---\n${content}\n--- End File ---`);
    } catch (err) {
      logger.warn('[precision_agent] Failed to read context file', {
        file: filePath,
        err: String(err),
      });
    }
  }

  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the final prompt from task prompt, context file content, and optional dossier.
 * @param prompt - The original task prompt
 * @param contextContent - Pre-formatted context file content (may be empty)
 * @param dossierText - Pre-formatted dossier text (may be empty)
 * @returns The assembled final prompt string
 */
export function assembleFinalPrompt(
  prompt: string,
  contextContent: string,
  dossierText: string
): string {
  const parts: string[] = [];

  if (dossierText) {
    parts.push(dossierText);
  }

  if (contextContent) {
    parts.push('## Context Files\n\n' + contextContent);
  }

  parts.push('## Task\n\n' + prompt);

  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider command builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Claude CLI command and arguments array.
 * Requires --print for headless mode, --dangerously-skip-permissions to prevent stalling.
 * @param prompt - The assembled final prompt
 * @param model - Model override (e.g. "sonnet", "opus")
 * @param cliFlags - Additional CLI flags
 * @returns [executable, args[]] tuple
 */
export function buildClaudeCommand(
  prompt: string,
  model?: string,
  cliFlags?: Record<string, unknown>
): [string, string[]] {
  const args: string[] = [
    '--print',
    '--dangerously-skip-permissions',
    '--max-turns',
    String(CLAUDE_DEFAULT_MAX_TURNS),
  ];

  if (model) {
    args.push('--model', model);
  }

  if (cliFlags) {
    // Process cli_flags as key-value CLI arguments
    for (const [key, value] of Object.entries(cliFlags)) {
      if (value === true) {
        // Boolean flag (e.g. { "no-markdown": true } → --no-markdown)
        args.push(`--${key}`);
      } else if (value !== false && value !== null && value !== undefined) {
        // Key-value flag (e.g. { "disallowedTools": "Write,Edit" } → --disallowedTools "Write,Edit")
        args.push(`--${key}`, String(value));
      }
    }
  }

  args.push(prompt);

  return ['claude', args];
}

/**
 * Build the Gemini CLI command and arguments array.
 * Placeholder implementation — logs a warning and returns best-effort command.
 * @param prompt - The assembled final prompt
 * @param model - Model override
 * @param cliFlags - Additional CLI flags
 * @returns [executable, args[]] tuple
 */
export function buildGeminiCommand(
  prompt: string,
  model?: string,
  cliFlags?: Record<string, unknown>
): [string, string[]] {
  logger.warn('[precision_agent] Gemini provider is a TBD placeholder — command may not work correctly');

  const args: string[] = [];

  if (model) {
    args.push('--model', model);
  }

  if (cliFlags) {
    for (const [key, value] of Object.entries(cliFlags)) {
      if (value === true) {
        args.push(`--${key}`);
      } else if (value !== false && value !== null && value !== undefined) {
        args.push(`--${key}`, String(value));
      }
    }
  }

  args.push(prompt);

  return ['gemini', args];
}

/**
 * Build the Codex CLI command and arguments array.
 * Placeholder implementation — logs a warning and returns best-effort command.
 * @param prompt - The assembled final prompt
 * @param model - Model override
 * @param cliFlags - Additional CLI flags
 * @returns [executable, args[]] tuple
 */
export function buildCodexCommand(
  prompt: string,
  model?: string,
  cliFlags?: Record<string, unknown>
): [string, string[]] {
  logger.warn('[precision_agent] Codex provider is a TBD placeholder — command may not work correctly');

  const args: string[] = [];

  if (model) {
    args.push('--model', model);
  }

  if (cliFlags) {
    for (const [key, value] of Object.entries(cliFlags)) {
      if (value === true) {
        args.push(`--${key}`);
      } else if (value !== false && value !== null && value !== undefined) {
        args.push(`--${key}`, String(value));
      }
    }
  }

  args.push(prompt);

  return ['codex', args];
}

/**
 * Build the CLI command for the given provider.
 * @param provider - Provider identifier
 * @param prompt - The assembled final prompt
 * @param model - Optional model override
 * @param cliFlags - Optional passthrough CLI flags
 * @returns [executable, args[]] tuple
 */
export function buildCommand(
  provider: Provider,
  prompt: string,
  model?: string,
  cliFlags?: Record<string, unknown>
): [string, string[]] {
  switch (provider) {
    case 'claude':
      return buildClaudeCommand(prompt, model, cliFlags);
    case 'gemini':
      return buildGeminiCommand(prompt, model, cliFlags);
    case 'codex':
      return buildCodexCommand(prompt, model, cliFlags);
    default: {
      // TypeScript exhaustiveness guard — should never reach here
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default model resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the default model identifier for a provider.
 * @param provider - Provider to look up
 * @returns Default model string for display/logging
 */
export function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case 'claude':
      return 'default';
    case 'gemini':
      return 'default';
    case 'codex':
      return 'default';
    default: {
      const _exhaustive: never = provider;
      return `default`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dossier generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate dossier text for agent context injection.
 * Returns empty string on any failure (dossier is best-effort).
 * @param prompt - Original task prompt for memory keyword matching
 * @param extraReminders - Optional extra reminder strings
 * @returns Formatted dossier text or empty string
 */
async function generateDossierText(
  prompt: string,
  extraReminders?: string[]
): Promise<string> {
  try {
    const runtime = PrecisionRuntime.get();
    const index = runtime?.index ?? ProjectIndex.getInstance();
    const generator = runtime?.dossier ?? new DossierGenerator(index);

    const dossier = await generator.generate({
      task: {
        description: prompt,
        scope: '',
      },
      extra_reminders: extraReminders,
      include_memory: true,
      include_project: true,
    });

    return generator.formatForPrompt(dossier);
  } catch (err) {
    logger.warn('[precision_agent] Dossier generation failed — continuing without dossier', {
      err: String(err),
    });
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle precision_agent tool calls.
 *
 * Spawns a headless AI session with the configured provider, optionally
 * injecting context files and a dossier into the prompt. Supports both
 * background (non-blocking) and foreground (blocking) execution modes.
 */
export const handlePrecisionAgent: ToolHandler = async (args) => {
  const elapsed = startTimer();
  const input = args as PrecisionAgentInput;

  // ─── Input Validation ───────────────────────────────────────────────────

  if (!input.prompt || typeof input.prompt !== 'string' || input.prompt.trim() === '') {
    return toCallToolResult(
      errorResult("Missing required parameter 'prompt'", DEFAULT_OUTPUT_MODE, elapsed())
    );
  }

  const options = input.options ?? {};

  // Validate provider
  const provider: Provider = (options.provider ?? 'claude') as Provider;
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return toCallToolResult(
      errorResult(
        `Invalid provider '${provider}'. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`,
        DEFAULT_OUTPUT_MODE,
        elapsed()
      )
    );
  }

  const model = options.model ?? getDefaultModel(provider);
  const cliFlags = options.cli_flags;
  const dossierOptions = options.dossier ?? { include: true };
  const includeDossier = dossierOptions.include !== false; // default true

  // ─── Background default resolution ──────────────────────────────────────
  // Design rule: main conversation defaults to background: true,
  // subagent defaults to background: false.
  // We detect subagent context by checking if CLAUDE_SUBAGENT_MODE env var is set,
  // or fall back to explicit option or the safer default of false (blocking).
  let runInBackground: boolean;
  if (options.background !== undefined) {
    runInBackground = options.background;
  } else {
    // Heuristic: if running as a subagent, default to blocking
    const isSubagent =
      process.env.CLAUDE_SUBAGENT_MODE === 'true' ||
      process.env.PRECISION_ENGINE_SUBAGENT === 'true';
    runInBackground = !isSubagent;
  }

  // ─── Session/Agent ID ───────────────────────────────────────────────────
  const runtime = PrecisionRuntime.get();
  const sessionId = runtime?.getSessionId();
  const agentId = generateAgentId(sessionId);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // ─── Context Files ───────────────────────────────────────────────────────
  const contextContent = await readContextFiles(input.context_files ?? []);

  // ─── Dossier ─────────────────────────────────────────────────────────────
  let dossierText = '';
  if (includeDossier) {
    dossierText = await generateDossierText(
      input.prompt,
      dossierOptions.extra_reminders
    );
  }

  // ─── Final Prompt Assembly ────────────────────────────────────────────────
  const finalPrompt = assembleFinalPrompt(input.prompt, contextContent, dossierText);

  // ─── Build Provider Command ──────────────────────────────────────────────
  const [executable, cmdArgs] = buildCommand(provider, finalPrompt, options.model, cliFlags);

  logger.debug('[precision_agent] Spawning agent', {
    agentId,
    provider,
    model,
    background: runInBackground,
    promptLength: finalPrompt.length,
  });

  // ─── Execution ───────────────────────────────────────────────────────────

  if (runInBackground) {
    // Background mode: spawn via ProcessManager, return immediately
    try {
      const bgResult = processManager.spawn(executable, cmdArgs, {
        cwd: process.cwd(),
      });

      const response: AgentRunningResponse = {
        agent_id: agentId,
        status: 'running',
        provider,
        model,
        started_at: startedAt,
        process_id: bgResult.process_id,
        log_file: bgResult.log_file,
        hint: bgResult.hint,
      };

      return toCallToolResult(successResult(response, DEFAULT_OUTPUT_MODE, elapsed()));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('[precision_agent] Failed to spawn background agent', { agentId, err: errMsg });
      return toCallToolResult(
        errorResult(`Failed to spawn agent '${agentId}': ${errMsg}`, DEFAULT_OUTPUT_MODE, elapsed())
      );
    }
  } else {
    // Blocking mode: execute and wait for result
    try {
      const { stdout, stderr } = await execFileAsync(executable, cmdArgs, {
        cwd: process.cwd(),
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for long-running agents
        shell: false,
        timeout: 0, // No timeout — AI agents are non-deterministic
      });

      const duration = Date.now() - startTime;
      const resultText = stdout.trim();

      if (stderr && stderr.trim()) {
        logger.debug('[precision_agent] Agent stderr', { agentId, stderr: stderr.slice(0, 500) });
      }

      const response: AgentCompletedResponse = {
        agent_id: agentId,
        status: 'completed',
        provider,
        model,
        result: resultText,
        tokens_used: null, // Future: parse from stderr/stdout telemetry
        cost: null, // Future: budget engine
        duration_ms: duration,
        exit_code: 0,
      };

      return toCallToolResult(successResult(response, DEFAULT_OUTPUT_MODE, elapsed()));
    } catch (err: unknown) {
      const duration = Date.now() - startTime;

      // execFile rejects with an ExecFileException that includes stdout/stderr
      const execErr = err as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number | string;
      };

      const exitCode =
        typeof execErr.code === 'number' ? execErr.code : 1;
      const resultText = (execErr.stdout ?? '').trim();
      const errMsg = (execErr.stderr ?? execErr.message ?? String(err)).trim();

      logger.warn('[precision_agent] Agent exited with non-zero code', {
        agentId,
        exitCode,
        err: errMsg.slice(0, 500),
      });

      const response: AgentCompletedResponse = {
        agent_id: agentId,
        status: 'failed',
        provider,
        model,
        result: resultText || errMsg,
        tokens_used: null,
        cost: null,
        duration_ms: duration,
        exit_code: exitCode,
      };

      return toCallToolResult(successResult(response, DEFAULT_OUTPUT_MODE, elapsed()));
    }
  }
};
