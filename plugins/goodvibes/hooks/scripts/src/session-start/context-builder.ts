/**
 * Context Builder Module
 *
 * Responsible for gathering and formatting all project context
 * for the session-start hook. This includes:
 * - Stack detection (frameworks, package manager, TypeScript)
 * - Git context (branch, uncommitted changes, recent commits)
 * - Environment status (.env files, missing vars)
 * - TODO/FIXME scanner
 * - Project health checks
 * - Folder structure analysis
 * - Port status for dev servers
 * - Project memory (decisions, patterns, failures)
 */

import {
  detectStack,
  formatStackInfo,
  getGitContext,
  formatGitContext,
  checkEnvStatus,
  formatEnvStatus,
  scanTodos,
  formatTodos,
  checkProjectHealth,
  formatHealthStatus,
  analyzeFolderStructure,
  formatFolderAnalysis,
  isEmptyProject,
  formatEmptyProjectContext,
  checkPorts,
  formatPortStatus,
} from '../context/index.js';

import { loadProjectMemory, formatMemoryContext } from '../memory/index.js';
import { formatRecoveryContext, type RecoveryInfo } from './crash-recovery.js';
import { debug } from '../shared/index.js';

/** Width of section separator lines */
const SECTION_SEPARATOR_LENGTH = 50;

/** Result of the context gathering process */
export interface ContextGatheringResult {
  /** Formatted context string to inject into the session */
  additionalContext: string;
  /** Brief summary of the project state */
  summary: string;
  /** Whether this is a new/empty project */
  isEmptyProject: boolean;
  /** Whether there are any issues detected */
  hasIssues: boolean;
  /** Count of detected issues */
  issueCount: number;
  /** Time taken to gather context in milliseconds */
  gatherTimeMs: number;
  /** Whether crash recovery is needed */
  needsRecovery: boolean;
}

/** Creates an empty project context result */
function createEmptyProjectResult(startTime: number): ContextGatheringResult {
  return {
    additionalContext: formatEmptyProjectContext(),
    summary: 'New project (empty directory)',
    isEmptyProject: true,
    hasIssues: false,
    issueCount: 0,
    gatherTimeMs: Date.now() - startTime,
    needsRecovery: false,
  };
}

/** Creates a failed context result */
export function createFailedContextResult(startTime: number): ContextGatheringResult {
  return {
    additionalContext: '',
    summary: 'Context gathering failed',
    isEmptyProject: false,
    hasIssues: false,
    issueCount: 0,
    gatherTimeMs: Date.now() - startTime,
    needsRecovery: false,
  };
}

/** Formats the context sections into a single string */
function formatContextSections(
  recoveryInfo: RecoveryInfo,
  stackInfo: Awaited<ReturnType<typeof detectStack>>,
  folderAnalysis: Awaited<ReturnType<typeof analyzeFolderStructure>>,
  gitContext: Awaited<ReturnType<typeof getGitContext>>,
  envStatus: Awaited<ReturnType<typeof checkEnvStatus>>,
  portStatus: Awaited<ReturnType<typeof checkPorts>>,
  memory: Awaited<ReturnType<typeof loadProjectMemory>>,
  todos: Awaited<ReturnType<typeof scanTodos>>,
  healthStatus: Awaited<ReturnType<typeof checkProjectHealth>>
): string {
  const contextParts: string[] = [];

  // Header
  contextParts.push('[GoodVibes SessionStart]');
  contextParts.push('='.repeat(SECTION_SEPARATOR_LENGTH));
  contextParts.push('');

  // Recovery section (if needed)
  if (recoveryInfo.needsRecovery) {
    const recoveryStr = formatRecoveryContext(recoveryInfo);
    if (recoveryStr) {
      contextParts.push(recoveryStr);
      contextParts.push('');
    }
  }

  // Project Overview section
  contextParts.push('## Project Overview');
  contextParts.push('');

  // Stack info
  const stackStr = formatStackInfo(stackInfo);
  if (stackStr) {
    contextParts.push(stackStr);
  }

  // Folder structure
  const folderStr = formatFolderAnalysis(folderAnalysis);
  if (folderStr) {
    contextParts.push(folderStr);
  }

  contextParts.push('');

  // Git section
  contextParts.push('## Git Status');
  contextParts.push('');
  const gitStr = formatGitContext(gitContext);
  if (gitStr) {
    contextParts.push(gitStr);
  }
  contextParts.push('');

  // Environment section
  const envStr = formatEnvStatus(envStatus);
  if (envStr) {
    contextParts.push('## Environment');
    contextParts.push('');
    contextParts.push(envStr);
    contextParts.push('');
  }

  // Dev Server / Ports section
  const portStr = formatPortStatus(portStatus);
  if (portStr && portStr !== 'No dev servers detected') {
    contextParts.push('## Dev Servers');
    contextParts.push('');
    contextParts.push(portStr);
    contextParts.push('');
  }

  // Memory section (decisions, patterns, failures)
  const memoryStr = formatMemoryContext(memory);
  if (memoryStr) {
    contextParts.push('## Project Memory');
    contextParts.push('');
    contextParts.push(memoryStr);
    contextParts.push('');
  }

  // Task comments section (TODO/FIXME/etc)
  const todoStr = formatTodos(todos);
  if (todoStr) {
    contextParts.push('## Code TODOs');
    contextParts.push('');
    contextParts.push(todoStr);
    contextParts.push('');
  }

  // Health section
  const healthStr = formatHealthStatus(healthStatus);
  if (healthStr && healthStr !== 'Health: All good') {
    contextParts.push('## Health Checks');
    contextParts.push('');
    contextParts.push(healthStr);
    contextParts.push('');
  }

  // Footer
  contextParts.push('='.repeat(SECTION_SEPARATOR_LENGTH));

  return contextParts.join('\n');
}

/** Builds the summary string from gathered context */
function buildContextSummary(
  stackInfo: Awaited<ReturnType<typeof detectStack>>,
  gitContext: Awaited<ReturnType<typeof getGitContext>>,
  issueCount: number
): string {
  const summaryParts: string[] = [];
  const MAX_FRAMEWORKS_IN_SUMMARY = 3;

  if (stackInfo.frameworks.length > 0) {
    summaryParts.push(stackInfo.frameworks.slice(0, MAX_FRAMEWORKS_IN_SUMMARY).join(', '));
  }
  if (gitContext.branch) {
    summaryParts.push(`on ${gitContext.branch}`);
  }
  if (gitContext.hasUncommittedChanges) {
    summaryParts.push(`${gitContext.uncommittedFileCount} uncommitted`);
  }
  if (issueCount > 0) {
    summaryParts.push(`${issueCount} issues`);
  }

  return summaryParts.join(' | ') || 'Project analyzed';
}

/** Calculates the total issue count from health status, env warnings, and todos */
function calculateIssueCount(
  healthStatus: Awaited<ReturnType<typeof checkProjectHealth>>,
  envStatus: Awaited<ReturnType<typeof checkEnvStatus>>,
  todos: Awaited<ReturnType<typeof scanTodos>>
): number {
  return (
    healthStatus.checks.filter((c) => c.status === 'warning' || c.status === 'error').length +
    envStatus.warnings.length +
    todos.length
  );
}

/**
 * Gathers all project context and formats it for session injection.
 *
 * This function orchestrates the parallel gathering of all context types
 * and formats them into a cohesive context string for the session.
 */
export async function gatherProjectContext(
  projectDir: string,
  recoveryInfo: RecoveryInfo,
  startTime: number
): Promise<ContextGatheringResult> {
  // Check for empty project first
  const isEmpty = await isEmptyProject(projectDir);

  if (isEmpty) {
    return createEmptyProjectResult(startTime);
  }

  // Gather all context in parallel for performance
  const [stackInfo, gitContext, envStatus, todos, healthStatus, folderAnalysis, memory, portStatus] =
    await Promise.all([
      detectStack(projectDir),
      getGitContext(projectDir),
      checkEnvStatus(projectDir),
      scanTodos(projectDir),
      checkProjectHealth(projectDir),
      analyzeFolderStructure(projectDir),
      loadProjectMemory(projectDir),
      checkPorts(projectDir),
    ]);

  // Calculate issues
  const issueCount = calculateIssueCount(healthStatus, envStatus, todos);

  // Format the context
  const additionalContext = formatContextSections(
    recoveryInfo,
    stackInfo,
    folderAnalysis,
    gitContext,
    envStatus,
    portStatus,
    memory,
    todos,
    healthStatus
  );

  // Build summary
  const summary = buildContextSummary(stackInfo, gitContext, issueCount);

  const result: ContextGatheringResult = {
    additionalContext,
    summary,
    isEmptyProject: false,
    hasIssues: issueCount > 0,
    issueCount,
    gatherTimeMs: Date.now() - startTime,
    needsRecovery: recoveryInfo.needsRecovery,
  };

  debug(`Context gathered in ${result.gatherTimeMs}ms`, {
    isEmptyProject: result.isEmptyProject,
    hasIssues: result.hasIssues,
    issueCount: result.issueCount,
    needsRecovery: result.needsRecovery,
  });

  return result;
}
