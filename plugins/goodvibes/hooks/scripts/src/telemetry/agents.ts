/**
 * Agent State Management
 *
 * Provides active agent state tracking for SubagentStart/Stop correlation.
 */

import { exec as execCallback } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { debug, logError, fileExists } from '../shared/index.js';

const exec = promisify(execCallback);

// ============================================================================
// Constants and Paths
// ============================================================================

/** Maximum age in ms for stale agent cleanup (24 hours). */
export const STALE_AGENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================

/** Represents an active agent entry being tracked for telemetry. */
export interface ActiveAgentEntry {
  agent_id: string;
  agent_type: string;
  session_id: string;
  cwd: string;
  project_name: string;
  started_at: string;
  git_branch?: string;
  git_commit?: string;
  task_description?: string;
}

/** State containing all currently active agents. */
export interface ActiveAgentsState {
  agents: Record<string, ActiveAgentEntry>;
  last_updated: string;
}

/**
 * Type guard to check if a value is a valid ActiveAgentsState.
 *
 * @param value - The value to validate
 * @returns True if value conforms to ActiveAgentsState interface
 */
function isActiveAgentsState(value: unknown): value is ActiveAgentsState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'agents' in value &&
    'last_updated' in value &&
    typeof (value as ActiveAgentsState).agents === 'object' &&
    typeof (value as ActiveAgentsState).last_updated === 'string'
  );
}

/** Git branch and commit information. */
export interface GitInfo {
  branch?: string;
  commit?: string;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Gets the path to the active agents file.
 *
 * @param goodVibesDir - Path to the .goodvibes directory
 * @param stateDir - Name of the state subdirectory
 * @returns Full path to the active-agents.json file
 *
 * @example
 * const filePath = getActiveAgentsFilePath('/project/.goodvibes', 'state');
 * // Returns: '/project/.goodvibes/state/active-agents.json'
 */
export function getActiveAgentsFilePath(
  goodVibesDir: string,
  stateDir: string
): string {
  return path.join(goodVibesDir, stateDir, 'active-agents.json');
}

// ============================================================================
// Git Utilities
// ============================================================================

/**
 * Gets git branch and commit info for the current directory.
 * Returns partial results if git commands fail.
 *
 * @param cwd - The current working directory
 * @returns Promise resolving to GitInfo with branch and/or commit
 *
 * @example
 * const gitInfo = await getGitInfo('/path/to/project');
 * // Returns: { branch: 'main', commit: 'abc123' }
 */
export async function getGitInfo(cwd: string): Promise<GitInfo> {
  const result: GitInfo = {};

  try {
    // Get current branch
    const { stdout: branch } = await exec('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    result.branch = branch.trim();
  } catch (error: unknown) {
    debug(
      'Git branch unavailable:',
      error instanceof Error ? error.message : 'unknown'
    );
  }

  try {
    // Get current commit (short hash)
    const { stdout: commit } = await exec('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    result.commit = commit.trim();
  } catch (error: unknown) {
    debug(
      'Git commit unavailable:',
      error instanceof Error ? error.message : 'unknown'
    );
  }

  return result;
}

/**
 * Derives project name from working directory path.
 * Falls back to parent directory name for temp directories.
 *
 * @param cwd - The current working directory
 * @returns Project name string (directory name or 'unknown-project')
 *
 * @example
 * deriveProjectName('/home/user/my-project');
 * // Returns: 'my-project'
 */
export function deriveProjectName(cwd: string): string {
  // Get the directory name
  const dirName = path.basename(cwd);

  // If it looks like a temp directory, try parent
  if (
    dirName.match(/^[a-f0-9]{8,}$/i) ||
    dirName === 'tmp' ||
    dirName === 'temp'
  ) {
    const parentDir = path.basename(path.dirname(cwd));
    if (parentDir && parentDir !== '.' && parentDir !== '/') {
      return parentDir;
    }
  }

  return dirName || 'unknown-project';
}

// ============================================================================
// Active Agents State Management
// ============================================================================

/**
 * Loads active agents state from file.
 * Returns empty state if file doesn't exist or is invalid.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @returns Promise resolving to ActiveAgentsState
 *
 * @example
 * const state = await loadActiveAgents('/project/.goodvibes/state/active-agents.json');
 */
export async function loadActiveAgents(
  activeAgentsFile: string
): Promise<ActiveAgentsState> {
  if (await fileExists(activeAgentsFile)) {
    try {
      const content = await fs.readFile(activeAgentsFile, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (isActiveAgentsState(parsed)) {
        return parsed;
      }
    } catch (error: unknown) {
      logError('loadActiveAgents', error);
    }
  }

  return {
    agents: {},
    last_updated: new Date().toISOString(),
  };
}

/**
 * Saves active agents state to file.
 * Updates the last_updated timestamp automatically.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @param state - The ActiveAgentsState to save
 * @returns Promise that resolves when state is saved
 */
export async function saveActiveAgents(
  activeAgentsFile: string,
  state: ActiveAgentsState
): Promise<void> {
  try {
    state.last_updated = new Date().toISOString();
    await fs.writeFile(activeAgentsFile, JSON.stringify(state, null, 2));
  } catch (error: unknown) {
    logError('saveActiveAgents', error);
  }
}

/**
 * Registers a new active agent.
 * Adds the agent entry to the active agents state file.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @param entry - The agent entry to register
 * @returns Promise that resolves when agent is registered
 *
 * @example
 * await registerActiveAgent(filePath, {
 *   agent_id: 'agent-123',
 *   agent_type: 'backend-engineer',
 *   session_id: 'session-456',
 *   // ...other fields
 * });
 */
export async function registerActiveAgent(
  activeAgentsFile: string,
  entry: ActiveAgentEntry
): Promise<void> {
  const state = await loadActiveAgents(activeAgentsFile);
  state.agents[entry.agent_id] = entry;
  await saveActiveAgents(activeAgentsFile, state);
  debug(
    'Registered active agent: ' + entry.agent_id + ' (' + entry.agent_type + ')'
  );
}

/**
 * Looks up and removes an active agent entry.
 * Used when an agent completes to retrieve its start data and clean up.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @param agentId - The unique identifier of the agent to pop
 * @returns Promise resolving to the agent entry, or null if not found
 *
 * @example
 * const entry = await popActiveAgent(filePath, 'agent-123');
 * if (entry) {
 *   const duration = Date.now() - new Date(entry.started_at).getTime();
 * }
 */
export async function popActiveAgent(
  activeAgentsFile: string,
  agentId: string
): Promise<ActiveAgentEntry | null> {
  const state = await loadActiveAgents(activeAgentsFile);
  const entry = state.agents[agentId];

  if (entry) {
    delete state.agents[agentId];
    await saveActiveAgents(activeAgentsFile, state);
    debug('Popped active agent: ' + agentId);
    return entry;
  }

  debug('Agent not found in active agents: ' + agentId);
  return null;
}

/**
 * Removes agent entries older than 24 hours.
 * Cleans up orphaned agents that were never properly stopped.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @returns Promise resolving to count of removed entries
 *
 * @example
 * const removed = await cleanupStaleAgents(filePath);
 * console.log(`Cleaned up ${removed} stale agents`);
 */
export async function cleanupStaleAgents(
  activeAgentsFile: string
): Promise<number> {
  const state = await loadActiveAgents(activeAgentsFile);
  const now = Date.now();
  let removed = 0;

  for (const [agentId, entry] of Object.entries(state.agents)) {
    const startedAt = new Date(entry.started_at).getTime();
    if (now - startedAt > STALE_AGENT_MAX_AGE_MS) {
      delete state.agents[agentId];
      removed++;
    }
  }

  if (removed > 0) {
    await saveActiveAgents(activeAgentsFile, state);
    debug('Cleaned up ' + removed + ' stale agent entries');
  }

  return removed;
}
