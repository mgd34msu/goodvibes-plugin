/**
 * Stack Detector
 *
 * Detects frameworks, package manager, and TypeScript configuration.
 */
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
