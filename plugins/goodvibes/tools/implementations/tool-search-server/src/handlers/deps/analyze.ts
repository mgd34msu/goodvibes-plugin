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
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { readJsonFile, fileExists, safeExec } from '../../utils.js';

/**
 * Arguments for the analyze_dependencies MCP tool
 */
export interface AnalyzeDependenciesArgs {
  /** Project root path (defaults to PROJECT_ROOT) */
  path?: string;
  /** Whether to check npm registry for latest versions (slower) */
  check_updates?: boolean;
  /** Include devDependencies in analysis */
  include_dev?: boolean;
}

/**
 * Information about a single dependency
 */
interface DependencyInfo {
  name: string;
  declared_version: string;
  used: boolean;
  import_count: number;
  latest_version?: string;
  outdated?: boolean;
}

/**
 * Summary statistics for the analysis
 */
interface AnalysisSummary {
  total: number;
  used: number;
  unused: number;
  outdated: number;
}

/**
 * Result of the dependency analysis
 */
interface AnalysisResult {
  dependencies: DependencyInfo[];
  summary: AnalysisSummary;
}

/**
 * Recursively find all source files in a directory
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
 * Extract import statements from file content
 * Returns a map of package names to import count
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
 * Fetch latest version from npm registry
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
 * Compare version strings to check if outdated
 * Returns true if installed version is less than latest
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
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const includeDevDeps = args.include_dev !== false;
  const checkUpdates = args.check_updates === true;

  // Read package.json
  const pkg = (await readJsonFile(path.join(projectPath, 'package.json'))) as Record<
    string,
    Record<string, string>
  > | null;

  if (!pkg) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'package.json not found' }),
        },
      ],
      isError: true,
    };
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

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
