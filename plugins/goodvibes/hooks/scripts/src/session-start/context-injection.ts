/**
 * Context Injection
 *
 * Gathers and formats project context for injection at session start.
 * Aggregates stack detection, git status, environment variables, TODOs,
 * health checks, and project memory into a comprehensive context snapshot.
 *
 * @module session-start/context-injection
 * @see {@link ../context} for context gathering functions
 * @see {@link ../memory} for project memory loading
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
} from '../context/index.js';
import { loadProjectMemory, formatMemoryContext } from '../memory/index.js';

/** Width of the separator line in context output */
const SEPARATOR_WIDTH = 50;

/** Result of gathering and formatting session context */
export interface ContextInjectionResult {
  /** Formatted context string for injection */
  context: string;
  /** Whether the project is empty */
  isEmpty: boolean;
}

/**
 * Gathers project context and formats it for session injection.
 * Collects stack info, git status, environment, TODOs, health checks, and memory.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ContextInjectionResult with formatted context
 *
 * @example
 * const result = await gatherAndFormatContext('/path/to/project');
 * if (!result.isEmpty) {
 *   console.log(result.context);
 * }
 */
export async function gatherAndFormatContext(
  cwd: string
): Promise<ContextInjectionResult> {
  // Check for empty project first
  if (await isEmptyProject(cwd)) {
    return {
      context: formatEmptyProjectContext(),
      isEmpty: true,
    };
  }

  // Gather all context in parallel
  const [
    stackInfo,
    gitContext,
    envStatus,
    todos,
    healthStatus,
    folderAnalysis,
    memory,
  ] = await Promise.all([
    detectStack(cwd),
    getGitContext(cwd),
    checkEnvStatus(cwd),
    scanTodos(cwd),
    checkProjectHealth(cwd),
    analyzeFolderStructure(cwd),
    loadProjectMemory(cwd),
  ]);

  // Format the context
  const parts: string[] = [
    '[GoodVibes SessionStart]',
    '━'.repeat(SEPARATOR_WIDTH),
    '',
  ];

  // Stack info
  const stackStr = formatStackInfo(stackInfo);
  if (stackStr) {
    parts.push(stackStr);
  }

  // Folder structure
  const folderStr = formatFolderAnalysis(folderAnalysis);
  if (folderStr) {
    parts.push(folderStr);
  }

  parts.push('');

  // Git context
  const gitStr = formatGitContext(gitContext);
  if (gitStr) {
    parts.push(gitStr);
  }

  // Environment
  const envStr = formatEnvStatus(envStatus);
  if (envStr) {
    parts.push(envStr);
  }

  parts.push('');

  // Memory (decisions, patterns, failures)
  const memoryStr = formatMemoryContext(memory);
  if (memoryStr) {
    parts.push(memoryStr);
  }

  // TODOs
  const todoStr = formatTodos(todos);
  if (todoStr) {
    parts.push('');
    parts.push(todoStr);
  }

  // Health
  const healthStr = formatHealthStatus(healthStatus);
  if (healthStr) {
    parts.push(healthStr);
  }

  parts.push('');
  parts.push('━'.repeat(SEPARATOR_WIDTH));

  return {
    context: parts.join('\n'),
    isEmpty: false,
  };
}
