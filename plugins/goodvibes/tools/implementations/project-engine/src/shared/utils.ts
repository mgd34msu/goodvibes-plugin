/**
 * Shared utility functions for project-engine v2.0.0.
 *
 * Pure infrastructure utilities — zero domain knowledge.
 * Consolidated from shared/utils.ts, config.ts (getEsmDir/getConfigDir),
 * logging.ts (startTimer), handler files, and lsp-utils.ts.
 */

import * as fsPromises from 'node:fs/promises';
import * as nodePath from 'node:path';
import { exec, type ExecException } from 'node:child_process';
import { promisify } from 'node:util';
import * as https from 'node:https';
import * as http from 'node:http';

import { SKIP_DIRECTORIES } from './constants.js';

const execAsync = promisify(exec);

// =============================================================================
// Shell Command Allowlist
// =============================================================================

/**
 * Permitted command prefixes for shellExec.
 * Only commands starting with one of these prefixes are allowed.
 */
const ALLOWED_COMMAND_PREFIXES = [
  'npm', 'npx', 'git', 'pnpm', 'yarn', 'bun', 'node', 'tsc', 'vitest', 'jest', 'prettier', 'eslint',
];

// =============================================================================
// File System Utilities
// =============================================================================

/**
 * Check if a file exists asynchronously.
 *
 * @param filePath - Absolute or relative path to check
 * @returns true if the file exists and is accessible
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read and parse a JSON file.
 *
 * @param filePath - Path to the JSON file
 * @returns Parsed object, or null if the file does not exist or cannot be parsed
 */
export async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fileExists(filePath))) {
      return null;
    }
    const content = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read the last N lines of a file asynchronously.
 *
 * @param filePath - Path to the file
 * @param lines - Number of lines to read from the end
 * @returns Array of line strings
 * @throws Error if the file cannot be read
 */
export async function tailFile(filePath: string, lines: number): Promise<string[]> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read file: ${message}`);
  }
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Normalize a file path to use forward slashes.
 *
 * @param filePath - The file path to normalize
 * @returns Path with all backslashes replaced by forward slashes
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Make an absolute path relative to a project root, normalized to forward slashes.
 *
 * @param absolutePath - The absolute file path
 * @param projectRoot - The project root directory
 * @returns Relative path with forward slashes
 */
export function toRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizePath(nodePath.relative(projectRoot, absolutePath));
}

/**
 * Resolve a file path to an absolute path relative to a project root.
 *
 * @param filePath - The file path (relative or absolute)
 * @param projectRoot - The project root directory
 * @returns Absolute file path
 */
export function resolveProjectPath(filePath: string, projectRoot: string): string {
  return nodePath.isAbsolute(filePath) ? filePath : nodePath.resolve(projectRoot, filePath);
}

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Recursively find files matching a pattern in a directory.
 *
 * Automatically skips directories listed in SKIP_DIRECTORIES.
 *
 * @param dir - Directory to search
 * @param includePattern - RegExp pattern that file names must match
 * @param excludePattern - Optional RegExp pattern to exclude files/dirs
 * @returns Array of absolute file paths matching the criteria
 */
export async function globFiles(
  dir: string,
  includePattern: RegExp,
  excludePattern?: RegExp
): Promise<string[]> {
  const files: string[] = [];

  try {
    await fsPromises.access(dir);
  } catch {
    return files;
  }

  const entries = await fsPromises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = nodePath.join(dir, entry.name);

    if (excludePattern && excludePattern.test(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if ((SKIP_DIRECTORIES as readonly string[]).includes(entry.name)) {
        continue;
      }
      files.push(...(await globFiles(fullPath, includePattern, excludePattern)));
    } else if (entry.isFile() && includePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

// =============================================================================
// Process Utilities
// =============================================================================

/**
 * Execute a shell command with an explicit allowlist and timeout.
 *
 * Only commands starting with an approved prefix are permitted:
 * npm, npx, git, pnpm, yarn, bun, node, tsc, vitest, jest, prettier, eslint.
 *
 * @param command - Shell command to execute (must match an allowlisted prefix)
 * @param cwd - Working directory for the command
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns stdout, stderr, and optional error message
 * @throws Error if the command does not match the allowlist
 */
export async function shellExec(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; error?: string }> {
  const trimmed = command.trimStart();
  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `) || trimmed.startsWith(`${prefix}\n`)
  );

  if (!isAllowed) {
    throw new Error(
      `shellExec: command not in allowlist. Permitted prefixes: ${ALLOWED_COMMAND_PREFIXES.join(', ')}. Got: ${trimmed.split(' ')[0]}`
    );
  }

  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (caughtError: unknown) {
    const execError = caughtError as ExecException & { stdout?: string; stderr?: string };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      error: execError.message || 'Command failed',
    };
  }
}

/**
 * Detect the package manager in use for a project.
 *
 * @param projectPath - Path to the project root
 * @returns Package manager name: 'pnpm', 'yarn', 'bun', or 'npm'
 */
export async function detectPackageManager(projectPath: string): Promise<string> {
  if (await fileExists(nodePath.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(nodePath.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (await fileExists(nodePath.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Sleep for a specified number of milliseconds.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Network Utilities
// =============================================================================

/**
 * Fetch URL content with HTTP redirect support.
 *
 * @param url - The URL to fetch (http or https)
 * @param maxRedirects - Maximum number of redirects to follow (default: 5)
 * @param connectionTimeoutMs - Connection timeout in milliseconds (default: 10000)
 * @returns Promise resolving to the response body as a string
 */
export function fetchUrl(
  url: string,
  maxRedirects: number = 5,
  connectionTimeoutMs: number = 10000
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Too many redirects'));
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, maxRedirects - 1, connectionTimeoutMs).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });

    req.setTimeout(connectionTimeoutMs, () => {
      req.destroy(new Error(`Connection timeout after ${connectionTimeoutMs}ms`));
    });

    req.on('error', reject);
  });
}

/**
 * Build a query string from OpenAPI-style parameter objects.
 *
 * @param params - Array of parameter objects with `in`, `name`, and optional `example` fields
 * @returns Query string starting with '?', or empty string if no query params
 */
export function buildQueryString(
  params: Array<{ in: string; name: string; example?: unknown }>
): string {
  const queryParams = params.filter(p => p.in === 'query');
  if (queryParams.length === 0) return '';
  const parts = queryParams.map(p => {
    const value = p.example || 'test';
    return `${encodeURIComponent(p.name)}=${encodeURIComponent(String(value))}`;
  });
  return '?' + parts.join('&');
}

// =============================================================================
// Math / Numeric Utilities
// =============================================================================

/**
 * Round a number to a specified number of decimal places.
 *
 * @param num - The number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
export function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Convert bytes to megabytes, rounded to 4 decimal places.
 *
 * @param bytes - Number of bytes
 * @returns Value in megabytes
 */
export function bytesToMb(bytes: number): number {
  return roundTo(bytes / (1024 * 1024), 4);
}

/**
 * Format a byte count as a human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Human-readable string (e.g. '1.2 KB', '3.45 MB')
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Check if a value is a Promise (thenable).
 *
 * @param value - Any value to check
 * @returns true if the value has a .then() method
 */
export function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}

// =============================================================================
// YAML Serialization
// =============================================================================

/**
 * Convert an object to YAML format.
 *
 * Lightweight YAML serializer — no external dependencies.
 * Handles primitives, arrays, and objects with proper indentation.
 *
 * @param obj - The value to convert
 * @param indent - Current indentation level (default: 0)
 * @returns YAML string
 */
export function toYaml(obj: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    if (
      obj.includes('\n') || obj.includes(':') || obj.includes('#') ||
      obj.startsWith(' ') || obj.endsWith(' ') || /^\d/.test(obj) ||
      obj === 'true' || obj === 'false' || obj === 'null' || obj === ''
    ) {
      return JSON.stringify(obj);
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      const itemStr = toYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null) {
        return `\n${spaces}- ${itemStr.trim().replace(/\n/g, `\n${spaces}  `)}`;
      }
      return `\n${spaces}- ${itemStr}`;
    }).join('');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const valueStr = toYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `${spaces}${key}:\n${valueStr}`;
      }
      if (Array.isArray(value) && value.length > 0) {
        return `${spaces}${key}:${valueStr}`;
      }
      return `${spaces}${key}: ${valueStr}`;
    }).join('\n');
  }

  return String(obj);
}
