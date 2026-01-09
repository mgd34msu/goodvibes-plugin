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

/** Type guard to check if a value is a valid ActiveAgentsState */
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
 * Get the path to the active agents file
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
 * Get git branch and commit info for the current directory
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
 * Derive project name from working directory path
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
 * Load active agents state from file
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
 * Save active agents state to file
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
 * Register a new active agent
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
 * Look up and remove an active agent entry
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

/** Removes agent entries older than 24 hours. Returns count of removed entries. */
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
