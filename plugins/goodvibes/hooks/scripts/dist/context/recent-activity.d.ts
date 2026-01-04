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
/** Gather all recent git activity context for the project. */
export declare function getRecentActivity(cwd: string): Promise<RecentActivity>;
/** Format recent activity for display in context output. */
export declare function formatRecentActivity(activity: RecentActivity): string | null;
