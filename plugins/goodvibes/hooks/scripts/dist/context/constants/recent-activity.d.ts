/**
 * Recent Activity Constants
 *
 * Configuration constants for git activity analysis.
 */
/**
 * Maximum buffer size for git command output (10MB).
 * Prevents memory issues when processing large git histories.
 */
export declare const GIT_MAX_BUFFER: number;
/**
 * Default number of days to look back for recent changes.
 * Used to determine what counts as "recent" file modifications.
 */
export declare const DEFAULT_DAYS_LOOKBACK = 7;
/**
 * Default number of commits to analyze for hotspots.
 * More commits provide better hotspot accuracy but slower processing.
 */
export declare const DEFAULT_COMMITS_FOR_HOTSPOTS = 50;
/**
 * Default number of recent commits to retrieve.
 * Displayed in the recent activity summary.
 */
export declare const DEFAULT_RECENT_COMMITS = 5;
/**
 * Maximum recently modified files to return.
 * Limits the number of files in the recent changes list.
 */
export declare const MAX_RECENT_FILES = 10;
/**
 * Maximum hotspots to return.
 * Limits the number of frequently-changed files reported.
 */
export declare const MAX_HOTSPOTS = 5;
/**
 * Minimum hotspot threshold multiplier.
 * Files changed in at least this fraction of commits are considered hotspots.
 */
export declare const HOTSPOT_THRESHOLD_MULTIPLIER = 0.1;
/**
 * Minimum absolute hotspot threshold.
 * Files must be changed at least this many times to be a hotspot.
 */
export declare const MIN_HOTSPOT_THRESHOLD = 3;
/**
 * Maximum recent commits to display in formatted output.
 * Prevents overwhelming output with too many commits.
 */
export declare const MAX_DISPLAY_COMMITS = 3;
/**
 * Maximum recently modified files to display.
 * Limits files shown in formatted output.
 */
export declare const MAX_DISPLAY_FILES = 5;
