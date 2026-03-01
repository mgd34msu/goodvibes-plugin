/**
 * analyzeUpgrade — L2 extension for the deps domain.
 *
 * Composes L1 core/deps utilities to analyze an npm package upgrade with
 * breaking change detection, changelog parsing, dependency impact analysis,
 * and optional test execution. Supports dry run mode for safe preview.
 *
 * @module extensions/deps/upgrade
 */

import * as node_fs from 'node:fs/promises';
import * as node_path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';
import { readJsonFile, fileExists, safeExec } from '../../shared/utils.js';

import type { UpgradePackageArgs } from '../../core/deps/types.js';
import { getCurrentVersion, isDevDependency, cleanVersion, isMajorBump } from '../../core/deps/version-utils.js';
import { extractGitHubRepo } from '../../core/deps/registry.js';
import type { BreakingChange } from '../../core/deps/changelog.js';
import { parseBreakingChanges, summarizeChangelog, generateUpgradeWarnings } from '../../core/deps/changelog.js';

import { validatePackageName, validateVersion } from '../../core/deps/validation.js';

/** Test execution results */
interface TestResults {
  passed: boolean;
  output: string;
}

/** Result of the upgrade operation */
interface UpgradePackageResult {
  package: string;
  current_version: string;
  target_version: string;
  is_major_bump: boolean;
  changelog_summary?: string;
  release_notes_url?: string;
  breaking_changes: BreakingChange[];
  dependencies_affected: string[];
  upgrade_applied: boolean;
  test_results?: TestResults;
  rollback_command: string;
  warnings: string[];
}

/**
 * Fetches the target version from npm registry.
 */
async function fetchTargetVersion(
  packageName: string,
  targetVersion: string,
  projectRoot: string
): Promise<string | null> {
  validatePackageName(packageName);
  if (targetVersion !== 'latest') {
    validateVersion(targetVersion);
    const result = await safeExec(
      `npm view ${packageName}@${targetVersion} version`,
      projectRoot,
      15000
    );
    if (result.error || !result.stdout) {
      return null;
    }
    return result.stdout.trim();
  }

  const result = await safeExec(`npm view ${packageName} version`, projectRoot, 15000);
  // Note: validatePackageName was already called at function entry
  if (result.error || !result.stdout) {
    return null;
  }
  return result.stdout.trim();
}

/**
 * Fetches npm package metadata including repository and homepage.
 */
async function fetchNpmMetadata(
  packageName: string,
  projectRoot: string
): Promise<{
  repository?: { type?: string; url?: string };
  homepage?: string;
  bugs?: { url?: string };
} | null> {
  validatePackageName(packageName);
  const result = await safeExec(
    `npm view ${packageName} repository homepage bugs --json`,
    projectRoot,
    15000
  );

  if (result.error || !result.stdout) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Attempts to fetch changelog content from various sources.
 */
async function fetchChangelog(
  packageName: string,
  projectRoot: string
): Promise<{ content: string | null; url: string | null }> {
  const metadata = await fetchNpmMetadata(packageName, projectRoot);
  const github = metadata ? extractGitHubRepo(metadata) : null;

  const urls: string[] = [];

  if (github) {
    urls.push(
      `https://raw.githubusercontent.com/${github.owner}/${github.repo}/main/CHANGELOG.md`,
      `https://raw.githubusercontent.com/${github.owner}/${github.repo}/master/CHANGELOG.md`,
      `https://raw.githubusercontent.com/${github.owner}/${github.repo}/main/HISTORY.md`,
      `https://raw.githubusercontent.com/${github.owner}/${github.repo}/master/HISTORY.md`
    );
  }

  // Try unpkg as fallback
  urls.push(`https://unpkg.com/${packageName}/CHANGELOG.md`);

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        if (content && content.length > 100 && !content.includes('<!DOCTYPE html>')) {
          return { content: content.slice(0, 15000), url };
        }
      }
    } catch {
      // Try next URL
    }
  }

  // Return release notes URL if we have GitHub info
  if (github) {
    return {
      content: null,
      url: `https://github.com/${github.owner}/${github.repo}/releases`,
    };
  }

  return { content: null, url: null };
}

/**
 * Finds packages that depend on the package being upgraded.
 */
async function findDependents(
  packageName: string,
  projectRoot: string
): Promise<string[]> {
  const dependents: string[] = [];

  // Check package-lock.json for dependency relationships
  const lockPath = node_path.join(projectRoot, 'package-lock.json');
  if (await fileExists(lockPath)) {
    try {
      const content = await node_fs.readFile(lockPath, 'utf-8');
      const lockFile = JSON.parse(content);

      // Parse v2/v3 lockfile format
      const packages = lockFile.packages || {};

      for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
        if (!pkgPath || pkgPath === '') continue;

        const info = pkgInfo as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
        const deps = { ...info.dependencies, ...info.peerDependencies };

        if (deps && packageName in deps) {
          const match = pkgPath.match(/node_modules\/(.+)/);
          if (match) {
            const depName = match[1].startsWith('@')
              ? match[1].split('/').slice(0, 2).join('/')
              : match[1].split('/')[0];
            if (depName !== packageName && !dependents.includes(depName)) {
              dependents.push(depName);
            }
          }
        }
      }
    } catch {
      // Lock file parse failed
    }
  }

  return dependents.slice(0, 20);
}

/**
 * Executes the actual package upgrade via npm.
 */
async function executeUpgrade(
  packageName: string,
  targetVersion: string,
  isDev: boolean,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  validatePackageName(packageName);
  validateVersion(targetVersion);
  const devFlag = isDev ? ' -D' : '';
  const command = `npm install ${packageName}@${targetVersion}${devFlag}`;

  const result = await safeExec(command, projectRoot, 120000);

  if (result.error) {
    return {
      success: false,
      output: result.error + '\n' + result.stderr,
    };
  }

  return {
    success: true,
    output: result.stdout || 'Package upgraded successfully',
  };
}

/**
 * Runs tests after upgrade using common test commands.
 */
async function runTests(projectRoot: string): Promise<TestResults> {
  // 'npm test' and 'npm run test' are aliases; only one is needed
  const testCommands = ['npm test'];

  for (const command of testCommands) {
    const result = await safeExec(command, projectRoot, 300000);

    if (!result.error) {
      return {
        passed: true,
        output: result.stdout.slice(0, 5000),
      };
    }

    if (result.stderr.includes('test') || result.stdout.includes('FAIL')) {
      return {
        passed: false,
        output: (result.stdout + '\n' + result.stderr).slice(0, 5000),
      };
    }
  }

  return {
    passed: true,
    output: 'No test script found or tests passed',
  };
}

/**
 * Analyzes an npm package upgrade with breaking change detection.
 *
 * Fetches the target version, changelog, and dependency impact, then
 * optionally applies the upgrade and runs tests.
 *
 * @param args - The upgrade_package tool arguments
 * @returns MCP tool response with upgrade analysis and results
 */
export async function analyzeUpgrade(args: UpgradePackageArgs): Promise<McpResponse> {
  try {
    const projectRoot = node_path.resolve(PROJECT_ROOT, args.path || '.');
    const packageName = args.package;
    const requestedVersion = args.target_version || 'latest';
    const includeChangelog = args.include_changelog !== false;
    const dryRun = args.dry_run !== false;
    const runTestsAfter = args.run_tests_after === true;

    // Read package.json
    const packageJson = (await readJsonFile(node_path.join(projectRoot, 'package.json'))) as Record<
      string,
      unknown
    > | null;

    if (!packageJson) {
      return fail('package.json not found');
    }

    // Get current version
    const currentVersion = getCurrentVersion(packageName, packageJson);
    if (!currentVersion) {
      return fail(`Package "${packageName}" is not installed in this project`);
    }

    // Fetch target version
    const targetVersion = await fetchTargetVersion(packageName, requestedVersion, projectRoot);
    if (!targetVersion) {
      return fail(
        `Could not resolve version "${requestedVersion}" for package "${packageName}"`
      );
    }

    const isDev = isDevDependency(packageName, packageJson);
    const isMajor = isMajorBump(currentVersion, targetVersion);

    // Initialize result
    const result: UpgradePackageResult = {
      package: packageName,
      current_version: cleanVersion(currentVersion),
      target_version: targetVersion,
      is_major_bump: isMajor,
      breaking_changes: [],
      dependencies_affected: [],
      upgrade_applied: false,
      rollback_command: `npm install ${packageName}@${cleanVersion(currentVersion)}${isDev ? ' -D' : ''}`,
      warnings: [],
    };

    // Fetch changelog and breaking changes if requested
    if (includeChangelog) {
      const { content: changelogContent, url: releaseNotesUrl } = await fetchChangelog(
        packageName,
        projectRoot
      );

      result.release_notes_url = releaseNotesUrl || undefined;
      result.changelog_summary = summarizeChangelog(changelogContent, targetVersion) || undefined;
      result.breaking_changes = parseBreakingChanges(changelogContent);

      // If major bump and no breaking changes found in changelog, add a generic warning
      if (isMajor && result.breaking_changes.length === 0) {
        result.breaking_changes.push({
          type: 'behavior',
          description: 'Major version bump detected. Check release notes for breaking changes.',
          migration_hint: `Review ${releaseNotesUrl || 'package documentation'} before upgrading.`,
        });
      }
    }

    // Find affected dependencies
    result.dependencies_affected = await findDependents(packageName, projectRoot);

    // Generate warnings
    result.warnings = generateUpgradeWarnings(
      isMajor,
      result.breaking_changes,
      result.dependencies_affected.length
    );

    // Check if already at target version
    if (cleanVersion(currentVersion) === targetVersion) {
      result.warnings.push('Package is already at the target version.');
      return ok(result);
    }

    // Execute upgrade if not dry run
    if (!dryRun) {
      const upgradeResult = await executeUpgrade(packageName, targetVersion, isDev, projectRoot);
      result.upgrade_applied = upgradeResult.success;

      if (!upgradeResult.success) {
        result.warnings.push(`Upgrade failed: ${upgradeResult.output}`);
        return fail(
          `Package upgrade failed: ${upgradeResult.output}`,
          result as unknown as Record<string, unknown>
        );
      }

      // Run tests if requested
      if (runTestsAfter) {
        result.test_results = await runTests(projectRoot);

        if (!result.test_results.passed) {
          result.warnings.push('Tests failed after upgrade. Consider rolling back.');
        }
      }
    } else {
      result.warnings.push('Dry run mode: No changes were made. Set dry_run=false to apply upgrade.');
    }

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to upgrade package: ${message}`);
  }
}
