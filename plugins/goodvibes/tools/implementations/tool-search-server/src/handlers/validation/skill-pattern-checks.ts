/**
 * Skill pattern validation checks
 */

import { ValidationIssue, ValidationContext, SkillPatterns } from './types.js';

export function runSkillPatternChecks(
  ctx: ValidationContext,
  skillPatterns: SkillPatterns
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check required imports
  if (skillPatterns.required_imports) {
    for (const imp of skillPatterns.required_imports) {
      if (!ctx.content.includes(imp)) {
        issues.push({
          severity: 'warning',
          file: ctx.file,
          line: 1,
          rule: 'skill/missing-import',
          message: `Skill requires import: ${imp}`,
          suggestion: `Add import for ${imp}`,
        });
      }
    }
  }

  // Check must include patterns
  if (skillPatterns.must_include) {
    for (const pattern of skillPatterns.must_include) {
      if (!ctx.content.includes(pattern)) {
        issues.push({
          severity: 'warning',
          file: ctx.file,
          line: 1,
          rule: 'skill/missing-pattern',
          message: `Skill expects pattern: ${pattern}`,
          suggestion: 'Implement the expected pattern',
        });
      }
    }
  }

  // Check must not include patterns
  if (skillPatterns.must_not_include) {
    for (const pattern of skillPatterns.must_not_include) {
      if (ctx.content.includes(pattern)) {
        const lineNum = ctx.lines.findIndex(l => l.includes(pattern)) + 1;
        issues.push({
          severity: 'warning',
          file: ctx.file,
          line: lineNum || 1,
          rule: 'skill/forbidden-pattern',
          message: `Skill advises against: ${pattern}`,
          suggestion: 'Remove or replace with recommended alternative',
        });
      }
    }
  }

  return issues;
}
