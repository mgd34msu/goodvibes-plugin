/**
 * Crash Recovery
 *
 * Detects and reports on interrupted sessions by analyzing previous state.
 * Identifies uncommitted changes, pending features, and last checkpoints
 * to help resume work after a crash or unexpected session termination.
 *
 * @module session-start/crash-recovery
 * @see {@link ../state} for state persistence
 * @see {@link ../automation/git-operations} for git status
 */

import * as path from 'path';

import {
  hasUncommittedChanges,
  getUncommittedFiles,
} from '../automation/git-operations.js';
import { fileExists } from '../shared/index.js';
import { loadState } from '../state.js';

import type { HooksState } from '../types/state.js';

/** Information about a potential crash recovery scenario */
export interface RecoveryInfo {
  /** Whether recovery is needed from a previous session */
  needsRecovery: boolean;
  /** Description of the previous feature being worked on */
  previousFeature: string | null;
  /** Branch name from the previous session */
  onBranch: string | null;
  /** List of files with uncommitted changes */
  uncommittedFiles: string[];
  /** List of pending issues from the previous session */
  pendingIssues: string[];
  /** Last checkpoint created before the crash */
  lastCheckpoint: HooksState['git']['checkpoints'][0] | null;
}

/** Checks if crash recovery is needed based on previous session state */
export async function checkCrashRecovery(cwd: string): Promise<RecoveryInfo> {
  const stateFile = path.join(cwd, '.goodvibes', 'state', 'hooks-state.json');

  // No previous state means no crash recovery needed
  if (!(await fileExists(stateFile))) {
    return {
      needsRecovery: false,
      previousFeature: null,
      onBranch: null,
      uncommittedFiles: [],
      pendingIssues: [],
      lastCheckpoint: null,
    };
  }

  const state = await loadState(cwd);

  // Check for signs of incomplete work
  const uncommitted = await hasUncommittedChanges(cwd);
  const uncommittedFiles = uncommitted ? await getUncommittedFiles(cwd) : [];
  const onFeatureBranch = state.git.featureBranch !== null;
  const hasPendingFixes = state.tests.pendingFixes.length > 0;
  const failingBuild = state.build.status === 'failing';
  const hasModifiedFiles = state.files.modifiedSinceCheckpoint.length > 0;

  const needsRecovery =
    uncommitted ||
    onFeatureBranch ||
    hasPendingFixes ||
    failingBuild ||
    hasModifiedFiles;

  if (!needsRecovery) {
    return {
      needsRecovery: false,
      previousFeature: null,
      onBranch: null,
      uncommittedFiles: [],
      pendingIssues: [],
      lastCheckpoint: null,
    };
  }

  const pendingIssues: string[] = [];
  if (hasPendingFixes) {
    pendingIssues.push(`${state.tests.pendingFixes.length} tests need fixes`);
  }
  if (failingBuild) {
    pendingIssues.push('Build is failing');
  }
  if (state.tests.failingFiles.length > 0) {
    pendingIssues.push(`${state.tests.failingFiles.length} test files failing`);
  }

  return {
    needsRecovery: true,
    previousFeature: state.git.featureDescription,
    onBranch: state.git.currentBranch,
    uncommittedFiles,
    pendingIssues,
    lastCheckpoint: state.git.checkpoints[0] || null,
  };
}

/** Formats recovery information into a human-readable context string */
export function formatRecoveryContext(info: RecoveryInfo): string {
  if (!info.needsRecovery) {
    return '';
  }

  const parts: string[] = [
    '[GoodVibes Recovery]',
    'Previous session ended unexpectedly.',
    '',
  ];

  if (info.onBranch) {
    parts.push(`Branch: ${info.onBranch}`);
  }

  if (info.previousFeature) {
    parts.push(`Feature: ${info.previousFeature}`);
  }

  if (info.lastCheckpoint) {
    parts.push(`Last checkpoint: "${info.lastCheckpoint.message}"`);
  }

  if (info.uncommittedFiles.length > 0) {
    parts.push(`Uncommitted files: ${info.uncommittedFiles.length}`);
  }

  if (info.pendingIssues.length > 0) {
    parts.push('Pending issues:');
    for (const issue of info.pendingIssues) {
      parts.push(`  - ${issue}`);
    }
  }

  parts.push('');
  parts.push('Continuing where you left off...');

  return parts.join('\n');
}
