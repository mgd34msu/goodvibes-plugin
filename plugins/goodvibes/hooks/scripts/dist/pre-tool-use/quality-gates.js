import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
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
function runCheck(command, cwd) {
    try {
        execSync(command, { cwd, stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
/** Runs all quality gates and returns aggregate results */
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
                execSync(gate.autoFix, { cwd, stdio: 'pipe' });
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
            catch {
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
/** Checks if a command is a git commit command */
export function isCommitCommand(command) {
    return /git\s+commit/.test(command);
}
/** Formats gate results into a human-readable string */
export function formatGateResults(results) {
    return results
        .map(r => `${r.gate}: ${r.status}${r.message ? ` (${r.message})` : ''}`)
        .join(', ');
}
