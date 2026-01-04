/**
 * Configuration
 *
 * Shared configuration loading and default settings for GoodVibes hooks.
 */

import * as fs from 'fs';
import * as path from 'path';
import { debug } from './logging.js';

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
export function getDefaultSharedConfig(): SharedConfig {
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
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] as object, source[key] as object) as T[typeof key];
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[typeof key];
    }
  }
  return result;
}

/**
 * Load shared configuration from .goodvibes/settings.json
 */
export function loadSharedConfig(cwd: string): SharedConfig {
  const configPath = path.join(cwd, '.goodvibes', 'settings.json');
  const defaults = getDefaultSharedConfig();

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    return deepMerge(defaults, userConfig.goodvibes || userConfig);
  } catch (error) {
    debug('loadSharedConfig failed', { error: String(error) });
    return defaults;
  }
}
