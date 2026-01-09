/**
 * Recent Activity Formatter
 *
 * Formats recent activity data for display in context output.
 */

import {
  MAX_DISPLAY_COMMITS,
  MAX_DISPLAY_FILES,
} from './constants/recent-activity.js';

import type { RecentActivity } from '../types/recent-activity.js';

/**
 * Format recent activity for display in context output.
 *
 * @param activity - The RecentActivity object to format
 * @returns Formatted string with commits, hotspots, and recent files, or null if no activity
 */
export function formatRecentActivity(activity: RecentActivity): string | null {
  const sections: string[] = [];

  if (activity.recentCommits.length > 0) {
    const commitLines = activity.recentCommits
      .slice(0, MAX_DISPLAY_COMMITS)
      .map((c) => `- \`${c.hash}\` ${c.message} (${c.date})`);
    sections.push(`**Recent Commits:**\n${commitLines.join('\n')}`);
  }

  if (activity.hotspots.length > 0) {
    const hotspotLines = activity.hotspots.map(
      (h) => `- \`${h.file}\` (${h.changeCount} changes)`
    );
    sections.push(`**Hotspots (frequently changed):**\n${hotspotLines.join('\n')}`);
  }

  if (activity.recentlyModifiedFiles.length > 0) {
    const fileLines = activity.recentlyModifiedFiles
      .slice(0, MAX_DISPLAY_FILES)
      .map((f) => `- \`${f.file}\` (${f.type}, ${f.changes} change(s))`);
    sections.push(`**Recently Modified:**\n${fileLines.join('\n')}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}
