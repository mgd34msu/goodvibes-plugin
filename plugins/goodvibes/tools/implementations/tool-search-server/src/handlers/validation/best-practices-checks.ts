/**
 * Best practices validation checks
 */

import { ValidationIssue, ValidationContext } from './types.js';

// HTTP status codes that are not magic numbers
const VALID_STATUS_CODES = [200, 201, 204, 400, 401, 403, 404, 500];

export function runBestPracticesChecks(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Track multi-line comment state
  let inMultiLineComment = false;

  // Check for console.log (should be removed in production)
  ctx.lines.forEach((line, i) => {
    // Handle multi-line comment tracking
    if (line.includes('/*') && !line.includes('*/')) {
      inMultiLineComment = true;
    }
    if (line.includes('*/')) {
      inMultiLineComment = false;
      return; // Skip this line as it ends a comment
    }
    if (inMultiLineComment) return;

    // Skip single-line comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return;

    // Check if console.log appears before any comment on this line
    const commentIndex = line.indexOf('//');
    const consoleMatch = line.match(/console\.(log|debug|info)\(/);
    if (consoleMatch) {
      const consoleIndex = line.indexOf(consoleMatch[0]);
      if (commentIndex === -1 || consoleIndex < commentIndex) {
        issues.push({
          severity: 'info',
          file: ctx.file,
          line: i + 1,
          rule: 'best-practices/no-console',
          message: 'console.log found in code',
          suggestion: 'Remove or use a proper logging library',
        });
      }
    }
  });

  // Check for TODO/FIXME comments
  ctx.lines.forEach((line, i) => {
    if (/\/\/\s*(TODO|FIXME|HACK|XXX):/i.test(line)) {
      issues.push({
        severity: 'info',
        file: ctx.file,
        line: i + 1,
        rule: 'best-practices/no-todo',
        message: 'TODO/FIXME comment found',
        suggestion: 'Address the TODO or create a ticket to track it',
      });
    }
  });

  // Check for magic numbers
  const magicNumberRegex = /[^a-zA-Z0-9_"](\d{2,})[^a-zA-Z0-9_"]/g;
  ctx.lines.forEach((line, i) => {
    if (line.includes('import') || line.includes('require') || line.includes('version')) return;
    if (line.includes('port') || line.includes('timeout') || line.includes('delay')) return;

    let match;
    while ((match = magicNumberRegex.exec(line)) !== null) {
      const num = parseInt(match[1]);
      if (num > 1 && num !== 100 && num !== 1000 && !VALID_STATUS_CODES.includes(num)) {
        issues.push({
          severity: 'info',
          file: ctx.file,
          line: i + 1,
          rule: 'best-practices/no-magic-numbers',
          message: `Magic number ${num} found`,
          suggestion: 'Extract to a named constant',
        });
        break;
      }
    }
    magicNumberRegex.lastIndex = 0;
  });

  return issues;
}
