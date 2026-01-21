/**
 * Naming convention validation checks
 */

import { ValidationIssue, ValidationContext } from './types.js';

/**
 * Validates naming conventions in code.
 * Checks for camelCase functions, PascalCase React components, and proper SCREAMING_CASE usage.
 * @param ctx - Validation context containing file content and metadata
 * @returns Array of validation issues for naming convention violations
 * @example
 * const issues = runNamingChecks(ctx);
 * // May return issues like:
 * // { rule: 'naming/camelCase', message: 'Function "MyFunc" uses PascalCase but file is not React' }
 * // { rule: 'naming/screaming-case', message: 'SCREAMING_CASE "MY_FUNC" should be for constant values only' }
 */
export function runNamingChecks(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check function naming (camelCase)
  const funcMatches = ctx.content.matchAll(/(?:function|const|let)\s+([a-zA-Z_]\w*)\s*(?:=\s*(?:async\s*)?\(|[\(<])/g);
  for (const match of funcMatches) {
    const name = match[1];
    if (name.startsWith('_')) continue;

    const isPascalCase = /^[A-Z]/.test(name);
    const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(name);
    const isValidPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(name);

    // PascalCase is valid for React components, camelCase for regular functions
    if (isPascalCase && !ctx.isReact && !isValidPascalCase) {
      const lineNum = ctx.content.substring(0, match.index || 0).split('\n').length;
      issues.push({
        severity: 'info',
        file: ctx.file,
        line: lineNum,
        rule: 'naming/camelCase',
        message: `Function "${name}" uses PascalCase but file is not React`,
        suggestion: 'Use camelCase for non-component functions',
      });
    } else if (!isCamelCase && !isValidPascalCase) {
      const lineNum = ctx.content.substring(0, match.index || 0).split('\n').length;
      issues.push({
        severity: 'info',
        file: ctx.file,
        line: lineNum,
        rule: 'naming/camelCase',
        message: `Function "${name}" should use camelCase`,
        suggestion: 'Use camelCase for functions and variables',
      });
    }
  }

  // Check for SCREAMING_CASE constants
  const constMatches = ctx.content.matchAll(/const\s+([a-zA-Z_]\w*)\s*=/g);
  for (const match of constMatches) {
    const name = match[1];
    if (/^[A-Z][A-Z0-9_]+$/.test(name)) {
      const lineNum = ctx.content.substring(0, match.index || 0).split('\n').length;
      const line = ctx.lines[lineNum - 1] || '';
      if (line.includes('()') || line.includes('new ')) {
        issues.push({
          severity: 'info',
          file: ctx.file,
          line: lineNum,
          rule: 'naming/screaming-case',
          message: `SCREAMING_CASE "${name}" should be for constant values only`,
          suggestion: 'Use SCREAMING_CASE only for true constants, not functions or instances',
        });
      }
    }
  }

  return issues;
}
