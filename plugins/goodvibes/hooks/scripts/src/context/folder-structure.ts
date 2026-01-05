/**
 * Folder Structure Analyzer
 *
 * Detects the architecture pattern used in the project.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';
import { fileExistsAsync as fileExists } from '../shared/file-utils.js';

/** Folder structure analysis results. */
export interface FolderStructure {
  pattern: ArchitecturePattern;
  confidence: 'high' | 'medium' | 'low';
  topLevelDirs: string[];
  srcDir: string | null;
  specialDirs: SpecialDirectories;
  depth: number;
}

/** Recognized architecture patterns for project organization. */
export type ArchitecturePattern =
  | 'next-app-router'
  | 'next-pages-router'
  | 'feature-based'
  | 'layer-based'
  | 'domain-driven'
  | 'atomic-design'
  | 'component-based'
  | 'flat'
  | 'unknown';

/** Flags indicating presence of common special directories. */
export interface SpecialDirectories {
  hasComponents: boolean;
  hasPages: boolean;
  hasApp: boolean;
  hasApi: boolean;
  hasLib: boolean;
  hasUtils: boolean;
  hasHooks: boolean;
  hasServices: boolean;
  hasTypes: boolean;
  hasTests: boolean;
}

const LAYER_INDICATORS = ['controllers', 'services', 'repositories', 'models', 'middleware', 'routes'];
const FEATURE_INDICATORS = ['features', 'modules', 'domains'];
const ATOMIC_INDICATORS = ['atoms', 'molecules', 'organisms', 'templates'];
const DDD_INDICATORS = ['domain', 'infrastructure', 'application', 'aggregates', 'entities', 'value-objects'];

/** Minimum indicator matches for pattern detection. */
const MIN_INDICATOR_MATCH = 2;
/** Minimum matches for high confidence pattern detection. */
const HIGH_CONFIDENCE_THRESHOLD = 3;
/** Maximum folder depth to traverse. */
const DEFAULT_MAX_DEPTH = 5;
/** Minimum top-level directories before considering structure flat. */
const FLAT_STRUCTURE_THRESHOLD = 3;

/**
 * Get immediate subdirectories of a path
 */
async function getSubdirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase());
  } catch (error: unknown) {
    debug('folder-structure failed', { error: String(error) });
    return [];
  }
}

/**
 * Check if any indicators are present
 */
function hasIndicators(dirs: string[], indicators: string[]): number {
  return dirs.filter((d) => indicators.includes(d)).length;
}

/**
 * Detect the architecture pattern
 */
async function detectPattern(cwd: string, topLevelDirs: string[], srcDirs: string[]): Promise<{ pattern: ArchitecturePattern; confidence: 'high' | 'medium' | 'low' }> {
  const allDirs = [...topLevelDirs, ...srcDirs];

  // Check for Next.js App Router
  if (topLevelDirs.includes('app') || srcDirs.includes('app')) {
    const appPath = topLevelDirs.includes('app')
      ? path.join(cwd, 'app')
      : path.join(cwd, 'src', 'app');

    if (await fileExists(appPath)) {
      const appContents = await getSubdirs(appPath);
      if (appContents.some((d) => d.startsWith('(') || d === 'api')) {
        return { pattern: 'next-app-router', confidence: 'high' };
      }
      try {
        const files = await fs.readdir(appPath);
        if (files.some((f) => f.startsWith('page.') || f.startsWith('layout.'))) {
          return { pattern: 'next-app-router', confidence: 'high' };
        }
      } catch (error: unknown) {
        debug('folder-structure failed', { error: String(error) });
      }
    }
  }

  // Check for Next.js Pages Router
  if (topLevelDirs.includes('pages') || srcDirs.includes('pages')) {
    return { pattern: 'next-pages-router', confidence: 'high' };
  }

  // Check for Atomic Design
  const atomicCount = hasIndicators(allDirs, ATOMIC_INDICATORS);
  if (atomicCount >= MIN_INDICATOR_MATCH) {
    return { pattern: 'atomic-design', confidence: atomicCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium' };
  }

  // Check for Domain-Driven Design
  const dddCount = hasIndicators(allDirs, DDD_INDICATORS);
  if (dddCount >= MIN_INDICATOR_MATCH) {
    return { pattern: 'domain-driven', confidence: dddCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium' };
  }

  // Check for Layer-based
  const layerCount = hasIndicators(allDirs, LAYER_INDICATORS);
  if (layerCount >= MIN_INDICATOR_MATCH) {
    return { pattern: 'layer-based', confidence: layerCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium' };
  }

  // Check for Feature-based
  const featureCount = hasIndicators(allDirs, FEATURE_INDICATORS);
  if (featureCount >= 1) {
    return { pattern: 'feature-based', confidence: 'medium' };
  }

  // Check for component-based
  if (allDirs.includes('components')) {
    return { pattern: 'component-based', confidence: 'medium' };
  }

  // Flat structure
  if (topLevelDirs.length < FLAT_STRUCTURE_THRESHOLD) {
    return { pattern: 'flat', confidence: 'low' };
  }

  return { pattern: 'unknown', confidence: 'low' };
}

/**
 * Check for special directories
 */
function checkSpecialDirs(dirs: string[]): SpecialDirectories {
  return {
    hasComponents: dirs.includes('components'),
    hasPages: dirs.includes('pages'),
    hasApp: dirs.includes('app'),
    hasApi: dirs.includes('api'),
    hasLib: dirs.includes('lib'),
    hasUtils: dirs.includes('utils') || dirs.includes('helpers'),
    hasHooks: dirs.includes('hooks'),
    hasServices: dirs.includes('services'),
    hasTypes: dirs.includes('types') || dirs.includes('interfaces'),
    hasTests: dirs.includes('__tests__') || dirs.includes('tests') || dirs.includes('test'),
  };
}

/**
 * Calculate approximate folder depth
 */
async function calculateDepth(cwd: string, maxDepth: number = DEFAULT_MAX_DEPTH): Promise<number> {
  let maxFound = 0;

  async function walk(dir: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;
    maxFound = Math.max(maxFound, currentDepth);

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(path.join(dir, entry.name), currentDepth + 1);
        }
      }
    } catch (error: unknown) {
      debug('folder-structure failed', { error: String(error) });
    }
  }

  await walk(cwd, 0);
  return maxFound;
}

/**
 * Analyze the folder structure of a project
 */
export async function analyzeFolderStructure(cwd: string): Promise<FolderStructure> {
  const allTopLevelDirs = await getSubdirs(cwd);
  const topLevelDirs = allTopLevelDirs.filter(
    (d) => !d.startsWith('.') && d !== 'node_modules' && d !== 'dist' && d !== 'build',
  );

  const srcPath = path.join(cwd, 'src');
  const srcDir = await fileExists(srcPath) ? 'src' : null;
  const srcDirs = srcDir ? await getSubdirs(srcPath) : [];

  const { pattern, confidence } = await detectPattern(cwd, topLevelDirs, srcDirs);
  const allDirs = [...topLevelDirs, ...srcDirs];
  const specialDirs = checkSpecialDirs(allDirs);
  const depth = await calculateDepth(cwd);

  return {
    pattern,
    confidence,
    topLevelDirs,
    srcDir,
    specialDirs,
    depth,
  };
}

/**
 * Get human-readable pattern name
 */
function getPatternName(pattern: ArchitecturePattern): string {
  const names: Record<ArchitecturePattern, string> = {
    'next-app-router': 'Next.js App Router',
    'next-pages-router': 'Next.js Pages Router',
    'feature-based': 'Feature-based / Module-based',
    'layer-based': 'Layer-based (MVC-like)',
    'domain-driven': 'Domain-Driven Design',
    'atomic-design': 'Atomic Design',
    'component-based': 'Component-based',
    flat: 'Flat structure',
    unknown: 'Unknown',
  };
  return names[pattern] || pattern;
}

/**
 * Format folder structure for display
 */
export function formatFolderStructure(structure: FolderStructure): string | null {
  const sections: string[] = [];

  const patternName = getPatternName(structure.pattern);
  sections.push(`**Architecture:** ${patternName} (${structure.confidence} confidence)`);

  const keyDirs: string[] = [];
  const special = structure.specialDirs;

  if (special.hasApp) keyDirs.push('app/');
  if (special.hasPages) keyDirs.push('pages/');
  if (special.hasComponents) keyDirs.push('components/');
  if (special.hasLib) keyDirs.push('lib/');
  if (special.hasServices) keyDirs.push('services/');
  if (special.hasHooks) keyDirs.push('hooks/');
  if (special.hasApi) keyDirs.push('api/');

  if (keyDirs.length > 0) {
    sections.push(`**Key Dirs:** ${keyDirs.join(', ')}`);
  }

  if (structure.srcDir) {
    sections.push(`**Source:** Uses \`${structure.srcDir}/\` directory`);
  }

  return sections.join('\n');
}
