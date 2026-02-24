/**
 * Environment Constants
 *
 * Configuration constants for environment file analysis.
 */
/**
 * Common sensitive variable patterns for security detection.
 * Used to identify environment variables that should not be committed.
 */
export declare const SENSITIVE_PATTERNS: RegExp[];
/**
 * All env file variants to check for.
 * Includes development, production, test, and local variants.
 */
export declare const ENV_FILES: string[];
/**
 * Example/template env files to check for required variables.
 * These files document the required environment variables.
 */
export declare const ENV_EXAMPLE_FILES: string[];
