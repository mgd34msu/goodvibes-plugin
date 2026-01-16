/**
 * Project Health Types
 *
 * Shared type definitions for project health analysis.
 * Extracted to break circular dependency between project-health.ts and project-health-formatter.ts.
 */

/**
 * Module marker constant to ensure this file is included in coverage.
 * TypeScript interfaces compile to empty JavaScript, so this constant
 * provides a runtime value that coverage tools can detect.
 * @internal
 */
export const PROJECT_HEALTH_TYPES_MODULE = 'project-health-types' as const;

/** Comprehensive project health analysis results. */
export interface ProjectHealth {
  hasNodeModules: boolean;
  lockfiles: string[];
  hasMultipleLockfiles: boolean;
  typescript: TypeScriptHealth | null;
  packageManager: string | null;
  scripts: string[];
  warnings: HealthWarning[];
  suggestions: string[];
}

/** TypeScript configuration health indicators. */
export interface TypeScriptHealth {
  hasConfig: boolean;
  strict: boolean;
  strictNullChecks: boolean;
  noImplicitAny: boolean;
  target: string | null;
}

/** A health check warning or informational message. */
export interface HealthWarning {
  type: 'error' | 'warning' | 'info';
  message: string;
}
