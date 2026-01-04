/**
 * Gitignore Management
 *
 * Ensures .gitignore contains security-critical entries to prevent
 * accidental commits of sensitive files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Helper to check if a file exists using async fs.access.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Security-critical gitignore entries grouped by category. */
export const SECURITY_GITIGNORE_ENTRIES: Record<string, string[]> = {
  'GoodVibes plugin state': ['.goodvibes/'],
  'Environment files': ['.env', '.env.local', '.env.*.local', '*.env'],
  'Secret files': ['*.pem', '*.key', 'credentials.json', 'secrets.json', 'service-account*.json'],
  'Cloud credentials': ['.aws/', '.gcp/', 'kubeconfig'],
  'Database files': ['*.db', '*.sqlite', '*.sqlite3', 'prisma/*.db'],
  'Log files': ['*.log', 'logs/'],
};

/**
 * Ensures the .gitignore file contains security-critical entries.
 *
 * Reads the existing .gitignore (if present) and appends any missing
 * security patterns from SECURITY_GITIGNORE_ENTRIES. Patterns are
 * organized by category with section headers for clarity.
 *
 * This function is idempotent - running it multiple times will not
 * add duplicate entries.
 *
 * @param cwd - The current working directory (project root) containing .gitignore
 * @returns A promise that resolves when the gitignore has been updated
 *
 * @example
 * // Ensure security entries are present
 * await ensureSecureGitignore('/path/to/project');
 *
 * @example
 * // Called automatically when .goodvibes directory is created
 * await ensureGoodVibesDir(cwd); // internally calls ensureSecureGitignore
 */
export async function ensureSecureGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  let content = '';

  if (await fileExists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf-8');
  }

  const entriesToAdd: string[] = [];

  for (const [section, patterns] of Object.entries(SECURITY_GITIGNORE_ENTRIES)) {
    const missing = patterns.filter(p => !content.includes(p));
    if (missing.length > 0) {
      entriesToAdd.push(`\n# ${section}`);
      entriesToAdd.push(...missing);
    }
  }

  if (entriesToAdd.length > 0) {
    const newContent = content.trimEnd() + '\n' + entriesToAdd.join('\n') + '\n';
    await fs.writeFile(gitignorePath, newContent);
  }
}
