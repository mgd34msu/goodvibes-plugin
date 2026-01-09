/**
 * Stack Detector
 *
 * Detects frameworks, package manager, and TypeScript configuration.
 */
/**
 * Clear expired entries from the stack cache.
 * Also enforces maximum cache size by removing oldest entries.
 * Useful for testing or when you need to force re-detection of the stack.
 *
 * @example
 * clearStackCache();
 * const freshStack = await detectStack('/my-project'); // Will re-scan filesystem
 */
export declare function clearStackCache(): void;
/** Detected technology stack information. */
export interface StackInfo {
    frameworks: string[];
    packageManager: string | null;
    hasTypeScript: boolean;
    isStrict: boolean;
}
/**
 * Detect the technology stack used in the project.
 * Checks for framework config files, package manager lockfiles, and TypeScript configuration.
 * Results are cached to improve performance on repeated calls.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to StackInfo with detected frameworks and tools
 *
 * @example
 * const stack = await detectStack('/my-project');
 * if (stack.frameworks.includes('Next.js')) {
 *   debug('Next.js project detected');
 * }
 * debug(`Package manager: ${stack.packageManager}`);
 * debug(`TypeScript strict mode: ${stack.isStrict}`);
 */
export declare function detectStack(cwd: string): Promise<StackInfo>;
/**
 * Format stack information for display in context output.
 * Creates a human-readable summary of detected technologies.
 *
 * @param info - The StackInfo object to format
 * @returns Formatted string with stack details, or empty string if no data
 *
 * @example
 * const formatted = formatStackInfo(stack);
 * // Returns: "Stack: Next.js, TypeScript, Tailwind CSS\nTypeScript: strict\nPackage Manager: pnpm"
 */
export declare function formatStackInfo(info: StackInfo): string;
