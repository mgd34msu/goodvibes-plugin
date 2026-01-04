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
/** Type check commands mapped by framework type. */
export declare const TYPECHECK_COMMANDS: Record<string, string>;
/**
 * Detects the appropriate build command based on project config files.
 */
export declare function detectBuildCommand(cwd: string): string;
/**
 * Run the build command for the project
 */
export declare function runBuild(cwd: string): BuildResult;
/**
 * Run TypeScript type checking
 */
export declare function runTypeCheck(cwd: string): BuildResult;
