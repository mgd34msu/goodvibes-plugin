/**
 * Environment Checker
 *
 * Checks .env files and finds missing environment variables.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Environment configuration analysis results. */
export interface EnvironmentContext {
  envFiles: string[];
  hasEnvExample: boolean;
  missingVars: string[];
  definedVars: string[];
  sensitiveVarsExposed: string[];
}

// Common sensitive variable patterns
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
  /credentials/i,
  /auth/i,
];

// Files to check for environment configuration
const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
];

const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];

/**
 * Parse an env file and extract variable names
 */
function parseEnvFile(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    const vars: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Extract variable name
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
      if (match) {
        vars.push(match[1]);
      }
    }

    return vars;
  } catch {
    return [];
  }
}

/**
 * Check if a variable name looks sensitive
 */
function isSensitiveVar(varName: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(varName));
}

/**
 * Check environment configuration
 */
export async function checkEnvironment(cwd: string): Promise<EnvironmentContext> {
  const envFiles: string[] = [];
  let definedVars: string[] = [];

  // Check which env files exist
  for (const envFile of ENV_FILES) {
    const filePath = path.join(cwd, envFile);
    if (fs.existsSync(filePath)) {
      envFiles.push(envFile);
      const vars = parseEnvFile(filePath);
      definedVars = [...definedVars, ...vars];
    }
  }

  // Deduplicate
  definedVars = [...new Set(definedVars)];

  // Check for .env.example
  let hasEnvExample = false;
  let exampleVars: string[] = [];

  for (const exampleFile of ENV_EXAMPLE_FILES) {
    const filePath = path.join(cwd, exampleFile);
    if (fs.existsSync(filePath)) {
      hasEnvExample = true;
      exampleVars = parseEnvFile(filePath);
      break;
    }
  }

  // Find missing vars (in example but not in any env file)
  const missingVars = exampleVars.filter((v) => !definedVars.includes(v));

  // Check for sensitive vars that might be in version control
  const sensitiveVarsExposed: string[] = [];

  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');

    for (const envFile of envFiles) {
      // Simple check - see if the file pattern is in gitignore
      const isIgnored =
        gitignore.includes(envFile) ||
        gitignore.includes('.env') ||
        gitignore.includes('.env*') ||
        gitignore.includes('.env.*');

      if (!isIgnored && envFile !== '.env.example') {
        const vars = parseEnvFile(path.join(cwd, envFile));
        const sensitive = vars.filter(isSensitiveVar);
        sensitiveVarsExposed.push(...sensitive.map((v) => `${v} (in ${envFile})`));
      }
    }
  }

  return {
    envFiles,
    hasEnvExample,
    missingVars,
    definedVars,
    sensitiveVarsExposed: [...new Set(sensitiveVarsExposed)],
  };
}

/**
 * Format environment context for display
 */
export function formatEnvironment(context: EnvironmentContext): string | null {
  const lines: string[] = [];

  if (context.envFiles.length === 0) {
    return null;
  }

  lines.push(`**Env Files:** ${context.envFiles.join(', ')}`);

  if (context.missingVars.length > 0) {
    lines.push(`**Missing Vars:** ${context.missingVars.join(', ')} (defined in .env.example but not set)`);
  }

  if (context.sensitiveVarsExposed.length > 0) {
    lines.push(`**Warning:** Potentially sensitive vars may not be gitignored: ${context.sensitiveVarsExposed.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
