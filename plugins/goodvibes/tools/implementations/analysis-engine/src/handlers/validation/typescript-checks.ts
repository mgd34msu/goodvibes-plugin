/**
 * TypeScript validation checks
 */

import { ValidationIssue, ValidationContext } from './types.js';

/**
 * Runs TypeScript-specific validation checks on a file.
 * Detects 'any' type usage, unexplained @ts-ignore comments, and excessive non-null assertions.
 * Only runs on TypeScript files (.ts, .tsx).
 * @param ctx - Validation context containing file content and metadata
 * @returns Array of TypeScript-related validation issues (empty for non-TS files)
 * @example
 * const issues = runTypeScriptChecks(ctx);
 * // May return issues like:
 * // { rule: 'typescript/no-any', message: 'Avoid using "any" type' }
 * // { rule: 'typescript/no-ts-ignore', message: '@ts-ignore should include an explanation' }
 */
export function runTypeScriptChecks(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!ctx.isTypeScript) return issues;

  // Check for 'any' type
  const anyMatches = ctx.content.matchAll(/:\s*any\b/g);
  for (const match of anyMatches) {
    const lineNum = ctx.content.substring(0, match.index || 0).split('\n').length;
    issues.push({
      severity: 'warning',
      file: ctx.file,
      line: lineNum,
      rule: 'typescript/no-any',
      message: 'Avoid using "any" type',
      suggestion: 'Use a more specific type or "unknown"',
    });
  }

  // Check for @ts-ignore without explanation
  ctx.lines.forEach((line, i) => {
    if (/@ts-ignore(?!\s+.{10,})/.test(line)) {
      issues.push({
        severity: 'warning',
        file: ctx.file,
        line: i + 1,
        rule: 'typescript/no-ts-ignore',
        message: '@ts-ignore should include an explanation',
        suggestion: 'Add a comment explaining why the ignore is needed',
      });
    }
  });

  // Check for non-null assertions
  const assertionCount = (ctx.content.match(/!\./g) || []).length;
  if (assertionCount > 5) {
    issues.push({
      severity: 'info',
      file: ctx.file,
      line: 1,
      rule: 'typescript/excessive-non-null',
      message: `${assertionCount} non-null assertions found`,
      suggestion: 'Consider proper null checking instead of assertions',
    });
  }

  return issues;
}
