/**
 * Project Health Checker (Comprehensive)
 *
 * Performs comprehensive project health analysis including:
 * - node_modules existence and dependency status
 * - Multiple lockfile detection (npm + yarn + pnpm + bun)
 * - Detailed TypeScript configuration (strict, strictNullChecks, noImplicitAny, target)
 * - Available npm scripts detection
 * - Actionable suggestions for improvement
 *
 * **Difference from health-checker.ts:**
 * - This module returns {@link ProjectHealth} with full analysis including suggestions
 * - health-checker.ts returns {@link HealthStatus} with basic health checks array only
 *
 * Use this when you need comprehensive health analysis with suggestions;
 * use health-checker.ts for quick status checks.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileExists } from '../shared/file-utils.js';
import { debug } from '../shared/logging.js';
import { generateWarnings, generateSuggestions, } from './project-health-formatter.js';
const LOCKFILES = {
    'package-lock.json': 'npm',
    'yarn.lock': 'yarn',
    'pnpm-lock.yaml': 'pnpm',
    'bun.lockb': 'bun',
};
/**
 * Check for node_modules and lockfiles.
 * Determines which package manager is in use and dependency installation status.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to dependency status including lockfiles and package manager
 */
async function checkDependencies(cwd) {
    const hasNodeModules = await fileExists(path.join(cwd, 'node_modules'));
    const lockfiles = [];
    let packageManager = null;
    for (const [file, manager] of Object.entries(LOCKFILES)) {
        if (await fileExists(path.join(cwd, file))) {
            lockfiles.push(file);
            packageManager ??= manager;
        }
    }
    return { hasNodeModules, lockfiles, packageManager };
}
/**
 * Check TypeScript configuration.
 * Parses tsconfig.json to determine strict mode settings and compiler target.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to TypeScriptHealth object, or null if no tsconfig.json
 */
async function checkTypeScript(cwd) {
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (!(await fileExists(tsconfigPath))) {
        return null;
    }
    try {
        const content = await fs.readFile(tsconfigPath, 'utf-8');
        const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const tsconfig = JSON.parse(jsonContent);
        const compilerOptions = typeof tsconfig === 'object' && tsconfig !== null && 'compilerOptions' in tsconfig
            ? (tsconfig.compilerOptions ?? {})
            : {};
        return {
            hasConfig: true,
            strict: compilerOptions.strict === true,
            strictNullChecks: compilerOptions.strictNullChecks === true ||
                compilerOptions.strict === true,
            noImplicitAny: compilerOptions.noImplicitAny === true ||
                compilerOptions.strict === true,
            target: typeof compilerOptions.target === 'string' ? compilerOptions.target : null,
        };
    }
    catch (error) {
        debug('project-health failed', { error: String(error) });
        return {
            hasConfig: true,
            strict: false,
            strictNullChecks: false,
            noImplicitAny: false,
            target: null,
        };
    }
}
/**
 * Get available npm scripts.
 * Extracts script names from package.json for health analysis.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to array of script names, or empty array if no package.json
 */
async function getScripts(cwd) {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (!(await fileExists(packageJsonPath))) {
        return [];
    }
    try {
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);
        if (typeof packageJson === 'object' && packageJson !== null && 'scripts' in packageJson) {
            const scripts = packageJson.scripts;
            return Object.keys(scripts ?? {});
        }
        return [];
    }
    catch (error) {
        debug('project-health failed', { error: String(error) });
        return [];
    }
}
/**
 * Check overall project health with comprehensive analysis.
 * Performs full analysis including TypeScript details and suggestions.
 * For lightweight status checks, use checkProjectHealth from health-checker.ts.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectHealth with comprehensive health analysis
 *
 * @example
 * const health = await checkProjectHealth('/my-project');
 * if (health.hasMultipleLockfiles) {
 *   debug('Multiple package manager lockfiles detected');
 * }
 * debug('Available scripts:', health.scripts);
 */
export async function checkProjectHealth(cwd) {
    const [{ hasNodeModules, lockfiles, packageManager }, typescript, scripts] = await Promise.all([
        checkDependencies(cwd),
        checkTypeScript(cwd),
        getScripts(cwd),
    ]);
    const health = {
        hasNodeModules,
        lockfiles,
        hasMultipleLockfiles: lockfiles.length > 1,
        typescript,
        packageManager,
        scripts,
        warnings: [],
        suggestions: [],
    };
    health.warnings = generateWarnings(health);
    health.suggestions = generateSuggestions(health);
    return health;
}
// Re-export formatProjectHealth from the formatter module
export { formatProjectHealth } from './project-health-formatter.js';
