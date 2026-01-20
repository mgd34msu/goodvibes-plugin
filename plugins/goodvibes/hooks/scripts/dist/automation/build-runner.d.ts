/**
 * Build Runner
 *
 * Executes build and type-check operations for the project,
 * parsing output to extract structured error information.
 */
/** Result of a build or type check operation. */
export interface BuildResult {
    passed: boolean;
    summary: string;
    errors: {
        file: string;
        line: number;
        message: string;
    }[];
}
/**
 * Runs TypeScript type checking using tsc --noEmit.
 * Returns structured results with parsed error information.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a BuildResult object containing pass/fail status, summary, and parsed type errors
 *
 * @example
 * const result = await runTypeCheck('/my-project');
 * if (!result.passed) {
 *   result.errors.forEach(e => debug(`${e.file}:${e.line}: ${e.message}`));
 * }
 */
export declare function runTypeCheck(cwd: string): Promise<BuildResult>;
