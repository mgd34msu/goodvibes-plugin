/**
 * Configuration for GoodVibes MCP Server
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { IFuseOptions } from 'fuse.js';
import { RegistryEntry } from './types.js';

// Handle both ESM and CJS contexts
const getConfigDir = (): string => {
  // In CJS bundle, use process.cwd() as fallback since import.meta is not available
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - import.meta only available in ESM, may error in CJS context
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};

/**
 * Root directory of the GoodVibes plugin.
 * Resolved from environment variables or relative to config location.
 * @example "/home/user/project/plugins/goodvibes"
 */
export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), '../../..');
/**
 * Root directory of the current project being analyzed.
 * Falls back to current working directory if not set.
 * @example "/home/user/my-project"
 */
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Gets the current PROJECT_ROOT dynamically.
 * Useful when process.env.PROJECT_ROOT may change at runtime (e.g., in tests).
 * @returns The project root directory path
 * @example
 * const root = getProjectRoot();
 * const configPath = path.join(root, 'config.json');
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/**
 * Fuse.js configuration for fuzzy searching registry entries.
 * Weighted search across name, description, and keywords fields.
 * @property {Array} keys - Searchable fields with weights (description highest at 0.4)
 * @property {number} threshold - Match sensitivity (0.4 = moderately fuzzy)
 * @property {boolean} includeScore - Include relevance scores in results
 * @property {boolean} ignoreLocation - Match anywhere in string, not just start
 */
export const FUSE_OPTIONS: IFuseOptions<RegistryEntry> = {
  keys: [
    { name: 'name', weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords', weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
};

/**
 * Maps hook event names to their corresponding script filenames.
 * Used to locate and execute hook scripts in response to Claude events.
 * @example
 * const script = HOOK_SCRIPT_MAP['SessionStart']; // 'session-start.js'
 */
export const HOOK_SCRIPT_MAP: Record<string, string> = {
  SessionStart: 'session-start.js',
  PreToolUse: 'pre-tool-use.js',
  PostToolUse: 'post-tool-use.js',
  PostToolUseFailure: 'post-tool-use-failure.js',
  PermissionRequest: 'permission-request.js',
  UserPromptSubmit: 'user-prompt-submit.js',
  Stop: 'stop.js',
  SubagentStart: 'subagent-start.js',
  SubagentStop: 'subagent-stop.js',
  PreCompact: 'pre-compact.js',
  SessionEnd: 'session-end.js',
  Notification: 'notification.js',
};
