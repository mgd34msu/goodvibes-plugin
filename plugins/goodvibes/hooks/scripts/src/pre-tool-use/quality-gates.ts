import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Configuration for a quality gate check */
export interface QualityGate {
  /** Display name of the gate */
  name: string;
  /** Command to run for the check */
  check: string;
  /** Optional command to auto-fix issues */
  autoFix: string | null;
  /** Whether failure blocks the operation */
  blocking: boolean;
}

/** Result of running a quality gate */
export interface GateResult {
  /** Name of the gate that was run */
  gate: string;
  /** Outcome of the gate check */
  status: 'passed' | 'failed' | 'auto-fixed' | 'skipped';
  /** Optional message with additional details */
  message?: string;
}

/** Default quality gates for TypeScript projects */
export const QUALITY_GATES: QualityGate[] = [
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

function toolExists(tool: string, cwd: string): boolean {
  // Check if it's an npx command (always available if node_modules exists)
  if (tool.startsWith('npx ')) {
    return fs.existsSync(path.join(cwd, 'node_modules'));
  }
  // Check if npm script exists
  if (tool.startsWith('npm ')) {
    const packageJson = path.join(cwd, 'package.json');
    if (!fs.existsSync(packageJson)) return false;
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
    const scriptName = tool.replace('npm ', '').replace('run ', '');
    return !!pkg.scripts?.[scriptName];
  }
  return true;
}

function runCheck(command: string, cwd: string): boolean {
  try {
    execSync(command, { cwd, stdio: 'pipe', timeout: 120000 });
    return true;
  } catch (error) {
    const { debug } = require('../shared/logging.js');
    debug(`Quality gate check failed: ${command} - ${error}`);
    return false;
  }
}

/** Runs all quality gates and returns aggregate results */
export async function runQualityGates(cwd: string): Promise<{
  allPassed: boolean;
  blocking: boolean;
  results: GateResult[];
}> {
  const results: GateResult[] = [];
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
    } else if (gate.autoFix) {
      // Try auto-fix
      try {
        execSync(gate.autoFix, { cwd, stdio: 'pipe', timeout: 120000 });
        // Re-check
        const fixedPassed = runCheck(gate.check, cwd);
        if (fixedPassed) {
          results.push({ gate: gate.name, status: 'auto-fixed' });
        } else {
          results.push({ gate: gate.name, status: 'failed', message: 'Auto-fix did not resolve issues' });
          allPassed = false;
          if (gate.blocking) hasBlockingFailure = true;
        }
      } catch (error) {
        const { logError } = require('../shared/logging.js');
        logError(`Auto-fix failed for ${gate.name}: ${error}`);
        results.push({ gate: gate.name, status: 'failed', message: 'Auto-fix failed' });
        allPassed = false;
        if (gate.blocking) hasBlockingFailure = true;
      }
    } else {
      results.push({ gate: gate.name, status: 'failed' });
      allPassed = false;
      if (gate.blocking) hasBlockingFailure = true;
    }
  }

  return { allPassed, blocking: hasBlockingFailure, results };
}

/** Checks if a command is a git commit command */
export function isCommitCommand(command: string): boolean {
  return /git\s+commit/.test(command);
}

/** Formats gate results into a human-readable string */
export function formatGateResults(results: GateResult[]): string {
  return results
    .map(r => `${r.gate}: ${r.status}${r.message ? ` (${r.message})` : ''}`)
    .join(', ');
}
