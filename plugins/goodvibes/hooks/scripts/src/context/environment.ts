/**
 * Environment Configuration Module
 *
 * Consolidated environment analysis providing both quick checks and comprehensive analysis.
 *
 * **Two APIs:**
 * - `checkEnvStatus()` - Quick check returning {@link EnvStatus} (basic presence/missing vars)
 * - `analyzeEnvironment()` - Comprehensive analysis returning {@link EnvironmentContext}
 *
 * **Backwards Compatibility:**
 * - `checkEnvironment()` is an alias for `analyzeEnvironment()` (comprehensive)
 * - env-checker.ts re-exports `checkEnvStatus` as `checkEnvironment` for existing consumers
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Lightweight environment status for quick checks.
 * Used by consumers that need basic env file presence information.
 */
export interface EnvStatus {
  hasEnvFile: boolean;
  hasEnvExample: boolean;
  missingVars: string[];
  warnings: string[];
}

/**
 * Comprehensive environment analysis results.
 * Includes sensitive variable detection and detailed file information.
 */
export interface EnvironmentContext {
  envFiles: string[];
  hasEnvExample: boolean;
  missingVars: string[];
  definedVars: string[];
  sensitiveVarsExposed: string[];
}

// =============================================================================
// Constants
// =============================================================================

/** Common sensitive variable patterns for security detection. */
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
  /credentials/i,
  /auth/i,
];

/** All env file variants to check for. */
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

/** Example/template env files to check for required variables. */
const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Parse an env file and extract variable names (sync version).
 */
function parseEnvFileSync(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    return parseEnvVars(content);
  } catch (error) {
    debug('parseEnvFileSync failed', { error: String(error) });
    return [];
  }
}

/**
 * Parse env content and extract variable names.
 */
function parseEnvVars(content: string): string[] {
  const vars: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Extract variable name (support both KEY=value and KEY= formats)
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
    if (match) {
      vars.push(match[1]);
    }
  }

  return vars;
}

/**
 * Check if a variable name looks sensitive.
 */
function isSensitiveVar(varName: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(varName));
}

/**
 * Check if a file exists (async version).
 */
async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Quick Check API (EnvStatus)
// =============================================================================

/**
 * Quick environment check returning basic status.
 *
 * This is the lightweight check that returns basic status. For comprehensive
 * environment analysis including sensitive variable detection, use
 * {@link analyzeEnvironment} instead.
 *
 * @param cwd - Working directory to check
 * @returns Promise resolving to EnvStatus
 */
export async function checkEnvStatus(cwd: string): Promise<EnvStatus> {
  const envPath = path.join(cwd, '.env');
  const envLocalPath = path.join(cwd, '.env.local');
  const envExamplePath = path.join(cwd, '.env.example');

  const [hasEnvPathExists, hasEnvLocalExists, hasEnvExampleExists] = await Promise.all([
    fileExistsAsync(envPath),
    fileExistsAsync(envLocalPath),
    fileExistsAsync(envExamplePath),
  ]);

  const hasEnvFile = hasEnvPathExists || hasEnvLocalExists;
  const hasEnvExample = hasEnvExampleExists;

  let missingVars: string[] = [];
  const warnings: string[] = [];

  if (hasEnvExample) {
    const exampleContent = await fsPromises.readFile(envExamplePath, 'utf-8');
    const requiredVars = parseEnvVars(exampleContent);

    let definedVars: string[] = [];
    if (hasEnvLocalExists) {
      definedVars = parseEnvVars(await fsPromises.readFile(envLocalPath, 'utf-8'));
    } else if (hasEnvPathExists) {
      definedVars = parseEnvVars(await fsPromises.readFile(envPath, 'utf-8'));
    }

    missingVars = requiredVars.filter(v => !definedVars.includes(v));

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
 * Comprehensive environment analysis including security checks.
 *
 * Performs full analysis including:
 * - Detection of all .env file variants
 * - Missing variable detection against example files
 * - Sensitive variable exposure detection (not in .gitignore)
 *
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export async function analyzeEnvironment(cwd: string): Promise<EnvironmentContext> {
  const envFiles: string[] = [];
  let definedVars: string[] = [];

  // Check which env files exist
  for (const envFile of ENV_FILES) {
    const filePath = path.join(cwd, envFile);
    if (fs.existsSync(filePath)) {
      envFiles.push(envFile);
      const vars = parseEnvFileSync(filePath);
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
      exampleVars = parseEnvFileSync(filePath);
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
        const vars = parseEnvFileSync(path.join(cwd, envFile));
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
 * Check environment configuration (comprehensive).
 *
 * @deprecated Use {@link analyzeEnvironment} for clarity. This is an alias for backwards compatibility.
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export async function checkEnvironment(cwd: string): Promise<EnvironmentContext> {
  return analyzeEnvironment(cwd);
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
