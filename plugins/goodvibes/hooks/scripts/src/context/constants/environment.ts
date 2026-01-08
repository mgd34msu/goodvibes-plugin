/**
 * Environment Constants
 *
 * Configuration constants for environment file analysis.
 */

/**
 * Common sensitive variable patterns for security detection.
 * Used to identify environment variables that should not be committed.
 */
export const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret|password|token/i,
  /private[_-]?key/i,
  /credentials/i,
  /auth/i,
];

/**
 * All env file variants to check for.
 * Includes development, production, test, and local variants.
 */
export const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
];

/**
 * Example/template env files to check for required variables.
 * These files document the required environment variables.
 */
export const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];
