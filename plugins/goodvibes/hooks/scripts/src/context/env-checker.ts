/**
 * Environment Checker
 *
 * Checks environment configuration and identifies missing variables.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Environment configuration status. */
export interface EnvStatus {
  hasEnvFile: boolean;
  hasEnvExample: boolean;
  missingVars: string[];
  warnings: string[];
}

function parseEnvVars(content: string): string[] {
  return content
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.split('=')[0].trim())
    .filter(Boolean);
}

/** Check environment configuration: .env files and missing variables. */
export function checkEnvironment(cwd: string): EnvStatus {
  const envPath = path.join(cwd, '.env');
  const envLocalPath = path.join(cwd, '.env.local');
  const envExamplePath = path.join(cwd, '.env.example');

  const hasEnvFile = fs.existsSync(envPath) || fs.existsSync(envLocalPath);
  const hasEnvExample = fs.existsSync(envExamplePath);

  let missingVars: string[] = [];
  const warnings: string[] = [];

  if (hasEnvExample) {
    const exampleContent = fs.readFileSync(envExamplePath, 'utf-8');
    const requiredVars = parseEnvVars(exampleContent);

    let definedVars: string[] = [];
    if (fs.existsSync(envLocalPath)) {
      definedVars = parseEnvVars(fs.readFileSync(envLocalPath, 'utf-8'));
    } else if (fs.existsSync(envPath)) {
      definedVars = parseEnvVars(fs.readFileSync(envPath, 'utf-8'));
    }

    missingVars = requiredVars.filter(v => !definedVars.includes(v));

    if (missingVars.length > 0) {
      warnings.push(`Missing env vars: ${missingVars.join(', ')}`);
    }
  }

  return { hasEnvFile, hasEnvExample, missingVars, warnings };
}

/** Format environment status for display in context output. */
export function formatEnvStatus(status: EnvStatus): string {
  const parts: string[] = [];

  if (status.hasEnvFile) {
    parts.push('Environment: .env present');
  } else if (status.hasEnvExample) {
    parts.push('Environment: .env.example exists but no .env file');
  }

  if (status.warnings.length > 0) {
    parts.push(`Warning: ${status.warnings.join(', ')}`);
  }

  return parts.join('\n');
}
