import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { debug, logError } from '../shared/logging.js';
/** Default quality gates for TypeScript projects */
export const QUALITY_GATES = [
    {
        name: 'TypeScript',
        check: 'npx tsc --noEmit',
        autoFix: null,
        blocking: true
    },
    {
        name: 'ESLint',
        check: 'npx eslint . --max-warnings=0',
        autoFix: 'npx eslint . --fix',
        blocking: true
    },
    {
        name: 'Prettier',
        check: 'npx prettier --check .',
        autoFix: 'npx prettier --write .',
        blocking: false
    },
    {
        name: 'Tests',
        check: 'npm test',
        autoFix: null,
        blocking: true
    },
];
/**
 * Checks if a tool or npm script exists and is available to run.
 *
 * @param tool - The tool command string (e.g., 'npx tsc' or 'npm test')
 * @param cwd - The current working directory to check for node_modules and package.json
 * @returns True if the tool is available, false otherwise
 */
function toolExists(tool, cwd) {
    // Check if it's an npx command (always available if node_modules exists)
    if (tool.startsWith('npx ')) {
        return fs.existsSync(path.join(cwd, 'node_modules'));
    }
    // Check if npm script exists
    if (tool.startsWith('npm ')) {
        const packageJson = path.join(cwd, 'package.json');
        if (!fs.existsSync(packageJson))
            return false;
        const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
        const scriptName = tool.replace('npm ', '').replace('run ', '');
        return !!pkg.scripts?.[scriptName];
    }
    return true;
}
/**
 * Executes a quality gate check command and returns success status.
 *
 * @param command - The command to execute
 * @param cwd - The current working directory
 * @returns True if the command succeeded (exit code 0), false otherwise
 */
function runCheck(command, cwd) {
    try {
        execSync(command, { cwd, stdio: 'pipe', timeout: 120000 });
        return true;
    }
    catch (error) {
        debug(`Quality gate check failed: ${command} - ${error}`);
        return false;
    }
}
/**
 * Runs all quality gates and returns aggregate results.
 * Iterates through TypeScript, ESLint, Prettier, and Test gates,
 * attempting auto-fixes where available if a gate fails.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise resolving to an object containing:
 *   - allPassed: Whether all gates passed or were auto-fixed
 *   - blocking: Whether any blocking gate failed
 *   - results: Array of individual gate results
 *
 * @example
 * const { allPassed, blocking, results } = await runQualityGates('/project');
 * if (blocking) {
 *   console.error('Blocking quality gates failed');
 * }
 */
export async function runQualityGates(cwd) {
    const results = [];
    let allPassed = true;
    let hasBlockingFailure = false;
    for (const gate of QUALITY_GATES) {
        // Check if tool exists
        const checkTool = gate.check.split(' ')[0] + ' ' + gate.check.split(' ')[1];
        if (!toolExists(checkTool, cwd)) {
            results.push({ gate: gate.name, status: 'skipped', message: 'Tool not available' });
            continue;
        }
        // Run the check
        const passed = runCheck(gate.check, cwd);
        if (passed) {
            results.push({ gate: gate.name, status: 'passed' });
        }
        else if (gate.autoFix) {
            // Try auto-fix
            try {
                execSync(gate.autoFix, { cwd, stdio: 'pipe', timeout: 120000 });
                // Re-check
                const fixedPassed = runCheck(gate.check, cwd);
                if (fixedPassed) {
                    results.push({ gate: gate.name, status: 'auto-fixed' });
                }
                else {
                    results.push({ gate: gate.name, status: 'failed', message: 'Auto-fix did not resolve issues' });
                    allPassed = false;
                    if (gate.blocking)
                        hasBlockingFailure = true;
                }
            }
            catch (error) {
                logError(`Auto-fix for ${gate.name}`, error);
                results.push({ gate: gate.name, status: 'failed', message: 'Auto-fix failed' });
                allPassed = false;
                if (gate.blocking)
                    hasBlockingFailure = true;
            }
        }
        else {
            results.push({ gate: gate.name, status: 'failed' });
            allPassed = false;
            if (gate.blocking)
                hasBlockingFailure = true;
        }
    }
    return { allPassed, blocking: hasBlockingFailure, results };
}
/**
 * Checks if a command string is a git commit command.
 *
 * @param command - The command string to check
 * @returns True if the command contains 'git commit', false otherwise
 *
 * @example
 * isCommitCommand('git commit -m "message"'); // true
 * isCommitCommand('git push origin main');    // false
 */
export function isCommitCommand(command) {
    return /git\s+commit/.test(command);
}
/**
 * Formats gate results into a human-readable string.
 * Each result is formatted as "GateName: status (message)" and joined with commas.
 *
 * @param results - Array of GateResult objects to format
 * @returns A comma-separated string of formatted gate results
 *
 * @example
 * const formatted = formatGateResults([
 *   { gate: 'TypeScript', status: 'passed' },
 *   { gate: 'ESLint', status: 'failed', message: 'Lint errors' }
 * ]);
 * // Returns: "TypeScript: passed, ESLint: failed (Lint errors)"
 */
export function formatGateResults(results) {
    return results
        .map(r => `${r.gate}: ${r.status}${r.message ? ` (${r.message})` : ''}`)
        .join(', ');
}
