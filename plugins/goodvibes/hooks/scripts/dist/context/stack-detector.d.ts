/**
 * Stack Detector
 *
 * Detects frameworks, package manager, and TypeScript configuration.
 */
/**
 * Clear expired entries from the stack cache.
 * Also enforces maximum cache size by removing oldest entries.
 */
export declare function clearStackCache(): void;
/** Detected technology stack information. */
export interface StackInfo {
    frameworks: string[];
    packageManager: string | null;
    hasTypeScript: boolean;
    isStrict: boolean;
}
/** Detect the technology stack used in the project. */
export declare function detectStack(cwd: string): Promise<StackInfo>;
/** Format stack information for display in context output. */
export declare function formatStackInfo(info: StackInfo): string;
