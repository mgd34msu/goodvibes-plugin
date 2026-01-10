/**
 * Bundle Analyzer Handler
 *
 * Analyzes build output for bundle size, duplicates, and tree-shaking issues.
 * Supports common build output directories: dist/, .next/, build/
 *
 * @module handlers/build/bundle-analyzer
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { fileExists, readJsonFile } from '../../utils.js';

const gzip = promisify(zlib.gzip);

/**
 * Output format type
 */
export type BundleFormat = 'summary' | 'detailed';

/**
 * Arguments for the analyze_bundle MCP tool
 */
export interface AnalyzeBundleArgs {
  /** Build output directory path */
  path?: string;
  /** Output format - summary or detailed */
  format?: BundleFormat;
}

/**
 * Size information for a bundle
 */
interface SizeInfo {
  raw: number;
  gzip: number;
  formatted: string;
}

/**
 * Information about a chunk
 */
interface ChunkInfo {
  name: string;
  size: number;
  gzip_size: number;
  modules: number;
}

/**
 * Information about a large module
 */
interface ModuleInfo {
  name: string;
  size: number;
  from_package: string;
}

/**
 * Information about duplicate packages
 */
interface DuplicateInfo {
  package: string;
  versions: string[];
  total_size: number;
}

/**
 * Complete bundle analysis result
 */
interface BundleAnalysis {
  total_size: SizeInfo;
  chunks: ChunkInfo[];
  largest_modules: ModuleInfo[];
  duplicates: DuplicateInfo[];
  recommendations: string[];
  build_directory?: string;
  files_analyzed?: number;
}

/**
 * Known large packages that could be replaced with lighter alternatives
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

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Estimate gzip size for content
 */
async function estimateGzipSize(content: Buffer): Promise<number> {
  try {
    const compressed = await gzip(content, { level: 9 });
    return compressed.length;
  } catch {
    // Estimate ~30% compression if gzip fails
    return Math.round(content.length * 0.3);
  }
}

/**
 * Find build output directory
 */
async function findBuildDirectory(projectPath: string): Promise<string | null> {
  const candidates = [
    'dist',
    '.next/static',
    'build/static',
    'build',
    '.output',
    'out',
    '.vercel/output/static',
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(projectPath, candidate);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Recursively find all JS/CSS files in directory
 */
async function findBundleFiles(
  dir: string,
  files: string[] = []
): Promise<string[]> {
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip source maps and node_modules
        if (!entry.name.includes('node_modules')) {
          await findBundleFiles(fullPath, files);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        // Include JS, CSS, and their maps for size analysis
        if (['.js', '.mjs', '.css'].includes(ext) && !entry.name.endsWith('.map')) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory read failed
  }

  return files;
}

/**
 * Extract module information from bundle content
 * Looks for common bundler patterns (webpack, rollup, esbuild)
 */
function extractModules(content: string, fileName: string): ModuleInfo[] {
  const modules: ModuleInfo[] = [];
  const seen = new Set<string>();

  // Webpack module patterns
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
          size: 0, // Will be estimated
          from_package: pkgName,
        });
      }
    }
  }

  // Look for common large package patterns in minified code
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

/**
 * Extract package name from module path
 */
function extractPackageName(modulePath: string): string | null {
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

  // Handle regular packages
  const parts = modulePath.split('/');
  if (parts.length > 0 && !parts[0].startsWith('.')) {
    return parts[0];
  }

  return null;
}

/**
 * Detect duplicate packages by scanning package.json files in node_modules
 */
async function detectDuplicates(projectPath: string): Promise<DuplicateInfo[]> {
  const duplicates: DuplicateInfo[] = [];
  const packageVersions = new Map<string, Set<string>>();

  // Check for package-lock.json or yarn.lock for duplicate detection
  const lockFile = path.join(projectPath, 'package-lock.json');
  const lockContent = await readJsonFile(lockFile) as Record<string, unknown> | null;

  if (lockContent && lockContent.packages) {
    const packages = lockContent.packages as Record<string, { version?: string }>;

    for (const [pkgPath, info] of Object.entries(packages)) {
      if (pkgPath.includes('node_modules/') && info.version) {
        // Extract package name from path
        const match = pkgPath.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)$/);
        if (match) {
          const pkgName = match[1];
          if (!packageVersions.has(pkgName)) {
            packageVersions.set(pkgName, new Set());
          }
          packageVersions.get(pkgName)!.add(info.version);
        }
      }
    }

    // Find packages with multiple versions
    for (const [pkgName, versions] of packageVersions) {
      if (versions.size > 1) {
        duplicates.push({
          package: pkgName,
          versions: Array.from(versions).sort(),
          total_size: 0, // Would need deeper analysis to determine
        });
      }
    }
  }

  return duplicates.slice(0, 10); // Limit to top 10 duplicates
}

/**
 * Check package.json for tree-shaking issues
 */
async function checkTreeShakingIssues(projectPath: string): Promise<string[]> {
  const issues: string[] = [];

  const pkgJsonPath = path.join(projectPath, 'package.json');
  const pkgJson = await readJsonFile(pkgJsonPath) as Record<string, unknown> | null;

  if (pkgJson) {
    // Check for sideEffects field
    if (!('sideEffects' in pkgJson)) {
      issues.push('Consider adding "sideEffects: false" to package.json for better tree-shaking');
    }

    // Check for ESM module type
    if (pkgJson.type !== 'module') {
      issues.push('Consider using "type": "module" in package.json for native ESM support');
    }

    // Check dependencies for known non-tree-shakeable packages
    const deps = {
      ...(pkgJson.dependencies as Record<string, string> || {}),
      ...(pkgJson.devDependencies as Record<string, string> || {}),
    };

    for (const [pkg, altInfo] of Object.entries(PACKAGE_ALTERNATIVES)) {
      if (deps[pkg]) {
        issues.push(
          `${pkg} (${formatBytes(altInfo.size)}) detected - consider: ${altInfo.alternatives.join(', ')}`
        );
      }
    }
  }

  return issues;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
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

  // Tree-shaking recommendations
  recommendations.push(...treeShakingIssues);

  // Chunk recommendations
  if (analysis.chunks) {
    const largeChunks = analysis.chunks.filter(c => c.size > 500 * 1024);
    if (largeChunks.length > 0) {
      recommendations.push(
        `${largeChunks.length} chunk(s) exceed 500KB - consider splitting large chunks`
      );
    }
  }

  return recommendations.slice(0, 10); // Limit recommendations
}

/**
 * Handles the analyze_bundle MCP tool call.
 *
 * Scans build output directory for bundle files and analyzes:
 * - Total size (raw and gzipped)
 * - Individual chunks
 * - Large modules
 * - Duplicate dependencies
 * - Tree-shaking opportunities
 *
 * @param args - The analyze_bundle tool arguments
 * @returns MCP tool response with bundle analysis
 */
export async function handleAnalyzeBundle(
  args: AnalyzeBundleArgs
): Promise<ToolResponse> {
  const format = args.format || 'summary';

  // Find or use specified build directory
  let buildDir: string | null;
  if (args.path) {
    buildDir = path.resolve(PROJECT_ROOT, args.path);
    if (!await fileExists(buildDir)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Build directory not found: ${args.path}`,
            hint: 'Run your build command first, or specify the correct output directory',
          }, null, 2),
        }],
        isError: true,
      };
    }
  } else {
    buildDir = await findBuildDirectory(PROJECT_ROOT);
    if (!buildDir) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No build output directory found',
            hint: 'Run your build command first. Looking for: dist/, .next/, build/, .output/, out/',
            searched: PROJECT_ROOT,
          }, null, 2),
        }],
        isError: true,
      };
    }
  }

  // Find all bundle files
  const bundleFiles = await findBundleFiles(buildDir);

  if (bundleFiles.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'No bundle files found in build directory',
          directory: path.relative(PROJECT_ROOT, buildDir),
          hint: 'Ensure build output contains .js or .css files',
        }, null, 2),
      }],
      isError: true,
    };
  }

  // Analyze each bundle file
  const chunks: ChunkInfo[] = [];
  const allModules: ModuleInfo[] = [];
  let totalRaw = 0;
  let totalGzip = 0;

  for (const file of bundleFiles) {
    try {
      const content = await fsPromises.readFile(file);
      const rawSize = content.length;
      const gzipSize = await estimateGzipSize(content);

      totalRaw += rawSize;
      totalGzip += gzipSize;

      const relativePath = path.relative(buildDir, file);
      const contentStr = content.toString('utf-8');
      const modules = extractModules(contentStr, relativePath);

      chunks.push({
        name: relativePath,
        size: rawSize,
        gzip_size: gzipSize,
        modules: modules.length,
      });

      allModules.push(...modules);
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort chunks by size descending
  chunks.sort((a, b) => b.size - a.size);

  // Get unique largest modules
  const moduleMap = new Map<string, ModuleInfo>();
  for (const mod of allModules) {
    const existing = moduleMap.get(mod.from_package);
    if (!existing || mod.size > existing.size) {
      moduleMap.set(mod.from_package, mod);
    }
  }
  const largestModules = Array.from(moduleMap.values())
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  // Detect duplicates
  const duplicates = await detectDuplicates(PROJECT_ROOT);

  // Check for tree-shaking issues
  const treeShakingIssues = await checkTreeShakingIssues(PROJECT_ROOT);

  // Build analysis result
  const analysis: BundleAnalysis = {
    total_size: {
      raw: totalRaw,
      gzip: totalGzip,
      formatted: `${formatBytes(totalRaw)} (${formatBytes(totalGzip)} gzipped)`,
    },
    chunks: format === 'detailed' ? chunks : chunks.slice(0, 5),
    largest_modules: largestModules,
    duplicates,
    recommendations: [],
    build_directory: path.relative(PROJECT_ROOT, buildDir),
    files_analyzed: bundleFiles.length,
  };

  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis, treeShakingIssues);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(analysis, null, 2),
    }],
  };
}
