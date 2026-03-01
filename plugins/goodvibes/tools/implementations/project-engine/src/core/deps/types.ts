/**
 * Shared types for the deps domain.
 *
 * @module core/deps/types
 */

/**
 * Arguments for the analyze_dependencies MCP tool.
 */
export interface AnalyzeDependenciesArgs {
  /** Project root path relative to PROJECT_ROOT (defaults to '.') */
  path?: string;
  /** Whether to check npm registry for latest versions (slower, requires network) */
  check_updates?: boolean;
  /** Include devDependencies in the analysis (default: true) */
  include_dev?: boolean;
}

/**
 * Arguments for the find_circular_deps MCP tool.
 *
 * Named CircularDepsArgs (was FindCircularDepsArgs in the handler).
 */
export interface CircularDepsArgs {
  /** Directory to scan (relative to project root or absolute, defaults to '.') */
  path?: string;
  /** Include node_modules in scan (default: false, typically left false for performance) */
  include_node_modules?: boolean;
}

/**
 * A detected circular dependency cycle in the import graph.
 */
export interface Cycle {
  /** Files forming the cycle, with first file repeated at end (e.g., [A, B, C, A]) */
  path: string[];
  /** Number of unique files in the cycle (path.length - 1) */
  length: number;
}

/**
 * Arguments for the upgrade_package MCP tool.
 */
export interface UpgradePackageArgs {
  /** Package name to upgrade */
  package: string;
  /** Target version (default: "latest") */
  target_version?: string;
  /** Whether to fetch release notes (default: true) */
  include_changelog?: boolean;
  /** Preview only, don't actually upgrade (default: true) */
  dry_run?: boolean;
  /** Run tests after upgrade (default: false) */
  run_tests_after?: boolean;
  /** Project path (defaults to PROJECT_ROOT) */
  path?: string;
}
