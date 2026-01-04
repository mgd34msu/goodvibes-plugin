/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */
export interface RecentActivity {
    recentlyModifiedFiles: FileChange[];
    hotspots: Hotspot[];
    recentCommits: RecentCommit[];
    activeContributors: string[];
}
export interface FileChange {
    file: string;
    changes: number;
    type: 'added' | 'modified' | 'deleted';
}
export interface Hotspot {
    file: string;
    changeCount: number;
    reason: string;
}
export interface RecentCommit {
    hash: string;
    message: string;
    author: string;
    date: string;
    filesChanged: number;
}
/**
 * Gather all recent activity context
 */
export declare function getRecentActivity(cwd: string): Promise<RecentActivity>;
/**
 * Format recent activity for display
 */
export declare function formatRecentActivity(activity: RecentActivity): string | null;
