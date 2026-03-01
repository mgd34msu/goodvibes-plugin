/**
 * Barrel export for core deps utilities.
 *
 * @module core/deps
 */

export type { AnalyzeDependenciesArgs, CircularDepsArgs, Cycle, UpgradePackageArgs } from './types.js';
export { IMPORT_PATTERNS } from './constants.js';
export { extractImports, parseImports, resolveImportPath } from './import-parser.js';
export { isOutdated, getCurrentVersion, isDevDependency, cleanVersion, parseVersion, isMajorBump } from './version-utils.js';
export { buildImportGraph, findCycles, extractCycle, createCycleSignature } from './graph.js';
export { extractGitHubRepo } from './registry.js';
export type { BreakingChange } from './changelog.js';
export { parseBreakingChanges, summarizeChangelog, generateUpgradeWarnings } from './changelog.js';
export { shouldSkipDirectory } from './file-utils.js';
