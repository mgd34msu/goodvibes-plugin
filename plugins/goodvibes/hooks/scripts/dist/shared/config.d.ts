/**
 * Configuration
 *
 * Shared configuration loading and default settings for GoodVibes hooks.
 */
/** Triggers that determine when quality checkpoints should run. */
export declare const CHECKPOINT_TRIGGERS: {
    fileCountThreshold: number;
    afterAgentComplete: boolean;
    afterMajorChange: boolean;
};
/** Default quality gate checks with auto-fix commands. */
export declare const QUALITY_GATES: ({
    name: string;
    check: string;
    autoFix: null;
    blocking: boolean;
} | {
    name: string;
    check: string;
    autoFix: string;
    blocking: boolean;
})[];
/**
 * Shared configuration for GoodVibes hooks (telemetry, quality, memory, checkpoints).
 * Note: This is separate from the automation config in ../types/config.ts which
 * handles build/test/git automation settings.
 */
export interface SharedConfig {
    telemetry?: {
        enabled?: boolean;
        anonymize?: boolean;
    };
    quality?: {
        gates?: Array<{
            name: string;
            check: string;
            autoFix: string | null;
            blocking: boolean;
        }>;
        autoFix?: boolean;
    };
    memory?: {
        enabled?: boolean;
        maxEntries?: number;
    };
    checkpoints?: {
        enabled?: boolean;
        triggers?: typeof CHECKPOINT_TRIGGERS;
    };
}
/**
 * Returns the default shared configuration for GoodVibes hooks.
 *
 * Provides sensible defaults for all configuration sections:
 * - Telemetry: enabled with anonymization
 * - Quality: all default gates with auto-fix enabled
 * - Memory: enabled with 100 entry limit
 * - Checkpoints: enabled with default triggers
 *
 * @returns The default SharedConfig object with all sections populated
 *
 * @example
 * const config = getDefaultSharedConfig();
 * console.log(config.telemetry?.enabled); // true
 * console.log(config.quality?.gates?.length); // 4 (TypeScript, ESLint, Prettier, Tests)
 */
export declare function getDefaultSharedConfig(): SharedConfig;
/**
 * Loads shared configuration from the .goodvibes/settings.json file.
 *
 * Reads the user's configuration file and deep-merges it with defaults.
 * If the file doesn't exist or is invalid, returns the default configuration.
 *
 * The configuration file can contain either a `goodvibes` key with nested
 * settings or the settings at the root level.
 *
 * @param cwd - The current working directory (project root) containing .goodvibes folder
 * @returns The merged SharedConfig with user overrides applied to defaults
 *
 * @example
 * // Load config from project directory
 * const config = loadSharedConfig('/path/to/project');
 *
 * // Check if telemetry is enabled
 * if (config.telemetry?.enabled) {
 *   collectTelemetry();
 * }
 *
 * @example
 * // Example settings.json structure:
 * // {
 * //   "goodvibes": {
 * //     "telemetry": { "enabled": false },
 * //     "quality": { "autoFix": false }
 * //   }
 * // }
 */
export declare function loadSharedConfig(cwd: string): SharedConfig;
