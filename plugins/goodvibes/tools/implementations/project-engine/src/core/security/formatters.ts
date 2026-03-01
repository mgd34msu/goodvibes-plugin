/**
 * Security output formatters
 *
 * Formats environment audit results as human-readable markdown reports.
 *
 * @module core/security/formatters
 */

import type { EnvAuditResult } from './types.js';

// =============================================================================
// Formatter
// =============================================================================

/**
 * Format an environment audit result as a markdown report.
 *
 * Produces a structured report with sections for:
 * - File status (env file presence)
 * - Summary statistics
 * - Missing, undocumented, and unused variables
 * - Type validation issues
 * - Full variable list (when code scanning was done)
 *
 * @param result - The completed environment audit result
 * @returns Formatted markdown string
 */
export function formatEnvAudit(result: EnvAuditResult): string {
  const lines: string[] = [];

  lines.push(result.valid ? '# Environment Audit: PASSED' : '# Environment Audit: FAILED');
  lines.push('');

  lines.push('## File Status');
  lines.push(`- .env file: ${result.env_file_exists ? 'exists' : 'MISSING'}`);
  lines.push(`- .env.example file: ${result.example_file_exists ? 'exists' : 'MISSING'}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`- Variables in .env: ${result.summary.total_in_env}`);
  lines.push(`- Variables in .env.example: ${result.summary.total_in_example}`);
  lines.push(`- Variables used in code: ${result.summary.total_used_in_code}`);
  lines.push(`- Missing: ${result.summary.missing_count}`);
  lines.push(`- Unused: ${result.summary.unused_count}`);
  lines.push(`- Undocumented: ${result.summary.undocumented_count}`);
  lines.push('');

  if (result.missing.length > 0) {
    lines.push('## Missing Variables');
    lines.push('These variables are referenced but not defined in .env:');
    lines.push('');
    for (const v of result.missing) {
      lines.push(`### \`${v.name}\``);
      lines.push(`- Defined in: ${v.defined_in}`);
      if (v.used_in.length > 0) {
        const extra = v.used_in.length > 5 ? ` (+${v.used_in.length - 5} more)` : '';
        lines.push(`- Used in: ${v.used_in.slice(0, 5).join(', ')}${extra}`);
      }
      lines.push('');
    }
  }

  if (result.undocumented.length > 0) {
    lines.push('## Undocumented Variables');
    lines.push('These variables are in .env but not in .env.example:');
    lines.push('');
    for (const v of result.undocumented) {
      lines.push(`- \`${v.name}\``);
    }
    lines.push('');
  }

  if (result.unused.length > 0) {
    lines.push('## Unused Variables');
    lines.push('These variables are defined but not used in code:');
    lines.push('');
    for (const v of result.unused) {
      lines.push(`- \`${v.name}\` (in ${v.defined_in})`);
    }
    lines.push('');
  }

  if (result.type_issues && result.type_issues.length > 0) {
    lines.push('## Type Validation Issues');
    lines.push('');
    for (const issue of result.type_issues) {
      lines.push(`### \`${issue.name}\``);
      lines.push(`- Expected: ${issue.expected_type}`);
      const displayValue = issue.actual_value.length > 50
        ? issue.actual_value.substring(0, 50) + '...'
        : issue.actual_value;
      lines.push(`- Value: \`${displayValue}\``);
      lines.push(`- Issue: ${issue.issue}`);
      lines.push('');
    }
  }

  if (result.variables.length > 0) {
    lines.push('## All Variables Found in Code');
    lines.push('');
    for (const v of result.variables) {
      lines.push(`### \`${v.name}\``);
      lines.push(`- Required: ${v.required ? 'Yes' : 'No'}`);
      lines.push(`- Has default: ${v.has_default ? 'Yes' : 'No'}`);
      lines.push(`- Defined in: ${v.defined_in.length > 0 ? v.defined_in.join(', ') : 'None'}`);
      lines.push(`- Used in ${v.used_in.length} location(s)`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
