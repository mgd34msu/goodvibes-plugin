/**
 * Breakpoint Resolver for Responsive Breakpoints
 *
 * Resolves the active breakpoint set with priority:
 *   explicit parameter > tailwind.config detection > hardcoded defaults
 *
 * @module handlers/frontend/responsive-breakpoints/breakpoint-resolver
 */

import * as fs from 'fs';
import * as path from 'path';
import { BREAKPOINT_SIZES } from './constants.js';
import { getProjectRoot } from '../../config.js';

/**
 * Resolved breakpoint configuration
 */
export interface ResolvedBreakpoints {
  /** Ordered breakpoint names (ascending pixel order, excludes 'base') */
  breakpoints: string[];
  /** Map of all breakpoint names (including 'base') to their min-width sizes */
  sizes: Record<string, string>;
}

/**
 * Tailwind config filenames to search for (in priority order)
 */
const TAILWIND_CONFIG_FILES = [
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
];

/**
 * Parse pixel value to number for sorting.
 * Returns Infinity for non-px values.
 */
function parsePx(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  return match ? parseFloat(match[1]) : Infinity;
}

/**
 * Sort breakpoint names by their pixel value ascending.
 */
function sortBreakpointsBySize(
  names: string[],
  sizes: Record<string, string>
): string[] {
  return [...names].sort((a, b) => parsePx(sizes[a] ?? '0px') - parsePx(sizes[b] ?? '0px'));
}

/**
 * Attempt to parse tailwind.config screens from file content using regex.
 * Handles:
 *   screens: { sm: '640px', md: '768px' }
 *   screens: { sm: { min: '640px' }, md: { min: '768px' } }
 * Returns null if unable to parse reliably.
 */
function parseTailwindScreens(content: string): Record<string, string> | null {
  // Match the screens block — find `screens:` or `screens :\n` followed by object literal
  // We use a simple approach: find `screens:` and extract the braced block
  const screensMatch = content.match(/screens\s*:\s*\{([^}]+)\}/);
  if (!screensMatch) return null;

  const screensBlock = screensMatch[1];
  const result: Record<string, string> = {};
  let foundAny = false;

  // Match string value: 'sm': '640px' or "sm": "640px" or sm: '640px'
  const stringValuePattern = /['"]?(\w+(?:-\w+)*)['"]?\s*:\s*['"]([^'"]+)['"]\s*(?:,|$)/g;
  let m: RegExpExecArray | null;
  while ((m = stringValuePattern.exec(screensBlock)) !== null) {
    const [, name, value] = m;
    // Skip non-px values that look like require() or dynamic values
    if (value.includes('(') || value.includes('$') || value.includes(' ')) continue;
    result[name] = value;
    foundAny = true;
  }

  // Match object value: 'sm': { min: '640px' } — capture first px value from inner object
  const objectValuePattern = /['"]?(\w+(?:-\w+)*)['"]?\s*:\s*\{[^}]*['"]([0-9]+px)['"][^}]*\}/g;
  while ((m = objectValuePattern.exec(screensBlock)) !== null) {
    const [, name, value] = m;
    if (!result[name]) {
      result[name] = value;
      foundAny = true;
    }
  }

  return foundAny ? result : null;
}

/**
 * Try to read tailwind.config screens from the project root.
 * Returns null if no config found or parsing fails.
 */
function readTailwindConfig(projectRoot: string): Record<string, string> | null {
  for (const configFile of TAILWIND_CONFIG_FILES) {
    const configPath = path.join(projectRoot, configFile);
    if (!fs.existsSync(configPath)) continue;

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parseTailwindScreens(content);
      if (parsed) return parsed;
    } catch {
      // Silently skip unreadable configs
    }
    break; // Only try the first config file found
  }
  return null;
}

/**
 * Resolve the active breakpoints with priority:
 *   1. Explicit parameter overrides
 *   2. tailwind.config.js/ts detection
 *   3. Hardcoded defaults
 *
 * Merging strategy:
 *   - Custom values override defaults for matching keys
 *   - New keys from config are added
 *   - Always includes base: '0px'
 *   - Sorted by pixel value ascending
 *
 * @param explicitBreakpoints - Optional map of breakpoint name to size (from tool args)
 * @param projectRoot - Optional project root override
 */
export function resolveBreakpoints(
  explicitBreakpoints?: Record<string, string>,
  projectRoot?: string
): ResolvedBreakpoints {
  const root = projectRoot ?? getProjectRoot();

  // Start with hardcoded defaults (excluding 'base' — handled separately)
  let mergedSizes: Record<string, string> = { ...BREAKPOINT_SIZES };

  if (explicitBreakpoints && Object.keys(explicitBreakpoints).length > 0) {
    // Priority 1: explicit parameter overrides everything
    for (const [name, size] of Object.entries(explicitBreakpoints)) {
      if (name !== 'base') mergedSizes[name] = size;
    }
  } else {
    // Priority 2: tailwind.config detection
    const tailwindScreens = readTailwindConfig(root);
    if (tailwindScreens) {
      for (const [name, size] of Object.entries(tailwindScreens)) {
        if (name !== 'base') mergedSizes[name] = size;
      }
    }
    // Priority 3: defaults already in mergedSizes
  }

  // Always include base
  mergedSizes['base'] = '0px';

  // Build sorted breakpoint list (excludes 'base')
  const breakpointNames = Object.keys(mergedSizes).filter((k) => k !== 'base');
  const sortedBreakpoints = sortBreakpointsBySize(breakpointNames, mergedSizes);

  return {
    breakpoints: sortedBreakpoints,
    sizes: mergedSizes,
  };
}
