/**
 * Empty Project Detector
 *
 * Detects if the project directory is empty or contains only scaffolding files.
 */
import * as fs from 'fs/promises';
import { debug } from '../shared/logging.js';
/**
 * List of files considered scaffolding-only that don't indicate a real project.
 * These are typically README, LICENSE, and git configuration files.
 */
const SCAFFOLDING_ONLY = [
    'readme.md',
    'readme',
    'license',
    'license.md',
    '.gitignore',
    '.git',
];
/**
 * Check if the project directory is empty or contains only scaffolding files.
 * A project is considered empty if it has no files other than README, LICENSE, .gitignore, etc.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to true if the project is empty, false otherwise
 *
 * @example
 * if (await isEmptyProject('/my-project')) {
 *   debug('New empty project detected');
 * }
 */
export async function isEmptyProject(cwd) {
    try {
        const files = await fs.readdir(cwd);
        const meaningfulFiles = files.filter((file) => {
            const lower = file.toLowerCase();
            return !SCAFFOLDING_ONLY.includes(lower) && !file.startsWith('.');
        });
        return meaningfulFiles.length === 0;
    }
    catch (error) {
        // If we can't read the directory, treat it as empty
        debug('empty-project: Failed to read directory', error);
        return true;
    }
}
/**
 * Format empty project context with scaffolding suggestions.
 * Returns a helpful message for users starting a new project with common frameworks.
 *
 * @returns A formatted string with new project scaffolding suggestions
 *
 * @example
 * const message = formatEmptyProjectContext();
 * // Returns help text with Next.js, Node.js API, and React library suggestions
 */
export function formatEmptyProjectContext() {
    return `[GoodVibes SessionStart]
Status: New project (empty directory)

Ready to scaffold. Common starting points:
- "Create a Next.js app with TypeScript and Tailwind"
- "Set up a Node.js API with Express and Prisma"
- "Initialize a React library with Vite"

I'll detect your stack automatically as you build.`;
}
