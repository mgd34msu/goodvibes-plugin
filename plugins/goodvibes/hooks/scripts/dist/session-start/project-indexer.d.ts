/**
 * Build the project file index by delegating to precision-engine's CLI.
 * The CLI writes the index to .goodvibes/project-index.json atomically.
 */
export declare function buildProjectIndex(projectDir: string): Promise<void>;
