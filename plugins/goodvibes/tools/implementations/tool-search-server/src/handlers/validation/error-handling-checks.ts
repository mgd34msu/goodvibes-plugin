/**
 * Error handling validation checks
 */

import { ValidationIssue, ValidationContext } from './types.js';
import { extractFunctionBody } from '../../utils.js';

export function runErrorHandlingChecks(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check async functions for error handling
  const asyncMatches = ctx.content.matchAll(/async\s+(?:function\s+)?(\w+)?\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{/g);
  for (const match of asyncMatches) {
    const startIndex = match.index || 0;
    const funcContent = extractFunctionBody(ctx.content, startIndex);

    if (funcContent && !funcContent.includes('try') && !funcContent.includes('catch') && !funcContent.includes('.catch(')) {
      const lineNum = ctx.content.substring(0, startIndex).split('\n').length;
      issues.push({
        severity: 'warning',
        file: ctx.file,
        line: lineNum,
        rule: 'error-handling/async-try-catch',
        message: 'Async function without error handling',
        suggestion: 'Wrap async code in try/catch or use .catch()',
      });
    }
  }

  // Check for empty catch blocks
  ctx.lines.forEach((line, i) => {
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || (line.includes('catch') && ctx.lines[i + 1]?.trim() === '}')) {
      issues.push({
        severity: 'warning',
        file: ctx.file,
        line: i + 1,
        rule: 'error-handling/empty-catch',
        message: 'Empty catch block swallows errors',
        suggestion: 'Log the error or handle it appropriately',
      });
    }
  });

  // Check for console.log in catch blocks (should use console.error)
  for (let i = 0; i < ctx.lines.length; i++) {
    if (ctx.lines[i].includes('catch') && ctx.lines[i + 1]?.includes('console.log')) {
      issues.push({
        severity: 'info',
        file: ctx.file,
        line: i + 2,
        rule: 'error-handling/console-error',
        message: 'Use console.error for errors, not console.log',
        suggestion: 'Replace console.log with console.error in catch blocks',
      });
    }
  }

  return issues;
}
