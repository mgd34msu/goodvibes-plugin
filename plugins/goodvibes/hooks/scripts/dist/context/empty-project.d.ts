/**
 * Empty Project Detector
 *
 * Detects if the project directory is empty or contains only scaffolding files.
 */
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
export declare function isEmptyProject(cwd: string): Promise<boolean>;
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
export declare function formatEmptyProjectContext(): string;
