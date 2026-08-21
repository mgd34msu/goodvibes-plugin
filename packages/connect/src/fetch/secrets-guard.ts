/**
 * Secrets file guard, prevents accidental git commits of credential files.
 *
 * Ported from v1 precision-engine `utils/fetch/secrets-guard.ts` (logic intact,
 * verified robust by the plan). The protected basenames are unchanged so the
 * ported secrets-guard tests keep passing and the v2 commit-guard hook shares
 * one source of truth for what "a secret file" is.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Protected files that must never be committed. */
export const PROTECTED_FILES = ['goodvibes.secrets.json', 'goodvibes.cookies.json'];

/**
 * Check if a file path matches a known secret-file pattern (by basename).
 * @param filePath - absolute or relative path to check
 * @returns true when the basename is a protected credential file
 */
export function isSecretFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return PROTECTED_FILES.some((pattern) => basename === pattern);
}

/**
 * Ensure `.gitignore` contains entries for the credential files. Idempotent,
 * appends only the missing basenames. Called before any secrets/cookies write.
 * @param projectRoot - directory whose `.gitignore` is amended
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
    // No .gitignore exists, we create one below.
  }

  const lines = content.split('\n').map((l) => l.trim());
  const missingEntries = PROTECTED_FILES.filter((entry) => !lines.includes(entry));

  if (missingEntries.length === 0) {
    return;
  }

  const addition = '\n# GoodVibes secrets (auto-added)\n' + missingEntries.join('\n') + '\n';
  const newContent = content.endsWith('\n') ? content + addition : content + '\n' + addition;

  await fs.promises.writeFile(gitignorePath, newContent, 'utf-8');
}
