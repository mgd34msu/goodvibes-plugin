/**
 * Environment Checker (Lightweight)
 *
 * Checks environment configuration and identifies missing variables.
 * Returns a simple EnvStatus for quick status checks.
 *
 * **Difference from environment.ts:**
 * - This module returns {@link EnvStatus} with basic env file presence/missing vars
 * - environment.ts returns {@link EnvironmentContext} with comprehensive analysis
 *   including sensitive variable detection and gitignore checks
 *
 * Use this when you need a quick check; use environment.ts for full analysis.
 */
/** Environment configuration status. */
export interface EnvStatus {
    hasEnvFile: boolean;
    hasEnvExample: boolean;
    missingVars: string[];
    warnings: string[];
}
/**
 * Check environment configuration: .env files and missing variables.
 *
 * This is a lightweight check that returns basic status. For comprehensive
 * environment analysis including sensitive variable detection, use
 * {@link checkEnvironment} from environment.ts instead.
 */
export declare function checkEnvironment(cwd: string): Promise<EnvStatus>;
/** Format environment status for display in context output. */
export declare function formatEnvStatus(status: EnvStatus): string;
