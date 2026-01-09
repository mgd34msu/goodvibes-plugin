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
/**
 * Analyze folder structure to detect architecture patterns.
 * Identifies project organization patterns like feature-based, layer-based, and routing type.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to FolderAnalysis with structure details
 *
 * @example
 * const analysis = await analyzeFolderStructure('/my-project');
 * if (analysis.routing === 'App Router') {
 *   debug('Using Next.js App Router');
 * }
 */
export declare function analyzeFolderStructure(cwd: string): Promise<FolderAnalysis>;
/**
 * Format folder analysis for display in context output.
 * Creates a concise summary of the project structure and architecture.
 *
 * @param analysis - The FolderAnalysis object to format
 * @returns Formatted string with structure pattern, routing type, and API presence
 *
 * @example
 * const formatted = formatFolderAnalysis(analysis);
 * // Returns: "Structure: feature-based, App Router, has API layer"
 */
export declare function formatFolderAnalysis(analysis: FolderAnalysis): string;
