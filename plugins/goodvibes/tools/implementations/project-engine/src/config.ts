/**
 * Configuration constants for project-engine.
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export const SERVER_NAME = 'project-engine';
export const SERVER_VERSION = '1.0.0';

/**
 * Gets the directory containing this config file.
 * Handles both ESM and CJS contexts with appropriate fallbacks.
 */
const getEsmDir = (): string => {
  // @ts-expect-error - import.meta.url is only available in ESM context
  return dirname(fileURLToPath(import.meta.url));
};

export const getConfigDir = (): string => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try { return getEsmDir(); } catch { return process.cwd(); }
};

/**
 * Root directory of the GoodVibes plugin.
 */
export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), '../../..');

/**
 * Root directory of the current project being analyzed.
 */
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Get plugin root from environment or cwd.
 */
export function getPluginRoot(): string {
  return PLUGIN_ROOT;
}

/**
 * Get project root from environment or cwd.
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

/**
 * Fuse.js configuration for fuzzy searching.
 */
export const FUSE_OPTIONS = {
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
