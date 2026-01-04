/**
 * Folder Analyzer
 *
 * Analyzes folder structure to detect architecture patterns.
 */
/** Folder structure analysis results. */
export interface FolderAnalysis {
    srcDir: string;
    pattern: string;
    routing: string | null;
    hasApi: boolean;
}
/** Analyze folder structure to detect architecture patterns. */
export declare function analyzeFolderStructure(cwd: string): FolderAnalysis;
/** Format folder analysis for display in context output. */
export declare function formatFolderAnalysis(analysis: FolderAnalysis): string;
