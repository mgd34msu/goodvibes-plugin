/**
 * Shared utilities for GoodVibes hook scripts
 *
 * This file maintains backwards compatibility by re-exporting from
 * the split modules in src/shared/
 */
export type { HookInput, HookResponse, HookSpecificOutput } from './shared/hook-io.js';
export { readHookInput, allowTool, blockTool, respond } from './shared/hook-io.js';
export { debug, logError } from './shared/logging.js';
export type { SharedConfig } from './shared/config.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './shared/config.js';
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './shared/gitignore.js';
/** Package manager lockfiles for detection. */
export declare const LOCKFILES: readonly ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb"];
export declare const PLUGIN_ROOT: string;
export declare const PROJECT_ROOT: string;
export declare const CACHE_DIR: string;
export declare const ANALYTICS_FILE: string;
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
export declare function ensureCacheDir(): void;
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
export declare function loadAnalytics(): SessionAnalytics | null;
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
export declare function saveAnalytics(analytics: SessionAnalytics): void;
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
export declare function commandExists(cmd: string): boolean;
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
export declare function fileExists(filePath: string): boolean;
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
export declare function validateRegistries(): {
    valid: boolean;
    missing: string[];
};
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
export declare function getSessionId(): string;
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
export declare function logToolUsage(usage: ToolUsage): void;
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
export declare function ensureGoodVibesDir(cwd: string): Promise<string>;
export { KEYWORD_CATEGORIES, ALL_KEYWORDS, extractStackKeywords as extractKeywords, } from './shared/keywords.js';
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
export declare function parseTranscript(transcriptPath: string): TranscriptData;
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
export declare function extractErrorOutput(error: unknown): string;
/**
 * Check if a file exists (async version with absolute path support).
 *
 * This is the shared async implementation used by context modules
 * (env-checker, health-checker, stack-detector) to avoid duplicate code.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to true if file exists
 */
export declare function fileExistsAsync(filePath: string): Promise<boolean>;
