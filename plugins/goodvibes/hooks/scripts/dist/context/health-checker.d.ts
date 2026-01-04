/**
 * Health Checker
 *
 * Checks project health: dependencies, lockfiles, TypeScript configuration.
 */
/** Result of a single health check. */
export interface HealthCheck {
    check: string;
    status: 'ok' | 'warning' | 'error' | 'info';
    message: string;
}
/** Aggregated health status with all check results. */
export interface HealthStatus {
    checks: HealthCheck[];
}
/** Check project health: dependencies, lockfiles, TypeScript configuration. */
export declare function checkProjectHealth(cwd: string): Promise<HealthStatus>;
/** Format health status for display in context output. */
export declare function formatHealthStatus(status: HealthStatus): string;
