/**
 * Configuration
 *
 * Shared configuration loading and default settings for GoodVibes hooks.
 */
import * as fs from 'fs';
import * as path from 'path';
/** Triggers that determine when quality checkpoints should run. */
export const CHECKPOINT_TRIGGERS = {
    fileCountThreshold: 5,
    afterAgentComplete: true,
    afterMajorChange: true,
};
/** Default quality gate checks with auto-fix commands. */
export const QUALITY_GATES = [
    { name: 'TypeScript', check: 'npx tsc --noEmit', autoFix: null, blocking: true },
    { name: 'ESLint', check: 'npx eslint . --max-warnings=0', autoFix: 'npx eslint . --fix', blocking: true },
    { name: 'Prettier', check: 'npx prettier --check .', autoFix: 'npx prettier --write .', blocking: false },
    { name: 'Tests', check: 'npm test', autoFix: null, blocking: true },
];
/**
 * Get default shared configuration
 */
export function getDefaultSharedConfig() {
    return {
        telemetry: {
            enabled: true,
            anonymize: true,
        },
        quality: {
            gates: QUALITY_GATES,
            autoFix: true,
        },
        memory: {
            enabled: true,
            maxEntries: 100,
        },
        checkpoints: {
            enabled: true,
            triggers: CHECKPOINT_TRIGGERS,
        },
    };
}
/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key], source[key]);
        }
        else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}
/**
 * Load shared configuration from .goodvibes/settings.json
 */
export function loadSharedConfig(cwd) {
    const configPath = path.join(cwd, '.goodvibes', 'settings.json');
    const defaults = getDefaultSharedConfig();
    if (!fs.existsSync(configPath)) {
        return defaults;
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        return deepMerge(defaults, userConfig.goodvibes || userConfig);
    }
    catch {
        return defaults;
    }
}
