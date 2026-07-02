/**
 * Prompt-chain installer CLI — the only consented write path for the
 * GoodVibes prompt chain besides the Setup hook (`claude init`).
 *
 * Invoked by the /goodvibes:plugin command:
 *   node dist/prompt-installer.js install   [projectDir]  — install the chain
 *   node dist/prompt-installer.js uninstall [projectDir]  — clean removal
 *   node dist/prompt-installer.js status    [projectDir]  — read-only state
 *
 * SessionStart never calls this; it only detects and reports install state.
 */
export {};
