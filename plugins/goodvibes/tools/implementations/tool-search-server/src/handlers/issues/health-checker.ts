/**
 * Project health checking functionality
 */

import * as fs from 'fs';
import * as path from 'path';

import { HealthWarning } from './types.js';
import { LOCKFILES } from './constants.js';

/**
 * Check project health
 */
export function checkHealth(cwd: string): { warnings: HealthWarning[]; suggestions: string[] } {
  const warnings: HealthWarning[] = [];
  const suggestions: string[] = [];

  // Check node_modules and lockfiles
  const hasNodeModules = fs.existsSync(path.join(cwd, 'node_modules'));
  const lockfiles: string[] = [];
  let packageManager: string | null = null;

  for (const [file, manager] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(cwd, file))) {
      lockfiles.push(file);
      if (!packageManager) packageManager = manager;
    }
  }

  if (lockfiles.length > 0 && !hasNodeModules) {
    warnings.push({
      type: 'warning',
      message: `node_modules not found. Run \`${packageManager} install\` to install dependencies.`,
    });
  }

  if (lockfiles.length > 1) {
    warnings.push({
      type: 'warning',
      message: `Multiple lockfiles found (${lockfiles.join(', ')}). This can cause inconsistent installs.`,
    });
  }

  // Check TypeScript config
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const content = fs.readFileSync(tsconfigPath, 'utf-8');
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const tsconfig = JSON.parse(jsonContent);
      const compilerOptions = tsconfig.compilerOptions || {};

      if (!compilerOptions.strict) {
        warnings.push({
          type: 'info',
          message: 'TypeScript strict mode is not enabled. Consider enabling for better type safety.',
        });
      }
    } catch (err: unknown) {
      console.error(`[issues] Failed to parse tsconfig.json:`, err instanceof Error ? err.message : err);
    }
  }

  // Check package.json scripts
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const scripts = Object.keys(packageJson.scripts || {});

      if (!scripts.includes('lint') && !scripts.includes('eslint')) {
        suggestions.push('Add a `lint` script to catch code issues');
      }
      if (!scripts.includes('test') && !scripts.includes('jest') && !scripts.includes('vitest')) {
        suggestions.push('Add a `test` script for automated testing');
      }
    } catch (err: unknown) {
      console.error(`[issues] Failed to parse package.json:`, err instanceof Error ? err.message : err);
    }
  }

  return { warnings, suggestions: suggestions.slice(0, 3) };
}
