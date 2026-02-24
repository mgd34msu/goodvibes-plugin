/**
 * Recent Activity Formatter
 *
 * Formats recent activity data for display in context output.
 */
import type { RecentActivity } from '../types/recent-activity.js';
/**
 * Format recent activity for display in context output.
 *
 * @param activity - The RecentActivity object to format
 * @returns Formatted string with commits, hotspots, and recent files, or null if no activity
 */
export declare function formatRecentActivity(activity: RecentActivity): string | null;
