/**
 * Environment Types
 *
 * Type definitions for environment configuration analysis.
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
