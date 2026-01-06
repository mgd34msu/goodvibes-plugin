/**
 * Context Formatter
 *
 * Formats all gathered context into a clean, readable format
 * for injection via additionalContext.
 */

import { StackInfo, formatStackInfo } from './stack-detector.js';
import { GitContext, formatGitContext } from './git-context.js';
import { loadProjectMemory, formatMemoryContext } from '../memory/index.js';
import { EnvStatus, formatEnvStatus } from './environment.js';
import { TodoItem, formatTodos } from './todo-scanner.js';
import { HealthStatus, formatHealthStatus } from './health-checker.js';
import { FolderAnalysis, formatFolderAnalysis } from './folder-analyzer.js';
import type { ProjectMemory } from '../types/memory.js';

/** Maximum number of frameworks to display in summary. */
const MAX_SUMMARY_FRAMEWORKS = 4;
/** Maximum number of frameworks to display in minimal context. */
const MAX_MINIMAL_FRAMEWORKS = 3;

/** All gathered project context data. */
export interface GatheredContext {
  stack: StackInfo;
  git: GitContext;
  memory: ProjectMemory;
  environment: EnvStatus;
  todos: TodoItem[];
  health: HealthStatus;
  folderStructure: FolderAnalysis;
}

/** Formatted context output with summary and issue tracking. */
export interface FormattedContext {
  full: string;
  summary: string;
  hasIssues: boolean;
  issueCount: number;
}

/** Format all gathered context into a readable string. */
export function formatContext(context: GatheredContext): FormattedContext {
  const sections: string[] = [];
  let issueCount = 0;

  sections.push('# Project Context');
  sections.push('');

  const stackFormatted = formatStackInfo(context.stack);
  if (stackFormatted) {
    sections.push('## Tech Stack');
    sections.push(stackFormatted);
    sections.push('');
  }

  const structureFormatted = formatFolderAnalysis(context.folderStructure);
  if (structureFormatted) {
    sections.push('## Architecture');
    sections.push(structureFormatted);
    sections.push('');
  }

  const gitFormatted = formatGitContext(context.git);
  if (gitFormatted) {
    sections.push('## Git Status');
    sections.push(gitFormatted);
    sections.push('');
  }

  const healthFormatted = formatHealthStatus(context.health);
  if (healthFormatted) {
    sections.push('## Project Health');
    sections.push(healthFormatted);
    // Count warnings and errors from health checks
    issueCount += context.health.checks.filter(c => c.status === 'warning' || c.status === 'error').length;
    sections.push('');
  }

  const envFormatted = formatEnvStatus(context.environment);
  if (envFormatted) {
    sections.push('## Environment');
    sections.push(envFormatted);
    issueCount += context.environment.missingVars.length;
    sections.push('');
  }

  const todosFormatted = formatTodos(context.todos);
  if (todosFormatted) {
    sections.push('## Code TODOs');
    sections.push(todosFormatted);
    issueCount += context.todos.filter((i) => i.type === 'FIXME' || i.type === 'BUG').length;
    sections.push('');
  }

  const memoryFormatted = formatMemoryContext(context.memory);
  if (memoryFormatted) {
    sections.push('## Project Memory');
    sections.push(memoryFormatted);
    sections.push('');
  }

  // Generate summary
  const summaryParts: string[] = [];

  const allTech = context.stack.frameworks.slice(0, MAX_SUMMARY_FRAMEWORKS);
  if (allTech.length > 0) {
    summaryParts.push(allTech.join(' + '));
  }

  if (context.git.isRepo && context.git.branch) {
    if (context.git.uncommittedFileCount > 0) {
      summaryParts.push(`${context.git.uncommittedFileCount} uncommitted changes`);
    }
  }

  if (issueCount > 0) {
    summaryParts.push(`${issueCount} issue(s) to review`);
  }

  const summary = summaryParts.length > 0 ? summaryParts.join(' | ') : 'Project context loaded';

  return {
    full: sections.join('\n'),
    summary,
    hasIssues: issueCount > 0,
    issueCount,
  };
}

/** Create a minimal context string for low-overhead scenarios. */
export function formatMinimalContext(context: GatheredContext): string {
  const parts: string[] = [];

  const tech = context.stack.frameworks.slice(0, MAX_MINIMAL_FRAMEWORKS);
  if (tech.length > 0) {
    parts.push(`Stack: ${tech.join(', ')}`);
  }

  if (context.git.isRepo && context.git.branch) {
    parts.push(`Branch: ${context.git.branch}`);
  }

  const healthWarnings = context.health.checks.filter(c => c.status === 'warning' || c.status === 'error');
  if (healthWarnings.length > 0) {
    parts.push(`${healthWarnings.length} health warning(s)`);
  }

  const highPriorityTodos = context.todos.filter((i) => i.type === 'FIXME' || i.type === 'BUG').length;
  if (highPriorityTodos > 0) {
    parts.push(`${highPriorityTodos} high-priority TODO(s)`);
  }

  return parts.join(' | ');
}
