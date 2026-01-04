/**
 * Environment Checker
 *
 * Checks .env files and finds missing environment variables.
 */
export interface EnvironmentContext {
    envFiles: string[];
    hasEnvExample: boolean;
    missingVars: string[];
    definedVars: string[];
    sensitiveVarsExposed: string[];
}
/**
 * Check environment configuration
 */
export declare function checkEnvironment(cwd: string): Promise<EnvironmentContext>;
/**
 * Format environment context for display
 */
export declare function formatEnvironment(ctx: EnvironmentContext): string | null;
