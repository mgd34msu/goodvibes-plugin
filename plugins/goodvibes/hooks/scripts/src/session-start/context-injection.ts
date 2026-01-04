import {
  detectStack,
  formatStackInfo,
  getGitContext,
  formatGitContext,
  checkEnvironment,
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

/** Gathers project context and formats it for session injection */
export async function gatherAndFormatContext(cwd: string): Promise<ContextInjectionResult> {
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
    checkEnvironment(cwd),
    scanTodos(cwd),
    checkProjectHealth(cwd),
    analyzeFolderStructure(cwd),
    loadProjectMemory(cwd),
  ]);

  // Format the context
  const parts: string[] = ['[GoodVibes SessionStart]', '━'.repeat(SEPARATOR_WIDTH), ''];

  // Stack info
  const stackStr = formatStackInfo(stackInfo);
  if (stackStr) parts.push(stackStr);

  // Folder structure
  const folderStr = formatFolderAnalysis(folderAnalysis);
  if (folderStr) parts.push(folderStr);

  parts.push('');

  // Git context
  const gitStr = formatGitContext(gitContext);
  if (gitStr) parts.push(gitStr);

  // Environment
  const envStr = formatEnvStatus(envStatus);
  if (envStr) parts.push(envStr);

  parts.push('');

  // Memory (decisions, patterns, failures)
  const memoryStr = formatMemoryContext(memory);
  if (memoryStr) parts.push(memoryStr);

  // TODOs
  const todoStr = formatTodos(todos);
  if (todoStr) {
    parts.push('');
    parts.push(todoStr);
  }

  // Health
  const healthStr = formatHealthStatus(healthStatus);
  if (healthStr) parts.push(healthStr);

  parts.push('');
  parts.push('━'.repeat(SEPARATOR_WIDTH));

  return {
    context: parts.join('\n'),
    isEmpty: false,
  };
}
