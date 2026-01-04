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
 * Get default shared configuration
 */
export declare function getDefaultSharedConfig(): SharedConfig;
/**
 * Load shared configuration from .goodvibes/settings.json
 */
export declare function loadSharedConfig(cwd: string): SharedConfig;
