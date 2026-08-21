/**
 * Path helpers for the compiler host.
 *
 * `toTsPath` is slash-normalization ONLY (backslash → forward slash) so cache
 * keys and `program.getSourceFile()` lookups match TypeScript's internal
 * forward-slashed representation on every platform. This is deliberately NOT the
 * v1 `normalizePath` git-bash rewrite that mangled paths and was deleted in v2
 * (see `@goodvibes/core/fsx`): callers resolve `base_path` → absolute via
 * `core/fsx` BEFORE handing a path to the host; `toTsPath` only reconciles slash
 * direction for TS's own key space.
 *
 * Ported from project-engine `core/code-intel/file-utils.ts` (file discovery)
 * plus the slash-normalization the language service relied on.
 */

import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

import { SOURCE_EXTENSIONS, SKIP_DIRECTORIES, TEST_PATTERNS } from './constants.js';

/**
 * Normalize a path to forward slashes for TypeScript's internal key space.
 * Slash-direction only, no drive/prefix rewriting.
 * @param filePath - any path
 * @returns the same path with backslashes replaced by forward slashes
 */
export function toTsPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Make an absolute path relative to a root, normalized to forward slashes.
 * @param absolutePath - absolute path
 * @param root - directory to relativize against
 */
export function makeRelativePath(absolutePath: string, root: string): string {
  return toTsPath(path.relative(root, absolutePath));
}

/**
 * Resolve a path against a root (absolute passthrough).
 * @param filePath - relative or absolute path
 * @param root - resolution base
 */
export function resolveFilePath(filePath: string, root: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

/**
 * True when the path matches a recognized source extension.
 * @param filePath - path or filename
 */
export function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return (SOURCE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * True when the path matches a test-file pattern.
 * @param filePath - path or filename
 */
export function isTestFile(filePath: string): boolean {
  const normalized = toTsPath(filePath);
  return TEST_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Recursively find all source files under a directory, skipping build outputs,
 * hidden directories, and `SKIP_DIRECTORIES`.
 * @param dirPath - directory to walk
 * @returns absolute paths of source files
 */
export async function findSourceFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          (SKIP_DIRECTORIES as readonly string[]).includes(entry.name) ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return files;
}
