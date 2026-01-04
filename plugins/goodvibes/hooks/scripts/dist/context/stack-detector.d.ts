/**
 * Stack Detector
 *
 * Detects frameworks and tools from configuration files.
 */
export interface DetectedStack {
    frameworks: string[];
    databases: string[];
    styling: string[];
    testing: string[];
    buildTools: string[];
    runtime: string[];
    deployment: string[];
    other: string[];
}
/**
 * Detect the project's technology stack from config files
 */
export declare function detectStack(cwd: string): Promise<DetectedStack>;
/**
 * Format detected stack for display
 */
export declare function formatStack(stack: DetectedStack): string;
