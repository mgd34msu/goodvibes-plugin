/**
 * Project Health Formatter
 *
 * Formats project health analysis results for display in context output.
 */

import type { ProjectHealth, HealthWarning } from './project-health.js';

/**
 * Maximum number of suggestions to return.
 * Limits improvement suggestions to avoid overwhelming output.
 */
const MAX_SUGGESTIONS = 3;

/**
 * Generate health warnings based on findings.
 * Creates warning messages for missing dependencies, multiple lockfiles, and loose TypeScript settings.
 *
 * @param health - Partial ProjectHealth object with health check results
 * @returns Array of HealthWarning objects with type and message
 */
export function generateWarnings(health: Partial<ProjectHealth>): HealthWarning[] {
  const warnings: HealthWarning[] = [];

  if (
    health.lockfiles &&
    health.lockfiles.length > 0 &&
    !health.hasNodeModules
  ) {
    warnings.push({
      type: 'warning',
      message:
        'node_modules not found. Run `npm install` (or your package manager) to install dependencies.',
    });
  }

  if (health.hasMultipleLockfiles) {
    warnings.push({
      type: 'warning',
      message: `Multiple lockfiles found (${health.lockfiles?.join(', ')}). This can cause inconsistent installs. Remove all but one.`,
    });
  }

  if (
    health.typescript &&
    health.typescript.hasConfig &&
    !health.typescript.strict
  ) {
    warnings.push({
      type: 'info',
      message:
        'TypeScript strict mode is not enabled. Consider enabling for better type safety.',
    });
  }

  return warnings;
}

/**
 * Generate improvement suggestions.
 * Recommends adding missing scripts for linting, testing, and type-checking.
 *
 * @param health - Partial ProjectHealth object with scripts and TypeScript status
 * @returns Array of suggestion strings, limited to MAX_SUGGESTIONS
 */
export function generateSuggestions(health: Partial<ProjectHealth>): string[] {
  const suggestions: string[] = [];
  /* v8 ignore next -- @preserve defensive: scripts is always set by checkProjectHealth */
  const scripts = health.scripts || [];

  if (!scripts.includes('lint') && !scripts.includes('eslint')) {
    suggestions.push('Add a `lint` script to catch code issues');
  }

  if (
    !scripts.includes('test') &&
    !scripts.includes('jest') &&
    !scripts.includes('vitest')
  ) {
    suggestions.push('Add a `test` script for automated testing');
  }

  if (
    !scripts.includes('typecheck') &&
    !scripts.includes('tsc') &&
    health.typescript?.hasConfig
  ) {
    suggestions.push('Add a `typecheck` script (e.g., `tsc --noEmit`) for CI');
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

/**
 * Format project health status for display in context output.
 * Creates a comprehensive health report with package manager, TypeScript, scripts, and issues.
 *
 * @param health - The ProjectHealth object to format
 * @returns Formatted string with health details, or null if no relevant information
 *
 * @example
 * const formatted = formatProjectHealth(health);
 * // Returns multi-section report with package manager, TypeScript, scripts, warnings, and suggestions
 */
export function formatProjectHealth(health: ProjectHealth): string | null {
  const sections: string[] = [];

  if (health.packageManager) {
    let line = `**Package Manager:** ${health.packageManager}`;
    if (!health.hasNodeModules) {
      line += ' (dependencies not installed)';
    }
    sections.push(line);
  }

  if (health.typescript) {
    const ts = health.typescript;
    let line = '**TypeScript:** ';
    if (ts.strict) {
      line += 'strict mode enabled';
    } else {
      const flags: string[] = [];
      if (ts.strictNullChecks) {
        flags.push('strictNullChecks');
      }
      if (ts.noImplicitAny) {
        flags.push('noImplicitAny');
      }
      line += flags.length > 0 ? `partial (${flags.join(', ')})` : 'not strict';
    }
    if (ts.target) {
      line += `, target: ${ts.target}`;
    }
    sections.push(line);
  }

  if (health.scripts.length > 0) {
    const importantScripts = health.scripts.filter((script) =>
      ['dev', 'build', 'start', 'test', 'lint', 'typecheck'].includes(script)
    );
    if (importantScripts.length > 0) {
      sections.push(`**Scripts:** ${importantScripts.join(', ')}`);
    }
  }

  if (health.warnings.length > 0) {
    const warningLines = health.warnings.map((warning) => {
      const icon =
        warning.type === 'error' ? '[!]' : warning.type === 'warning' ? '[*]' : '[i]';
      return `${icon} ${warning.message}`;
    });
    sections.push(`**Health Issues:**\n${warningLines.join('\n')}`);
  }

  if (health.suggestions.length > 0) {
    const suggestionLines = health.suggestions.map((suggestion) => `- ${suggestion}`);
    sections.push(`**Suggestions:**\n${suggestionLines.join('\n')}`);
  }

  return sections.length > 0 ? sections.join('\n') : null;
}
