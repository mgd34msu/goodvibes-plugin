/**
 * Directory management for the memory module.
 *
 * Handles lazy creation of the .goodvibes and memory directories,
 * as well as security-hardened .gitignore management.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { fileExists } from '../shared/file-utils.js';
import { debug, logError, ensureGoodVibesDir } from '../shared/index.js';
import { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';

import { getGoodVibesDir, getMemoryDir } from './paths.js';

// Re-export fileExists for backwards compatibility
export { fileExists };

// Re-export ensureGoodVibesDir from shared for backwards compatibility
export { ensureGoodVibesDir };

// ============================================================================
// Directory Management (Lazy Creation)
// ============================================================================

/**
 * Ensure the memory directory exists (lazy creation).
 *
 * Creates the memory directory within .goodvibes if it doesn't exist.
 * Also ensures the parent .goodvibes directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise that resolves when the memory directory exists
 * @throws Error if the directory cannot be created
 *
 * @example
 * await ensureMemoryDir('/path/to/project');
 */
export async function ensureMemoryDir(cwd: string): Promise<void> {
  await ensureGoodVibesDir(cwd);

  const memoryDir = getMemoryDir(cwd);
  try {
    if (!(await fileExists(memoryDir))) {
      await fs.mkdir(memoryDir, { recursive: true });
      debug(`Created memory directory at ${memoryDir}`);
    }
  } catch (error: unknown) {
    logError('ensureMemoryDir:mkdir', error);
    throw new Error(`Failed to create memory directory: ${error}`);
  }
}

/**
 * Ensure .gitignore has comprehensive security patterns.
 *
 * Checks the project's .gitignore file and adds any missing security
 * patterns to prevent sensitive files from being committed. Only adds
 * patterns that are not already present.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise that resolves when the gitignore is updated
 *
 * @example
 * await ensureSecurityGitignore('/path/to/project');
 */
export async function ensureSecurityGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');

  try {
    let existingContent = '';
    if (await fileExists(gitignorePath)) {
      existingContent = await fs.readFile(gitignorePath, 'utf-8');
    }

    // Parse security patterns into individual lines
    const securityLines = SECURITY_GITIGNORE_PATTERNS.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    // Parse existing patterns
    const existingPatterns = new Set(
      existingContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    );

    // Find patterns that need to be added
    const patternsToAdd = securityLines.filter(
      (pattern) => !existingPatterns.has(pattern)
    );

    if (patternsToAdd.length === 0) {
      debug('.gitignore already has all security patterns');
      return;
    }

    // Build only the missing patterns to append
    const separator = existingContent.endsWith('\n') ? '' : '\n';
    const newPatternsBlock =
      '\n# GoodVibes Security Patterns\n' + patternsToAdd.join('\n') + '\n';

    // Write the updated .gitignore
    await fs.writeFile(
      gitignorePath,
      existingContent + separator + newPatternsBlock
    );

    debug(`Added ${patternsToAdd.length} security patterns to .gitignore`);
  } catch (error: unknown) {
    logError('ensureSecurityGitignore', error);
    // Don't throw - gitignore is non-critical
  }
}
