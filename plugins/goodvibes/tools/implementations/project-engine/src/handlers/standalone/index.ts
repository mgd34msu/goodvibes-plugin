/**
 * Standalone domain handlers.
 *
 * Provides 2 independent tools:
 * - scaffold: Scaffold new projects from templates
 * - bundle_analyze: Analyze bundle size and optimization opportunities
 */

export { handleScaffoldProject } from './scaffold.js';
export { handleAnalyzeBundle } from './bundle.js';
