/**
 * Environment Configuration Module
 *
 * Consolidated environment analysis providing both quick checks and comprehensive analysis.
 *
 * **Two APIs:**
 * - `checkEnvStatus()` - Quick check returning {@link EnvStatus} (basic presence/missing vars)
 * - `analyzeEnvironment()` - Comprehensive analysis returning {@link EnvironmentContext}
 */
import type { EnvStatus, EnvironmentContext } from '../types/environment.js';
/** Re-export of environment status types for consumer convenience. */
export type { EnvStatus, EnvironmentContext };
/**
 * Quick environment check returning basic status.
 *
 * @param cwd - Working directory to check
 * @returns Promise resolving to EnvStatus
 */
export declare function checkEnvStatus(cwd: string): Promise<EnvStatus>;
/**
 * Comprehensive environment analysis including security checks.
 *
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export declare function analyzeEnvironment(cwd: string): Promise<EnvironmentContext>;
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
