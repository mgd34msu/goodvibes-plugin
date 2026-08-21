/**
 * `@goodvibes/core/fsx`, filesystem path handling shared by intel and connect.
 *
 * Field issue 1 fixes, non-negotiable:
 *  - `base_path` resolution is plain `path.resolve`, NO git-bash rewrite (the
 *    v1 `normalizePath` that mangled paths is deleted).
 *  - Every resolved input echoes its absolute `resolved_path` (fix #3), so a
 *    caller can always see exactly which file was touched.
 *  - A relative input with no `base_path` still resolves (against the server
 *    cwd) but carries a `warning` field so the ambiguity is visible.
 *
 * Plus a real `.gitignore` reader (re-exported), UTF-8-safe slicing, and path
 * validation ported from v1 `utils/path-validation.ts`, with the
 * agent-reachable sandbox toggle removed (plan §1.12); the project-root boundary
 * is now an explicit, opt-in argument, never a hidden config switch.
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { randomBytes } from 'crypto';

export {
  gitignoreLineToGlobs,
  parseGitignore,
  loadGitignorePatterns,
} from './gitignore.js';
export { utf8SafeSlice, utf8SafeSliceBytes, utf8ByteLength } from '../shared/utf8.js';

/** The outcome of resolving a caller-supplied path against an optional base. */
export interface ResolvedInput {
  /** Absolute, resolved path, always echoed to the caller (issue 1 fix #3). */
  resolved_path: string;
  /** Present only when a relative path was resolved without a base_path. */
  warning?: string;
}

/**
 * Resolve an input path to an absolute path.
 *  - Absolute input: returned as-is (resolved/normalized).
 *  - Relative input with `base_path`: resolved against it (base_path itself is
 *    resolved against `cwd` when relative).
 *  - Relative input with no `base_path`: resolved against `cwd` WITH a warning.
 *
 * @param input - the caller-supplied path
 * @param basePath - the optional base directory
 * @param cwd - the fallback root (defaults to process.cwd())
 */
export function resolveInputPath(
  input: string,
  basePath?: string,
  cwd: string = process.cwd(),
): ResolvedInput {
  if (path.isAbsolute(input)) {
    return { resolved_path: path.resolve(input) };
  }
  if (basePath) {
    const base = path.isAbsolute(basePath) ? basePath : path.resolve(cwd, basePath);
    return { resolved_path: path.resolve(base, input) };
  }
  return {
    resolved_path: path.resolve(cwd, input),
    warning:
      `Relative path '${input}' was resolved against the server working directory ` +
      `('${cwd}'). Pass base_path for deterministic resolution.`,
  };
}

/** Resolve the effective base directory (absolute) for a request. */
export function resolveBaseDir(basePath?: string, cwd: string = process.cwd()): string {
  if (!basePath) {return path.resolve(cwd);}
  return path.isAbsolute(basePath) ? path.resolve(basePath) : path.resolve(cwd, basePath);
}

/**
 * Assert that a resolved path stays within a project root. Opt-in boundary
 * enforcement (no hidden config toggle). No-op when `root` is undefined.
 * @throws Error when `resolvedPath` escapes `root`
 */
export function assertWithinRoot(resolvedPath: string, root?: string): void {
  if (!root) {return;}
  const real = path.normalize(resolvedPath);
  const normRoot = path.normalize(root);
  const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
  if (real !== normRoot && !real.startsWith(rootWithSep)) {
    throw new Error(
      `Path '${resolvedPath}' is outside the project root '${root}'.`,
    );
  }
}

/**
 * Validate and resolve a DIRECTORY path (must exist and be a directory).
 * @param dirPath - directory path (absolute or relative)
 * @param projectRoot - resolution base; also the boundary when `enforceBoundary`
 * @param enforceBoundary - when true, the resolved path must stay within root
 * @returns the resolved real (symlink-followed) absolute path
 */
export async function validateDirectoryPath(
  dirPath: string,
  projectRoot: string,
  enforceBoundary = false,
): Promise<string> {
  const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.resolve(projectRoot, dirPath);
  let realPath: string;
  try {
    realPath = await fsPromises.realpath(absolutePath);
  } catch {
    throw new Error(`Invalid path: '${dirPath}' does not exist or is not accessible.`);
  }
  if (enforceBoundary) {assertWithinRoot(realPath, projectRoot);}
  const stats = await fsPromises.stat(realPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path '${dirPath}' is not a directory.`);
  }
  return realPath;
}

/**
 * Validate and resolve a FILE path. Handles files that do not yet exist by
 * validating the nearest existing ancestor directory.
 * @param filePath - file path (absolute or relative)
 * @param projectRoot - resolution base; also the boundary when `enforceBoundary`
 * @param mustExist - reserved for callers that require existence upfront
 * @param enforceBoundary - when true, the resolved path must stay within root
 * @returns the resolved absolute path
 */
export async function validateFilePath(
  filePath: string,
  projectRoot: string,
  mustExist = true,
  enforceBoundary = false,
): Promise<string> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
  try {
    const realPath = await fsPromises.realpath(absolutePath);
    if (enforceBoundary) {assertWithinRoot(realPath, projectRoot);}
    return realPath;
  } catch (e) {
    if (e instanceof Error && e.message.includes('outside the project root')) {throw e;}
    if (mustExist) {
      // fall through to ancestor validation for not-yet-created files
    }
    let ancestor = path.dirname(absolutePath);
    for (;;) {
      try {
        const realAncestor = await fsPromises.realpath(ancestor);
        if (enforceBoundary) {assertWithinRoot(realAncestor, projectRoot);}
        return absolutePath;
      } catch {
        const parent = path.dirname(ancestor);
        if (parent === ancestor) {
          throw new Error(`Invalid path: no accessible ancestor directory for '${filePath}'.`);
        }
        ancestor = parent;
      }
    }
  }
}

/**
 * Write a file atomically: a uniquely named temp file in the same directory,
 * then a rename over the target. Rename is atomic on one filesystem, so a
 * crash mid-write leaves the previous file intact instead of a truncated one,
 * and a concurrent reader never observes a half-written file.
 *
 * @param filePath - destination path (its directory must already exist)
 * @param data - bytes or UTF-8 string to write
 * @param options - `mode` is applied to the temp file before the rename, so the
 * destination never exists with wider permissions than requested
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer,
  options: { mode?: number } = {},
): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fsPromises.writeFile(tmp, data, options.mode !== undefined ? { mode: options.mode } : {});
    // writeFile only honours `mode` when it creates the file, and umask can
    // still clear bits, so set it explicitly before the rename.
    if (options.mode !== undefined) {await fsPromises.chmod(tmp, options.mode);}
    await fsPromises.rename(tmp, filePath);
  } catch (err) {
    await fsPromises.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Serialize `value` as pretty JSON (trailing newline) and write it atomically. */
export async function atomicWriteJson(
  filePath: string,
  value: unknown,
  options: { mode?: number } = {},
): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(value, null, 2) + '\n', options);
}

/** How long a lock file may sit untouched before its owner is presumed dead. */
const LOCK_TAKEOVER_MS = 15_000;
/** Poll interval while waiting for another holder to release a lock. */
const LOCK_POLL_MS = 20;

/**
 * Run `fn` holding an exclusive cross-process lock on `target`, taken as a
 * sibling `.lock` file created with `wx` (create-if-absent-or-fail, which is
 * what makes this a mutex between OS processes rather than only between callers
 * inside one process).
 *
 * A lock left behind by a process that died is taken over once it goes stale,
 * and a lock still held after `waitMs` is broken rather than blocking forever.
 *
 * @param target - path of the file being protected (not the lock file itself)
 * @param fn - the critical section
 * @param waitMs - how long to wait before breaking an existing lock
 */
export async function withFileLock<T>(
  target: string,
  fn: () => T | Promise<T>,
  waitMs = 10_000,
): Promise<T> {
  const lockPath = `${target}.lock`;
  const deadline = Date.now() + waitMs;
  let handle: fsPromises.FileHandle | undefined;

  for (;;) {
    try {
      handle = await fsPromises.open(lockPath, 'wx', 0o600);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {throw err;}

      let age: number;
      try {
        age = Date.now() - (await fsPromises.stat(lockPath)).mtimeMs;
      } catch {
        continue;
      }

      if (age > LOCK_TAKEOVER_MS || Date.now() > deadline) {
        await fsPromises.unlink(lockPath).catch(() => undefined);
        continue;
      }

      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    }
  }

  try {
    return await fn();
  } finally {
    await handle.close().catch(() => undefined);
    await fsPromises.unlink(lockPath).catch(() => undefined);
  }
}
