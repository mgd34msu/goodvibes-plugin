import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { debug, logError } from '../shared/logging.js';
import { fileExistsAsync as fileExists } from '../shared/file-utils.js';

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

/**
 * Checks if a tool or npm script exists and is available to run.
 *
 * @param tool - The tool command string (e.g., 'npx tsc' or 'npm test')
 * @param cwd - The current working directory to check for node_modules and package.json
 * @returns Promise resolving to true if the tool is available, false otherwise
 */
async function toolExists(tool: string, cwd: string): Promise<boolean> {
  // Check if it's an npx command (always available if node_modules exists)
  if (tool.startsWith('npx ')) {
    return fileExists(path.join(cwd, 'node_modules'));
  }
  // Check if npm script exists
  if (tool.startsWith('npm ')) {
    const packageJson = path.join(cwd, 'package.json');
    if (!(await fileExists(packageJson))) return false;
    const content = await fs.readFile(packageJson, 'utf-8');
    const pkg = JSON.parse(content);
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
function runCheck(command: string, cwd: string): boolean {
  try {
    execSync(command, { cwd, stdio: 'pipe', timeout: 120000 });
    return true;
  } catch (error) {
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
    if (!(await toolExists(checkTool, cwd))) {
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
        logError(`Auto-fix for ${gate.name}`, error);
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
export function isCommitCommand(command: string): boolean {
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
export function formatGateResults(results: GateResult[]): string {
  return results
    .map(r => `${r.gate}: ${r.status}${r.message ? ` (${r.message})` : ''}`)
    .join(', ');
}
