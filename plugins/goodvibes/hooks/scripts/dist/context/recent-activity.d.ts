/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */
import type { RecentActivity, FileChange, Hotspot, RecentCommit } from '../types/recent-activity.js';
/**
 * Re-exported types for recent activity analysis.
 * Consumers can import these types directly from this module.
 */
export type { RecentActivity, FileChange, Hotspot, RecentCommit };
/**
 * Gather all recent git activity context for the project.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to RecentActivity with all git activity data
 */
export declare function getRecentActivity(cwd: string): Promise<RecentActivity>;
export { formatRecentActivity } from './recent-activity-formatter.js';
