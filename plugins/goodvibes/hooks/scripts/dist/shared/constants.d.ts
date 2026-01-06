/**
 * Constants
 *
 * Environment constants and package manager lockfile definitions.
 */
/**
 * Package manager lockfiles for detection.
 * Used to identify which package manager a project uses (pnpm, yarn, npm, or bun).
 */
export declare const LOCKFILES: readonly ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb"];
/**
 * Root directory of the GoodVibes plugin itself.
 * Uses official Claude Code environment variable or falls back to parent directory.
 */
export declare const PLUGIN_ROOT: string;
/**
 * Root directory of the user's project.
 * Uses official Claude Code environment variable or falls back to current working directory.
 */
export declare const PROJECT_ROOT: string;
/**
 * Cache directory for temporary plugin data.
 * Located at PLUGIN_ROOT/.cache for storing analytics and other ephemeral data.
 */
export declare const CACHE_DIR: string;
/**
 * Path to the analytics JSON file.
 * Stores session analytics data including tool usage and skill recommendations.
 */
export declare const ANALYTICS_FILE: string;
