/**
 * Environment variable parsing and scanning utilities
 *
 * Functions for parsing .env files and scanning source code
 * for environment variable usages.
 *
 * @module core/security/env-parser
 */

import * as node_fs from 'node:fs';
import * as node_path from 'node:path';
import { logger } from '../../shared/logger.js';
import { ENV_PATTERNS, DEFAULT_PATTERNS, SCAN_EXTENSIONS, SKIP_DIRS, BUILTIN_VARS } from './constants.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Location where an environment variable is referenced.
 */
export interface EnvUsage {
  /** Relative file path */
  file: string;
  /** 1-indexed line number */
  line: number;
}

/**
 * Aggregated data about a single environment variable.
 */
export interface EnvVarData {
  /** All locations where this variable is accessed */
  usages: EnvUsage[];
  /** Whether any usage includes a default/fallback value */
  hasDefault: boolean;
}

// =============================================================================
// .env File Parser
// =============================================================================

/**
 * Parse environment variables from the content of a .env file.
 *
 * Skips comments (#) and blank lines. Strips surrounding quotes from values.
 *
 * @param content - Raw string content of the .env file
 * @returns Map from uppercase variable name to its string value
 *
 * @example
 * parseEnvFile('PORT=3000\nDB_URL=postgres://localhost/db')
 * // Returns Map { 'PORT' => '3000', 'DB_URL' => 'postgres://localhost/db' }
 */
export function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/i);
    if (match) {
      const name = match[1].toUpperCase();
      const value = match[2].replace(/^["']|["']$/g, '');
      vars.set(name, value);
    }
  }

  return vars;
}

// =============================================================================
// Source File Scanner
// =============================================================================

/**
 * Scan a single source file for environment variable usages.
 *
 * Detects process.env.VAR, import.meta.env.VAR, and Deno.env.get('VAR')
 * patterns. Also detects whether each variable has a fallback/default.
 *
 * @param filePath - Absolute path to the file to scan
 * @param relativePath - Path to use in usage records (for display)
 * @returns Map from variable name to usage data
 */
export function scanFileForEnvVars(
  filePath: string,
  relativePath: string
): Map<string, EnvVarData> {
  const varMap = new Map<string, EnvVarData>();

  try {
    const content = node_fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Find all vars that have default/fallback values
    const varsWithDefaults = new Set<string>();
    for (const pattern of DEFAULT_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, 'g');
      let match;
      while ((match = globalPattern.exec(content)) !== null) {
        varsWithDefaults.add(match[1].toUpperCase());
      }
    }

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of ENV_PATTERNS) {
        pattern.lastIndex = 0;
        let match;

        while ((match = pattern.exec(line)) !== null) {
          const varName = match[1].toUpperCase();

          if (BUILTIN_VARS.has(varName)) continue;

          if (!varMap.has(varName)) {
            varMap.set(varName, {
              usages: [],
              hasDefault: varsWithDefaults.has(varName),
            });
          }

          const entry = varMap.get(varName)!;
          const alreadyRecorded = entry.usages.some(
            u => u.file === relativePath && u.line === lineNum + 1
          );
          if (!alreadyRecorded) {
            entry.usages.push({ file: relativePath, line: lineNum + 1 });
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[env-parser] Failed to scan ${filePath}`, err);
  }

  return varMap;
}

// =============================================================================
// Directory Scanner
// =============================================================================

/**
 * Recursively scan a directory for environment variable usages.
 *
 * Skips directories in SKIP_DIRS and limits total files scanned.
 *
 * @param dir - Absolute path of the directory to scan
 * @param baseDir - Base directory for computing relative paths
 * @param varMap - Accumulator map for discovered variables
 * @param maxFiles - Maximum number of files to scan (default: 1000)
 * @returns Number of files actually scanned
 */
export function scanDirectoryForEnv(
  dir: string,
  baseDir: string,
  varMap: Map<string, EnvVarData>,
  maxFiles: number = 1000
): number {
  let filesScanned = 0;

  try {
    const entries = node_fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (filesScanned >= maxFiles) break;

      const fullPath = node_path.join(dir, entry.name);
      const relativePath = node_path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          filesScanned += scanDirectoryForEnv(fullPath, baseDir, varMap, maxFiles - filesScanned);
        }
      } else if (entry.isFile()) {
        const ext = node_path.extname(entry.name).toLowerCase();
        if (SCAN_EXTENSIONS.has(ext)) {
          filesScanned++;
          const fileVars = scanFileForEnvVars(fullPath, relativePath);

          for (const [varName, data] of fileVars) {
            if (!varMap.has(varName)) {
              varMap.set(varName, { usages: [], hasDefault: data.hasDefault });
            }
            const existing = varMap.get(varName)!;
            existing.usages.push(...data.usages);
            if (data.hasDefault) {
              existing.hasDefault = true;
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[env-parser] Failed to read directory ${dir}`, err);
  }

  return filesScanned;
}

// =============================================================================
// Value Type Inference and Validation
// =============================================================================

/**
 * Infer expected value type from an environment variable name.
 *
 * Uses naming convention heuristics:
 * - Contains 'port' → number
 * - Contains 'url', 'uri', 'endpoint' → url
 * - Contains 'key', 'secret', 'token', 'password' → secret
 * - Contains 'enabled', 'debug', 'disable' → boolean
 * - Contains 'timeout', 'limit', 'max', 'min', 'count' → number
 *
 * @param varName - The environment variable name (case-insensitive)
 * @returns Inferred type string ('number', 'url', 'secret', 'boolean', 'string')
 */
export function inferExpectedType(varName: string): string {
  const name = varName.toLowerCase();

  if (name.includes('port')) return 'number';
  if (name.includes('url') || name.includes('uri') || name.includes('endpoint')) return 'url';
  if (name.includes('key') || name.includes('secret') || name.includes('token') || name.includes('password')) return 'secret';
  if (name.includes('enabled') || name.includes('debug') || name.includes('disable')) return 'boolean';
  if (name.includes('timeout') || name.includes('limit') || name.includes('max') || name.includes('min') || name.includes('count')) return 'number';

  return 'string';
}

/**
 * Validate a value against its expected type.
 *
 * Returns a description of the validation issue, or null if valid.
 *
 * @param value - The raw string value from .env
 * @param expectedType - The inferred expected type
 * @returns Validation error message, or null if the value is valid
 *
 * @example
 * validateEnvValue('abc', 'number') // 'Expected numeric value'
 * validateEnvValue('3000', 'number') // null
 */
export function validateEnvValue(value: string, expectedType: string): string | null {
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
      if (value.length < 8) {
        return 'Secret value appears too short (< 8 characters)';
      }
      break;
  }

  return null;
}
