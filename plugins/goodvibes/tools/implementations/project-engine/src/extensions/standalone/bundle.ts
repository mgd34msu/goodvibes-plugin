/**
 * Bundle Analyzer — L2 Extension
 *
 * Composes L1 core/standalone utilities with I/O, orchestrates the full
 * analyze_bundle workflow, and returns an McpResponse.
 *
 * @module extensions/standalone/bundle
 */

import * as node_fs from 'node:fs/promises';
import * as node_path from 'node:path';
import * as node_zlib from 'node:zlib';
import { promisify } from 'node:util';

import { PROJECT_ROOT } from '../../shared/config.js';
import { fileExists, readJsonFile, formatBytes } from '../../shared/utils.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import {
  extractModules,
  extractPackageName,
  generateBundleRecommendations,
  generatePackageAlternativeMessages,
} from '../../core/standalone/bundle-parser.js';
import type {
  AnalyzeBundleArgs,
  BundleAnalysis,
  ChunkInfo,
  ModuleInfo,
  DuplicateInfo,
  SizeInfo,
} from '../../core/standalone/types.js';

const gzip = promisify(node_zlib.gzip);

// =============================================================================
// Internal I/O Helpers
// =============================================================================

/**
 * Estimate gzip-compressed size for a buffer.
 *
 * @param content - Raw file content buffer
 * @returns Estimated gzip byte count (falls back to 30% of raw size on error)
 */
async function estimateGzipSize(content: Buffer): Promise<number> {
  try {
    const compressed = await gzip(content, { level: 9 });
    return compressed.length;
  } catch {
    return Math.round(content.length * 0.3);
  }
}

/**
 * Find the build output directory inside a project.
 *
 * Checks common output paths in order: dist, .next/static, build/static,
 * build, .output, out, .vercel/output/static.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Absolute path to the first existing candidate, or null
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
    const fullPath = node_path.join(projectPath, candidate);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Recursively find all JS/CSS bundle files in a directory.
 *
 * Skips node_modules subdirectories. Includes .js, .mjs, and .css files
 * but excludes source maps (*.map).
 *
 * @param dir - Absolute directory path to search
 * @param files - Accumulator (used in recursion)
 * @returns Array of absolute file paths
 */
async function findBundleFiles(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await node_fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = node_path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.includes('node_modules')) {
          await findBundleFiles(fullPath, files);
        }
      } else if (entry.isFile()) {
        const ext = node_path.extname(entry.name).toLowerCase();
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
 * Detect duplicate packages by scanning package-lock.json.
 *
 * @param projectPath - Absolute project root path
 * @returns Array of DuplicateInfo objects (top 10)
 */
async function detectDuplicates(projectPath: string): Promise<DuplicateInfo[]> {
  const duplicates: DuplicateInfo[] = [];
  const packageVersions = new Map<string, Set<string>>();

  const lockFile = node_path.join(projectPath, 'package-lock.json');
  const lockContent = await readJsonFile(lockFile) as Record<string, unknown> | null;

  if (lockContent && lockContent.packages) {
    const packages = lockContent.packages as Record<string, { version?: string }>;

    for (const [pkgPath, info] of Object.entries(packages)) {
      if (pkgPath.includes('node_modules/') && info.version) {
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

    for (const [pkgName, versions] of packageVersions) {
      if (versions.size > 1) {
        duplicates.push({
          package: pkgName,
          versions: Array.from(versions).sort(),
          total_size: 0,
        });
      }
    }
  }

  return duplicates.slice(0, 10);
}

/**
 * Collect tree-shaking issue strings from package.json analysis.
 *
 * Checks for:
 * - Missing `sideEffects` field
 * - Missing `"type": "module"`
 * - Known large packages with lighter alternatives
 *
 * @param projectPath - Absolute project root path
 * @returns Array of human-readable issue strings
 */
async function checkTreeShakingIssues(projectPath: string): Promise<string[]> {
  const issues: string[] = [];

  const pkgJsonPath = node_path.join(projectPath, 'package.json');
  const pkgJson = await readJsonFile(pkgJsonPath) as Record<string, unknown> | null;

  if (pkgJson) {
    if (!('sideEffects' in pkgJson)) {
      issues.push('Consider adding "sideEffects: false" to package.json for better tree-shaking');
    }

    if (pkgJson.type !== 'module') {
      issues.push('Consider using "type": "module" in package.json for native ESM support');
    }

    const deps = {
      ...(pkgJson.dependencies as Record<string, string> || {}),
      ...(pkgJson.devDependencies as Record<string, string> || {}),
    };

    issues.push(...generatePackageAlternativeMessages(deps));
  }

  return issues;
}

// =============================================================================
// Public Handler
// =============================================================================

/**
 * Analyze the bundle output of a project.
 *
 * Workflow:
 * 1. Locate the build directory (explicit path or auto-detected)
 * 2. Recursively find all JS/CSS bundle files
 * 3. Read each file, compute raw + gzip sizes, detect embedded modules
 * 4. Detect duplicate packages from package-lock.json
 * 5. Collect tree-shaking issues from package.json
 * 6. Generate recommendations and return the result
 *
 * @param args - AnalyzeBundleArgs with optional path and format
 * @returns McpResponse with JSON-encoded BundleAnalysis or error details
 */
export async function analyzeBundle(args: AnalyzeBundleArgs): Promise<McpResponse> {
  const format = args.format || 'summary';

  // Resolve build directory
  let buildDir: string | null;
  if (args.path) {
    buildDir = node_path.resolve(PROJECT_ROOT, args.path);
    if (!await fileExists(buildDir)) {
      return fail(`Build directory not found: ${args.path}`, {
        hint: 'Run your build command first, or specify the correct output directory',
      });
    }
  } else {
    buildDir = await findBuildDirectory(PROJECT_ROOT);
    if (!buildDir) {
      return fail('No build output directory found', {
        hint: 'Run your build command first. Looking for: dist/, .next/, build/, .output/, out/',
        searched: PROJECT_ROOT,
      });
    }
  }

  // Find bundle files
  const bundleFiles = await findBundleFiles(buildDir);

  if (bundleFiles.length === 0) {
    return fail('No bundle files found in build directory', {
      directory: node_path.relative(PROJECT_ROOT, buildDir),
      hint: 'Ensure build output contains .js or .css files',
    });
  }

  // Analyze each file
  const chunks: ChunkInfo[] = [];
  const allModules: ModuleInfo[] = [];
  let totalRaw = 0;
  let totalGzip = 0;

  for (const file of bundleFiles) {
    try {
      const content = await node_fs.readFile(file);
      const rawSize = content.length;
      const gzipSize = await estimateGzipSize(content);

      totalRaw += rawSize;
      totalGzip += gzipSize;

      const relativePath = node_path.relative(buildDir, file);
      const contentStr = content.toString('utf-8');
      const modules = extractModules(contentStr);

      chunks.push({
        name: relativePath,
        size: rawSize,
        gzip_size: gzipSize,
        modules: modules.length,
      });

      allModules.push(...modules);
    } catch {
      // Skip unreadable files
    }
  }

  // Sort chunks by size descending
  chunks.sort((a, b) => b.size - a.size);

  // Deduplicate modules by package, keep largest
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

  const duplicates = await detectDuplicates(PROJECT_ROOT);
  const treeShakingIssues = await checkTreeShakingIssues(PROJECT_ROOT);

  const totalSizeInfo: SizeInfo = {
    raw: totalRaw,
    gzip: totalGzip,
    formatted: `${formatBytes(totalRaw)} (${formatBytes(totalGzip)} gzipped)`,
  };

  const analysis: BundleAnalysis = {
    total_size: totalSizeInfo,
    chunks: format === 'detailed' ? chunks : chunks.slice(0, 5),
    largest_modules: largestModules,
    duplicates,
    recommendations: [],
    build_directory: node_path.relative(PROJECT_ROOT, buildDir),
    files_analyzed: bundleFiles.length,
  };

  analysis.recommendations = generateBundleRecommendations(analysis, treeShakingIssues);

  return ok(analysis);
}

// Re-export extractPackageName for consumers that need it
export { extractPackageName };
