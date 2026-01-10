/**
 * Upgrade Package Handler
 *
 * Provides a comprehensive tool for upgrading npm packages with:
 * - Breaking change detection (semver major bumps)
 * - Changelog fetching and parsing
 * - Dependency impact analysis
 * - Optional test execution after upgrade
 * - Rollback command generation
 *
 * @module handlers/package/upgrade-package
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { readJsonFile, fileExists, safeExec, fetchUrl } from '../../utils.js';

/**
 * Arguments for the upgrade_package MCP tool
 */
export interface UpgradePackageArgs {
  /** Package name to upgrade */
  package: string;
  /** Target version (default: "latest") */
  target_version?: string;
  /** Whether to fetch release notes (default: true) */
  include_changelog?: boolean;
  /** Preview only, don't actually upgrade (default: true) */
  dry_run?: boolean;
  /** Run tests after upgrade (default: false) */
  run_tests_after?: boolean;
  /** Project path (defaults to PROJECT_ROOT) */
  path?: string;
}

/**
 * Breaking change information
 */
interface BreakingChange {
  type: 'api' | 'config' | 'behavior' | 'deprecation';
  description: string;
  migration_hint?: string;
}

/**
 * Test execution results
 */
interface TestResults {
  passed: boolean;
  output: string;
}

/**
 * Result of the upgrade operation
 */
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
 * Get the currently installed version of a package from package.json
 */
function getCurrentVersion(packageName: string, packageJson: Record<string, unknown>): string | null {
  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as Record<string, string> | undefined;

  return deps?.[packageName] || devDeps?.[packageName] || null;
}

/**
 * Check if the package is in devDependencies
 */
function isDevDependency(packageName: string, packageJson: Record<string, unknown>): boolean {
  const devDeps = packageJson.devDependencies as Record<string, string> | undefined;
  return devDeps?.[packageName] !== undefined;
}

/**
 * Clean version string (remove prefixes like ^, ~, >=, etc.)
 */
function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, '').split('-')[0];
}

/**
 * Parse version into numeric parts
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const clean = cleanVersion(version);
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Check if upgrading from currentVersion to targetVersion is a major bump
 */
function isMajorBump(currentVersion: string, targetVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const target = parseVersion(targetVersion);
  return target.major > current.major;
}

/**
 * Fetch the latest version from npm registry
 */
async function fetchTargetVersion(
  packageName: string,
  targetVersion: string,
  projectRoot: string
): Promise<string | null> {
  if (targetVersion !== 'latest') {
    // Validate that the specified version exists
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
  if (result.error || !result.stdout) {
    return null;
  }
  return result.stdout.trim();
}

/**
 * Fetch npm package metadata including repository info
 */
async function fetchNpmMetadata(
  packageName: string,
  projectRoot: string
): Promise<{
  repository?: { type?: string; url?: string };
  homepage?: string;
  bugs?: { url?: string };
} | null> {
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
 * Extract GitHub repo info from npm metadata
 */
function extractGitHubRepo(metadata: {
  repository?: { type?: string; url?: string };
  homepage?: string;
}): { owner: string; repo: string } | null {
  const repoUrl = metadata.repository?.url || metadata.homepage || '';

  // Match GitHub URL patterns
  const patterns = [
    /github\.com[/:]([^/]+)\/([^/.]+)/,
    /github\.com\/([^/]+)\/([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = repoUrl.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }

  return null;
}

/**
 * Attempt to fetch changelog from various sources
 */
async function fetchChangelog(
  packageName: string,
  projectRoot: string
): Promise<{ content: string | null; url: string | null }> {
  const metadata = await fetchNpmMetadata(packageName, projectRoot);
  const github = metadata ? extractGitHubRepo(metadata) : null;

  const urls: string[] = [];

  if (github) {
    // Try common changelog locations on GitHub
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
      const content = await fetchUrl(url);
      if (content && content.length > 100 && !content.includes('<!DOCTYPE html>')) {
        return { content: content.slice(0, 15000), url };
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
 * Parse changelog content to extract breaking changes
 */
function parseBreakingChanges(
  changelogContent: string | null,
  currentVersion: string,
  targetVersion: string
): BreakingChange[] {
  const breakingChanges: BreakingChange[] = [];

  if (!changelogContent) {
    return breakingChanges;
  }

  const content = changelogContent.toLowerCase();

  // Look for breaking change indicators
  const breakingPatterns = [
    /breaking\s*changes?[:\s]*([^\n]+(?:\n(?!\n)[^\n]+)*)/gi,
    /\*\*breaking\*\*[:\s]*([^\n]+)/gi,
    /⚠️\s*([^\n]+)/g,
    /removed[:\s]*([^\n]+)/gi,
  ];

  for (const pattern of breakingPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(changelogContent)) !== null) {
      const description = match[1].trim().slice(0, 200);
      if (description.length > 10) {
        // Determine type based on content
        let type: BreakingChange['type'] = 'behavior';
        if (/api|function|method|signature|parameter|argument/i.test(description)) {
          type = 'api';
        } else if (/config|option|setting|environment/i.test(description)) {
          type = 'config';
        } else if (/deprecat/i.test(description)) {
          type = 'deprecation';
        }

        breakingChanges.push({
          type,
          description,
        });
      }
    }
  }

  // Dedupe by description
  const seen = new Set<string>();
  return breakingChanges.filter((bc) => {
    const key = bc.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Summarize changelog content focusing on the version being upgraded to
 */
function summarizeChangelog(
  changelogContent: string | null,
  targetVersion: string
): string | null {
  if (!changelogContent) {
    return null;
  }

  // Try to find section for target version
  const versionPattern = new RegExp(
    `(?:^|\\n)#+\\s*(?:v?${targetVersion.replace(/\./g, '\\.')}|\\[?v?${targetVersion.replace(/\./g, '\\.')}\\]?)\\s*([\\s\\S]*?)(?=\\n#+\\s*(?:v?\\d|\\[?v?\\d)|$)`,
    'i'
  );

  const match = changelogContent.match(versionPattern);
  if (match && match[1]) {
    // Clean up and truncate
    const summary = match[1]
      .trim()
      .split('\n')
      .slice(0, 15)
      .join('\n')
      .slice(0, 1000);
    return summary;
  }

  // Fall back to first significant section
  const firstSection = changelogContent.slice(0, 2000);
  const lines = firstSection.split('\n').filter((l) => l.trim()).slice(0, 10);
  return lines.join('\n');
}

/**
 * Find packages that depend on the package being upgraded
 */
async function findDependents(
  packageName: string,
  projectRoot: string
): Promise<string[]> {
  const dependents: string[] = [];

  // Check package-lock.json for dependency relationships
  const lockPath = path.join(projectRoot, 'package-lock.json');
  if (await fileExists(lockPath)) {
    try {
      const content = await fsPromises.readFile(lockPath, 'utf-8');
      const lockFile = JSON.parse(content);

      // Parse v2/v3 lockfile format
      const packages = lockFile.packages || {};

      for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
        if (!pkgPath || pkgPath === '') continue;

        const info = pkgInfo as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
        const deps = { ...info.dependencies, ...info.peerDependencies };

        if (deps && packageName in deps) {
          // Extract package name from path
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

  // Also check yarn.lock if present
  const yarnLockPath = path.join(projectRoot, 'yarn.lock');
  if (await fileExists(yarnLockPath)) {
    try {
      const content = await fsPromises.readFile(yarnLockPath, 'utf-8');
      // Simple pattern matching for yarn.lock
      const depPattern = new RegExp(`"?${packageName}@[^"]+":`, 'g');
      if (depPattern.test(content)) {
        // Found in yarn.lock, dependencies may be affected
      }
    } catch {
      // Yarn lock parse failed
    }
  }

  return dependents.slice(0, 20); // Limit to 20 most relevant
}

/**
 * Execute the actual package upgrade
 */
async function executeUpgrade(
  packageName: string,
  targetVersion: string,
  isDev: boolean,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  const devFlag = isDev ? ' -D' : '';
  const command = `npm install ${packageName}@${targetVersion}${devFlag}`;

  const result = await safeExec(command, projectRoot, 120000); // 2 minute timeout

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
 * Run tests after upgrade
 */
async function runTests(projectRoot: string): Promise<TestResults> {
  // Try common test commands
  const testCommands = ['npm test', 'npm run test'];

  for (const command of testCommands) {
    const result = await safeExec(command, projectRoot, 300000); // 5 minute timeout

    if (!result.error) {
      return {
        passed: true,
        output: result.stdout.slice(0, 5000),
      };
    }

    // If tests exist but failed
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
 * Generate warnings based on analysis
 */
function generateWarnings(
  isMajor: boolean,
  breakingChanges: BreakingChange[],
  dependentsCount: number
): string[] {
  const warnings: string[] = [];

  if (isMajor) {
    warnings.push('This is a major version upgrade. Review breaking changes carefully.');
  }

  if (breakingChanges.length > 0) {
    warnings.push(`Found ${breakingChanges.length} potential breaking change(s) in changelog.`);
  }

  if (dependentsCount > 5) {
    warnings.push(`${dependentsCount} other packages depend on this one. Test thoroughly.`);
  }

  return warnings;
}

/**
 * Handles the upgrade_package MCP tool call.
 *
 * Analyzes an npm package upgrade with breaking change detection,
 * changelog parsing, dependency impact analysis, and optional
 * test execution. Supports dry run mode for safe preview.
 *
 * @param args - The upgrade_package tool arguments
 * @returns MCP tool response with upgrade analysis and results
 */
export async function handleUpgradePackage(
  args: UpgradePackageArgs
): Promise<ToolResponse> {
  const projectRoot = path.resolve(PROJECT_ROOT, args.path || '.');
  const packageName = args.package;
  const requestedVersion = args.target_version || 'latest';
  const includeChangelog = args.include_changelog !== false;
  const dryRun = args.dry_run !== false;
  const runTestsAfter = args.run_tests_after === true;

  // Read package.json
  const packageJson = (await readJsonFile(path.join(projectRoot, 'package.json'))) as Record<
    string,
    unknown
  > | null;

  if (!packageJson) {
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

  // Get current version
  const currentVersion = getCurrentVersion(packageName, packageJson);
  if (!currentVersion) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Package "${packageName}" is not installed in this project`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Fetch target version
  const targetVersion = await fetchTargetVersion(packageName, requestedVersion, projectRoot);
  if (!targetVersion) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Could not resolve version "${requestedVersion}" for package "${packageName}"`,
          }),
        },
      ],
      isError: true,
    };
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
    result.breaking_changes = parseBreakingChanges(changelogContent, currentVersion, targetVersion);

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
  result.warnings = generateWarnings(
    isMajor,
    result.breaking_changes,
    result.dependencies_affected.length
  );

  // Check if already at target version
  if (cleanVersion(currentVersion) === targetVersion) {
    result.warnings.push('Package is already at the target version.');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // Execute upgrade if not dry run
  if (!dryRun) {
    const upgradeResult = await executeUpgrade(packageName, targetVersion, isDev, projectRoot);
    result.upgrade_applied = upgradeResult.success;

    if (!upgradeResult.success) {
      result.warnings.push(`Upgrade failed: ${upgradeResult.output}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: true,
      };
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

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
