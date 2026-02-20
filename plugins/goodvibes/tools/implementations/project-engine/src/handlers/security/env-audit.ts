/**
 * Environment Audit Handler
 *
 * Comprehensive environment variable auditing that combines:
 * 1. Scanning source files for process.env.*, import.meta.env.*, Deno.env.* usages
 * 2. Comparing .env vs .env.example
 * 3. Validating value formats based on naming conventions
 *
 * @module handlers/security/env-audit
 */

import * as fs from 'fs';
import * as path from 'path';

import { createTextResponse, ToolResponse } from '../../shared/response.js';
import { PROJECT_ROOT } from '../../config.js';
import { logError } from '../../logging.js';

/**
 * Arguments for the env_audit MCP tool
 */
export interface EnvAuditArgs {
  /** Project root path to analyze (defaults to PROJECT_ROOT) */
  path?: string;
  /** Path to the .env file (default: ".env") */
  env_file?: string;
  /** Path to the .env.example file (default: ".env.example") */
  example_file?: string;
  /** Variable names to ignore during validation */
  ignore?: string[];
  /** Validate value formats based on variable naming (e.g., PORT should be numeric) */
  check_values?: boolean;
  /** Scan source code for env var usages (default: true) */
  scan_code?: boolean;
}

/**
 * Location where an environment variable is used
 */
interface EnvUsage {
  file: string;
  line: number;
}

/**
 * Information about an environment variable
 */
interface EnvVariable {
  name: string;
  used_in: EnvUsage[];
  defined_in: string[];
  has_default: boolean;
  required: boolean;
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
interface EnvAuditSummary {
  total_in_env: number;
  total_in_example: number;
  total_used_in_code: number;
  missing_count: number;
  unused_count: number;
  undocumented_count: number;
}

/**
 * Result from env_audit tool
 */
interface EnvAuditResult {
  valid: boolean;
  env_file_exists: boolean;
  example_file_exists: boolean;
  variables: EnvVariable[];
  missing: MissingVariable[];
  unused: UnusedVariable[];
  undocumented: UndocumentedVariable[];
  type_issues?: TypeIssue[];
  summary: EnvAuditSummary;
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

// Patterns that indicate a default/fallback value is provided
const DEFAULT_PATTERNS = [
  // process.env.VAR || 'default'
  /process\.env\.([A-Z_][A-Z0-9_]*)\s*\|\|/,
  // process.env.VAR ?? 'default'
  /process\.env\.([A-Z_][A-Z0-9_]*)\s*\?\?/,
  // process.env['VAR'] || 'default'
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]\s*\|\|/,
  // process.env['VAR'] ?? 'default'
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]\s*\?\?/,
  // import.meta.env.VAR || 'default'
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)\s*\|\|/,
  // import.meta.env.VAR ?? 'default'
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)\s*\?\?/,
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
    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/i);
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
): Map<string, { usages: EnvUsage[]; hasDefault: boolean }> {
  const varMap = new Map<string, { usages: EnvUsage[]; hasDefault: boolean }>();

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Track which vars have defaults (check full content first)
    const varsWithDefaults = new Set<string>();
    for (const pattern of DEFAULT_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, 'g');
      let match;
      while ((match = globalPattern.exec(content)) !== null) {
        varsWithDefaults.add(match[1].toUpperCase());
      }
    }

    // Scan each line for env var usage
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of ENV_PATTERNS) {
        // Reset regex state
        pattern.lastIndex = 0;
        let match;

        while ((match = pattern.exec(line)) !== null) {
          const varName = match[1].toUpperCase();

          // Skip built-in env vars
          if (BUILTIN_VARS.has(varName)) {
            continue;
          }

          if (!varMap.has(varName)) {
            varMap.set(varName, {
              usages: [],
              hasDefault: varsWithDefaults.has(varName),
            });
          }

          const entry = varMap.get(varName)!;
          // Avoid duplicate entries for same file:line
          const alreadyRecorded = entry.usages.some(
            u => u.file === relativePath && u.line === lineNum + 1
          );
          if (!alreadyRecorded) {
            entry.usages.push({
              file: relativePath,
              line: lineNum + 1,
            });
          }
        }
      }
    }
  } catch (err) {
    logError(`[env-audit] Failed to scan ${filePath}`, err);
  }

  return varMap;
}

/**
 * Recursively scan directory for env variable usages
 */
function scanDirectory(
  dir: string,
  baseDir: string,
  varMap: Map<string, { usages: EnvUsage[]; hasDefault: boolean }>,
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
          for (const [varName, data] of fileVars) {
            if (!varMap.has(varName)) {
              varMap.set(varName, { usages: [], hasDefault: data.hasDefault });
            }
            const entry = varMap.get(varName)!;
            entry.usages.push(...data.usages);
            if (data.hasDefault) {
              entry.hasDefault = true;
            }
          }
        }
      }
    }
  } catch (err) {
    logError(`[env-audit] Failed to read directory ${dir}`, err);
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
function formatAsMarkdown(result: EnvAuditResult): string {
  const lines: string[] = [];

  // Header
  if (result.valid) {
    lines.push('# Environment Audit: PASSED');
  } else {
    lines.push('# Environment Audit: FAILED');
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
  lines.push(`- Undocumented: ${result.summary.undocumented_count}`);
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

  // Variables list (if code scanning was done)
  if (result.variables.length > 0) {
    lines.push('## All Variables Found in Code');
    lines.push('');
    for (const v of result.variables) {
      lines.push(`### \`${v.name}\``);
      lines.push(`- Required: ${v.required ? 'Yes' : 'No'}`);
      lines.push(`- Has default: ${v.has_default ? 'Yes' : 'No'}`);
      lines.push(`- Defined in: ${v.defined_in.length > 0 ? v.defined_in.join(', ') : 'None'}`);
      lines.push(`- Used in ${v.used_in.length} location(s)`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Handles the env_audit MCP tool call.
 *
 * Comprehensive environment variable audit that combines:
 * 1. Scanning source files for env var usages
 * 2. Comparing .env vs .env.example
 * 3. Validating value formats
 *
 * @param args - The env_audit tool arguments
 * @returns MCP tool response with audit results
 *
 * @example
 * handleEnvAudit({});
 * // Returns full audit results with all checks
 *
 * @example
 * handleEnvAudit({ check_values: true, ignore: ['DEBUG'], scan_code: false });
 * // Only compare env files without scanning code
 */
export function handleEnvAudit(args: EnvAuditArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const envFile = args.env_file || '.env';
  const exampleFile = args.example_file || '.env.example';
  const ignoreList = new Set((args.ignore || []).map(v => v.toUpperCase()));
  const checkValues = args.check_values ?? false;
  const scanCode = args.scan_code ?? true;

  const envFilePath = path.join(projectPath, envFile);
  const exampleFilePath = path.join(projectPath, exampleFile);

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
      logError(`[env-audit] Failed to parse ${envFile}`, err);
    }
  }

  if (exampleFileExists) {
    try {
      const content = fs.readFileSync(exampleFilePath, 'utf-8');
      exampleVars = parseEnvFile(content);
    } catch (err) {
      logError(`[env-audit] Failed to parse ${exampleFile}`, err);
    }
  }

  // Scan code for env var usage (optional)
  const codeVarMap = new Map<string, { usages: EnvUsage[]; hasDefault: boolean }>();
  if (scanCode) {
    scanDirectory(projectPath, projectPath, codeVarMap);
  }

  // Build variables list for code usage
  const variables: EnvVariable[] = [];
  for (const [varName, data] of codeVarMap) {
    if (ignoreList.has(varName)) continue;

    // Find which env files define this variable
    const definedIn: string[] = [];
    if (envVars.has(varName)) definedIn.push(envFile);
    if (exampleVars.has(varName)) definedIn.push(exampleFile);

    variables.push({
      name: varName,
      used_in: data.usages,
      defined_in: definedIn,
      has_default: data.hasDefault,
      required: !data.hasDefault && !envVars.has(varName),
    });
  }

  // Sort variables: undocumented first, then by name
  variables.sort((a, b) => {
    if (a.defined_in.length === 0 && b.defined_in.length > 0) return -1;
    if (a.defined_in.length > 0 && b.defined_in.length === 0) return 1;
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    return a.name.localeCompare(b.name);
  });

  // Filter out ignored variables
  for (const ignoredVar of ignoreList) {
    envVars.delete(ignoredVar);
    exampleVars.delete(ignoredVar);
  }

  // Calculate missing, unused, undocumented
  const missing: MissingVariable[] = [];
  const unused: UnusedVariable[] = [];
  const undocumented: UndocumentedVariable[] = [];
  const typeIssues: TypeIssue[] = [];

  // Create a set of var names used in code
  const codeVarNames = new Set(codeVarMap.keys());

  // All vars that should exist (union of example and code usage)
  const allRequiredVars = new Set([...exampleVars.keys(), ...codeVarNames]);

  // Check for missing vars (in example or code but not in .env)
  for (const varName of allRequiredVars) {
    if (ignoreList.has(varName)) continue;
    if (!envVars.has(varName)) {
      const definedIn = exampleVars.has(varName) ? 'example' : 'code';
      const usedIn = codeVarMap.get(varName)?.usages.map(u => u.file) || [];
      missing.push({
        name: varName,
        defined_in: definedIn as 'example' | 'code',
        used_in: usedIn,
      });
    }
  }

  // Check for unused vars (in .env but not in code)
  if (scanCode) {
    for (const varName of envVars.keys()) {
      if (ignoreList.has(varName)) continue;
      if (!codeVarNames.has(varName)) {
        unused.push({
          name: varName,
          defined_in: '.env',
        });
      }
    }

    // Check for unused vars in example (in .env.example but not in code)
    for (const varName of exampleVars.keys()) {
      if (ignoreList.has(varName)) continue;
      if (!codeVarNames.has(varName) && !envVars.has(varName)) {
        unused.push({
          name: varName,
          defined_in: '.env.example',
        });
      }
    }
  }

  // Check for undocumented vars (in .env but not in .env.example)
  for (const varName of envVars.keys()) {
    if (ignoreList.has(varName)) continue;
    if (!exampleVars.has(varName)) {
      undocumented.push({ name: varName });
    }
  }

  // Type validation (optional)
  if (checkValues) {
    for (const [varName, value] of envVars) {
      if (ignoreList.has(varName)) continue;
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
  const result: EnvAuditResult = {
    valid: missing.length === 0 && (checkValues ? typeIssues.length === 0 : true),
    env_file_exists: envFileExists,
    example_file_exists: exampleFileExists,
    variables,
    missing,
    unused,
    undocumented,
    type_issues: checkValues ? typeIssues : undefined,
    summary: {
      total_in_env: envVars.size,
      total_in_example: exampleVars.size,
      total_used_in_code: codeVarMap.size,
      missing_count: missing.length,
      unused_count: unused.length,
      undocumented_count: undocumented.length,
    },
  };

  // Return formatted markdown
  return createTextResponse(formatAsMarkdown(result));
}
