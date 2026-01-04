/**
 * Environment Checker
 *
 * Checks environment configuration and identifies missing variables.
 */
/** Environment configuration status. */
export interface EnvStatus {
    hasEnvFile: boolean;
    hasEnvExample: boolean;
    missingVars: string[];
    warnings: string[];
}
/** Check environment configuration: .env files and missing variables. */
export declare function checkEnvironment(cwd: string): Promise<EnvStatus>;
/** Format environment status for display in context output. */
export declare function formatEnvStatus(status: EnvStatus): string;
