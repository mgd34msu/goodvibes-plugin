/**
 * Environment Checker (Comprehensive)
 *
 * Performs comprehensive environment configuration analysis including:
 * - Detection of all .env file variants (.env, .env.local, .env.production, etc.)
 * - Missing variable detection against .env.example/.env.sample/.env.template
 * - Sensitive variable exposure detection (API keys, secrets not in .gitignore)
 *
 * **Difference from env-checker.ts:**
 * - This module returns {@link EnvironmentContext} with full analysis
 * - env-checker.ts returns {@link EnvStatus} with basic presence/missing checks only
 *
 * Use this when you need comprehensive security analysis; use env-checker.ts for quick checks.
 */
/** Environment configuration analysis results. */
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
export declare function formatEnvironment(context: EnvironmentContext): string | null;
