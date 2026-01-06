/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */
/** Aggregated recent git activity for the project. */
export interface RecentActivity {
    recentlyModifiedFiles: FileChange[];
    hotspots: Hotspot[];
    recentCommits: RecentCommit[];
    activeContributors: string[];
}
/** A file change summary with modification type. */
export interface FileChange {
    file: string;
    changes: number;
    type: 'added' | 'modified' | 'deleted';
}
/** A frequently changed file that may need attention. */
export interface Hotspot {
    file: string;
    changeCount: number;
    reason: string;
}
/** Summary of a recent git commit. */
export interface RecentCommit {
    hash: string;
    message: string;
    author: string;
    date: string;
    filesChanged: number;
}
/**
 * Gather all recent git activity context for the project.
 * Analyzes git history to identify recently modified files, hotspots, and commits.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to RecentActivity with all git activity data
 *
 * @example
 * const activity = await getRecentActivity('/my-repo');
 * if (activity.hotspots.length > 0) {
 *   console.log('Frequently changed files:', activity.hotspots);
 * }
 */
export declare function getRecentActivity(cwd: string): Promise<RecentActivity>;
/**
 * Format recent activity for display in context output.
 * Creates a human-readable summary of recent commits, hotspots, and file changes.
 *
 * @param activity - The RecentActivity object to format
 * @returns Formatted string with commits, hotspots, and recent files, or null if no activity
 *
 * @example
 * const formatted = formatRecentActivity(activity);
 * // Returns formatted sections with recent commits, hotspots, and modified files
 */
export declare function formatRecentActivity(activity: RecentActivity): string | null;
