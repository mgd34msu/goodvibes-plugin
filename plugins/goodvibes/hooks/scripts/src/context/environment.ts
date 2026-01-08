/**
 * Environment Configuration Module
 *
 * Consolidated environment analysis providing both quick checks and comprehensive analysis.
 *
 * **Two APIs:**
 * - `checkEnvStatus()` - Quick check returning {@link EnvStatus} (basic presence/missing vars)
 * - `analyzeEnvironment()` - Comprehensive analysis returning {@link EnvironmentContext}
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { fileExists } from '../shared/file-utils.js';
import { debug } from '../shared/logging.js';

import {
  SENSITIVE_PATTERNS,
  ENV_FILES,
  ENV_EXAMPLE_FILES,
} from './constants/environment.js';

import type { EnvStatus, EnvironmentContext } from '../types/environment.js';

// Re-export types for consumers
export type { EnvStatus, EnvironmentContext };

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Parse env content and extract variable names.
 *
 * @param content - The raw content of an env file
 * @returns Array of environment variable names
 */
function parseEnvVars(content: string): string[] {
  const vars: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
    if (match) {
      vars.push(match[1]);
    }
  }
  return vars;
}

/**
 * Parse an env file and extract variable names.
 *
 * @param filePath - The absolute path to the .env file
 * @returns Promise resolving to array of variable names
 */
async function parseEnvFile(filePath: string): Promise<string[]> {
  try {
    if (!(await fileExists(filePath))) {
      return [];
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return parseEnvVars(content);
  } catch (error: unknown) {
    debug('parseEnvFile failed', { error: String(error) });
    return [];
  }
}

/**
 * Check if a variable name looks sensitive.
 *
 * @param varName - The environment variable name to check
 * @returns True if the variable name matches sensitive patterns
 */
function isSensitiveVar(varName: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(varName));
}

/**
 * Check if an env file is ignored by gitignore.
 *
 * @param gitignore - The gitignore file contents
 * @param envFile - The env file name to check
 * @returns True if the file is ignored
 */
function isEnvFileIgnored(gitignore: string, envFile: string): boolean {
  return (
    gitignore.includes(envFile) ||
    gitignore.includes('.env') ||
    gitignore.includes('.env*') ||
    gitignore.includes('.env.*')
  );
}

// =============================================================================
// Quick Check API (EnvStatus)
// =============================================================================

/**
 * Quick environment check returning basic status.
 *
 * @param cwd - Working directory to check
 * @returns Promise resolving to EnvStatus
 */
export async function checkEnvStatus(cwd: string): Promise<EnvStatus> {
  const envPath = path.join(cwd, '.env');
  const envLocalPath = path.join(cwd, '.env.local');
  const envExamplePath = path.join(cwd, '.env.example');

  const [hasEnvPathExists, hasEnvLocalExists, hasEnvExampleExists] =
    await Promise.all([
      fileExists(envPath),
      fileExists(envLocalPath),
      fileExists(envExamplePath),
    ]);

  const hasEnvFile = hasEnvPathExists || hasEnvLocalExists;
  const hasEnvExample = hasEnvExampleExists;

  let missingVars: string[] = [];
  const warnings: string[] = [];

  if (hasEnvExample) {
    const exampleContent = await fs.readFile(envExamplePath, 'utf-8');
    const requiredVars = parseEnvVars(exampleContent);

    let definedVars: string[] = [];
    if (hasEnvLocalExists) {
      definedVars = parseEnvVars(await fs.readFile(envLocalPath, 'utf-8'));
    } else if (hasEnvPathExists) {
      definedVars = parseEnvVars(await fs.readFile(envPath, 'utf-8'));
    }

    missingVars = requiredVars.filter((v) => !definedVars.includes(v));
    if (missingVars.length > 0) {
      warnings.push(`Missing env vars: ${missingVars.join(', ')}`);
    }
  }

  return { hasEnvFile, hasEnvExample, missingVars, warnings };
}

// =============================================================================
// Comprehensive Analysis API (EnvironmentContext)
// =============================================================================

/**
 * Collect env files and their variables from the project.
 *
 * @param cwd - Working directory to analyze
 * @returns Object with envFiles array and definedVars array
 */
async function collectEnvFiles(
  cwd: string
): Promise<{ envFiles: string[]; definedVars: string[] }> {
  const envFiles: string[] = [];
  let definedVars: string[] = [];

  const fileChecks = await Promise.all(
    ENV_FILES.map(async (envFile) => {
      const filePath = path.join(cwd, envFile);
      if (await fileExists(filePath)) {
        return { envFile, vars: await parseEnvFile(filePath) };
      }
      return null;
    })
  );

  for (const result of fileChecks) {
    if (result) {
      envFiles.push(result.envFile);
      definedVars = [...definedVars, ...result.vars];
    }
  }

  return { envFiles, definedVars: [...new Set(definedVars)] };
}

/**
 * Find example env file and its variables.
 *
 * @param cwd - Working directory to check
 * @returns Object with hasEnvExample flag and exampleVars array
 */
async function findExampleEnvFile(
  cwd: string
): Promise<{ hasEnvExample: boolean; exampleVars: string[] }> {
  const exampleChecks = await Promise.all(
    ENV_EXAMPLE_FILES.map(async (exampleFile) => {
      const filePath = path.join(cwd, exampleFile);
      return { filePath, exists: await fileExists(filePath) };
    })
  );

  for (const check of exampleChecks) {
    if (check.exists) {
      return {
        hasEnvExample: true,
        exampleVars: await parseEnvFile(check.filePath),
      };
    }
  }

  return { hasEnvExample: false, exampleVars: [] };
}

/**
 * Check for sensitive vars that might be in version control.
 *
 * @param cwd - Working directory
 * @param envFiles - List of env files found
 * @returns Array of exposed sensitive variable descriptions
 */
async function checkSensitiveVarsExposed(
  cwd: string,
  envFiles: string[]
): Promise<string[]> {
  const sensitiveVarsExposed: string[] = [];
  const gitignorePath = path.join(cwd, '.gitignore');

  if (!(await fileExists(gitignorePath))) {
    return [];
  }

  const gitignore = await fs.readFile(gitignorePath, 'utf-8');

  for (const envFile of envFiles) {
    if (!isEnvFileIgnored(gitignore, envFile) && envFile !== '.env.example') {
      const vars = await parseEnvFile(path.join(cwd, envFile));
      const sensitive = vars.filter(isSensitiveVar);
      sensitiveVarsExposed.push(...sensitive.map((v) => `${v} (in ${envFile})`));
    }
  }

  return [...new Set(sensitiveVarsExposed)];
}

/**
 * Comprehensive environment analysis including security checks.
 *
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export async function analyzeEnvironment(
  cwd: string
): Promise<EnvironmentContext> {
  const { envFiles, definedVars } = await collectEnvFiles(cwd);
  const { hasEnvExample, exampleVars } = await findExampleEnvFile(cwd);
  const missingVars = exampleVars.filter((v) => !definedVars.includes(v));
  const sensitiveVarsExposed = await checkSensitiveVarsExposed(cwd, envFiles);

  return {
    envFiles,
    hasEnvExample,
    missingVars,
    definedVars,
    sensitiveVarsExposed,
  };
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format EnvStatus for display in context output.
 *
 * @param status - The EnvStatus to format
 * @returns Formatted string or empty string if no relevant info
 */
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

/**
 * Format EnvironmentContext for display.
 *
 * @param context - The EnvironmentContext to format
 * @returns Formatted string or null if no env files
 */
export function formatEnvironment(context: EnvironmentContext): string | null {
  if (context.envFiles.length === 0) {
    return null;
  }

  const lines: string[] = [`**Env Files:** ${context.envFiles.join(', ')}`];

  if (context.missingVars.length > 0) {
    lines.push(
      `**Missing Vars:** ${context.missingVars.join(', ')} (defined in .env.example but not set)`
    );
  }

  if (context.sensitiveVarsExposed.length > 0) {
    lines.push(
      `**Warning:** Potentially sensitive vars may not be gitignored: ${context.sensitiveVarsExposed.join(', ')}`
    );
  }

  return lines.join('\n');
}
