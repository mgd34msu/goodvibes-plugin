/**
 * Structure validation checks
 */

import * as path from 'path';
import { ValidationIssue, ValidationContext } from './types.js';

export function runStructureChecks(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for exports
  const hasExport = ctx.content.includes('export default') || ctx.content.includes('export {') ||
                   ctx.content.includes('export const') || ctx.content.includes('export function') ||
                   ctx.content.includes('export class') || ctx.content.includes('export type') ||
                   ctx.content.includes('export interface');

  if (!hasExport && !ctx.file.includes('index') && !ctx.file.includes('.d.ts')) {
    issues.push({
      severity: 'warning',
      file: ctx.file,
      line: 1,
      rule: 'structure/missing-export',
      message: 'No exports found in file',
      suggestion: 'Add exports to make the module usable',
    });
  }

  // React component checks
  if (ctx.isReact) {
    const componentName = path.basename(ctx.file, ctx.ext);
    const pascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(componentName);

    if (!pascalCase && !ctx.file.includes('index') && !ctx.file.includes('use')) {
      issues.push({
        severity: 'info',
        file: ctx.file,
        line: 1,
        rule: 'structure/component-naming',
        message: 'React component files should use PascalCase',
        suggestion: `Rename to ${componentName.charAt(0).toUpperCase() + componentName.slice(1)}`,
      });
    }

    // Check for proper hook usage
    const hookUsage = ctx.content.match(/use[A-Z]\w+/g);
    if (hookUsage) {
      ctx.lines.forEach((line, i) => {
        if (/if\s*\(.*use[A-Z]/.test(line) || /&&\s*use[A-Z]/.test(line)) {
          issues.push({
            severity: 'error',
            file: ctx.file,
            line: i + 1,
            rule: 'react/hooks-rules',
            message: 'Hooks cannot be called conditionally',
            suggestion: 'Move hook call outside of conditions',
          });
        }
      });
    }
  }

  // File size check
  if (ctx.lines.length > 500) {
    issues.push({
      severity: 'info',
      file: ctx.file,
      line: 1,
      rule: 'structure/file-size',
      message: `File has ${ctx.lines.length} lines, consider splitting`,
      suggestion: 'Break large files into smaller, focused modules',
    });
  }

  // Check for barrel exports in index files
  if (ctx.file.includes('index') && ctx.content.length < 50 && !ctx.content.includes('export')) {
    issues.push({
      severity: 'info',
      file: ctx.file,
      line: 1,
      rule: 'structure/empty-index',
      message: 'Index file appears empty or incomplete',
      suggestion: 'Add barrel exports or remove empty index',
    });
  }

  return issues;
}
