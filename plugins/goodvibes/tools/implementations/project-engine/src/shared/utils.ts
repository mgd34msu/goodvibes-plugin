/**
 * Shared utility functions for project-engine v2.0.0.
 *
 * Pure infrastructure utilities — zero domain knowledge.
 * Consolidated from shared/utils.ts, config.ts (getEsmDir/getConfigDir),
 * logging.ts (startTimer), handler files, and lsp-utils.ts.
 */

import * as nodeFs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as nodePath from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as https from 'node:https';
import * as http from 'node:http';

const execAsync = promisify(exec);

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
 * Read the last N lines of a file synchronously.
 *
 * @param filePath - Path to the file
 * @param lines - Number of lines to read from the end
 * @returns Array of line strings
 * @throws Error if the file cannot be read
 */
export function tailFile(filePath: string, lines: number): string[] {
  try {
    const content = nodeFs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read file: ${message}`);
  }
}

/**
 * Get a code snippet from a TypeScript SourceFile around a position range.
 *
 * @param sourceFile - TypeScript SourceFile object
 * @param start - Start character offset
 * @param end - End character offset
 * @param maxLength - Maximum snippet length (default: 100)
 * @returns Trimmed code snippet, truncated with '...' if too long
 */
export function getCodeSnippet(
  sourceFile: { text: string },
  start: number,
  end: number,
  maxLength: number = 100
): string {
  const fullText = sourceFile.text;
  const lineStart = fullText.lastIndexOf('\n', start) + 1;
  const lineEnd = fullText.indexOf('\n', end);
  const endPos = lineEnd === -1 ? fullText.length : lineEnd;
  let snippet = fullText.slice(lineStart, endPos).trim();
  if (snippet.length > maxLength) {
    snippet = snippet.slice(0, maxLength) + '...';
  }
  return snippet;
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

/**
 * Converts a character index to a 1-based line number in source content.
 *
 * @param content - Full source file content
 * @param index - Character index position
 * @returns 1-based line number
 */
export function offsetToLine(content: string, index: number): number {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Recursively find files matching a pattern in a directory.
 *
 * Automatically skips: node_modules, .git, .next, dist, build, .turbo
 *
 * @param dir - Directory to search
 * @param includePattern - RegExp pattern that file names must match
 * @param excludePattern - Optional RegExp pattern to exclude files/dirs
 * @returns Array of absolute file paths matching the criteria
 */
export function globFiles(
  dir: string,
  includePattern: RegExp,
  excludePattern?: RegExp
): string[] {
  const files: string[] = [];

  if (!nodeFs.existsSync(dir)) {
    return files;
  }

  const entries = nodeFs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = nodePath.join(dir, entry.name);

    if (excludePattern && excludePattern.test(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'build', '.turbo'].includes(entry.name)) {
        continue;
      }
      files.push(...globFiles(fullPath, includePattern, excludePattern));
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
 * Execute a shell command safely with timeout.
 *
 * @param command - Shell command to execute
 * @param cwd - Working directory for the command
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns stdout, stderr, and optional error message
 */
export async function safeExec(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (caughtError: unknown) {
    const execError = caughtError as { stdout?: string; stderr?: string; message?: string };
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
 * @returns Promise resolving to the response body as a string
 */
export function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
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
// Timing Utilities
// =============================================================================

/**
 * Start a high-resolution timer.
 *
 * @returns Function that returns elapsed milliseconds when called
 *
 * @example
 * ```typescript
 * const elapsed = startTimer();
 * await doWork();
 * console.log(`Took ${elapsed()}ms`);
 * ```
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
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

/**
 * Mutable reference to the active YAML converter.
 * Swap via setYamlConverter() for testing.
 */
export let convertToYaml: (obj: unknown) => string = toYaml;

/**
 * Replace the active YAML converter (for testing).
 *
 * @param converter - Custom YAML conversion function
 */
export function setYamlConverter(converter: (obj: unknown) => string): void {
  convertToYaml = converter;
}

/**
 * Reset the YAML converter to the built-in toYaml implementation.
 */
export function resetYamlConverter(): void {
  convertToYaml = toYaml;
}
