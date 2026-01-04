/**
 * Build Runner
 *
 * Executes build and type-check operations for the project,
 * parsing output to extract structured error information.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { extractErrorOutput } from '../shared.js';

/** Result of a build or type check operation. */
export interface BuildResult {
  passed: boolean;
  summary: string;
  errors: {
    file: string;
    line: number;
    message: string;
  }[];
}

/** Build commands mapped by framework type. */
export const BUILD_COMMANDS: Record<string, string> = {
  next: 'npm run build',
  vite: 'npm run build',
  typescript: 'npx tsc --noEmit',
  default: 'npm run build',
};

/** TypeScript type check command (same for all frameworks). */
export const TYPECHECK_COMMAND = 'npx tsc --noEmit';

/**
 * Detects the appropriate build command based on project config files.
 */
export function detectBuildCommand(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'next.config.js')) ||
      fs.existsSync(path.join(cwd, 'next.config.mjs')) ||
      fs.existsSync(path.join(cwd, 'next.config.ts'))) {
    return BUILD_COMMANDS.next;
  }
  if (fs.existsSync(path.join(cwd, 'vite.config.ts')) ||
      fs.existsSync(path.join(cwd, 'vite.config.js'))) {
    return BUILD_COMMANDS.vite;
  }
  return BUILD_COMMANDS.default;
}

/**
 * Run the build command for the project
 */
export function runBuild(cwd: string): BuildResult {
  const command = detectBuildCommand(cwd);

  try {
    execSync(command, { cwd, stdio: 'pipe', timeout: 120000 });
    return { passed: true, summary: 'Build passed', errors: [] };
  } catch (error: unknown) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: 'Build failed',
      errors: parseBuildErrors(output),
    };
  }
}

/**
 * Run TypeScript type checking
 */
export function runTypeCheck(cwd: string): BuildResult {
  try {
    execSync(TYPECHECK_COMMAND, { cwd, stdio: 'pipe' });
    return { passed: true, summary: 'Type check passed', errors: [] };
  } catch (error: unknown) {
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
 */
function parseBuildErrors(output: string): BuildResult['errors'] {
  const errors: BuildResult['errors'] = [];
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
