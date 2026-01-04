/**
 * Health Checker (Lightweight)
 *
 * Checks project health: dependencies, lockfiles, TypeScript configuration.
 * Returns a simple HealthStatus for quick checks.
 *
 * **Difference from project-health.ts:**
 * - This module returns {@link HealthStatus} with basic health checks array
 * - project-health.ts returns {@link ProjectHealth} with comprehensive analysis
 *   including TypeScript config details, npm scripts, and suggestions
 *
 * Use this when you need quick health checks; use project-health.ts for full analysis.
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
/**
 * Check project health: dependencies, lockfiles, TypeScript configuration.
 *
 * This is a lightweight check returning basic status. For comprehensive
 * health analysis including TypeScript details and suggestions, use
 * {@link checkProjectHealth} from project-health.ts instead.
 */
export declare function checkProjectHealth(cwd: string): Promise<HealthStatus>;
/** Format health status for display in context output. */
export declare function formatHealthStatus(status: HealthStatus): string;
