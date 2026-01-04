/**
 * Empty Project Detector
 *
 * Detects if the project directory is empty or contains only scaffolding files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';

const SCAFFOLDING_ONLY = [
  'readme.md',
  'readme',
  'license',
  'license.md',
  '.gitignore',
  '.git',
];

/** Check if the project directory is empty or contains only scaffolding files. */
export async function isEmptyProject(cwd: string): Promise<boolean> {
  try {
    const files = await fs.readdir(cwd);
    const meaningfulFiles = files.filter(f => {
      const lower = f.toLowerCase();
      return !SCAFFOLDING_ONLY.includes(lower) && !f.startsWith('.');
    });

    return meaningfulFiles.length === 0;
  } catch (error) {
    // If we can't read the directory, treat it as empty
    debug('empty-project: Failed to read directory', error);
    return true;
  }
}

/** Format empty project context with scaffolding suggestions. */
export function formatEmptyProjectContext(): string {
  return `[GoodVibes SessionStart]
Status: New project (empty directory)

Ready to scaffold. Common starting points:
- "Create a Next.js app with TypeScript and Tailwind"
- "Set up a Node.js API with Express and Prisma"
- "Initialize a React library with Vite"

I'll detect your stack automatically as you build.`;
}
