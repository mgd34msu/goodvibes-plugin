#!/usr/bin/env node
/**
 * Add missing JSDoc comments to exported items
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcDir = join(__dirname, 'src');

// Patches to apply to specific files
const patches = {
  'memory/index.ts': [
    {
      search: `} from './paths.js';
export type { MemoryFileType } from './paths.js';`,
      replace: `} from './paths.js';

/** Memory file type enumeration for different memory categories */
export type { MemoryFileType } from './paths.js';`
    },
    {
      search: `export type { ProjectMemory };

// Type aliases for backward compatibility
export type Decision = MemoryDecision;
export type Pattern = MemoryPattern;
export type Failure = MemoryFailure;
export type Preference = MemoryPreference;`,
      replace: `/** Aggregated project memory containing all memory types */
export type { ProjectMemory };

// Type aliases for backward compatibility
/** Architectural decision record type alias */
export type Decision = MemoryDecision;

/** Code pattern record type alias */
export type Pattern = MemoryPattern;

/** Failed approach record type alias */
export type Failure = MemoryFailure;

/** User preference record type alias */
export type Preference = MemoryPreference;`
    }
  ],

  'post-tool-use-failure/error-patterns.ts': [
    {
      search: `export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RecoveryPattern {`,
      replace: `/** Error severity level for categorizing error impact */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Recovery pattern definition for error matching and fix suggestions */
export interface RecoveryPattern {`
    }
  ],

  'post-tool-use-failure/retry-tracker.ts': [
    {
      search: `}

export async function loadRetries(cwd: string): Promise<RetryData> {`,
      replace: `}

/**
 * Loads retry tracking data from disk.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to retry data map or empty object if file doesn't exist
 */
export async function loadRetries(cwd: string): Promise<RetryData> {`
    },
    {
      search: `}

export async function saveRetry(`,
      replace: `}

/**
 * Saves a retry attempt to disk, incrementing the count and updating phase.
 *
 * @param stateOrCwd - Either HooksState or directory path
 * @param signature - Unique error signature
 * @param errorStateOrPhase - Error state object or phase number
 * @returns Promise that resolves when retry is saved
 */
export async function saveRetry(`
    },
    {
      search: `}

export async function getRetryCount(cwd: string, signature: string): Promise<number> {`,
      replace: `}

/**
 * Gets the number of retry attempts for an error signature.
 *
 * @param cwd - The current working directory (project root)
 * @param signature - Unique error signature
 * @returns Promise resolving to retry count or 0 if not found
 */
export async function getRetryCount(cwd: string, signature: string): Promise<number> {`
    },
    {
      search: `}

export async function getCurrentPhase(cwd: string, signature: string): Promise<number> {`,
      replace: `}

/**
 * Gets the current fix phase for an error signature.
 *
 * @param cwd - The current working directory (project root)
 * @param signature - Unique error signature
 * @returns Promise resolving to phase number (1-3) or 1 if not found
 */
export async function getCurrentPhase(cwd: string, signature: string): Promise<number> {`
    },
    {
      search: `}

export async function shouldEscalatePhase(`,
      replace: `}

/**
 * Determines if the error should escalate to the next fix phase.
 *
 * @param cwdOrErrorState - Either directory path or error state object
 * @param signature - Unique error signature (required if cwdOrErrorState is a path)
 * @param currentPhase - Current phase number (optional)
 * @param category - Error category for retry limit lookup
 * @returns Promise resolving to true if phase should escalate
 */
export async function shouldEscalatePhase(`
    },
    {
      search: `}

export function escalatePhase(errorState: ErrorState): ErrorState {`,
      replace: `}

/**
 * Escalates error state to the next phase.
 *
 * @param errorState - The current error state
 * @returns New error state with incremented phase
 */
export function escalatePhase(errorState: ErrorState): ErrorState {`
    },
    {
      search: `}

export async function hasExhaustedRetries(`,
      replace: `}

/**
 * Checks if all retry attempts have been exhausted across all phases.
 *
 * @param cwdOrErrorState - Either directory path or error state object
 * @param signature - Unique error signature (required if cwdOrErrorState is a path)
 * @param category - Error category for retry limit lookup
 * @returns Promise resolving to true if all retries exhausted
 */
export async function hasExhaustedRetries(`
    },
    {
      search: `}

export function getPhaseDescription(phase: number): string {`,
      replace: `}

/**
 * Gets a human-readable description of a fix phase.
 *
 * @param phase - The phase number (1-3)
 * @returns Description string for the phase
 */
export function getPhaseDescription(phase: number): string {`
    },
    {
      search: `}

export async function getRemainingAttempts(`,
      replace: `}

/**
 * Gets the number of remaining retry attempts in the current phase.
 *
 * @param cwdOrErrorState - Either directory path or error state object
 * @param signature - Unique error signature (required if cwdOrErrorState is a path)
 * @param category - Error category for retry limit lookup
 * @returns Promise resolving to number of remaining attempts
 */
export async function getRemainingAttempts(`
    },
    {
      search: `}

export function generateErrorSignature(error: string, toolName?: string): string {`,
      replace: `}

/**
 * Generates a unique signature for an error based on its message and tool.
 *
 * @param error - The error message
 * @param toolName - The name of the tool that failed (optional)
 * @returns Unique error signature string
 */
export function generateErrorSignature(error: string, toolName?: string): string {`
    },
    {
      search: `}

export async function clearRetry(cwd: string, signature: string): Promise<void> {`,
      replace: `}

/**
 * Clears retry tracking data for a specific error signature.
 *
 * @param cwd - The current working directory (project root)
 * @param signature - Unique error signature to clear
 * @returns Promise that resolves when retry is cleared
 */
export async function clearRetry(cwd: string, signature: string): Promise<void> {`
    },
    {
      search: `const DEFAULT_MAX_AGE_HOURS = 24;

export async function pruneOldRetries(cwd: string, maxAgeHours: number = DEFAULT_MAX_AGE_HOURS): Promise<void> {`,
      replace: `const DEFAULT_MAX_AGE_HOURS = 24;

/**
 * Removes retry tracking data older than specified hours.
 *
 * @param cwd - The current working directory (project root)
 * @param maxAgeHours - Maximum age in hours before pruning (default: 24)
 * @returns Promise that resolves when old retries are pruned
 */
export async function pruneOldRetries(cwd: string, maxAgeHours: number = DEFAULT_MAX_AGE_HOURS): Promise<void> {`
    },
    {
      search: `}

export async function getRetryStats(cwd: string): Promise<{`,
      replace: `}

/**
 * Gets statistics about retry tracking data.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to retry statistics object
 */
export async function getRetryStats(cwd: string): Promise<{`
    }
  ],

  'shared/constants.ts': [
    {
      search: `// Environment - using official Claude Code environment variable names
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');`,
      replace: `// Environment - using official Claude Code environment variable names
/** Root directory of the GoodVibes plugin */
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');

/** Root directory of the current project */
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** Cache directory for temporary plugin files */
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');

/** Path to the analytics JSON file */
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');`
    }
  ]
};

console.log('Applying JSDoc patches...\n');

for (const [relativePath, filePatchess] of Object.entries(patches)) {
  const filePath = join(srcDir, relativePath);
  console.log(`Processing ${relativePath}...`);

  let content = readFileSync(filePath, 'utf-8');
  let changeCount = 0;

  for (const patch of filePatches) {
    if (content.includes(patch.search)) {
      content = content.replace(patch.search, patch.replace);
      changeCount++;
    } else {
      console.log(`  ⚠ Warning: Could not find search pattern in ${relativePath}`);
    }
  }

  writeFileSync(filePath, content, 'utf-8');
  console.log(`  ✓ Applied ${changeCount}/${filePatchess.length} patches\n`);
}

console.log('JSDoc patches complete!');
