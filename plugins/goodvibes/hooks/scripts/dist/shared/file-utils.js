/**
 * File Utilities
 *
 * File system utilities including existence checks and command detection.
 */
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PROJECT_ROOT, PLUGIN_ROOT } from './constants.js';
import { debug } from './logging.js';
// =============================================================================
// File Existence Utilities
// =============================================================================
/**
 * Checks if a file exists relative to the project root.
 *
 * Resolves the path relative to PROJECT_ROOT and checks for existence.
 *
 * @param filePath - The file path relative to PROJECT_ROOT
 * @returns Promise resolving to true if the file exists, false otherwise
 *
 * @example
 * if (await fileExists('package.json')) {
 *   console.log('This is a Node.js project');
 * }
 *
 * @example
 * if (await fileExists('tsconfig.json')) {
 *   console.log('TypeScript is configured');
 * }
 */
export async function fileExists(filePath) {
    try {
        await fs.access(path.resolve(PROJECT_ROOT, filePath));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if a file exists (async version with absolute path support).
 *
 * This is the shared async implementation used by context modules
 * (env-checker, health-checker, stack-detector) to avoid duplicate code.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to true if file exists
 */
export async function fileExistsAsync(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
// =============================================================================
// Command Utilities
// =============================================================================
/**
 * Checks if a command-line tool is available on the system.
 *
 * Uses platform-specific commands to check for availability:
 * - Windows: `where <cmd>`
 * - Unix/Mac: `which <cmd>`
 *
 * @param cmd - The command name to check (e.g., 'git', 'npm', 'node')
 * @returns True if the command is available in PATH, false otherwise
 *
 * @example
 * if (commandExists('git')) {
 *   console.log('Git is available');
 * }
 *
 * @example
 * // Check before running a tool
 * if (!commandExists('pnpm')) {
 *   console.log('pnpm not found, falling back to npm');
 * }
 */
export function commandExists(cmd) {
    try {
        // Use 'where' on Windows, 'which' on Unix/Mac
        const isWindows = process.platform === 'win32';
        const checkCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;
        execSync(checkCmd, { stdio: 'ignore', timeout: 30000 });
        return true;
    }
    catch (error) {
        debug(`Command check failed for ${cmd}: ${error}`);
        return false;
    }
}
// =============================================================================
// Registry Validation
// =============================================================================
/**
 * Validates that all required registry files exist in the plugin.
 *
 * Checks for the presence of the three core registry files:
 * - skills/_registry.yaml
 * - agents/_registry.yaml
 * - tools/_registry.yaml
 *
 * @returns Promise resolving to an object with `valid` (true if all exist) and `missing` (array of missing paths)
 *
 * @example
 * const result = await validateRegistries();
 * if (!result.valid) {
 *   console.error('Missing registries:', result.missing.join(', '));
 * }
 */
export async function validateRegistries() {
    const registries = [
        'skills/_registry.yaml',
        'agents/_registry.yaml',
        'tools/_registry.yaml',
    ];
    const missing = [];
    for (const reg of registries) {
        if (!(await fileExistsAsync(path.join(PLUGIN_ROOT, reg)))) {
            missing.push(reg);
        }
    }
    return { valid: missing.length === 0, missing };
}
// =============================================================================
// GoodVibes Directory Management
// =============================================================================
/**
 * Ensures the .goodvibes directory exists with all required subdirectories.
 *
 * Creates the following directory structure if it doesn't exist:
 * - .goodvibes/
 *   - memory/   - For persistent memory storage
 *   - state/    - For session state files
 *   - logs/     - For hook execution logs
 *   - telemetry/ - For telemetry data
 *
 * Also ensures the project's .gitignore contains security-critical entries.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise that resolves to the path of the .goodvibes directory
 *
 * @example
 * const goodvibesDir = await ensureGoodVibesDir('/path/to/project');
 * console.log(goodvibesDir); // '/path/to/project/.goodvibes'
 *
 * // Now safe to write to subdirectories
 * fs.writeFileSync(path.join(goodvibesDir, 'state', 'session.json'), data);
 */
export async function ensureGoodVibesDir(cwd) {
    const goodvibesDir = path.join(cwd, '.goodvibes');
    if (!(await fileExistsAsync(goodvibesDir))) {
        await fs.mkdir(goodvibesDir, { recursive: true });
        await fs.mkdir(path.join(goodvibesDir, 'memory'), { recursive: true });
        await fs.mkdir(path.join(goodvibesDir, 'state'), { recursive: true });
        await fs.mkdir(path.join(goodvibesDir, 'logs'), { recursive: true });
        await fs.mkdir(path.join(goodvibesDir, 'telemetry'), { recursive: true });
        // Add security-hardened gitignore
        const { ensureSecureGitignore } = await import('./gitignore.js');
        await ensureSecureGitignore(cwd);
    }
    return goodvibesDir;
}
// =============================================================================
// Error Output Extraction
// =============================================================================
/** Type guard for exec errors with stdout/stderr buffers */
function isExecError(error) {
    return error !== null && typeof error === 'object';
}
/**
 * Extracts readable error output from an execSync error.
 *
 * When execSync fails, the error object may contain stdout/stderr buffers.
 * This function extracts the most useful error message from those buffers.
 *
 * @param error - The error thrown by execSync (typically has stdout/stderr properties)
 * @returns A string containing the error output (stdout, stderr, or message)
 *
 * @example
 * try {
 *   execSync('npm test');
 * } catch (error) {
 *   const output = extractErrorOutput(error);
 *   console.log('Test failed:', output);
 * }
 */
export function extractErrorOutput(error) {
    if (isExecError(error)) {
        return error.stdout?.toString() || error.stderr?.toString() || error.message || 'Unknown error';
    }
    return String(error);
}
