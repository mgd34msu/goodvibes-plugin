/**
 * Analyze Dependencies Handler
 *
 * Analyzes npm dependencies by comparing declared dependencies in package.json
 * against actual imports found in source files. Identifies unused, missing,
 * and optionally outdated packages.
 *
 * @module handlers/deps/analyze
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from '../../shared/response.js';
import { readJsonFile, fileExists, safeExec } from '../../shared/utils.js';

/**
 * Arguments for the analyze_dependencies MCP tool.
 * @property path - Project root path (defaults to PROJECT_ROOT)
 * @property check_updates - Whether to check npm registry for latest versions (slower)
 * @property include_dev - Include devDependencies in analysis
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
 * Information about a single npm dependency.
 * @property name - Package name (e.g., 'react', '@types/node')
 * @property declared_version - Version string from package.json
 * @property used - Whether the package is imported in source files
 * @property import_count - Number of times the package is imported
 * @property latest_version - Latest version from npm registry (if check_updates enabled)
 * @property outdated - Whether declared version is behind latest (if check_updates enabled)
 */
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

/**
 * Summary statistics for the dependency analysis.
 * @property total - Total number of dependencies analyzed
 * @property used - Number of dependencies that are imported in source
 * @property unused - Number of dependencies not found in any imports
 * @property outdated - Number of outdated dependencies (only with check_updates)
 */
interface AnalysisSummary {
  /** Total number of dependencies analyzed */
  total: number;
  /** Number of dependencies that are used (found in imports) */
  used: number;
  /** Number of dependencies that appear unused (not found in imports) */
  unused: number;
  /** Number of outdated dependencies (0 if check_updates was false) */
  outdated: number;
}

/**
 * Result of the dependency analysis operation.
 * @property dependencies - Array of analyzed dependencies (sorted: unused first, then by import count)
 * @property summary - Summary statistics for the analysis
 */
interface AnalysisResult {
  /** Array of analyzed dependencies, sorted with unused first then by import count */
  dependencies: DependencyInfo[];
  /** Summary statistics for the analysis */
  summary: AnalysisSummary;
}

/**
 * Recursively finds all source files in a directory.
 *
 * Skips common non-source directories (node_modules, .git, dist, etc.).
 *
 * @param dir - Directory to search
 * @param extensions - File extensions to include (default: .ts, .tsx, .js, .jsx, .mjs, .cjs)
 * @returns Promise resolving to array of absolute file paths
 */
async function findSourceFiles(
  dir: string,
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common non-source directories
      if (entry.isDirectory()) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache'];
        if (!skipDirs.includes(entry.name)) {
          const subFiles = await findSourceFiles(fullPath, extensions);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
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
 * Extracts import statements from file content.
 *
 * Parses ES6 imports, require() calls, and dynamic imports.
 * Skips relative imports and extracts base package names (handles scoped packages).
 *
 * @param content - Source file content to parse
 * @returns Map of package names to their import count in this file
 */
function extractImports(content: string): Map<string, number> {
  const imports = new Map<string, number>();

  // Match ES6 imports: import ... from 'package'
  const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"]([^'"]+)['"]/g;

  // Match require statements: require('package')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  // Match dynamic imports: import('package')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const addImport = (pkg: string) => {
    // Skip relative imports
    if (pkg.startsWith('.') || pkg.startsWith('/')) {
      return;
    }

    // Extract base package name (handle scoped packages)
    let basePkg: string;
    if (pkg.startsWith('@')) {
      // Scoped package: @scope/package/subpath -> @scope/package
      const parts = pkg.split('/');
      basePkg = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : pkg;
    } else {
      // Regular package: package/subpath -> package
      basePkg = pkg.split('/')[0];
    }

    imports.set(basePkg, (imports.get(basePkg) || 0) + 1);
  };

  let match: RegExpExecArray | null;

  while ((match = es6ImportRegex.exec(content)) !== null) {
    addImport(match[1]);
  }

  while ((match = requireRegex.exec(content)) !== null) {
    addImport(match[1]);
  }

  while ((match = dynamicImportRegex.exec(content)) !== null) {
    addImport(match[1]);
  }

  return imports;
}

/**
 * Fetches the latest version of a package from the npm registry.
 *
 * Uses `npm view` command with a 10 second timeout.
 *
 * @param packageName - npm package name to look up
 * @returns Latest version string, or null if lookup fails
 */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const result = await safeExec(`npm view ${packageName} version`, PROJECT_ROOT, 10000);
    if (result.error || !result.stdout) {
      return null;
    }
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Compares version strings to determine if installed version is outdated.
 *
 * Strips version prefixes (^, ~, >=) and pre-release suffixes before comparing.
 * Compares major.minor.patch numerically.
 *
 * @param installed - Installed version string (may include prefixes like ^, ~)
 * @param latest - Latest version string from npm registry
 * @returns True if installed version is less than latest
 */
function isOutdated(installed: string, latest: string): boolean {
  // Clean version strings (remove ^, ~, >=, etc.)
  const cleanInstalled = installed.replace(/^[\^~>=<]+/, '').split('-')[0];
  const cleanLatest = latest.replace(/^[\^~>=<]+/, '').split('-')[0];

  const installedParts = cleanInstalled.split('.').map((p) => parseInt(p, 10) || 0);
  const latestParts = cleanLatest.split('.').map((p) => parseInt(p, 10) || 0);

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    const inst = installedParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > inst) return true;
    if (inst > lat) return false;
  }

  return false;
}

/**
 * Handles the analyze_dependencies MCP tool call.
 *
 * Scans project source files for import statements and compares against
 * declared dependencies in package.json to identify:
 * - Used dependencies (found in imports)
 * - Unused dependencies (declared but not imported)
 * - Optionally checks npm registry for outdated packages
 *
 * @param args - The analyze_dependencies tool arguments
 * @returns MCP tool response with dependency analysis
 */
export async function handleAnalyzeDependencies(
  args: AnalyzeDependenciesArgs
): Promise<ToolResponse> {
  try {
    const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
    const includeDevDeps = args.include_dev !== false;
    const checkUpdates = args.check_updates === true;

    // Read package.json
    const pkg = (await readJsonFile(path.join(projectPath, 'package.json'))) as Record<
      string,
      Record<string, string>
    > | null;

    if (!pkg) {
      return createErrorResponse('package.json not found');
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
      const dirPath = path.join(projectPath, dir);
      if (await fileExists(dirPath)) {
        const files = await findSourceFiles(dirPath);
        sourceFiles.push(...files);
      }
    }

    // Also check root-level files
    const rootPath = projectPath;
    try {
      const rootEntries = await fsPromises.readdir(rootPath, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
            sourceFiles.push(path.join(rootPath, entry.name));
          }
        }
      }
    } catch {
      // Root directory read failed
    }

    // Aggregate imports across all files
    const allImports = new Map<string, number>();

    for (const file of sourceFiles) {
      try {
        const content = await fsPromises.readFile(file, 'utf-8');
        const fileImports = extractImports(content);

        fileImports.forEach((count, pkg) => {
          allImports.set(pkg, (allImports.get(pkg) || 0) + count);
        });
      } catch {
        // File read failed, skip
      }
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
        const latestVersion = await fetchLatestVersion(name);
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

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to analyze dependencies: ${message}`);
  }
}
