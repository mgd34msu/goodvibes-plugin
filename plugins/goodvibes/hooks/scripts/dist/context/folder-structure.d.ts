/**
 * Folder Structure Analyzer
 *
 * Detects the architecture pattern used in the project.
 */
/** Folder structure analysis results. */
export interface FolderStructure {
    pattern: ArchitecturePattern;
    confidence: 'high' | 'medium' | 'low';
    topLevelDirs: string[];
    srcDir: string | null;
    specialDirs: SpecialDirectories;
    depth: number;
}
/** Recognized architecture patterns for project organization. */
export type ArchitecturePattern = 'next-app-router' | 'next-pages-router' | 'feature-based' | 'layer-based' | 'domain-driven' | 'atomic-design' | 'component-based' | 'flat' | 'unknown';
/** Flags indicating presence of common special directories. */
export interface SpecialDirectories {
    hasComponents: boolean;
    hasPages: boolean;
    hasApp: boolean;
    hasApi: boolean;
    hasLib: boolean;
    hasUtils: boolean;
    hasHooks: boolean;
    hasServices: boolean;
    hasTypes: boolean;
    hasTests: boolean;
}
/**
 * Analyze the folder structure of a project.
 * Performs comprehensive analysis to detect architecture pattern, special directories, and folder depth.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a FolderStructure object with pattern, confidence, and directory information
 *
 * @example
 * const structure = await analyzeFolderStructure('/my-next-app');
 * if (structure.pattern === 'next-app-router') {
 *   console.log('Next.js App Router detected');
 * }
 */
export declare function analyzeFolderStructure(cwd: string): Promise<FolderStructure>;
/**
 * Format folder structure for display.
 * Generates a human-readable summary of the project architecture.
 *
 * @param structure - The FolderStructure object to format
 * @returns Formatted string with architecture pattern and key directories, or null if no data
 *
 * @example
 * const formatted = formatFolderStructure(structure);
 * // Returns: "Architecture: Next.js App Router (high confidence)\nKey Dirs: app/, components/, lib/"
 */
export declare function formatFolderStructure(structure: FolderStructure): string | null;
