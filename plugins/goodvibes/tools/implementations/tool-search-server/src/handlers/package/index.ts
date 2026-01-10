/**
 * Package management handlers
 *
 * Provides tools for npm package operations:
 * - upgrade_package: Upgrade packages with breaking change detection
 *
 * @module handlers/package
 */

// Package upgrade
export { handleUpgradePackage } from './upgrade-package.js';
export type { UpgradePackageArgs } from './upgrade-package.js';
