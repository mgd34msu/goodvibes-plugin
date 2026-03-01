/**
 * Environment variable audit extension
 *
 * High-level handler for the env_audit MCP tool.
 * Audits environment variable usage by combining .env file parsing
 * with source code scanning and optional value format validation.
 *
 * @module extensions/security/env-audit
 */

import * as node_fs from 'node:fs/promises';
import * as node_path from 'node:path';
import type { McpResponse } from '../../shared/types.js';
import { text } from '../../shared/response.js';
import { getProjectRoot } from '../../shared/config.js';
import {
  type EnvAuditArgs,
  parseEnvFile,
  scanDirectoryForEnv,
  inferExpectedType,
  validateEnvValue,
  formatEnvAudit,
  type EnvAuditResult,
} from '../../core/security/index.js';

/**
 * Audit environment variable configuration across .env files and source code.
 *
 * Combines three checks:
 * 1. Scanning source files for `process.env.*`, `import.meta.env.*`, and `Deno.env.get()` usages
 * 2. Comparing .env vs .env.example for missing, unused, and undocumented variables
 * 3. Optionally validating value formats based on naming conventions
 *
 * @param args - The env_audit tool arguments
 * @returns MCP response with formatted markdown audit report
 *
 * @example
 * await auditEnvVars({});
 * // Returns full audit markdown report
 *
 * @example
 * await auditEnvVars({ check_values: true, ignore: ['DEBUG'], scan_code: false });
 * // Compares env files only, skipping code scan
 */
export async function auditEnvVars(args: EnvAuditArgs): Promise<McpResponse> {
  const projectRoot = getProjectRoot();
  const projectPath = node_path.resolve(projectRoot, args.path || '.');
  const envFile = args.env_file || '.env';
  const exampleFile = args.example_file || '.env.example';
  const ignoreList = new Set((args.ignore || []).map(v => v.toUpperCase()));
  const checkValues = args.check_values ?? false;
  const scanCode = args.scan_code ?? true;

  const envFilePath = node_path.join(projectPath, envFile);
  const exampleFilePath = node_path.join(projectPath, exampleFile);

  let envFileExists = false;
  let exampleFileExists = false;
  try { await node_fs.access(envFilePath); envFileExists = true; } catch { /* not found */ }
  try { await node_fs.access(exampleFilePath); exampleFileExists = true; } catch { /* not found */ }

  let envVars = new Map<string, string>();
  let exampleVars = new Map<string, string>();

  if (envFileExists) {
    try {
      const content = await node_fs.readFile(envFilePath, 'utf-8');
      envVars = parseEnvFile(content);
    } catch {
      // Continue with empty map on parse failure
    }
  }

  if (exampleFileExists) {
    try {
      const content = await node_fs.readFile(exampleFilePath, 'utf-8');
      exampleVars = parseEnvFile(content);
    } catch {
      // Continue with empty map on parse failure
    }
  }

  // Scan source code for env var usage
  const codeVarMap = new Map<string, { usages: Array<{ file: string; line: number }>; hasDefault: boolean }>();
  if (scanCode) {
    await scanDirectoryForEnv(projectPath, projectPath, codeVarMap);
  }

  // Build variables list
  const variables: EnvAuditResult['variables'] = [];
  for (const [varName, data] of codeVarMap) {
    if (ignoreList.has(varName)) continue;

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

  // Sort: undefined vars first, then required, then alphabetical
  variables.sort((a, b) => {
    if (a.defined_in.length === 0 && b.defined_in.length > 0) return -1;
    if (a.defined_in.length > 0 && b.defined_in.length === 0) return 1;
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    return a.name.localeCompare(b.name);
  });

  // Remove ignored vars from maps
  for (const ignoredVar of ignoreList) {
    envVars.delete(ignoredVar);
    exampleVars.delete(ignoredVar);
  }

  const codeVarNames = new Set(codeVarMap.keys());
  const allRequiredVars = new Set([...exampleVars.keys(), ...codeVarNames]);

  const missing: EnvAuditResult['missing'] = [];
  const unused: EnvAuditResult['unused'] = [];
  const undocumented: EnvAuditResult['undocumented'] = [];
  const typeIssues: NonNullable<EnvAuditResult['type_issues']> = [];

  // Missing: in example or code but not in .env
  for (const varName of allRequiredVars) {
    if (ignoreList.has(varName)) continue;
    if (!envVars.has(varName)) {
      const definedIn = exampleVars.has(varName) ? 'example' : 'code';
      const usedIn = codeVarMap.get(varName)?.usages.map(u => u.file) || [];
      missing.push({ name: varName, defined_in: definedIn, used_in: usedIn });
    }
  }

  // Unused: in .env but not in code
  if (scanCode) {
    for (const varName of envVars.keys()) {
      if (ignoreList.has(varName)) continue;
      if (!codeVarNames.has(varName)) {
        unused.push({ name: varName, defined_in: '.env' });
      }
    }
    for (const varName of exampleVars.keys()) {
      if (ignoreList.has(varName)) continue;
      if (!codeVarNames.has(varName) && !envVars.has(varName)) {
        unused.push({ name: varName, defined_in: '.env.example' });
      }
    }
  }

  // Undocumented: in .env but not in .env.example
  for (const varName of envVars.keys()) {
    if (ignoreList.has(varName)) continue;
    if (!exampleVars.has(varName)) {
      undocumented.push({ name: varName });
    }
  }

  // Type validation
  if (checkValues) {
    for (const [varName, value] of envVars) {
      if (ignoreList.has(varName)) continue;
      const expectedType = inferExpectedType(varName);
      const issue = validateEnvValue(value, expectedType);
      if (issue) {
        typeIssues.push({ name: varName, expected_type: expectedType, actual_value: value, issue });
      }
    }
  }

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

  return text(formatEnvAudit(result));
}
