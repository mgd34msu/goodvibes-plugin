/**
 * Dependency analysis handlers
 *
 * Provides tools for analyzing npm dependencies and import relationships:
 * - analyze_dependencies: Find unused, missing, and outdated packages
 * - find_circular_deps: Detect circular import dependencies
 *
 * @module handlers/deps
 */

// NPM dependency analysis
export { handleAnalyzeDependencies } from './analyze.js';
export type { AnalyzeDependenciesArgs } from './analyze.js';

// Circular dependency detection
export { handleFindCircularDeps } from './circular.js';
export type { FindCircularDepsArgs } from './circular.js';
