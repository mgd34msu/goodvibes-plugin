/**
 * NPM package handlers
 *
 * Provides handlers for fetching npm package information, checking
 * package versions, and comparing installed vs latest versions.
 *
 * @module handlers/npm
 */

import * as path from 'path';
import { PackageInfo, ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';
import { readJsonFile, safeExec } from '../utils.js';

/**
 * Arguments for the check_versions MCP tool
 */
export interface CheckVersionsArgs {
  /** Specific packages to check (defaults to first 20 from package.json) */
  packages?: string[];
  /** Whether to fetch latest versions from npm registry */
  check_latest?: boolean;
  /** Path to project directory (defaults to PROJECT_ROOT) */
  path?: string;
}

/**
 * Fetches package version information from the npm registry.
 *
 * Uses `npm view` command to get the latest version and dist-tags
 * for a specified package.
 *
 * @param packageName - The npm package name to look up
 * @returns Object with latest and wanted versions, or null if lookup fails
 *
 * @example
 * const info = await fetchNpmPackageInfo('react');
 * // Returns: { latest: '18.2.0', wanted: '18.2.0' }
 *
 * @example
 * const info = await fetchNpmPackageInfo('nonexistent-package');
 * // Returns: null
 */
export async function fetchNpmPackageInfo(
  packageName: string
): Promise<{ latest: string; wanted?: string } | null> {
  try {
    // Use npm view command which is more reliable than direct registry calls
    const result = await safeExec(`npm view ${packageName} version`, PROJECT_ROOT, 10000);
    if (result.error || !result.stdout) {
      return null;
    }

    const latest = result.stdout.trim();

    // Also get dist-tags for wanted version
    const tagsResult = await safeExec(`npm view ${packageName} dist-tags --json`, PROJECT_ROOT, 10000);
    let wanted: string | undefined;
    if (!tagsResult.error && tagsResult.stdout) {
      try {
        const tags = JSON.parse(tagsResult.stdout);
        wanted = tags.latest;
      } catch {
        // Ignore parse errors
      }
    }

    return { latest, wanted };
  } catch {
    return null;
  }
}

/**
 * Fetches npm package README and metadata.
 *
 * Uses `npm view` command to retrieve the package README, description,
 * repository URL, and homepage from the npm registry.
 *
 * @param packageName - The npm package name to fetch README for
 * @returns Object with readme, description, repository, and homepage, or null on failure
 *
 * @example
 * const data = await fetchNpmReadme('lodash');
 * // Returns: {
 * //   readme: '# Lodash...',
 * //   description: 'Lodash modular utilities',
 * //   repository: 'https://github.com/lodash/lodash',
 * //   homepage: 'https://lodash.com/'
 * // }
 */
export async function fetchNpmReadme(
  packageName: string
): Promise<{
  readme?: string;
  description?: string;
  repository?: string;
  homepage?: string;
} | null> {
  try {
    const result = await safeExec(
      `npm view ${packageName} readme description repository.url homepage --json`,
      PROJECT_ROOT,
      15000
    );

    if (result.error || !result.stdout) {
      return null;
    }

    const data = JSON.parse(result.stdout);
    return {
      readme: typeof data.readme === 'string' ? data.readme.slice(0, 8000) : undefined,
      description: data.description,
      repository: data['repository.url']?.replace(/^git\+/, '').replace(/\.git$/, ''),
      homepage: data.homepage,
    };
  } catch {
    return null;
  }
}

/**
 * Handles the check_versions MCP tool call.
 *
 * Reads package.json to get installed dependency versions and optionally
 * checks against npm registry for latest versions. Identifies outdated
 * packages and potential breaking changes (major version bumps).
 *
 * @param args - The check_versions tool arguments
 * @param args.packages - Specific packages to check (defaults to first 20)
 * @param args.check_latest - Whether to fetch latest versions from npm
 * @param args.path - Project path containing package.json
 * @returns MCP tool response with package version information and summary
 * @throws Error if package.json is not found
 *
 * @example
 * await handleCheckVersions({ check_latest: true });
 * // Returns: {
 * //   packages: [{ name: 'react', installed: '^18.0.0', latest: '18.2.0', outdated: true }],
 * //   summary: { total: 10, outdated: 3, major_updates: 1, up_to_date: 7 }
 * // }
 *
 * @example
 * await handleCheckVersions({ packages: ['react', 'next'], check_latest: true });
 * // Checks only specified packages
 */
export async function handleCheckVersions(args: CheckVersionsArgs): Promise<ToolResponse> {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const pkg = await readJsonFile(path.join(projectPath, 'package.json')) as Record<string, Record<string, string>> | null;

  if (!pkg) {
    throw new Error('package.json not found');
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const packagesToCheck = args.packages?.length ? args.packages : Object.keys(deps).slice(0, 20);

  const packages: PackageInfo[] = [];

  for (const name of packagesToCheck) {
    const installed = deps[name] || 'not installed';
    const pkgInfo: PackageInfo = {
      name,
      installed,
      outdated: false,
    };

    // Fetch latest version from npm registry if requested
    if (args.check_latest && installed !== 'not installed') {
      try {
        const npmInfo = await fetchNpmPackageInfo(name);
        if (npmInfo) {
          pkgInfo.latest = npmInfo.latest;
          pkgInfo.wanted = npmInfo.wanted || installed;

          // Parse versions for comparison
          const installedClean = installed.replace(/^[\^~>=<]+/, '');
          const latestClean = npmInfo.latest;

          // Check if outdated
          if (installedClean !== latestClean) {
            pkgInfo.outdated = true;

            // Check for breaking changes (major version bump)
            const installedMajor = parseInt(installedClean.split('.')[0]) || 0;
            const latestMajor = parseInt(latestClean.split('.')[0]) || 0;
            pkgInfo.breaking_changes = latestMajor > installedMajor;
          }
        }
      } catch {
        // If npm lookup fails, continue without latest info
      }
    }

    packages.push(pkgInfo);
  }

  const outdatedCount = packages.filter(p => p.outdated).length;
  const majorUpdates = packages.filter(p => p.breaking_changes).length;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        packages,
        summary: {
          total: packages.length,
          outdated: outdatedCount,
          major_updates: majorUpdates,
          up_to_date: packages.length - outdatedCount,
        },
      }, null, 2),
    }],
  };
}
