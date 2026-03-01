/**
 * Version comparison and parsing utilities for the deps domain.
 *
 * @module core/deps/version-utils
 */

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
export function isOutdated(installed: string, latest: string): boolean {
  // Clean version strings (remove ^, ~, >=, etc.)
  const cleanInstalled = installed.replace(/^[\^~>=<]+/, '').split('-')[0];
  const cleanLatest = latest.replace(/^[\^~>=<]+/, '').split('-')[0];

  const installedParts = cleanInstalled.split('.').map((p) => parseInt(p, 10) || 0);
  const latestParts = cleanLatest.split('.').map((p) => parseInt(p, 10) || 0);

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    const installedVersion = installedParts[i] || 0;
    const latestVersion = latestParts[i] || 0;
    if (latestVersion > installedVersion) return true;
    if (installedVersion > latestVersion) return false;
  }

  return false;
}

/**
 * Gets the currently installed version of a package from a parsed package.json object.
 *
 * Checks both `dependencies` and `devDependencies`.
 *
 * @param pkgName - Package name to look up
 * @param packageJson - Parsed package.json as a plain object
 * @returns Version string or null if not found
 */
export function getCurrentVersion(
  pkgName: string,
  packageJson: Record<string, unknown>
): string | null {
  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as Record<string, string> | undefined;

  return deps?.[pkgName] || devDeps?.[pkgName] || null;
}

/**
 * Checks if a package is listed under devDependencies in a parsed package.json.
 *
 * @param pkgName - Package name to check
 * @param packageJson - Parsed package.json as a plain object
 * @returns True if the package is a devDependency
 */
export function isDevDependency(
  pkgName: string,
  packageJson: Record<string, unknown>
): boolean {
  const devDeps = packageJson.devDependencies as Record<string, string> | undefined;
  return devDeps?.[pkgName] !== undefined;
}

/**
 * Removes version prefixes (^, ~, >=, etc.) and pre-release suffixes.
 *
 * @param version - Raw version string from package.json
 * @returns Clean semver string (e.g., '1.2.3')
 */
export function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, '').split('-')[0];
}

/**
 * Parses a version string into its numeric components.
 *
 * @param version - Version string (may include prefixes)
 * @returns Object with major, minor, and patch numbers
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const clean = cleanVersion(version);
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Checks if upgrading from currentVersion to targetVersion is a major version bump.
 *
 * @param currentVersion - Current (installed) version string
 * @param targetVersion - Target (upgrade) version string
 * @returns True if the target major version is greater than the current major version
 */
export function isMajorBump(currentVersion: string, targetVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const target = parseVersion(targetVersion);
  return target.major > current.major;
}
