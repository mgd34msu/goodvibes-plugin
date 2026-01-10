/**
 * Environment Configuration Handler
 *
 * Scans project source files to find environment variable usages and
 * cross-references them with .env files to identify documented vs
 * undocumented variables.
 *
 * @module handlers/project/env-config
 */

import * as fs from 'fs';
import * as path from 'path';

import { success } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the get_env_config MCP tool
 */
export interface GetEnvConfigArgs {
  /** Project root path to analyze (defaults to PROJECT_ROOT) */
  path?: string;
}

/**
 * Location where an environment variable is used
 */
interface EnvUsage {
  file: string;
  line: number;
}

/**
 * Environment variable information
 */
interface EnvVariable {
  name: string;
  used_in: EnvUsage[];
  defined_in: string[];
  has_default: boolean;
  required: boolean;
}

/**
 * Summary statistics for environment configuration
 */
interface EnvSummary {
  total: number;
  documented: number;
  undocumented: number;
  unused_in_example: number;
}

/**
 * Result from get_env_config tool
 */
interface EnvConfigResult {
  variables: EnvVariable[];
  summary: EnvSummary;
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

// Env file names to check (in order of priority)
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

const ENV_EXAMPLE_FILES = [
  '.env.example',
  '.env.sample',
  '.env.template',
];

// Regex patterns to match environment variable access
// Matches: process.env.VAR_NAME, process.env['VAR_NAME'], process.env["VAR_NAME"]
// Also: import.meta.env.VAR_NAME, Deno.env.get('VAR_NAME')
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

/**
 * Parse environment variables from an env file
 */
function parseEnvFile(filePath: string): Set<string> {
  const vars = new Set<string>();

  try {
    if (!fs.existsSync(filePath)) {
      return vars;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      // Match VAR_NAME= at the start of line
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
      if (match) {
        vars.add(match[1].toUpperCase());
      }
    }
  } catch (err) {
    console.error(`[env-config] Failed to parse ${filePath}:`, err instanceof Error ? err.message : err);
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
          if (varName === 'NODE_ENV' || varName === 'MODE' || varName === 'DEV' || varName === 'PROD') {
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
    console.error(`[env-config] Failed to scan ${filePath}:`, err instanceof Error ? err.message : err);
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
    console.error(`[env-config] Failed to read directory ${dir}:`, err instanceof Error ? err.message : err);
  }

  return filesScanned;
}

/**
 * Handles the get_env_config MCP tool call.
 *
 * Scans project source files to find all environment variable usages
 * (process.env.*, import.meta.env.*, Deno.env.*) and cross-references
 * them with .env, .env.example, and .env.local files.
 *
 * @param args - The get_env_config tool arguments
 * @param args.path - Project root path (defaults to PROJECT_ROOT)
 * @returns MCP tool response with env config analysis
 *
 * @example
 * handleGetEnvConfig({});
 * // Returns: {
 * //   variables: [
 * //     { name: "DATABASE_URL", used_in: [...], defined_in: [".env"], ... },
 * //   ],
 * //   summary: { total: 5, documented: 4, undocumented: 1, unused_in_example: 0 }
 * // }
 */
export function handleGetEnvConfig(args: GetEnvConfigArgs) {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

  // Validate path exists
  if (!fs.existsSync(projectPath)) {
    return success({
      error: `Path does not exist: ${projectPath}`,
      variables: [],
      summary: { total: 0, documented: 0, undocumented: 0, unused_in_example: 0 },
    });
  }

  // Parse all env files
  const envFileVars: Map<string, Set<string>> = new Map();
  const allEnvFiles = [...ENV_FILES, ...ENV_EXAMPLE_FILES];

  for (const envFile of allEnvFiles) {
    const filePath = path.join(projectPath, envFile);
    const vars = parseEnvFile(filePath);
    if (vars.size > 0) {
      envFileVars.set(envFile, vars);
    }
  }

  // Get vars from example files specifically
  const exampleVars = new Set<string>();
  for (const exampleFile of ENV_EXAMPLE_FILES) {
    const vars = envFileVars.get(exampleFile);
    if (vars) {
      for (const v of vars) {
        exampleVars.add(v);
      }
    }
  }

  // Scan source files for env var usage
  const varUsageMap = new Map<string, { usages: EnvUsage[]; hasDefault: boolean }>();
  scanDirectory(projectPath, projectPath, varUsageMap);

  // Build result
  const variables: EnvVariable[] = [];
  const usedVarNames = new Set<string>();

  // Process variables found in code
  for (const [varName, data] of varUsageMap) {
    usedVarNames.add(varName);

    // Find which env files define this variable
    const definedIn: string[] = [];
    for (const [envFile, vars] of envFileVars) {
      if (vars.has(varName)) {
        definedIn.push(envFile);
      }
    }

    variables.push({
      name: varName,
      used_in: data.usages,
      defined_in: definedIn,
      has_default: data.hasDefault,
      required: !data.hasDefault && definedIn.length === 0,
    });
  }

  // Sort variables: undocumented first, then by name
  variables.sort((a, b) => {
    // Undocumented (no env file) come first
    if (a.defined_in.length === 0 && b.defined_in.length > 0) return -1;
    if (a.defined_in.length > 0 && b.defined_in.length === 0) return 1;
    // Then required before optional
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  // Calculate summary
  const documented = variables.filter(v => v.defined_in.length > 0).length;
  const undocumented = variables.filter(v => v.defined_in.length === 0).length;
  const unusedInExample = [...exampleVars].filter(v => !usedVarNames.has(v)).length;

  const result: EnvConfigResult = {
    variables,
    summary: {
      total: variables.length,
      documented,
      undocumented,
      unused_in_example: unusedInExample,
    },
  };

  return success(result);
}
