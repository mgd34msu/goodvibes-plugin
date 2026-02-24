/**
 * Setup Hook Entry Point
 *
 * Runs during `claude init` to pre-write CLAUDE.md chain files.
 * This ensures all import chain files exist before any session starts,
 * avoiding race conditions where SessionStart isn't fast enough.
 */
export {};
