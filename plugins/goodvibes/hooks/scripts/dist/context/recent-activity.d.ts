/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */
import type { RecentActivity, FileChange, Hotspot, RecentCommit } from '../types/recent-activity.js';
export type { RecentActivity, FileChange, Hotspot, RecentCommit };
/**
 * Gather all recent git activity context for the project.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to RecentActivity with all git activity data
 */
export declare function getRecentActivity(cwd: string): RecentActivity;
/**
 * Format recent activity for display in context output.
 *
 * @param activity - The RecentActivity object to format
 * @returns Formatted string with commits, hotspots, and recent files, or null if no activity
 */
export declare function formatRecentActivity(activity: RecentActivity): string | null;
