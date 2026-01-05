/**
 * Build Runner
 *
 * Executes build and type-check operations for the project,
 * parsing output to extract structured error information.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import { extractErrorOutput, fileExists } from '../shared/index.js';
/** Build commands mapped by framework type. */
export const BUILD_COMMANDS = {
    next: 'npm run build',
    vite: 'npm run build',
    typescript: 'npx tsc --noEmit',
    default: 'npm run build',
};
/** TypeScript type check command (same for all frameworks). */
export const TYPECHECK_COMMAND = 'npx tsc --noEmit';
/**
 * Detects the appropriate build command based on project config files.
 * Checks for Next.js, Vite, or falls back to default npm build.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to the build command string appropriate for the detected framework
 *
 * @example
 * const cmd = await detectBuildCommand('/my-next-app');
 * // Returns 'npm run build' if next.config.js exists
 */
export async function detectBuildCommand(cwd) {
    // Check for Next.js config files
    const [hasNextJs, hasNextMjs, hasNextTs] = await Promise.all([
        fileExists(path.join(cwd, 'next.config.js')),
        fileExists(path.join(cwd, 'next.config.mjs')),
        fileExists(path.join(cwd, 'next.config.ts')),
    ]);
    if (hasNextJs || hasNextMjs || hasNextTs) {
        return BUILD_COMMANDS.next;
    }
    // Check for Vite config files
    const [hasViteTs, hasViteJs] = await Promise.all([
        fileExists(path.join(cwd, 'vite.config.ts')),
        fileExists(path.join(cwd, 'vite.config.js')),
    ]);
    if (hasViteTs || hasViteJs) {
        return BUILD_COMMANDS.vite;
    }
    return BUILD_COMMANDS.default;
}
/**
 * Runs the build command for the project and returns structured results.
 * Automatically detects the appropriate build command based on project configuration.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a BuildResult object containing pass/fail status, summary, and parsed errors
 *
 * @example
 * const result = await runBuild('/my-project');
 * if (!result.passed) {
 *   console.error('Build failed:', result.errors);
 * }
 */
export async function runBuild(cwd) {
    const command = await detectBuildCommand(cwd);
    try {
        execSync(command, { cwd, stdio: 'pipe', timeout: 120000 });
        return { passed: true, summary: 'Build passed', errors: [] };
    }
    catch (error) {
        const output = extractErrorOutput(error);
        return {
            passed: false,
            summary: 'Build failed',
            errors: parseBuildErrors(output),
        };
    }
}
/**
 * Runs TypeScript type checking using tsc --noEmit.
 * Returns structured results with parsed error information.
 *
 * @param cwd - The current working directory (project root)
 * @returns A BuildResult object containing pass/fail status, summary, and parsed type errors
 *
 * @example
 * const result = runTypeCheck('/my-project');
 * if (!result.passed) {
 *   result.errors.forEach(e => console.error(`${e.file}:${e.line}: ${e.message}`));
 * }
 */
export function runTypeCheck(cwd) {
    try {
        execSync(TYPECHECK_COMMAND, { cwd, stdio: 'pipe', timeout: 120000 });
        return { passed: true, summary: 'Type check passed', errors: [] };
    }
    catch (error) {
        const output = extractErrorOutput(error);
        return {
            passed: false,
            summary: 'Type errors found',
            errors: parseBuildErrors(output),
        };
    }
}
/**
 * Parses TypeScript compiler output to extract structured error information.
 * Matches the format: file(line,col): error TS1234: message
 *
 * @param output - The raw TypeScript compiler output string
 * @returns An array of parsed error objects with file, line, and message
 */
function parseBuildErrors(output) {
    const errors = [];
    const lines = output.split('\n');
    for (const line of lines) {
        // Match TypeScript error format: file(line,col): error TS1234: message
        const match = line.match(/(.+)\((\d+),\d+\):\s*error\s*TS\d+:\s*(.+)/);
        if (match) {
            errors.push({
                file: match[1],
                line: parseInt(match[2], 10),
                message: match[3],
            });
        }
    }
    return errors;
}
