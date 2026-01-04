/**
 * Project Health Checker
 *
 * Checks various project health indicators:
 * - node_modules existence
 * - Multiple lockfiles (npm + yarn + pnpm)
 * - TypeScript strict mode
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
/** Check overall project health including dependencies and TypeScript config. */
export declare function checkProjectHealth(cwd: string): Promise<ProjectHealth>;
/** Format project health status for display in context output. */
export declare function formatProjectHealth(health: ProjectHealth): string | null;
