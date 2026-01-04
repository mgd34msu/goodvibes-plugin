/**
 * Gitignore Management
 *
 * Ensures .gitignore contains security-critical entries to prevent
 * accidental commits of sensitive files.
 */

import * as fs from 'fs';
import * as path from 'path';

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
 * Ensure .gitignore contains security-critical entries
 */
export async function ensureSecureGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
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
    fs.writeFileSync(gitignorePath, newContent);
  }
}
