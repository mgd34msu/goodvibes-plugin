/**
 * Shared path validation utilities for sandbox enforcement.
 * Used by all precision-engine handlers to enforce project root boundaries
 * when sandbox mode is enabled.
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { getConfigValue } from '../runtime-config.js';

/**
 * Core sandbox boundary check. Shared by both file and directory validators.
 * When sandbox is disabled (default), this is a no-op.
 * 
 * @param resolvedPath - The fully resolved (symlink-followed) absolute path
 * @param projectRoot - The project root directory
 * @param originalPath - The original user-provided path (for error messages)
 * @throws Error if sandbox is enabled and path is outside project root
 */
function enforceSandboxBoundary(
  resolvedPath: string,
  projectRoot: string,
  originalPath: string
): void {
  const sandboxEnabled = getConfigValue<boolean>('sandbox');
  
  if (sandboxEnabled === false) {
    return; // Sandbox disabled, skip enforcement
  }
  
  const normalizedReal = path.normalize(resolvedPath);
  const normalizedRoot = path.normalize(projectRoot);
  // Append path.sep to prevent prefix collision (e.g., /app-secrets matching /app)
  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  
  if (normalizedReal !== normalizedRoot && !normalizedReal.startsWith(rootWithSep)) {
    throw new Error(
      `Path '${originalPath}' resolves to '${resolvedPath}' which is outside the project root. ` +
      `Path traversal is not allowed when sandbox is enabled. ` +
      `Use precision_config to disable sandbox if needed.`
    );
  }
}

/**
 * Validate and resolve a DIRECTORY path for sandbox enforcement.
 * Used by: discover, precision-grep, precision-glob, precision-exec.
 * 
 * @param dirPath - The directory path to validate (absolute or relative)
 * @param projectRoot - The project root (typically process.cwd())
 * @returns The resolved absolute real path
 * @throws Error if path doesn't exist, isn't a directory, or violates sandbox
 */
export async function validateDirectoryPath(
  dirPath: string,
  projectRoot: string
): Promise<string> {
  const absolutePath = path.isAbsolute(dirPath)
    ? dirPath
    : path.resolve(projectRoot, dirPath);
  
  let realPath: string;
  try {
    realPath = await fsPromises.realpath(absolutePath);
  } catch {
    throw new Error(
      `Invalid path: '${dirPath}' does not exist or is not accessible.`
    );
  }
  
  enforceSandboxBoundary(realPath, projectRoot, dirPath);
  
  const stats = await fsPromises.stat(realPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path '${dirPath}' is not a directory.`);
  }
  
  return realPath;
}

/**
 * Validate and resolve a FILE path for sandbox enforcement.
 * Handles files that may not yet exist (resolves parent directory instead).
 * Used by: precision-read, precision-write, precision-edit.
 * 
 * @param filePath - The file path to validate (absolute or relative)
 * @param projectRoot - The project root (typically process.cwd())
 * @param mustExist - If false, validates the parent directory for new files (default: true)
 * @returns The resolved absolute path
 * @throws Error if path violates sandbox boundary
 */
export async function validateFilePath(
  filePath: string,
  projectRoot: string,
  mustExist: boolean = true
): Promise<string> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectRoot, filePath);
  
  try {
    // Try to resolve the file itself first (works for existing files)
    const realPath = await fsPromises.realpath(absolutePath);
    enforceSandboxBoundary(realPath, projectRoot, filePath);
    return realPath;
  } catch (e) {
    // Re-throw sandbox violations - don't fall through to ancestor checking
    if (e instanceof Error && e.message.includes('outside the project root')) {
      throw e;
    }
    // File doesn't exist - validate the parent directory instead
    const parentDir = path.dirname(absolutePath);
    let ancestor = parentDir;
    
    // Walk up to find the first existing ancestor directory
    while (true) {
      try {
        const realAncestor = await fsPromises.realpath(ancestor);
        enforceSandboxBoundary(realAncestor, projectRoot, filePath);
        // Ancestor is valid, return the originally resolved absolute path
        return absolutePath;
      } catch {
        const parent = path.dirname(ancestor);
        if (parent === ancestor) {
          // Reached filesystem root without finding an accessible ancestor
          throw new Error(
            `Invalid path: no accessible ancestor directory found for '${filePath}'.`
          );
        }
        ancestor = parent;
      }
    }
  }
}
