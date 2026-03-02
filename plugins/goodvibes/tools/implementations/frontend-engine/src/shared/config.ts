/**
 * Runtime configuration for frontend-engine.
 *
 * Provides environment-derived path constants used throughout the engine.
 *
 * @module shared/config
 */

// =============================================================================
// Accessor Functions
// =============================================================================

/**
 * Get the project root directory being analyzed.
 *
 * Resolved from PROJECT_ROOT environment variable, or falls back to
 * the current working directory.
 *
 * @returns Absolute path to the current project root
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.cwd();
}
