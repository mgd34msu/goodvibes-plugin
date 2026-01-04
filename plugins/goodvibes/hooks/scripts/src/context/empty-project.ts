/**
 * Empty Project Detection
 *
 * Detects if a project is essentially empty (only boilerplate files)
 * to provide appropriate scaffolding context.
 */

import * as fs from 'fs';
import * as path from 'path';

// Files that don't count as "real" project content
const BOILERPLATE_FILES = new Set([
  'readme.md',
  'readme.txt',
  'readme',
  'license',
  'license.md',
  'license.txt',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.npmrc',
  '.nvmrc',
  '.node-version',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierignore',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintignore',
  'changelog.md',
  'contributing.md',
  'code_of_conduct.md',
]);

// Directories that don't count as "real" project content
const BOILERPLATE_DIRS = new Set([
  '.git',
  '.github',
  '.vscode',
  '.idea',
  'node_modules',
  '.goodvibes',
]);

export interface EmptyProjectResult {
  isEmpty: boolean;
  filesFound: string[];
  reason?: string;
}

/**
 * Check if a project directory is essentially empty
 * Returns true if only README/.gitignore/LICENSE or genuinely empty
 */
export function isEmptyProject(cwd: string): EmptyProjectResult {
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const meaningfulFiles: string[] = [];

    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();

      if (entry.isDirectory()) {
        // Check if it's a meaningful directory
        if (!BOILERPLATE_DIRS.has(lowerName)) {
          // Check if directory has any content
          const dirPath = path.join(cwd, entry.name);
          try {
            const dirContents = fs.readdirSync(dirPath);
            if (dirContents.length > 0) {
              meaningfulFiles.push(entry.name + '/');
            }
          } catch {
            // Can't read directory, assume it's meaningful
            meaningfulFiles.push(entry.name + '/');
          }
        }
      } else if (entry.isFile()) {
        // Check if it's a meaningful file
        if (!BOILERPLATE_FILES.has(lowerName)) {
          meaningfulFiles.push(entry.name);
        }
      }
    }

    const isEmpty = meaningfulFiles.length === 0;

    return {
      isEmpty,
      filesFound: meaningfulFiles,
      reason: isEmpty
        ? 'Only boilerplate files found (README, LICENSE, .gitignore, etc.)'
        : `Found ${meaningfulFiles.length} meaningful file(s)/folder(s)`,
    };
  } catch (error) {
    // If we can't read the directory, assume it's not empty
    return {
      isEmpty: false,
      filesFound: [],
      reason: `Could not read directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Generate context message for empty projects
 */
export function getEmptyProjectContext(): string {
  return `## Project Status: Empty/New Project

This appears to be a new or empty project. Ready to help you scaffold!

### Quick Start Options:
- "Create a Next.js app with TypeScript and Tailwind"
- "Set up an Express API with Prisma"
- "Initialize a React component library"
- "Create a CLI tool with TypeScript"

### Available Scaffolding:
Use \`scaffold_project\` tool to generate project structure from templates.
Use \`list_templates\` to see available project templates.`;
}
