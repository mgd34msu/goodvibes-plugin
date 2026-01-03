/**
 * Empty Project Detection
 *
 * Detects if a project is essentially empty (only boilerplate files)
 * to provide appropriate scaffolding context.
 */
export interface EmptyProjectResult {
    isEmpty: boolean;
    filesFound: string[];
    reason?: string;
}
/**
 * Check if a project directory is essentially empty
 * Returns true if only README/.gitignore/LICENSE or genuinely empty
 */
export declare function isEmptyProject(cwd: string): EmptyProjectResult;
/**
 * Generate context message for empty projects
 */
export declare function getEmptyProjectContext(): string;
