/**
 * Project Health Checker
 *
 * Checks various project health indicators:
 * - node_modules existence
 * - Multiple lockfiles (npm + yarn + pnpm)
 * - TypeScript strict mode
 */
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
export interface TypeScriptHealth {
    hasConfig: boolean;
    strict: boolean;
    strictNullChecks: boolean;
    noImplicitAny: boolean;
    target: string | null;
}
export interface HealthWarning {
    type: 'error' | 'warning' | 'info';
    message: string;
}
/**
 * Check overall project health
 */
export declare function checkProjectHealth(cwd: string): Promise<ProjectHealth>;
/**
 * Format project health for display
 */
export declare function formatProjectHealth(health: ProjectHealth): string | null;
