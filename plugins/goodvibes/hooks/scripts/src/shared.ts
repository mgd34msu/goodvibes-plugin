/**
 * Shared utilities for GoodVibes hook scripts
 *
 * This file maintains backwards compatibility by re-exporting from
 * the split modules in src/shared/
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// Re-export from split modules for backwards compatibility
export type { HookInput, HookResponse, HookSpecificOutput } from './shared/hook-io.js';
export { readHookInput, allowTool, blockTool, respond } from './shared/hook-io.js';
export { debug, logError } from './shared/logging.js';

// Import for internal use
import { debug as debugLog } from './shared/logging.js';
export type { SharedConfig } from './shared/config.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './shared/config.js';
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './shared/gitignore.js';

// =============================================================================
// Type Guards
// =============================================================================

/** Type guard for exec errors with stdout/stderr buffers */
function isExecError(error: unknown): error is { stdout?: Buffer; stderr?: Buffer; message?: string } {
  return error !== null && typeof error === 'object';
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum length for transcript summary text. */
const TRANSCRIPT_SUMMARY_MAX_LENGTH = 500;

/** Package manager lockfiles for detection. */
export const LOCKFILES = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb'] as const;

// Environment - using official Claude Code environment variable names
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');

// =============================================================================
// Analytics Types
// =============================================================================

/** Represents a single tool usage event for analytics. */
export interface ToolUsage {
  tool: string;
  timestamp: string;
  duration_ms?: number;
  success: boolean;
  args?: Record<string, unknown>;
}

/** Represents a tool failure event for analytics. */
export interface ToolFailure {
  tool: string;
  error: string;
  timestamp: string;
}

/** Represents a subagent spawn event for analytics. */
export interface SubagentSpawn {
  type: string;
  task: string;
  started_at: string;
  completed_at?: string;
  success?: boolean;
}

/** Aggregated analytics for a session. */
export interface SessionAnalytics {
  session_id: string;
  started_at: string;
  ended_at?: string;
  tool_usage: ToolUsage[];
  tool_failures?: ToolFailure[];
  skills_recommended: string[];
  subagents_spawned?: SubagentSpawn[];
  validations_run: number;
  issues_found: number;
  detected_stack?: Record<string, unknown>;
}

// =============================================================================
// Cache and Analytics Management
// =============================================================================

/**
 * Ensures the cache directory exists for storing analytics and temporary data.
 *
 * Creates the .cache directory under PLUGIN_ROOT if it doesn't exist.
 * This directory is used for session analytics and other cached data.
 *
 * @example
 * ensureCacheDir();
 * // Now safe to write to CACHE_DIR
 * fs.writeFileSync(path.join(CACHE_DIR, 'data.json'), JSON.stringify(data));
 */
export function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Loads the current session analytics from the cache file.
 *
 * Reads and parses the analytics.json file from the cache directory.
 * Returns null if the file doesn't exist or contains invalid JSON.
 *
 * @returns The parsed SessionAnalytics object, or null if unavailable
 *
 * @example
 * const analytics = loadAnalytics();
 * if (analytics) {
 *   console.log(`Session: ${analytics.session_id}`);
 *   console.log(`Tools used: ${analytics.tool_usage.length}`);
 * }
 */
export function loadAnalytics(): SessionAnalytics | null {
  ensureCacheDir();
  if (fs.existsSync(ANALYTICS_FILE)) {
    try {
      const content = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      debugLog('loadAnalytics failed', { error: String(error) });
      return null;
    }
  }
  return null;
}

/**
 * Saves session analytics to the cache file.
 *
 * Writes the analytics object to analytics.json in the cache directory.
 * Creates the cache directory if it doesn't exist.
 *
 * @param analytics - The SessionAnalytics object to persist
 *
 * @example
 * const analytics: SessionAnalytics = {
 *   session_id: 'session_123',
 *   started_at: new Date().toISOString(),
 *   tool_usage: [],
 *   skills_recommended: [],
 *   validations_run: 0,
 *   issues_found: 0,
 * };
 * saveAnalytics(analytics);
 */
export function saveAnalytics(analytics: SessionAnalytics): void {
  ensureCacheDir();
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}

/**
 * Checks if a command-line tool is available on the system.
 *
 * Uses platform-specific commands to check for availability:
 * - Windows: `where <cmd>`
 * - Unix/Mac: `which <cmd>`
 *
 * @param cmd - The command name to check (e.g., 'git', 'npm', 'node')
 * @returns True if the command is available in PATH, false otherwise
 *
 * @example
 * if (commandExists('git')) {
 *   console.log('Git is available');
 * }
 *
 * @example
 * // Check before running a tool
 * if (!commandExists('pnpm')) {
 *   console.log('pnpm not found, falling back to npm');
 * }
 */
export function commandExists(cmd: string): boolean {
  try {
    // Use 'where' on Windows, 'which' on Unix/Mac
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch (error) {
    debugLog(`Command check failed for ${cmd}: ${error}`);
    return false;
  }
}

/**
 * Checks if a file exists relative to the project root.
 *
 * Resolves the path relative to PROJECT_ROOT and checks for existence.
 * This is a synchronous operation.
 *
 * @param filePath - The file path relative to PROJECT_ROOT
 * @returns True if the file exists, false otherwise
 *
 * @example
 * if (fileExists('package.json')) {
 *   console.log('This is a Node.js project');
 * }
 *
 * @example
 * if (fileExists('tsconfig.json')) {
 *   console.log('TypeScript is configured');
 * }
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(PROJECT_ROOT, filePath));
}

/**
 * Validates that all required registry files exist in the plugin.
 *
 * Checks for the presence of the three core registry files:
 * - skills/_registry.yaml
 * - agents/_registry.yaml
 * - tools/_registry.yaml
 *
 * @returns An object with `valid` (true if all exist) and `missing` (array of missing paths)
 *
 * @example
 * const result = validateRegistries();
 * if (!result.valid) {
 *   console.error('Missing registries:', result.missing.join(', '));
 * }
 */
export function validateRegistries(): { valid: boolean; missing: string[] } {
  const registries = [
    'skills/_registry.yaml',
    'agents/_registry.yaml',
    'tools/_registry.yaml',
  ];

  const missing: string[] = [];
  for (const reg of registries) {
    if (!fs.existsSync(path.join(PLUGIN_ROOT, reg))) {
      missing.push(reg);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Gets the current session ID or creates a new one.
 *
 * Attempts to load an existing session ID from analytics. If no session
 * exists, generates a new ID using the current timestamp.
 *
 * @returns The session ID string (format: 'session_<timestamp>')
 *
 * @example
 * const sessionId = getSessionId();
 * console.log(sessionId); // 'session_1705234567890'
 */
export function getSessionId(): string {
  const analytics = loadAnalytics();
  if (analytics?.session_id) {
    return analytics.session_id;
  }
  return `session_${Date.now()}`;
}

/**
 * Logs a tool usage event to the session analytics.
 *
 * Records information about a tool invocation including the tool name,
 * timestamp, duration, and success status. Creates a new analytics
 * session if one doesn't exist.
 *
 * @param usage - The ToolUsage object describing the tool invocation
 *
 * @example
 * logToolUsage({
 *   tool: 'Bash',
 *   timestamp: new Date().toISOString(),
 *   duration_ms: 1500,
 *   success: true,
 *   args: { command: 'npm test' },
 * });
 */
export function logToolUsage(usage: ToolUsage): void {
  const analytics = loadAnalytics() || {
    session_id: getSessionId(),
    started_at: new Date().toISOString(),
    tool_usage: [],
    skills_recommended: [],
    validations_run: 0,
    issues_found: 0,
  };

  analytics.tool_usage.push(usage);
  saveAnalytics(analytics);
}

// =============================================================================
// Lazy .goodvibes Directory Creation
// =============================================================================

/**
 * Ensures the .goodvibes directory exists with all required subdirectories.
 *
 * Creates the following directory structure if it doesn't exist:
 * - .goodvibes/
 *   - memory/   - For persistent memory storage
 *   - state/    - For session state files
 *   - logs/     - For hook execution logs
 *   - telemetry/ - For telemetry data
 *
 * Also ensures the project's .gitignore contains security-critical entries.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise that resolves to the path of the .goodvibes directory
 *
 * @example
 * const goodvibesDir = await ensureGoodVibesDir('/path/to/project');
 * console.log(goodvibesDir); // '/path/to/project/.goodvibes'
 *
 * // Now safe to write to subdirectories
 * fs.writeFileSync(path.join(goodvibesDir, 'state', 'session.json'), data);
 */
export async function ensureGoodVibesDir(cwd: string): Promise<string> {
  const goodvibesDir = path.join(cwd, '.goodvibes');

  if (!fs.existsSync(goodvibesDir)) {
    fs.mkdirSync(goodvibesDir, { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'memory'), { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'state'), { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'telemetry'), { recursive: true });

    // Add security-hardened gitignore
    const { ensureSecureGitignore } = await import('./shared/gitignore.js');
    await ensureSecureGitignore(cwd);
  }

  return goodvibesDir;
}

// =============================================================================
// Master Keyword List for Telemetry
// =============================================================================

// Import from consolidated keywords module
export {
  KEYWORD_CATEGORIES,
  ALL_KEYWORDS,
  extractStackKeywords as extractKeywords,
} from './shared/keywords.js';

// =============================================================================
// Transcript Parsing Utility
// =============================================================================

/** Parsed transcript data containing tools used and files modified. */
export interface TranscriptData {
  toolsUsed: string[];
  filesModified: string[];
  summary: string;
}

/**
 * Parses a Claude Code transcript file to extract tools used and files modified.
 *
 * Reads the JSONL transcript file and extracts:
 * - All unique tool names that were used
 * - All file paths that were modified (via Write or Edit tools)
 * - A summary from the last assistant message (truncated to 500 chars)
 *
 * @param transcriptPath - The absolute path to the transcript JSONL file
 * @returns A TranscriptData object with toolsUsed, filesModified, and summary
 *
 * @example
 * const data = parseTranscript('/path/to/transcript.jsonl');
 * console.log('Tools:', data.toolsUsed); // ['Bash', 'Edit', 'Write']
 * console.log('Files:', data.filesModified); // ['/src/index.ts']
 * console.log('Summary:', data.summary); // 'I have completed the changes...'
 */
export function parseTranscript(transcriptPath: string): TranscriptData {
  const toolsUsed = new Set<string>();
  const filesModified: string[] = [];
  let lastAssistantMessage = '';

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const event = JSON.parse(line);

        if (event.type === 'tool_use') {
          toolsUsed.add(event.name);
          if (['Write', 'Edit'].includes(event.name) && event.input?.file_path) {
            filesModified.push(event.input.file_path);
          }
        }

        if (event.role === 'assistant' && event.content) {
          lastAssistantMessage = typeof event.content === 'string'
            ? event.content
            : JSON.stringify(event.content);
        }
      } catch (error) {
        debugLog('parseTranscript line parse failed', { error: String(error) });
      }
    }
  } catch (error) {
    debugLog('parseTranscript read failed', { error: String(error) });
  }

  return {
    toolsUsed: Array.from(toolsUsed),
    filesModified: [...new Set(filesModified)],
    summary: lastAssistantMessage.slice(0, TRANSCRIPT_SUMMARY_MAX_LENGTH),
  };
}

/**
 * Extracts readable error output from an execSync error.
 *
 * When execSync fails, the error object may contain stdout/stderr buffers.
 * This function extracts the most useful error message from those buffers.
 *
 * @param error - The error thrown by execSync (typically has stdout/stderr properties)
 * @returns A string containing the error output (stdout, stderr, or message)
 *
 * @example
 * try {
 *   execSync('npm test');
 * } catch (error) {
 *   const output = extractErrorOutput(error);
 *   console.log('Test failed:', output);
 * }
 */
export function extractErrorOutput(error: unknown): string {
  if (isExecError(error)) {
    return error.stdout?.toString() || error.stderr?.toString() || error.message || 'Unknown error';
  }
  return String(error);
}

/**
 * Check if a file exists (async version with absolute path support).
 *
 * This is the shared async implementation used by context modules
 * (env-checker, health-checker, stack-detector) to avoid duplicate code.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to true if file exists
 */
export async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch (error) {
    debugLog('fileExistsAsync failed', { error: String(error) });
    return false;
  }
}
