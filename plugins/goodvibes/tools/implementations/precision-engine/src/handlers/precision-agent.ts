/**
 * precision_agent handler - Spawn headless AI sessions across providers.
 * Phase 5I: Orchestration-level agent spawning from MCP tool layer.
 *
 * Supports:
 * - Multiple AI providers: claude, gemini, codex
 * - Background-only (non-blocking) execution via ProcessManager
 * - Context file injection into agent prompt
 * - Dossier integration (project context, memory, decisions)
 * - Structured response with agent_id, status, process_id
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { toCallToolResult, ToolHandler, successResult, errorResult } from '../utils/index.js';
import { processManager } from '../state/index.js';
import { DossierGenerator } from '../state/dossier.js';
import { ProjectIndex } from '../state/project-index.js';
import { PrecisionRuntime } from '../state/precision-runtime.js';
import { startTimer, logger } from '../logging.js';

/**
 * Default output mode for this tool.
 * Note: This intentionally does NOT use the global verbosity system because agent
 * output is AI-generated text, not structured file data. Standard is always appropriate.
 */
const DEFAULT_OUTPUT_MODE = 'standard' as const;

/** Delay in ms before cleaning up the prompt temp file after background spawn.
 * Shell reads the redirect file immediately on startup; 2 seconds is generous. */
const STDIN_FILE_CLEANUP_DELAY_MS = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default max turns for Claude headless sessions. */
const CLAUDE_DEFAULT_MAX_TURNS = 30;

/** Supported provider identifiers. */
const SUPPORTED_PROVIDERS = ['claude', 'gemini', 'codex'] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

/**
 * CLI flag keys that must never be overridden by user-supplied cli_flags.
 * These control security-critical behaviour or headless operation.
 */
const FORBIDDEN_CLI_FLAGS = new Set([
  'model',
  'm', // short alias for --model
  'dangerously-skip-permissions',
  'print',
  'p', // short alias for --print
  'stdin',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dossier inclusion options for agent context injection.
 */
export interface AgentDossierOptions {
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
  /** Pass --dangerously-skip-permissions to the spawned CLI (claude only). Default false. */
  skip_permissions?: boolean;
  /** Maximum cost USD — placeholder for future budget engine. */
  max_cost?: number | null;
  /** Maximum tokens — placeholder for future budget engine. */
  max_tokens?: number | null;
  /** Dossier integration options. */
  dossier?: AgentDossierOptions;
}

/**
 * Input specification for the precision_agent tool.
 */
export interface PrecisionAgentInput {
  /** Task prompt for the agent. Required. */
  prompt: string;
  /** File paths whose content is read and injected into the prompt. */
  context_files?: string[];
  /** File/directory paths that define the task scope. Passed to dossier generation for memory relevance matching. */
  scope?: string[];
  /** Specific criteria the task must meet. Passed to dossier generation for agent focus. */
  acceptance_criteria?: string[];
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
 * Uses Promise.allSettled for parallel reads with per-file error isolation.
 * Silently skips files that cannot be read, logging warnings for each failure.
 * @param files - Absolute or relative file paths to read
 * @returns Formatted context string, or empty string if no files are readable
 */
export async function readContextFiles(files: string[]): Promise<string> {
  if (!files || files.length === 0) return '';

  const resolvedPaths = files.map((filePath) =>
    path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  );

  const results = await Promise.allSettled(
    resolvedPaths.map((resolvedPath) => fs.readFile(resolvedPath, 'utf-8'))
  );

  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const resolvedPath = resolvedPaths[i];
    if (result.status === 'fulfilled') {
      parts.push(`--- File: ${resolvedPath} ---\n${result.value}\n--- End File ---`);
    } else {
      logger.warn('[precision_agent] Failed to read context file', {
        file: files[i],
        err: String(result.reason),
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
 * Filter user-supplied cli_flags, removing any keys that are in the forbidden
 * list (security-critical flags that must not be user-overridden).
 * @param cliFlags - Raw user-supplied flags
 * @returns Filtered copy of the flags
 */
function filterCliFlags(cliFlags: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cliFlags)) {
    if (FORBIDDEN_CLI_FLAGS.has(key)) {
      logger.warn('[precision_agent] Ignoring forbidden cli_flag', { key });
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Append CLI flags to an args array. Shared helper for all provider command builders.
 * Boolean values become --flag, other truthy values become --key value.
 * @param args - Mutable args array to append to
 * @param cliFlags - Filtered CLI flags to append
 */
function appendCliFlags(args: string[], cliFlags: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(cliFlags)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value !== false && value !== null && value !== undefined) {
      args.push(`--${key}`, String(value));
    }
  }
}

/**
 * Build a generic CLI command for providers that follow the same pattern.
 * Prompt is NOT included in the args — it must be passed via stdin.
 * @param executable - CLI executable name
 * @param model - Model override
 * @param cliFlags - Additional (filtered) CLI flags
 * @param baseArgs - Provider-specific base args (e.g. ['--print'] for Claude)
 * @returns [executable, args[]] tuple (prompt passed separately via stdin)
 */
export function buildGenericCommand(
  executable: string,
  model: string | undefined,
  cliFlags: Record<string, unknown> | undefined,
  baseArgs: string[]
): [string, string[]] {
  const args: string[] = [...baseArgs];

  if (model) {
    args.push('--model', model);
  }

  if (cliFlags) {
    appendCliFlags(args, filterCliFlags(cliFlags));
  }

  return [executable, args];
}

/**
 * Build the Claude CLI command and arguments array.
 * Requires --print for headless mode. --dangerously-skip-permissions is added
 * only when skipPermissions is true (consent default: false).
 * Prompt is NOT included in args — pass via stdin to avoid ARG_MAX limits.
 * @param model - Model override (e.g. "sonnet", "opus")
 * @param cliFlags - Additional CLI flags
 * @param skipPermissions - Pass --dangerously-skip-permissions (default false)
 * @returns [executable, args[]] tuple
 */
export function buildClaudeCommand(
  model?: string,
  cliFlags?: Record<string, unknown>,
  skipPermissions = false
): [string, string[]] {
  const baseArgs = ['--print'];
  if (skipPermissions) {
    baseArgs.push('--dangerously-skip-permissions');
  }
  baseArgs.push('--max-turns', String(CLAUDE_DEFAULT_MAX_TURNS));
  return buildGenericCommand('claude', model, cliFlags, baseArgs);
}

/**
 * Build the Gemini CLI command and arguments array.
 * Placeholder implementation — logs a warning and returns best-effort command.
 * Prompt is NOT included in args — pass via stdin to avoid ARG_MAX limits.
 * @param model - Model override
 * @param cliFlags - Additional CLI flags
 * @returns [executable, args[]] tuple
 */
export function buildGeminiCommand(
  model?: string,
  cliFlags?: Record<string, unknown>
): [string, string[]] {
  logger.warn('[precision_agent] Gemini provider is a TBD placeholder — command may not work correctly');
  return buildGenericCommand('gemini', model, cliFlags, []);
}

/**
 * Build the Codex CLI command and arguments array.
 * Placeholder implementation — logs a warning and returns best-effort command.
 * Prompt is NOT included in args — pass via stdin to avoid ARG_MAX limits.
 * @param model - Model override
 * @param cliFlags - Additional CLI flags
 * @returns [executable, args[]] tuple
 */
export function buildCodexCommand(
  model?: string,
  cliFlags?: Record<string, unknown>
): [string, string[]] {
  logger.warn('[precision_agent] Codex provider is a TBD placeholder — command may not work correctly');
  return buildGenericCommand('codex', model, cliFlags, []);
}

/**
 * Build the CLI command for the given provider.
 * Prompt is NOT included in args — it must be passed via stdin to avoid ARG_MAX limits.
 * @param provider - Provider identifier
 * @param model - Optional model override
 * @param cliFlags - Optional passthrough CLI flags
 * @param skipPermissions - Pass --dangerously-skip-permissions (claude only, default false)
 * @returns [executable, args[]] tuple
 */
export function buildCommand(
  provider: Provider,
  model?: string,
  cliFlags?: Record<string, unknown>,
  skipPermissions = false
): [string, string[]] {
  switch (provider) {
    case 'claude':
      return buildClaudeCommand(model, cliFlags, skipPermissions);
    case 'gemini':
      return buildGeminiCommand(model, cliFlags);
    case 'codex':
      return buildCodexCommand(model, cliFlags);
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
 * Returns the actual model name so it can be passed explicitly to the CLI.
 * @param provider - Provider to look up
 * @returns Default model string
 */
export function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case 'claude':
      return 'sonnet';
    case 'gemini':
      return 'gemini-2.5-pro';
    case 'codex':
      return 'codex-mini';
    default: {
      const _exhaustive: never = provider;
      return 'sonnet';
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
  extraReminders?: string[],
  scope?: string[],
  acceptanceCriteria?: string[]
): Promise<string> {
  try {
    const runtime = PrecisionRuntime.get();
    const index = runtime?.index ?? ProjectIndex.getInstance();
    const generator = runtime?.dossier ?? new DossierGenerator(index);

    const dossier = await generator.generate({
      task: {
        description: prompt,
        scope: scope ?? [],
        acceptance_criteria: acceptanceCriteria ?? [],
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
 * injecting context files and a dossier into the prompt. Always runs in
 * background (non-blocking) mode — returns immediately with agent_id.
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

  // ─── Session/Agent ID ───────────────────────────────────────────────────
  const runtime = PrecisionRuntime.get();
  const sessionId = runtime?.getSessionId();
  const agentId = generateAgentId(sessionId);
  const startedAt = new Date().toISOString();

  // ─── Context Files ───────────────────────────────────────────────────────
  const contextContent = await readContextFiles(input.context_files ?? []);

  // ─── Dossier ─────────────────────────────────────────────────────────────
  let dossierText = '';
  if (includeDossier) {
    dossierText = await generateDossierText(
      input.prompt,
      dossierOptions.extra_reminders,
      input.scope,
      input.acceptance_criteria
    );
  }

  // ─── Final Prompt Assembly ────────────────────────────────────────────────
  const finalPrompt = assembleFinalPrompt(input.prompt, contextContent, dossierText);

  // ─── Build Provider Command ──────────────────────────────────────────────
  // Pass the resolved `model` (not raw options.model) so --model is always set explicitly.
  // Prompt is passed via stdin to avoid ARG_MAX OS limits on large prompts.
  const [executable, cmdArgs] = buildCommand(provider, model, cliFlags, options.skip_permissions === true);

  logger.debug('[precision_agent] Spawning agent', {
    agentId,
    provider,
    model,
    promptLength: finalPrompt.length,
  });

  // ─── Execution (always background) ───────────────────────────────────────

  // Build a clean environment without CLAUDECODE vars to prevent nested-session
  // detection errors when spawning child Claude CLI processes.
  const cleanEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  delete cleanEnv['CLAUDECODE'];
  delete cleanEnv['CLAUDE_PARENT_SESSION_ID'];

  // Spawn via ProcessManager and return immediately.
  // Prompt is written to a temp file and passed via shell stdin redirect
  // to avoid ARG_MAX OS limits on large prompts.
  let promptTmpFile: string | null = null;
  try {
    promptTmpFile = path.join(os.tmpdir(), `precision-agent-${agentId}.txt`);
    await fs.writeFile(promptTmpFile, finalPrompt, 'utf-8');

    const bgResult = processManager.spawn(executable, cmdArgs, {
      cwd: process.cwd(),
      stdinFile: promptTmpFile,
      env: cleanEnv,
    });

    // Schedule temp file cleanup after spawn succeeds.
    // The shell reads the redirect file immediately on startup, so a short
    // delay is more than sufficient before cleanup.
    const tmpFileToClean = promptTmpFile;
    setTimeout(() => {
      fs.unlink(tmpFileToClean).catch(() => {});
    }, STDIN_FILE_CLEANUP_DELAY_MS);

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
    // Clean up temp file on failure
    if (promptTmpFile) {
      await fs.unlink(promptTmpFile).catch(() => {});
    }
    return toCallToolResult(
      errorResult(`Failed to spawn agent '${agentId}': ${errMsg}`, DEFAULT_OUTPUT_MODE, elapsed())
    );
  }
};
