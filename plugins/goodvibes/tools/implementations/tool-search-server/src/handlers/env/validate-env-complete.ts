/**
 * Validate Environment Complete Handler
 *
 * Validates that environment variables are complete and properly documented.
 * Compares .env files against .env.example and code usage to identify:
 * - Missing variables (in example or code but not in .env)
 * - Unused variables (in .env but not in code)
 * - Undocumented variables (in .env but not in .env.example)
 * - Type validation issues (optional)
 *
 * @module handlers/env/validate-env-complete
 */

import * as fs from 'fs';
import * as path from 'path';

import { success } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the validate_env_complete MCP tool
 */
export interface ValidateEnvCompleteArgs {
  /** Path to the .env file (default: ".env") */
  env_file?: string;
  /** Path to the .env.example file (default: ".env.example") */
  example_file?: string;
  /** Variables to ignore during validation */
  ignore?: string[];
  /** Whether to validate value formats (default: false) */
  check_values?: boolean;
}

/**
 * Information about a missing environment variable
 */
interface MissingVariable {
  name: string;
  defined_in: 'example' | 'code';
  used_in: string[];
}

/**
 * Information about an unused environment variable
 */
interface UnusedVariable {
  name: string;
  defined_in: '.env' | '.env.example';
}

/**
 * Information about an undocumented environment variable
 */
interface UndocumentedVariable {
  name: string;
}

/**
 * Information about a type validation issue
 */
interface TypeIssue {
  name: string;
  expected_type: string;
  actual_value: string;
  issue: string;
}

/**
 * Summary statistics
 */
interface ValidationSummary {
  total_in_env: number;
  total_in_example: number;
  total_used_in_code: number;
  missing_count: number;
  unused_count: number;
}

/**
 * Result from validate_env_complete tool
 */
interface ValidateEnvCompleteResult {
  valid: boolean;
  env_file_exists: boolean;
  example_file_exists: boolean;
  missing: MissingVariable[];
  unused: UnusedVariable[];
  undocumented: UndocumentedVariable[];
  type_issues?: TypeIssue[];
  summary: ValidationSummary;
}

// File extensions to scan for env variable usage
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte',
]);

// Directories to skip during scanning
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage',
  '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target',
]);

// Regex patterns to match environment variable access
const ENV_PATTERNS = [
  // process.env.VAR_NAME
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  // process.env['VAR_NAME'] or process.env["VAR_NAME"]
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
  // import.meta.env.VAR_NAME (Vite)
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  // Deno.env.get('VAR_NAME')
  /Deno\.env\.get\(['"]([A-Z_][A-Z0-9_]*)['"]\)/g,
];

// Built-in env vars to skip
const BUILTIN_VARS = new Set([
  'NODE_ENV', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL',
]);

/**
 * Parse environment variables from an env file content
 */
function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    // Match VAR_NAME=value
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (match) {
      const name = match[1].toUpperCase();
      // Remove surrounding quotes from value
      const value = match[2].replace(/^["']|["']$/g, '');
      vars.set(name, value);
    }
  }

  return vars;
}

/**
 * Scan a file for environment variable usages
 */
function scanFileForEnvVars(
  filePath: string,
  relativePath: string
): Map<string, string[]> {
  const varMap = new Map<string, string[]>();

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const pattern of ENV_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const varName = match[1].toUpperCase();

        // Skip built-in env vars
        if (BUILTIN_VARS.has(varName)) {
          continue;
        }

        if (!varMap.has(varName)) {
          varMap.set(varName, []);
        }

        const files = varMap.get(varName)!;
        if (!files.includes(relativePath)) {
          files.push(relativePath);
        }
      }
    }
  } catch (err) {
    console.error(`[validate-env-complete] Failed to scan ${filePath}:`, err instanceof Error ? err.message : err);
  }

  return varMap;
}

/**
 * Recursively scan directory for env variable usages
 */
function scanDirectory(
  dir: string,
  baseDir: string,
  varMap: Map<string, string[]>,
  maxFiles: number = 1000
): number {
  let filesScanned = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (filesScanned >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          filesScanned += scanDirectory(fullPath, baseDir, varMap, maxFiles - filesScanned);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCAN_EXTENSIONS.has(ext)) {
          filesScanned++;
          const fileVars = scanFileForEnvVars(fullPath, relativePath);

          // Merge into main map
          for (const [varName, files] of fileVars) {
            if (!varMap.has(varName)) {
              varMap.set(varName, []);
            }
            const existingFiles = varMap.get(varName)!;
            for (const file of files) {
              if (!existingFiles.includes(file)) {
                existingFiles.push(file);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`[validate-env-complete] Failed to read directory ${dir}:`, err instanceof Error ? err.message : err);
  }

  return filesScanned;
}

/**
 * Infer expected type from variable name
 */
function inferExpectedType(varName: string): string {
  const name = varName.toLowerCase();

  if (name.includes('port')) return 'number';
  if (name.includes('url') || name.includes('uri') || name.includes('endpoint')) return 'url';
  if (name.includes('key') || name.includes('secret') || name.includes('token') || name.includes('password')) return 'secret';
  if (name.includes('enabled') || name.includes('debug') || name.includes('disable')) return 'boolean';
  if (name.includes('timeout') || name.includes('limit') || name.includes('max') || name.includes('min') || name.includes('count')) return 'number';

  return 'string';
}

/**
 * Validate a value against its expected type
 */
function validateValue(value: string, expectedType: string): string | null {
  // Empty value is always an issue for non-optional vars
  if (!value || value.trim() === '') {
    return 'Value is empty';
  }

  switch (expectedType) {
    case 'number':
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        return 'Expected numeric value';
      }
      break;
    case 'url':
      try {
        new URL(value);
      } catch {
        return 'Expected valid URL';
      }
      break;
    case 'boolean':
      if (!['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase())) {
        return 'Expected boolean value (true/false/1/0/yes/no)';
      }
      break;
    case 'secret':
      // Secrets should have minimum length
      if (value.length < 8) {
        return 'Secret value appears too short (< 8 characters)';
      }
      break;
  }

  return null;
}

/**
 * Format result as markdown
 */
function formatAsMarkdown(result: ValidateEnvCompleteResult): string {
  const lines: string[] = [];

  // Header
  if (result.valid) {
    lines.push('# Environment Validation: PASSED');
  } else {
    lines.push('# Environment Validation: FAILED');
  }
  lines.push('');

  // File status
  lines.push('## File Status');
  lines.push(`- .env file: ${result.env_file_exists ? 'exists' : 'MISSING'}`);
  lines.push(`- .env.example file: ${result.example_file_exists ? 'exists' : 'MISSING'}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push(`- Variables in .env: ${result.summary.total_in_env}`);
  lines.push(`- Variables in .env.example: ${result.summary.total_in_example}`);
  lines.push(`- Variables used in code: ${result.summary.total_used_in_code}`);
  lines.push(`- Missing: ${result.summary.missing_count}`);
  lines.push(`- Unused: ${result.summary.unused_count}`);
  lines.push('');

  // Missing variables
  if (result.missing.length > 0) {
    lines.push('## Missing Variables');
    lines.push('These variables are referenced but not defined in .env:');
    lines.push('');
    for (const v of result.missing) {
      lines.push(`### \`${v.name}\``);
      lines.push(`- Defined in: ${v.defined_in}`);
      if (v.used_in.length > 0) {
        lines.push(`- Used in: ${v.used_in.slice(0, 5).join(', ')}${v.used_in.length > 5 ? ` (+${v.used_in.length - 5} more)` : ''}`);
      }
      lines.push('');
    }
  }

  // Undocumented variables
  if (result.undocumented.length > 0) {
    lines.push('## Undocumented Variables');
    lines.push('These variables are in .env but not in .env.example:');
    lines.push('');
    for (const v of result.undocumented) {
      lines.push(`- \`${v.name}\``);
    }
    lines.push('');
  }

  // Unused variables
  if (result.unused.length > 0) {
    lines.push('## Unused Variables');
    lines.push('These variables are defined but not used in code:');
    lines.push('');
    for (const v of result.unused) {
      lines.push(`- \`${v.name}\` (in ${v.defined_in})`);
    }
    lines.push('');
  }

  // Type issues
  if (result.type_issues && result.type_issues.length > 0) {
    lines.push('## Type Validation Issues');
    lines.push('');
    for (const issue of result.type_issues) {
      lines.push(`### \`${issue.name}\``);
      lines.push(`- Expected: ${issue.expected_type}`);
      lines.push(`- Value: \`${issue.actual_value.length > 50 ? issue.actual_value.substring(0, 50) + '...' : issue.actual_value}\``);
      lines.push(`- Issue: ${issue.issue}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Handles the validate_env_complete MCP tool call.
 *
 * Validates that environment variables are complete and documented:
 * - Compares .env against .env.example
 * - Scans code for env var usage
 * - Identifies missing, unused, and undocumented variables
 * - Optionally validates value formats
 *
 * @param args - The validate_env_complete tool arguments
 * @returns MCP tool response with validation results
 *
 * @example
 * handleValidateEnvComplete({});
 * // Returns validation results
 *
 * @example
 * handleValidateEnvComplete({ check_values: true, ignore: ['DEBUG'] });
 * // Returns validation results with type checking, ignoring DEBUG
 */
export function handleValidateEnvComplete(args: ValidateEnvCompleteArgs) {
  const envFile = args.env_file || '.env';
  const exampleFile = args.example_file || '.env.example';
  const ignoreList = new Set((args.ignore || []).map(v => v.toUpperCase()));
  const checkValues = args.check_values ?? false;

  const envFilePath = path.join(PROJECT_ROOT, envFile);
  const exampleFilePath = path.join(PROJECT_ROOT, exampleFile);

  // Check file existence
  const envFileExists = fs.existsSync(envFilePath);
  const exampleFileExists = fs.existsSync(exampleFilePath);

  // Parse env files
  let envVars = new Map<string, string>();
  let exampleVars = new Map<string, string>();

  if (envFileExists) {
    try {
      const content = fs.readFileSync(envFilePath, 'utf-8');
      envVars = parseEnvFile(content);
    } catch (err) {
      console.error(`[validate-env-complete] Failed to parse ${envFile}:`, err instanceof Error ? err.message : err);
    }
  }

  if (exampleFileExists) {
    try {
      const content = fs.readFileSync(exampleFilePath, 'utf-8');
      exampleVars = parseEnvFile(content);
    } catch (err) {
      console.error(`[validate-env-complete] Failed to parse ${exampleFile}:`, err instanceof Error ? err.message : err);
    }
  }

  // Scan code for env var usage
  const codeVars = new Map<string, string[]>();
  scanDirectory(PROJECT_ROOT, PROJECT_ROOT, codeVars);

  // Filter out ignored variables
  for (const ignoredVar of ignoreList) {
    envVars.delete(ignoredVar);
    exampleVars.delete(ignoredVar);
    codeVars.delete(ignoredVar);
  }

  // Calculate missing, unused, undocumented
  const missing: MissingVariable[] = [];
  const unused: UnusedVariable[] = [];
  const undocumented: UndocumentedVariable[] = [];
  const typeIssues: TypeIssue[] = [];

  // All vars that should exist (union of example and code usage)
  const allRequiredVars = new Set([...exampleVars.keys(), ...codeVars.keys()]);

  // Check for missing vars (in example or code but not in .env)
  for (const varName of allRequiredVars) {
    if (!envVars.has(varName)) {
      const definedIn = exampleVars.has(varName) ? 'example' : 'code';
      const usedIn = codeVars.get(varName) || [];
      missing.push({
        name: varName,
        defined_in: definedIn as 'example' | 'code',
        used_in: usedIn,
      });
    }
  }

  // Check for unused vars (in .env but not in code)
  for (const varName of envVars.keys()) {
    if (!codeVars.has(varName)) {
      unused.push({
        name: varName,
        defined_in: '.env',
      });
    }
  }

  // Check for unused vars in example (in .env.example but not in code)
  for (const varName of exampleVars.keys()) {
    if (!codeVars.has(varName) && !envVars.has(varName)) {
      // Only add if not already in unused from .env
      const alreadyUnused = unused.some(u => u.name === varName);
      if (!alreadyUnused) {
        unused.push({
          name: varName,
          defined_in: '.env.example',
        });
      }
    }
  }

  // Check for undocumented vars (in .env but not in .env.example)
  for (const varName of envVars.keys()) {
    if (!exampleVars.has(varName)) {
      undocumented.push({ name: varName });
    }
  }

  // Type validation (optional)
  if (checkValues) {
    for (const [varName, value] of envVars) {
      const expectedType = inferExpectedType(varName);
      const issue = validateValue(value, expectedType);
      if (issue) {
        typeIssues.push({
          name: varName,
          expected_type: expectedType,
          actual_value: value,
          issue,
        });
      }
    }
  }

  // Build result
  const result: ValidateEnvCompleteResult = {
    valid: missing.length === 0 && (checkValues ? typeIssues.length === 0 : true),
    env_file_exists: envFileExists,
    example_file_exists: exampleFileExists,
    missing,
    unused,
    undocumented,
    type_issues: checkValues ? typeIssues : undefined,
    summary: {
      total_in_env: envVars.size,
      total_in_example: exampleVars.size,
      total_used_in_code: codeVars.size,
      missing_count: missing.length,
      unused_count: unused.length,
    },
  };

  // Return formatted markdown
  return success(formatAsMarkdown(result));
}
