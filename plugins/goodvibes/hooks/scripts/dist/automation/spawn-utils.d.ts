/**
 * Spawn Utilities
 *
 * Safe process spawning utilities to avoid shell injection vulnerabilities.
 */
/**
 * Promisified spawn that returns a promise resolving to exit code.
 * Used for commands where we need to pass arguments as an array to avoid shell injection.
 *
 * @param command - The command to execute
 * @param args - Array of arguments to pass to the command
 * @param options - Execution options including working directory and optional timeout
 * @returns Promise resolving to an object with exit code, stdout, and stderr
 */
export declare function spawnAsync(command: string, args: string[], options: {
    cwd: string;
    timeout?: number;
}): Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
}>;
/**
 * Sanitizes a string for safe use in git commands.
 * Removes shell metacharacters that could enable command injection.
 *
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in git commands
 */
export declare function sanitizeForGit(input: string): string;
