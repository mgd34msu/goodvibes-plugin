/**
 * Environment Configuration Module
 *
 * Consolidated environment analysis providing both quick checks and comprehensive analysis.
 *
 * **Two APIs:**
 * - `checkEnvStatus()` - Quick check returning {@link EnvStatus} (basic presence/missing vars)
 * - `analyzeEnvironment()` - Comprehensive analysis returning {@link EnvironmentContext}
 *
 * **Backwards Compatibility:**
 * - `checkEnvironment()` is an alias for `analyzeEnvironment()` (comprehensive)
 * - env-checker.ts re-exports `checkEnvStatus` as `checkEnvironment` for existing consumers
 */
/**
 * Lightweight environment status for quick checks.
 * Used by consumers that need basic env file presence information.
 */
export interface EnvStatus {
    hasEnvFile: boolean;
    hasEnvExample: boolean;
    missingVars: string[];
    warnings: string[];
}
/**
 * Comprehensive environment analysis results.
 * Includes sensitive variable detection and detailed file information.
 */
export interface EnvironmentContext {
    envFiles: string[];
    hasEnvExample: boolean;
    missingVars: string[];
    definedVars: string[];
    sensitiveVarsExposed: string[];
}
/**
 * Quick environment check returning basic status.
 *
 * This is the lightweight check that returns basic status. For comprehensive
 * environment analysis including sensitive variable detection, use
 * {@link analyzeEnvironment} instead.
 *
 * @param cwd - Working directory to check
 * @returns Promise resolving to EnvStatus
 */
export declare function checkEnvStatus(cwd: string): Promise<EnvStatus>;
/**
 * Comprehensive environment analysis including security checks.
 *
 * Performs full analysis including:
 * - Detection of all .env file variants
 * - Missing variable detection against example files
 * - Sensitive variable exposure detection (not in .gitignore)
 *
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export declare function analyzeEnvironment(cwd: string): Promise<EnvironmentContext>;
/**
 * Check environment configuration (comprehensive).
 *
 * @deprecated Use {@link analyzeEnvironment} for clarity. This is an alias for backwards compatibility.
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export declare function checkEnvironment(cwd: string): Promise<EnvironmentContext>;
/**
 * Format EnvStatus for display in context output.
 *
 * @param status - The EnvStatus to format
 * @returns Formatted string or empty string if no relevant info
 */
export declare function formatEnvStatus(status: EnvStatus): string;
/**
 * Format EnvironmentContext for display.
 *
 * @param context - The EnvironmentContext to format
 * @returns Formatted string or null if no env files
 */
export declare function formatEnvironment(context: EnvironmentContext): string | null;
