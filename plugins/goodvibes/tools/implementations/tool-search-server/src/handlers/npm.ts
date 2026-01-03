/**
 * NPM package handlers
 */

import * as path from 'path';
import { PackageInfo, ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';
import { readJsonFile, safeExec } from '../utils.js';

export interface CheckVersionsArgs {
  packages?: string[];
  check_latest?: boolean;
  path?: string;
}

/**
 * Fetch package info from npm registry
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
 * Fetch npm package README and metadata
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
 * Handle check_versions tool call
 */
export async function handleCheckVersions(args: CheckVersionsArgs): Promise<ToolResponse> {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const pkg = readJsonFile(path.join(projectPath, 'package.json')) as Record<string, Record<string, string>> | null;

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
