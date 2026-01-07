/**
 * Stack Detector
 *
 * Detects frameworks, package manager, and TypeScript configuration.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { LOCKFILES, fileExists } from '../shared/index.js';
import { debug } from '../shared/logging.js';
/**
 * Module-level cache for stack detection results.
 * Stores StackInfo objects with timestamps to avoid repeated filesystem checks.
 */
const stackCache = new Map();
/**
 * Cache TTL in milliseconds (5 minutes).
 * Cached stack detection results expire after this duration.
 */
const CACHE_TTL = 5 * 60 * 1000;
/**
 * Maximum number of entries to keep in cache (LRU-style cleanup).
 * Prevents unbounded cache growth in long-running processes.
 */
const MAX_CACHE_ENTRIES = 50;
/**
 * Minimum interval between pruning operations (60 seconds).
 * Prevents excessive pruning overhead.
 */
const PRUNE_INTERVAL = 60 * 1000;
/**
 * Threshold size to trigger pruning (prune only when cache exceeds this).
 * Pruning is skipped until cache reaches this size.
 */
const PRUNE_THRESHOLD = 40;
/**
 * Last time cache was pruned.
 * Tracked to enforce minimum interval between pruning operations.
 */
let lastPruneTime = 0;
/**
 * Clear expired entries from the stack cache.
 * Also enforces maximum cache size by removing oldest entries.
 * Useful for testing or when you need to force re-detection of the stack.
 *
 * @example
 * clearStackCache();
 * const freshStack = await detectStack('/my-project'); // Will re-scan filesystem
 */
export function clearStackCache() {
    stackCache.clear();
    lastPruneTime = 0;
}
/**
 * Remove expired entries and enforce LRU-style size limit.
 * Optimized to only run:
 * - Every 60 seconds (minimum interval)
 * - When cache size exceeds threshold (40 entries)
 * - When cache exceeds maximum size (50 entries) - always prune
 */
function pruneCache() {
    const now = Date.now();
    const timeSinceLastPrune = now - lastPruneTime;
    // Skip pruning if:
    // 1. Last pruned within the interval AND
    // 2. Cache size is below threshold AND
    // 3. Cache size is below maximum
    if (timeSinceLastPrune < PRUNE_INTERVAL &&
        stackCache.size < PRUNE_THRESHOLD &&
        stackCache.size < MAX_CACHE_ENTRIES) {
        return;
    }
    // Update last prune time
    lastPruneTime = now;
    // Remove expired entries
    for (const [key, value] of stackCache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
            stackCache.delete(key);
        }
    }
    // If still over limit, remove oldest entries
    if (stackCache.size >= MAX_CACHE_ENTRIES) {
        const entries = Array.from(stackCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, stackCache.size - MAX_CACHE_ENTRIES + 1);
        for (const [key] of toRemove) {
            stackCache.delete(key);
        }
    }
}
const STACK_INDICATORS = {
    'next.config': 'Next.js',
    'nuxt.config': 'Nuxt',
    'svelte.config': 'SvelteKit',
    'astro.config': 'Astro',
    'remix.config': 'Remix',
    'vite.config': 'Vite',
    'angular.json': 'Angular',
    'vue.config': 'Vue CLI',
    'prisma/schema.prisma': 'Prisma',
    'drizzle.config': 'Drizzle',
    'tailwind.config': 'Tailwind CSS',
    'vitest.config': 'Vitest',
    'jest.config': 'Jest',
    'playwright.config': 'Playwright',
    'turbo.json': 'Turborepo',
    'pnpm-workspace.yaml': 'pnpm workspaces',
    'tsconfig.json': 'TypeScript',
};
const LOCKFILE_TO_PM = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm',
    'bun.lockb': 'bun',
};
/**
 * Detect the technology stack used in the project.
 * Checks for framework config files, package manager lockfiles, and TypeScript configuration.
 * Results are cached to improve performance on repeated calls.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to StackInfo with detected frameworks and tools
 *
 * @example
 * const stack = await detectStack('/my-project');
 * if (stack.frameworks.includes('Next.js')) {
 *   console.log('Next.js project detected');
 * }
 * console.log(`Package manager: ${stack.packageManager}`);
 * console.log(`TypeScript strict mode: ${stack.isStrict}`);
 */
export async function detectStack(cwd) {
    // Check cache first
    const cached = stackCache.get(cwd);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.result;
    }
    const frameworks = [];
    let packageManager = null;
    let hasTypeScript = false;
    let isStrict = false;
    // Check for framework indicators
    for (const [indicator, name] of Object.entries(STACK_INDICATORS)) {
        const checkPath = path.join(cwd, indicator);
        const checks = await Promise.all([
            fileExists(checkPath),
            fileExists(checkPath + '.js'),
            fileExists(checkPath + '.ts'),
            fileExists(checkPath + '.mjs'),
        ]);
        if (checks.some((exists) => exists)) {
            frameworks.push(name);
            if (name === 'TypeScript') {
                hasTypeScript = true;
            }
        }
    }
    // Check lockfiles for package manager
    for (const lockfile of LOCKFILES) {
        if (await fileExists(path.join(cwd, lockfile))) {
            packageManager = LOCKFILE_TO_PM[lockfile];
            break;
        }
    }
    // Check tsconfig for strict mode
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (await fileExists(tsconfigPath)) {
        try {
            const content = await fs.readFile(tsconfigPath, 'utf-8');
            const config = JSON.parse(content);
            isStrict = config.compilerOptions?.strict === true;
        }
        catch (error) {
            // tsconfig.json might have comments or invalid JSON - ignore parse errors
            debug('stack-detector: Failed to parse tsconfig.json', error);
        }
    }
    const result = { frameworks, packageManager, hasTypeScript, isStrict };
    // Prune cache before adding new entry
    pruneCache();
    // Store in cache
    stackCache.set(cwd, { result, timestamp: now });
    return result;
}
/**
 * Format stack information for display in context output.
 * Creates a human-readable summary of detected technologies.
 *
 * @param info - The StackInfo object to format
 * @returns Formatted string with stack details, or empty string if no data
 *
 * @example
 * const formatted = formatStackInfo(stack);
 * // Returns: "Stack: Next.js, TypeScript, Tailwind CSS\nTypeScript: strict\nPackage Manager: pnpm"
 */
export function formatStackInfo(info) {
    if (!info || typeof info !== 'object') {
        return '';
    }
    const parts = [];
    if (info.frameworks && info.frameworks.length > 0) {
        parts.push(`Stack: ${info.frameworks.join(', ')}`);
    }
    if (info.hasTypeScript) {
        parts.push(`TypeScript: ${info.isStrict ? 'strict' : 'not strict'}`);
    }
    if (info.packageManager) {
        parts.push(`Package Manager: ${info.packageManager}`);
    }
    return parts.join('\n');
}
