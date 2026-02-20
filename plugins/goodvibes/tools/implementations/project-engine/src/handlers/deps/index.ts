/**
 * Dependencies domain handlers.
 *
 * Provides 3 tools for dependency analysis:
 * - project_deps_analyze: Analyze project dependencies for security, updates, and issues
 * - project_deps_circular: Detect circular import dependencies using DFS coloring
 * - project_deps_upgrade: Upgrade packages with breaking change detection
 */

export { handleAnalyzeDependencies } from './analyze.js';
export { handleFindCircularDeps } from './circular.js';
export { handleUpgradePackage } from './upgrade.js';
