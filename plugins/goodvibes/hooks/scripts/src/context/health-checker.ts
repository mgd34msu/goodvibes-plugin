/**
 * Health Checker (Lightweight)
 *
 * Checks project health: dependencies, lockfiles, TypeScript configuration.
 * Returns a simple HealthStatus for quick checks.
 *
 * **Difference from project-health.ts:**
 * - This module returns {@link HealthStatus} with basic health checks array
 * - project-health.ts returns {@link ProjectHealth} with comprehensive analysis
 *   including TypeScript config details, npm scripts, and suggestions
 *
 * Use this when you need quick health checks; use project-health.ts for full analysis.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LOCKFILES, fileExistsAsync } from '../shared.js';
import { debug } from '../shared/logging.js';

/** Result of a single health check. */
export interface HealthCheck {
  check: string;
  status: 'ok' | 'warning' | 'error' | 'info';
  message: string;
}

/** Aggregated health status with all check results. */
export interface HealthStatus {
  checks: HealthCheck[];
}

/**
 * Check project health: dependencies, lockfiles, TypeScript configuration.
 *
 * This is a lightweight check returning basic status. For comprehensive
 * health analysis including TypeScript details and suggestions, use
 * {@link checkProjectHealth} from project-health.ts instead.
 */
export async function checkProjectHealth(cwd: string): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];

  // Check node_modules
  const hasNodeModules = await fileExistsAsync(path.join(cwd, 'node_modules'));
  const hasPackageJson = await fileExistsAsync(path.join(cwd, 'package.json'));

  if (hasPackageJson && !hasNodeModules) {
    checks.push({
      check: 'dependencies',
      status: 'warning',
      message: 'node_modules missing - run install',
    });
  }

  // Check for multiple lockfiles
  const lockfileChecks = await Promise.all(
    LOCKFILES.map(async (f) => ({ file: f, exists: await fileExistsAsync(path.join(cwd, f)) }))
  );
  const foundLockfiles = lockfileChecks.filter(({ exists }) => exists).map(({ file }) => file);

  if (foundLockfiles.length > 1) {
    checks.push({
      check: 'lockfiles',
      status: 'warning',
      message: `Multiple lockfiles found: ${foundLockfiles.join(', ')}`,
    });
  }

  // Check TypeScript strict mode
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (await fileExistsAsync(tsconfigPath)) {
    try {
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);
      if (!config.compilerOptions?.strict) {
        checks.push({
          check: 'typescript',
          status: 'info',
          message: 'TypeScript strict mode is off',
        });
      }
    } catch (error) {
      // tsconfig.json might have comments or invalid JSON, which is fine
      debug('health-checker: Failed to parse tsconfig.json', error);
    }
  }

  return { checks };
}

/** Format health status for display in context output. */
export function formatHealthStatus(status: HealthStatus): string {
  if (status.checks.length === 0) return 'Health: All good';

  const lines = ['Health:'];
  for (const check of status.checks) {
    const icon = check.status === 'warning' ? '[!]' : check.status === 'error' ? '[X]' : '[i]';
    lines.push(`${icon} ${check.message}`);
  }
  return lines.join('\n');
}
