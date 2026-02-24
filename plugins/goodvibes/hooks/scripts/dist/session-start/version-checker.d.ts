/**
 * Version Checker Module
 *
 * Checks if the local GoodVibes plugin version matches the latest GitHub release.
 * Used during session-start to notify users of available updates.
 */
export interface VersionCheckResult {
    isUpToDate: boolean;
    localVersion: string;
    remoteVersion: string | null;
    message: string;
    error?: string;
}
/**
 * Checks if the local version is up to date with the latest GitHub release.
 * Returns a result object with version info and a user-friendly message.
 *
 * Note: fetchLatestVersion never throws (returns null on error), so the try-catch
 * here is for other potential errors in this function.
 */
export declare function checkForUpdates(): Promise<VersionCheckResult>;
