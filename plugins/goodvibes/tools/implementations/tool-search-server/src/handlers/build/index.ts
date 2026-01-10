/**
 * Build analysis handlers
 *
 * Provides tools for analyzing build output:
 * - analyze_bundle: Bundle size, duplicates, and tree-shaking analysis
 *
 * @module handlers/build
 */

export { handleAnalyzeBundle } from './bundle-analyzer.js';
export type { AnalyzeBundleArgs, BundleFormat } from './bundle-analyzer.js';
