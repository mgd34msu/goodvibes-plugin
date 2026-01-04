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
/** Build commands mapped by framework type. */
export declare const BUILD_COMMANDS: Record<string, string>;
/** TypeScript type check command (same for all frameworks). */
export declare const TYPECHECK_COMMAND = "npx tsc --noEmit";
/**
 * Detects the appropriate build command based on project config files.
 * Checks for Next.js, Vite, or falls back to default npm build.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to the build command string appropriate for the detected framework
 *
 * @example
 * const cmd = await detectBuildCommand('/my-next-app');
 * // Returns 'npm run build' if next.config.js exists
 */
export declare function detectBuildCommand(cwd: string): Promise<string>;
/**
 * Runs the build command for the project and returns structured results.
 * Automatically detects the appropriate build command based on project configuration.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a BuildResult object containing pass/fail status, summary, and parsed errors
 *
 * @example
 * const result = await runBuild('/my-project');
 * if (!result.passed) {
 *   console.error('Build failed:', result.errors);
 * }
 */
export declare function runBuild(cwd: string): Promise<BuildResult>;
/**
 * Runs TypeScript type checking using tsc --noEmit.
 * Returns structured results with parsed error information.
 *
 * @param cwd - The current working directory (project root)
 * @returns A BuildResult object containing pass/fail status, summary, and parsed type errors
 *
 * @example
 * const result = runTypeCheck('/my-project');
 * if (!result.passed) {
 *   result.errors.forEach(e => console.error(`${e.file}:${e.line}: ${e.message}`));
 * }
 */
export declare function runTypeCheck(cwd: string): BuildResult;
