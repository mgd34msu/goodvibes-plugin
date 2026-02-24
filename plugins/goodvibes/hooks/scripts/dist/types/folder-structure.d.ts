/**
 * Type definitions for folder structure analysis.
 */
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
/** Folder structure analysis results. */
export interface FolderStructure {
    pattern: ArchitecturePattern;
    confidence: 'high' | 'medium' | 'low';
    topLevelDirs: string[];
    srcDir: string | null;
    specialDirs: SpecialDirectories;
    depth: number;
}
/** Human-readable names for architecture patterns. */
export declare const PATTERN_NAMES: Record<ArchitecturePattern, string>;
