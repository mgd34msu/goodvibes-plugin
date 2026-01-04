/**
 * Empty Project Detector
 *
 * Detects if the project directory is empty or contains only scaffolding files.
 */
import * as fs from 'fs';
const SCAFFOLDING_ONLY = [
    'readme.md',
    'readme',
    'license',
    'license.md',
    '.gitignore',
    '.git',
];
/** Check if the project directory is empty or contains only scaffolding files. */
export async function isEmptyProject(cwd) {
    try {
        const files = fs.readdirSync(cwd);
        const meaningfulFiles = files.filter(f => {
            const lower = f.toLowerCase();
            return !SCAFFOLDING_ONLY.includes(lower) && !f.startsWith('.');
        });
        return meaningfulFiles.length === 0;
    }
    catch {
        return true;
    }
}
/** Format empty project context with scaffolding suggestions. */
export function formatEmptyProjectContext() {
    return `[GoodVibes SessionStart]
Status: New project (empty directory)

Ready to scaffold. Common starting points:
- "Create a Next.js app with TypeScript and Tailwind"
- "Set up a Node.js API with Express and Prisma"
- "Initialize a React library with Vite"

I'll detect your stack automatically as you build.`;
}
