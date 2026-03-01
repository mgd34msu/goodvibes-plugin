/**
 * File system utility functions for the deps domain.
 *
 * @module core/deps/file-utils
 */

/** Directories to always skip when scanning for source files */
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out'];

/**
 * Determines if a directory should be skipped during source file scanning.
 *
 * The `node_modules` directory is skipped unless `includeNodeModules` is true.
 * All other directories in the skip list are always skipped.
 *
 * @param dirName - Directory name (not full path)
 * @param includeNodeModules - Whether to include node_modules in scan
 * @returns True if the directory should be skipped
 */
export function shouldSkipDirectory(
  dirName: string,
  includeNodeModules: boolean
): boolean {
  if (dirName === 'node_modules') {
    return !includeNodeModules;
  }
  return SKIP_DIRS.includes(dirName);
}
