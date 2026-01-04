/**
 * Health Checker
 *
 * Checks project health: dependencies, lockfiles, TypeScript configuration.
 */

import * as fs from 'fs';
import * as path from 'path';

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

/** Check project health: dependencies, lockfiles, TypeScript configuration. */
export function checkProjectHealth(cwd: string): HealthStatus {
  const checks: HealthCheck[] = [];

  // Check node_modules
  const hasNodeModules = fs.existsSync(path.join(cwd, 'node_modules'));
  const hasPackageJson = fs.existsSync(path.join(cwd, 'package.json'));

  if (hasPackageJson && !hasNodeModules) {
    checks.push({
      check: 'dependencies',
      status: 'warning',
      message: 'node_modules missing - run install',
    });
  }

  // Check for multiple lockfiles
  const lockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb'];
  const foundLockfiles = lockfiles.filter(f => fs.existsSync(path.join(cwd, f)));
  if (foundLockfiles.length > 1) {
    checks.push({
      check: 'lockfiles',
      status: 'warning',
      message: `Multiple lockfiles found: ${foundLockfiles.join(', ')}`,
    });
  }

  // Check TypeScript strict mode
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const content = fs.readFileSync(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);
      if (!config.compilerOptions?.strict) {
        checks.push({
          check: 'typescript',
          status: 'info',
          message: 'TypeScript strict mode is off',
        });
      }
    } catch {
      // tsconfig.json might have comments or invalid JSON, which is fine
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
