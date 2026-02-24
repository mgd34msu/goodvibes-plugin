/**
 * Analytics Directory Utility
 *
 * Shared utility for ensuring the global analytics directory exists.
 * Used by session-start and session-end hooks.
 */
/**
 * Ensures the global analytics directory exists at ~/.claude/.goodvibes/analytics/.
 * Lightweight directory check — full DB initialization is handled by the analytics engine.
 * Wrapped in try/catch to never crash the hook.
 */
export declare function ensureGlobalAnalyticsDir(): void;
