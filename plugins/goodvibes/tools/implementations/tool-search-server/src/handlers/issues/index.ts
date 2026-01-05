/**
 * Project Issues Handler
 *
 * Scans project for actionable issues:
 * - High-priority TODOs (FIXME, BUG) with file:line locations
 * - Health warnings (missing deps, multiple lockfiles, etc.)
 * - Environment issues (missing vars, exposed secrets)
 *
 * NOTE: Some TODO scanning logic is duplicated from hooks/scripts/src/context/todo-scanner.ts
 * This is intentional - the MCP server and hooks are separate npm packages with different
 * compilation targets. A shared module would require significant restructuring.
 * If you fix bugs here, also fix them in todo-scanner.ts!
 */

import * as fs from 'fs';
import * as path from 'path';

import { success } from '../../utils.js';
import { ProjectIssuesArgs, ProjectIssuesResult, TodoItem } from './types.js';
import { scanDirectory } from './todo-scanner.js';
import { checkHealth } from './health-checker.js';
import { checkEnvironment } from './environment-checker.js';
import { formatIssues } from './formatter.js';

// Re-export types for backwards compatibility
export type { ProjectIssuesArgs } from './types.js';

/**
 * Handles the project_issues MCP tool call.
 *
 * Scans the project for actionable issues including:
 * - High-priority TODOs (FIXME, BUG) with file:line locations
 * - Medium and low priority TODOs
 * - Health warnings (missing deps, multiple lockfiles, etc.)
 * - Environment issues (missing vars, exposed secrets)
 *
 * @param args - The project_issues tool arguments
 * @param args.path - Project root path to scan (defaults to cwd)
 * @param args.include_low_priority - Whether to include low-priority TODOs
 * @returns MCP tool response with formatted issues report
 *
 * @example
 * handleProjectIssues({});
 * // Returns formatted markdown report with all issues
 *
 * @example
 * handleProjectIssues({ path: './packages/api', include_low_priority: true });
 * // Scans specific directory including low-priority items
 */
export function handleProjectIssues(args: ProjectIssuesArgs) {
  const cwd = args.path ? path.resolve(args.path) : process.cwd();

  // Validate path exists and is a directory
  if (!fs.existsSync(cwd)) {
    return success(`## Project Issues\n\nError: Path does not exist: ${cwd}`);
  }

  const stats = fs.statSync(cwd);
  if (!stats.isDirectory()) {
    return success(`## Project Issues\n\nError: Path is not a directory: ${cwd}`);
  }

  // Scan for TODOs
  const allTodos: TodoItem[] = [];
  scanDirectory(cwd, cwd, allTodos);

  const highPriority = allTodos.filter(t => t.priority === 'high');
  const mediumPriority = allTodos.filter(t => t.priority === 'medium');
  const lowPriority = allTodos.filter(t => t.priority === 'low');

  // Check health
  const health = checkHealth(cwd);

  // Check environment
  const envIssues = checkEnvironment(cwd);

  // Build result
  const totalIssues = highPriority.length + health.warnings.filter(w => w.type !== 'info').length + envIssues.length;

  const result: ProjectIssuesResult = {
    total_issues: totalIssues,
    todos: {
      high_priority: highPriority,
      medium_priority: args.include_low_priority ? mediumPriority : mediumPriority.slice(0, 10),
      low_priority: args.include_low_priority ? lowPriority : [],
      total: allTodos.length,
    },
    health: {
      warnings: health.warnings,
      suggestions: health.suggestions,
    },
    environment: {
      issues: envIssues,
    },
    formatted: '',
  };

  result.formatted = formatIssues(result);

  return success(result.formatted);
}
