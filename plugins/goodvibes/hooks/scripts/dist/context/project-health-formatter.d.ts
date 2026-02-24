/**
 * Project Health Formatter
 *
 * Formats project health analysis results for display in context output.
 */
import type { ProjectHealth, HealthWarning } from './project-health-types.js';
/**
 * Generate health warnings based on findings.
 * Creates warning messages for missing dependencies, multiple lockfiles, and loose TypeScript settings.
 *
 * @param health - Partial ProjectHealth object with health check results
 * @returns Array of HealthWarning objects with type and message
 */
export declare function generateWarnings(health: Partial<ProjectHealth>): HealthWarning[];
/**
 * Generate improvement suggestions.
 * Recommends adding missing scripts for linting, testing, and type-checking.
 *
 * @param health - Partial ProjectHealth object with scripts and TypeScript status
 * @returns Array of suggestion strings, limited to MAX_SUGGESTIONS
 */
export declare function generateSuggestions(health: Partial<ProjectHealth>): string[];
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
export declare function formatProjectHealth(health: ProjectHealth): string | null;
