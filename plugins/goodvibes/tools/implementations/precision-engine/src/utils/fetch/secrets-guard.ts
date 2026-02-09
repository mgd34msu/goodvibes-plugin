/**
 * Secrets file guard - prevents accidental git commits of sensitive data.
 * Triple-layer protection: gitignore entries, file pattern matching, commit guard.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Protected files that should never be committed */
const PROTECTED_FILES = [
  'goodvibes.secrets.json',
  'goodvibes.cookies.json',
];

/**
 * Check if a file path matches a known secret file pattern.
 *
 * @public - Intended for external consumption by precision_write and other tools
 * to validate file operations before execution.
 *
 * @param filePath - Absolute or relative file path to check
 * @returns true if the file matches a secret file pattern
 */
export function isSecretFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return PROTECTED_FILES.some(pattern => basename === pattern);
}

/**
 * Ensure gitignore contains entries for secret files.
 * Called automatically before any secrets file write.
 * Idempotent - safe to call multiple times.
 * 
 * @param projectRoot - Root directory containing .gitignore
 */
export async function ensureGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  
  let content = '';
  try {
    content = await fs.promises.readFile(gitignorePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // No .gitignore exists - we'll create one
  }

  const lines = content.split('\n').map(l => l.trim());
  const missingEntries = PROTECTED_FILES.filter(entry => !lines.includes(entry));

  if (missingEntries.length === 0) {
    return; // All entries already present
  }

  // Append missing entries
  const addition = '\n# GoodVibes secrets (auto-added)\n' + 
    missingEntries.join('\n') + '\n';
  
  const newContent = content.endsWith('\n') ? content + addition : content + '\n' + addition;
  
  await fs.promises.writeFile(gitignorePath, newContent, 'utf-8');
}
