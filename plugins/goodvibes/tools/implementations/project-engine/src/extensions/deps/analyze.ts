/**
 * analyzeDependencies — L2 extension for the deps domain.
 *
 * Composes L1 core/deps utilities to analyze npm dependencies by comparing
 * declared package.json entries against actual imports in source files.
 *
 * @module extensions/deps/analyze
 */

import * as node_fs from 'node:fs/promises';
import * as node_path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';
import { readJsonFile, fileExists, safeExec } from '../../shared/utils.js';
import { SOURCE_EXTENSIONS, SKIP_DIRECTORIES } from '../../shared/constants.js';

import type { AnalyzeDependenciesArgs } from '../../core/deps/types.js';
import { extractImports } from '../../core/deps/import-parser.js';
import { isOutdated } from '../../core/deps/version-utils.js';

/** Information about a single npm dependency */
interface DependencyInfo {
  /** Package name from package.json */
  name: string;
  /** Version string as declared in package.json (e.g., '^1.2.3') */
  declared_version: string;
  /** Whether the package is imported anywhere in source files */
  used: boolean;
  /** Number of import statements referencing this package */
  import_count: number;
  /** Latest version from npm registry (only if check_updates is true) */
  latest_version?: string;
  /** Whether the package is outdated compared to latest (only if check_updates is true) */
  outdated?: boolean;
}

/** Summary statistics for the dependency analysis */
interface AnalysisSummary {
  total: number;
  used: number;
  unused: number;
  outdated: number;
}

/** Result of the dependency analysis operation */
interface AnalysisResult {
  dependencies: DependencyInfo[];
  summary: AnalysisSummary;
}

/**
 * Recursively finds all source files in a directory.
 *
 * Skips common non-source directories (node_modules, .git, dist, etc.).
 *
 * @param dir - Directory to search
 * @returns Promise resolving to array of absolute file paths
 */
async function findSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await node_fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = node_path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.includes(entry.name)) {
          const subFiles = await findSourceFiles(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        const ext = node_path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory read failed, return empty
  }

  return files;
}

/**
 * Fetches the latest version of a package from the npm registry.
 *
 * @param packageName - npm package name to look up
 * @param projectRoot - Project root for running npm commands
 * @returns Latest version string, or null if lookup fails
 */
async function fetchLatestVersion(
  packageName: string,
  projectRoot: string
): Promise<string | null> {
  try {
    const result = await safeExec(`npm view ${packageName} version`, projectRoot, 10000);
    if (result.error || !result.stdout) {
      return null;
    }
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Analyzes npm dependencies in a project.
 *
 * Scans project source files for import statements and compares against
 * declared dependencies in package.json to identify used, unused, and
 * optionally outdated packages.
 *
 * @param args - The analyze_dependencies tool arguments
 * @returns MCP tool response with dependency analysis
 */
export async function analyzeDependencies(args: AnalyzeDependenciesArgs): Promise<McpResponse> {
  try {
    const projectPath = node_path.resolve(PROJECT_ROOT, args.path || '.');
    const includeDevDeps = args.include_dev !== false;
    const checkUpdates = args.check_updates === true;

    // Read package.json
    const pkg = (await readJsonFile(node_path.join(projectPath, 'package.json'))) as Record<
      string,
      Record<string, string>
    > | null;

    if (!pkg) {
      return fail('package.json not found');
    }

    // Collect all declared dependencies
    const declaredDeps: Record<string, string> = {
      ...(pkg.dependencies || {}),
      ...(includeDevDeps ? pkg.devDependencies || {} : {}),
    };

    // Find all source files
    const srcDirs = ['src', 'app', 'pages', 'lib', 'components', 'utils', 'hooks'];
    let sourceFiles: string[] = [];

    for (const dir of srcDirs) {
      const dirPath = node_path.join(projectPath, dir);
      if (await fileExists(dirPath)) {
        const files = await findSourceFiles(dirPath);
        sourceFiles.push(...files);
      }
    }

    // Also check root-level source files
    try {
      const rootEntries = await node_fs.readdir(projectPath, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (entry.isFile()) {
          const ext = node_path.extname(entry.name).toLowerCase();
          if (SOURCE_EXTENSIONS.includes(ext)) {
            sourceFiles.push(node_path.join(projectPath, entry.name));
          }
        }
      }
    } catch {
      // Root directory read failed
    }

    // Aggregate imports across all files
    const allImports = new Map<string, number>();

    for (const file of sourceFiles) {
      const fileImports = await extractImports(file);
      fileImports.forEach((count, pkg) => {
        allImports.set(pkg, (allImports.get(pkg) || 0) + count);
      });
    }

    // Analyze each declared dependency
    const dependencies: DependencyInfo[] = [];
    let usedCount = 0;
    let outdatedCount = 0;

    const depNames = Object.keys(declaredDeps);

    for (const name of depNames) {
      const declaredVersion = declaredDeps[name];
      const importCount = allImports.get(name) || 0;
      const used = importCount > 0;

      if (used) {
        usedCount++;
      }

      const depInfo: DependencyInfo = {
        name,
        declared_version: declaredVersion,
        used,
        import_count: importCount,
      };

      // Check for updates if requested
      if (checkUpdates) {
        const latestVersion = await fetchLatestVersion(name, projectPath);
        if (latestVersion) {
          depInfo.latest_version = latestVersion;
          depInfo.outdated = isOutdated(declaredVersion, latestVersion);
          if (depInfo.outdated) {
            outdatedCount++;
          }
        }
      }

      dependencies.push(depInfo);
    }

    // Sort: unused first, then by import count descending
    dependencies.sort((a, b) => {
      if (a.used !== b.used) {
        return a.used ? 1 : -1; // Unused first
      }
      return b.import_count - a.import_count;
    });

    const result: AnalysisResult = {
      dependencies,
      summary: {
        total: depNames.length,
        used: usedCount,
        unused: depNames.length - usedCount,
        outdated: outdatedCount,
      },
    };

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to analyze dependencies: ${message}`);
  }
}
