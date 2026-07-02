/**
 * Shared `base_path` resolution for the search/read trio (issue 1, §3.2 of
 * the carve-out spec): every tool takes `base_path`; relative inputs resolve
 * against it; absent `base_path`, resolution falls back to the server cwd
 * WITH a `warning` field so the ambiguity is visible to the caller.
 */

import { resolveInputPath, validateDirectoryPath } from '@goodvibes/core/fsx';

export interface WorkDir {
  /** Resolved, validated absolute search/read root. */
  workDir: string;
  /** Present only when no base_path was given (resolution fell back to cwd). */
  warning?: string;
}

/**
 * Resolve and validate the tool's working directory from an optional
 * `base_path`. Throws when an explicit `base_path` does not exist.
 * @param basePath - the caller-supplied base_path, if any
 */
export async function resolveWorkDir(basePath?: string): Promise<WorkDir> {
  if (basePath) {
    const workDir = await validateDirectoryPath(basePath, process.cwd());
    return { workDir };
  }
  const { resolved_path, warning } = resolveInputPath('.', undefined);
  return { workDir: resolved_path, warning };
}
