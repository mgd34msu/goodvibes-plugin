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
    // @ts-expect-error - import.meta only available in ESM
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};

export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), '../../..');
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
