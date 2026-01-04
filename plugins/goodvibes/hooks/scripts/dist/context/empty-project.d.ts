/**
 * Empty Project Detector
 *
 * Detects if the project directory is empty or contains only scaffolding files.
 */
/** Check if the project directory is empty or contains only scaffolding files. */
export declare function isEmptyProject(cwd: string): Promise<boolean>;
/** Format empty project context with scaffolding suggestions. */
export declare function formatEmptyProjectContext(): string;
