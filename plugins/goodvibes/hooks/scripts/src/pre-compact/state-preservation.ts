/**
 * State Preservation Module for Pre-Compact Hook
 *
 * Handles saving session state and creating checkpoints before context compaction.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import type { TelemetryTracking } from '../types/telemetry.js';

import { hasUncommittedChanges } from '../automation/git-operations.js';
import { createCheckpointIfNeeded } from '../post-tool-use/checkpoint-manager.js';
import {
  ensureGoodVibesDir,
  debug,
  logError,
  fileExists,
} from '../shared/index.js';
import { loadState, saveState } from '../state/index.js';

import type { HooksState } from '../types/state.js';

/**
 * Reads currently active agents from agent-tracking.json and formats a summary string.
 * Returns empty string if no agents are tracked or on any error.
 */
async function getActiveAgentsSummary(cwd: string, sessionId?: string): Promise<string> {
  const AGENT_DESC_MAX_LENGTH = 80;
  try {
    const trackingPath = path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json');
    if (!(await fileExists(trackingPath))) return '';

    const content = await fs.readFile(trackingPath, 'utf-8');
    const trackings = JSON.parse(content) as Record<string, TelemetryTracking>;

    let entries = Object.values(trackings);
    if (sessionId) {
      entries = entries.filter(entry => entry.session_id === sessionId);
    }

    if (entries.length === 0) return '';

    const agentDescriptions = entries.map(entry => {
      const desc = entry.task_description
        ? entry.task_description.substring(0, AGENT_DESC_MAX_LENGTH).replace(/\n/g, ' ').trim()
        : entry.agent_type || 'unknown';
      return `${entry.agent_id} - ${desc}`;
    });

    return `agents running during compact: ${agentDescriptions.join(', ')}`;
  } catch {
    return '';
  }
}

/**
 * Creates a checkpoint commit before context compaction if there are uncommitted changes.
 * This ensures work is not lost during the compaction process.
 */
export async function createPreCompactCheckpoint(cwd: string): Promise<void> {
  try {
    if (!(await hasUncommittedChanges(cwd))) {
      debug('No uncommitted changes, skipping pre-compact checkpoint');
      return;
    }

    const state = await loadState(cwd);
    const agentsSummary = await getActiveAgentsSummary(cwd, state.session.id);
    const commitMessage = agentsSummary
      ? `pre-compact: saving work before context compaction\n${agentsSummary}`
      : 'pre-compact: saving work before context compaction';

    const result = await createCheckpointIfNeeded(
      state,
      cwd,
      commitMessage
    );

    if (result.created) {
      debug('Pre-compact checkpoint created', { message: result.message });
      await saveState(cwd, state);
    } else {
      debug('Pre-compact checkpoint skipped', { reason: result.message });
    }
  } catch (error: unknown) {
    logError('createPreCompactCheckpoint', error);
    // Don't throw - checkpoint failure shouldn't block compaction
  }
}

/**
 * Saves a session summary to `.goodvibes/state/last-session-summary.md`.
 * This summary can be used to restore context after compaction.
 */
export async function saveSessionSummary(
  cwd: string,
  summary: string
): Promise<void> {
  try {
    await ensureGoodVibesDir(cwd);
    const stateDir = path.join(cwd, '.goodvibes', 'state');

    if (!(await fileExists(stateDir))) {
      await fs.mkdir(stateDir, { recursive: true });
    }

    const summaryPath = path.join(stateDir, 'last-session-summary.md');
    const timestamp = new Date().toISOString();

    const content = `# Session Summary

Generated: ${timestamp}

## Context Before Compaction

${summary}

---
*This summary was automatically saved before context compaction by GoodVibes.*
`;

    await fs.writeFile(summaryPath, content, 'utf-8');
    debug('Saved session summary', { path: summaryPath });
  } catch (error: unknown) {
    logError('saveSessionSummary', error);
    // Don't throw - summary failure shouldn't block compaction
  }
}

/**
 * Returns a list of files modified during the current session.
 * Combines both modified and created files from the state.
 */
export function getFilesModifiedThisSession(state: HooksState): string[] {
  const files = new Set<string>();

  // Add files modified this session
  if (state.files.modifiedThisSession) {
    for (const file of state.files.modifiedThisSession) {
      files.add(file);
    }
  }

  // Add files created this session
  if (state.files.createdThisSession) {
    for (const file of state.files.createdThisSession) {
      files.add(file);
    }
  }

  return Array.from(files);
}
