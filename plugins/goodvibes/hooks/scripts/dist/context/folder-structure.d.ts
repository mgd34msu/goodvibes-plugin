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
 * Analyze the folder structure of a project
 */
export declare function analyzeFolderStructure(cwd: string): Promise<FolderStructure>;
/**
 * Format folder structure for display
 */
export declare function formatFolderStructure(structure: FolderStructure): string | null;
