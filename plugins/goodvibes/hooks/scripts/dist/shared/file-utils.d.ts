/**
 * File Utilities
 *
 * File system utilities including existence checks and command detection.
 */
/**
 * Checks if a file exists at the given absolute path.
 *
 * This is the canonical file existence check function. All code should use
 * this function for checking file existence with absolute paths.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to true if the file exists, false otherwise
 *
 * @example
 * const pkgPath = path.join(cwd, 'package.json');
 * if (await fileExists(pkgPath)) {
 *   console.log('This is a Node.js project');
 * }
 *
 * @example
 * const tsconfigPath = path.join(PROJECT_ROOT, 'tsconfig.json');
 * if (await fileExists(tsconfigPath)) {
 *   console.log('TypeScript is configured');
 * }
 */
export declare function fileExists(filePath: string): Promise<boolean>;
/**
 * Checks if a file exists relative to a base directory.
 *
 * This is a convenience wrapper around {@link fileExists} for checking
 * files relative to a base directory (defaults to PROJECT_ROOT).
 *
 * Use this when you have relative paths and want to check against PROJECT_ROOT.
 * For absolute paths, use {@link fileExists} directly.
 *
 * @param filePath - The file path relative to the base directory
 * @param baseDir - The base directory to resolve against (defaults to PROJECT_ROOT)
 * @returns Promise resolving to true if the file exists, false otherwise
 *
 * @example
 * // Check relative to PROJECT_ROOT
 * if (await fileExistsRelative('package.json')) {
 *   console.log('This is a Node.js project');
 * }
 *
 * @example
 * // Check relative to custom directory
 * if (await fileExistsRelative('src/index.ts', '/path/to/project')) {
 *   console.log('Source file found');
 * }
 */
export declare function fileExistsRelative(filePath: string, baseDir?: string): Promise<boolean>;
/**
 * Checks if a command-line tool is available on the system.
 *
 * Uses platform-specific commands to check for availability:
 * - Windows: `where <cmd>`
 * - Unix/Mac: `which <cmd>`
 *
 * @param cmd - The command name to check (e.g., 'git', 'npm', 'node')
 * @returns Promise resolving to true if the command is available in PATH, false otherwise
 *
 * @example
 * if (await commandExists('git')) {
 *   console.log('Git is available');
 * }
 *
 * @example
 * // Check before running a tool
 * if (!(await commandExists('pnpm'))) {
 *   console.log('pnpm not found, falling back to npm');
 * }
 */
export declare function commandExists(cmd: string): Promise<boolean>;
/**
 * Validates that all required registry files exist in the plugin.
 *
 * Checks for the presence of the three core registry files:
 * - skills/_registry.yaml
 * - agents/_registry.yaml
 * - tools/_registry.yaml
 *
 * @returns Promise resolving to an object with `valid` (true if all exist) and `missing` (array of missing paths)
 *
 * @example
 * const result = await validateRegistries();
 * if (!result.valid) {
 *   console.error('Missing registries:', result.missing.join(', '));
 * }
 */
export declare function validateRegistries(): Promise<{
    valid: boolean;
    missing: string[];
}>;
/**
 * Ensures the .goodvibes directory exists with all required subdirectories.
 *
 * Creates the following directory structure if it doesn't exist:
 * - .goodvibes/
 *   - memory/   - For persistent memory storage
 *   - state/    - For session state files
 *   - logs/     - For hook execution logs
 *   - telemetry/ - For telemetry data
 *
 * Also ensures the project's .gitignore contains security-critical entries.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise that resolves to the path of the .goodvibes directory
 *
 * @example
 * const goodvibesDir = await ensureGoodVibesDir('/path/to/project');
 * console.log(goodvibesDir); // '/path/to/project/.goodvibes'
 *
 * // Now safe to write to subdirectories
 * fs.writeFileSync(path.join(goodvibesDir, 'state', 'session.json'), data);
 */
export declare function ensureGoodVibesDir(cwd: string): Promise<string>;
/**
 * Extracts readable error output from an execSync error.
 *
 * When execSync fails, the error object may contain stdout/stderr buffers.
 * This function extracts the most useful error message from those buffers.
 *
 * @param error - The error thrown by execSync (typically has stdout/stderr properties)
 * @returns A string containing the error output (stdout, stderr, or message)
 *
 * @example
 * try {
 *   execSync('npm test');
 * } catch (error) {
 *   const output = extractErrorOutput(error);
 *   console.log('Test failed:', output);
 * }
 */
export declare function extractErrorOutput(error: unknown): string;
