/**
 * Output formatting for project issues
 */

import { ProjectIssuesResult } from './types.js';
import { ICONS } from './constants.js';

/**
 * Format issues for display
 */
export function formatIssues(result: ProjectIssuesResult): string {
  const sections: string[] = [];

  sections.push(`## Project Issues (${result.total_issues} total)\n`);

  // High-priority TODOs
  sections.push(`### High-Priority TODOs (${result.todos.high_priority.length})`);
  if (result.todos.high_priority.length > 0) {
    for (const todo of result.todos.high_priority.slice(0, 10)) {
      sections.push(`- **${todo.type}** in \`${todo.file}:${todo.line}\`: ${todo.text}`);
    }
    if (result.todos.high_priority.length > 10) {
      sections.push(`  _(${result.todos.high_priority.length - 10} more...)_`);
    }
  } else {
    sections.push('No high-priority TODOs found.');
  }
  sections.push('');

  // Health warnings
  sections.push(`### Health Warnings (${result.health.warnings.length})`);
  if (result.health.warnings.length > 0) {
    for (const warning of result.health.warnings) {
      const icon = ICONS[warning.type] || ICONS.info;
      sections.push(`- ${icon} ${warning.message}`);
    }
  } else {
    sections.push('No health warnings.');
  }
  sections.push('');

  // Environment issues
  sections.push(`### Environment Issues (${result.environment.issues.length})`);
  if (result.environment.issues.length > 0) {
    for (const issue of result.environment.issues) {
      const icon = issue.type === 'sensitive_exposed' ? ICONS.error : ICONS.warning;
      sections.push(`- ${icon} ${issue.message}`);
    }
  } else {
    sections.push('No environment issues found.');
  }
  sections.push('');

  // Medium-priority TODOs (if any)
  if (result.todos.medium_priority.length > 0) {
    sections.push(`### Medium-Priority TODOs (${result.todos.medium_priority.length})`);
    for (const todo of result.todos.medium_priority.slice(0, 5)) {
      sections.push(`- ${todo.type} in \`${todo.file}:${todo.line}\`: ${todo.text}`);
    }
    if (result.todos.medium_priority.length > 5) {
      sections.push(`  _(${result.todos.medium_priority.length - 5} more...)_`);
    }
    sections.push('');
  }

  // Suggestions
  if (result.health.suggestions.length > 0) {
    sections.push('### Suggestions');
    for (const suggestion of result.health.suggestions) {
      sections.push(`- ${ICONS.suggestion} ${suggestion}`);
    }
  }

  return sections.join('\n');
}
