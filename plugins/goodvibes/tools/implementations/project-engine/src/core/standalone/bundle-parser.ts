/**
 * Bundle Parser — L1 Core
 *
 * Pure parsing utilities for bundle analysis. Extracts module information
 * from bundle content and generates recommendations from analysis data.
 * No I/O: all functions operate on already-loaded string content.
 *
 * @module core/standalone/bundle-parser
 */

import { formatBytes } from '../../shared/utils.js';
import type { ModuleInfo, BundleAnalysis } from './types.js';

// =============================================================================
// Package Alternatives Registry
// =============================================================================

/**
 * Known large packages and their lighter alternatives.
 * Used to generate tree-shaking / alternative recommendations.
 */
const PACKAGE_ALTERNATIVES: Record<string, { size: number; alternatives: string[] }> = {
  'moment': { size: 280000, alternatives: ['date-fns', 'dayjs', 'luxon'] },
  'lodash': { size: 70000, alternatives: ['lodash-es (tree-shakeable)', 'individual lodash/* imports'] },
  'jquery': { size: 85000, alternatives: ['vanilla JS', 'cash-dom'] },
  'underscore': { size: 25000, alternatives: ['lodash-es', 'native array methods'] },
  'axios': { size: 45000, alternatives: ['fetch API', 'ky', 'got'] },
  'numeral': { size: 60000, alternatives: ['Intl.NumberFormat'] },
  'chart.js': { size: 200000, alternatives: ['lightweight-charts', 'uPlot'] },
};

// =============================================================================
// Module Extraction
// =============================================================================

/**
 * Extract module information from bundle content.
 *
 * Scans bundle text for:
 * - Webpack module comment annotations (/*! package-name *\/)
 * - CJS require() calls: require("package-name") or require('package-name')
 * - Common large package signatures in minified code
 *
 * @param content - Text content of a bundle/chunk file
 * @returns Array of detected modules with package attribution
 */
export function extractModules(content: string): ModuleInfo[] {
  const modules: ModuleInfo[] = [];
  const seen = new Set<string>();

  // Webpack module patterns: /*! node_modules/react/index.js */
  const webpackModuleRegex = /\/\*!\s*(\S+)\s*\*\//g;
  let match;
  while ((match = webpackModuleRegex.exec(content)) !== null) {
    const moduleName = match[1];
    if (!seen.has(moduleName) && moduleName.includes('/')) {
      seen.add(moduleName);
      const pkgName = extractPackageName(moduleName);
      if (pkgName) {
        modules.push({
          name: moduleName,
          size: 0,
          from_package: pkgName,
        });
      }
    }
  }

  // CJS require() calls: require("package-name") or require('package-name')
  // Matches top-level package requires (excludes relative paths starting with . or /)
  const requireRegex = /\brequire\(["']([^./"'][^"']*)["']\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    const moduleName = match[1];
    const pkgName = extractPackageName(moduleName);
    if (pkgName && !seen.has(pkgName)) {
      seen.add(pkgName);
      modules.push({
        name: moduleName,
        size: PACKAGE_ALTERNATIVES[pkgName]?.size || 0,
        from_package: pkgName,
      });
    }
  }

  // Large package heuristics in minified code.
  // NOTE: These patterns match characteristic API call combinations to reduce
  // false positives, but may still match user code that uses similar variable
  // names (e.g. a local variable named '_' or 'Chart' in non-library code).
  const largePackagePatterns: Array<{ pattern: RegExp; pkg: string }> = [
    { pattern: /\bmoment\b.*\b(locale|format|parse)\b/i, pkg: 'moment' },
    { pattern: /\blodash\b|\b_\.(map|filter|reduce|each)\b/i, pkg: 'lodash' },
    { pattern: /\bjQuery\b|\$\.(ajax|get|post)\b/i, pkg: 'jquery' },
    { pattern: /\baxios\b.*\b(get|post|put|delete)\b/i, pkg: 'axios' },
    { pattern: /\bReact\b.*\bcreateElement\b/i, pkg: 'react' },
    { pattern: /\bChart\b.*\b(Line|Bar|Pie)\b/i, pkg: 'chart.js' },
  ];

  for (const { pattern, pkg } of largePackagePatterns) {
    if (pattern.test(content) && !seen.has(pkg)) {
      seen.add(pkg);
      modules.push({
        name: pkg,
        size: PACKAGE_ALTERNATIVES[pkg]?.size || 0,
        from_package: pkg,
      });
    }
  }

  return modules;
}

// =============================================================================
// Package Name Extraction
// =============================================================================

/**
 * Extract package name from a module path.
 *
 * Handles:
 * - node_modules paths: `node_modules/@scope/pkg/file` → `@scope/pkg`
 * - Scoped packages: `@scope/pkg/sub` → `@scope/pkg`
 * - Regular packages: `pkg/sub/file` → `pkg`
 * - Relative paths (`./*`): returns null
 *
 * @param modulePath - Module path to extract package name from
 * @returns Package name, or null if the path is relative or unrecognized
 */
export function extractPackageName(modulePath: string): string | null {
  // Handle node_modules paths
  const nodeModulesMatch = modulePath.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  if (nodeModulesMatch) {
    return nodeModulesMatch[1];
  }

  // Handle scoped packages
  if (modulePath.startsWith('@')) {
    const parts = modulePath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  // Handle regular packages (not relative)
  const parts = modulePath.split('/');
  if (parts.length > 0 && !parts[0].startsWith('.')) {
    return parts[0];
  }

  return null;
}

// =============================================================================
// Recommendation Generation
// =============================================================================

/**
 * Generate actionable recommendations from bundle analysis data.
 *
 * Produces recommendations based on:
 * - Total bundle size vs. 1 MB threshold
 * - Gzip size vs. 250 KB threshold
 * - Detected duplicate packages
 * - Tree-shaking issues (package.json configuration, large package alternatives)
 * - Chunk size vs. 500 KB threshold
 *
 * @param analysis - Partial bundle analysis data
 * @param treeShakingIssues - Issues collected from package.json analysis
 * @returns Array of recommendation strings (up to 10)
 */
export function generateBundleRecommendations(
  analysis: Partial<BundleAnalysis>,
  treeShakingIssues: string[]
): string[] {
  const recommendations: string[] = [];

  // Size-based recommendations
  if (analysis.total_size && analysis.total_size.raw > 1024 * 1024) {
    recommendations.push('Total bundle size exceeds 1MB - consider code splitting and lazy loading');
  }

  if (analysis.total_size && analysis.total_size.gzip > 250 * 1024) {
    recommendations.push('Gzipped size exceeds 250KB - may impact initial page load time');
  }

  // Duplicate recommendations
  if (analysis.duplicates && analysis.duplicates.length > 0) {
    recommendations.push(
      `Found ${analysis.duplicates.length} duplicate package(s) - run "npm dedupe" or check for version conflicts`
    );
  }

  // Tree-shaking recommendations (from package.json analysis)
  recommendations.push(...treeShakingIssues);

  // Chunk size recommendations
  if (analysis.chunks) {
    const largeChunks = analysis.chunks.filter(c => c.size > 500 * 1024);
    if (largeChunks.length > 0) {
      recommendations.push(
        `${largeChunks.length} chunk(s) exceed 500KB - consider splitting large chunks`
      );
    }
  }

  return recommendations.slice(0, 10);
}

// =============================================================================
// Tree-Shaking Issue Text Generator
// =============================================================================

/**
 * Generate tree-shaking issue descriptions for detected large packages.
 *
 * Used by the handler to populate tree-shaking issue strings before passing
 * them to generateBundleRecommendations.
 *
 * @param deps - Combined dependencies from package.json (dependencies + devDependencies)
 * @returns Array of tree-shaking issue strings
 */
export function generatePackageAlternativeMessages(
  deps: Record<string, string>
): string[] {
  const issues: string[] = [];
  for (const [pkg, altInfo] of Object.entries(PACKAGE_ALTERNATIVES)) {
    if (deps[pkg]) {
      issues.push(
        `${pkg} (${formatBytes(altInfo.size)}) detected - consider: ${altInfo.alternatives.join(', ')}`
      );
    }
  }
  return issues;
}
