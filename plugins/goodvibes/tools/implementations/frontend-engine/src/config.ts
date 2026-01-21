/**
 * Configuration constants for frontend-engine.
 */

export const SERVER_NAME = 'frontend-engine';
export const SERVER_VERSION = '1.0.0';

/**
 * Get project root from environment or cwd.
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.cwd();
}
