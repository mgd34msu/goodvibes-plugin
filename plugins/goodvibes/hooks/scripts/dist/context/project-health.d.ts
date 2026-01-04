/**
 * Project Health Checker (Comprehensive)
 *
 * Performs comprehensive project health analysis including:
 * - node_modules existence and dependency status
 * - Multiple lockfile detection (npm + yarn + pnpm + bun)
 * - Detailed TypeScript configuration (strict, strictNullChecks, noImplicitAny, target)
 * - Available npm scripts detection
 * - Actionable suggestions for improvement
 *
 * **Difference from health-checker.ts:**
 * - This module returns {@link ProjectHealth} with full analysis including suggestions
 * - health-checker.ts returns {@link HealthStatus} with basic health checks array only
 *
 * Use this when you need comprehensive health analysis with suggestions;
 * use health-checker.ts for quick status checks.
 */
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
/**
 * Check overall project health with comprehensive analysis.
 *
 * This performs full analysis including TypeScript details and suggestions.
 * For lightweight status checks, use checkProjectHealth from health-checker.ts.
 */
export declare function checkProjectHealth(cwd: string): Promise<ProjectHealth>;
/** Format project health status for display in context output. */
export declare function formatProjectHealth(health: ProjectHealth): string | null;
