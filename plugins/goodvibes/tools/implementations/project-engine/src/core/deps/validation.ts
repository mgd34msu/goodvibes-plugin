/**
 * Package name and version validation utilities.
 *
 * Shared validation logic used across deps extensions to prevent
 * shell injection and ensure well-formed inputs before executing
 * npm commands.
 *
 * @module core/deps/validation
 */

// =============================================================================
// Patterns
// =============================================================================

/** Valid npm package name pattern (supports scoped packages) */
export const PACKAGE_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Valid npm version specifier pattern.
 *
 * Uses an allowlist of safe characters to support the full range of npm
 * version range syntax while rejecting shell injection characters.
 *
 * Supported patterns:
 * - Exact semver:       `1.2.3`, `1.2.3-beta.1`
 * - X-ranges:           `1.x`, `1.2.x`, `*`
 * - Tilde/caret:        `~1.0.0`, `^1.0.0`
 * - Comparators:        `>=1.0.0`, `<=2.0.0`, `>1.0.0`, `<2.0.0`
 * - Hyphen ranges:      `1.0.0 - 2.0.0`
 * - Compound ranges:    `>=1.0.0 <2.0.0`
 * - OR ranges:          `1.x || 2.x`
 * - Dist-tags:          `latest`, `next`, `canary`
 *
 * Rejected characters: `;`, `$`, backtick, `(`, `)`, and other shell
 * metacharacters not needed by any valid npm version range.
 */
export const VERSION_PATTERN = /^[0-9a-zA-Z.*x~^><=| -]+$/;

// =============================================================================
// Validators
// =============================================================================

/** Throws if packageName contains shell-unsafe characters */
export function validatePackageName(name: string): void {
  if (!PACKAGE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid package name: "${name}". Only lowercase letters, digits, hyphens, and scoped names (@scope/pkg) are allowed.`);
  }
}

/** Throws if version contains shell-unsafe characters */
export function validateVersion(version: string): void {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version specifier: "${version}". Supported: semver (1.2.3), x-ranges (1.x), comparators (>=1.0.0), OR ranges (1.x || 2.x), dist-tags (latest/next/canary).`);
  }
}
