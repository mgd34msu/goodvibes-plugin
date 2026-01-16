/**
 * Project Health Checker (Comprehensive)
 *
 * Performs comprehensive project health analysis including:
 * - node_modules existence and dependency status
 * - Multiple lockfile detection (npm + yarn + pnpm + bun)
 * - Detailed TypeScript configuration (strict, strictNullChecks, noImplicitAny, target)
 * - Available npm scripts detection
 * - Actionable suggestions for improvement
 *
 * **Difference from health-checker.ts:**
 * - This module returns {@link ProjectHealth} with full analysis including suggestions
 * - health-checker.ts returns {@link HealthStatus} with basic health checks array only
 *
 * Use this when you need comprehensive health analysis with suggestions;
 * use health-checker.ts for quick status checks.
 */
import type { ProjectHealth } from './project-health-types.js';
/**
 * Re-exported types for backward compatibility.
 * Consumers can import these types directly from this module.
 */
export type { ProjectHealth, TypeScriptHealth, HealthWarning } from './project-health-types.js';
/**
 * Check overall project health with comprehensive analysis.
 * Performs full analysis including TypeScript details and suggestions.
 * For lightweight status checks, use checkProjectHealth from health-checker.ts.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectHealth with comprehensive health analysis
 *
 * @example
 * const health = await checkProjectHealth('/my-project');
 * if (health.hasMultipleLockfiles) {
 *   debug('Multiple package manager lockfiles detected');
 * }
 * debug('Available scripts:', health.scripts);
 */
export declare function checkProjectHealth(cwd: string): Promise<ProjectHealth>;
export { formatProjectHealth } from './project-health-formatter.js';
