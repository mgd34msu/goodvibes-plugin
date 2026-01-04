/**
 * Health Checker
 *
 * Checks project health: dependencies, lockfiles, TypeScript configuration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LOCKFILES } from '../shared.js';

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Check project health: dependencies, lockfiles, TypeScript configuration. */
export async function checkProjectHealth(cwd: string): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];

  // Check node_modules
  const hasNodeModules = await fileExists(path.join(cwd, 'node_modules'));
  const hasPackageJson = await fileExists(path.join(cwd, 'package.json'));

  if (hasPackageJson && !hasNodeModules) {
    checks.push({
      check: 'dependencies',
      status: 'warning',
      message: 'node_modules missing - run install',
    });
  }

  // Check for multiple lockfiles
  const lockfileChecks = await Promise.all(
    LOCKFILES.map(async (f) => ({ file: f, exists: await fileExists(path.join(cwd, f)) }))
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
  if (await fileExists(tsconfigPath)) {
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
      console.error('[health-checker] Failed to parse tsconfig.json:', error);
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
