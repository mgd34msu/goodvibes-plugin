/**
 * Folder Structure Analyzer
 *
 * Detects the architecture pattern used in the project.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileExists } from '../shared/file-utils.js';
import { debug } from '../shared/logging.js';
import { PATTERN_NAMES } from '../types/folder-structure.js';
import { LAYER_INDICATORS, FEATURE_INDICATORS, ATOMIC_INDICATORS, DDD_INDICATORS, MIN_INDICATOR_MATCH, HIGH_CONFIDENCE_THRESHOLD, DEFAULT_MAX_DEPTH, FLAT_STRUCTURE_THRESHOLD, } from './folder-structure-constants.js';
/**
 * Get immediate subdirectories of a path.
 * Only returns directories, not files, and converts names to lowercase.
 *
 * @param dirPath - The directory path to scan
 * @returns Promise resolving to an array of lowercase subdirectory names
 */
async function getSubdirs(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name.toLowerCase());
    }
    catch (error) {
        debug('folder-structure failed', { error: String(error) });
        return [];
    }
}
/**
 * Check if any indicators are present.
 * Counts how many indicator directories exist in the given directory list.
 *
 * @param dirs - Array of directory names to check
 * @param indicators - Array of indicator patterns to look for
 * @returns Count of matching indicators found
 */
function hasIndicators(dirs, indicators) {
    return dirs.filter((dir) => indicators.includes(dir)).length;
}
/**
 * Detect the architecture pattern.
 * Analyzes directory structure to determine the architecture pattern used in the project.
 *
 * @param cwd - The current working directory (project root)
 * @param topLevelDirs - Array of top-level directory names
 * @param srcDirs - Array of subdirectories within src/ if it exists
 * @returns Promise resolving to an object with pattern name and confidence level
 */
async function detectPattern(cwd, topLevelDirs, srcDirs) {
    const allDirs = [...topLevelDirs, ...srcDirs];
    // Check for Next.js App Router
    if (topLevelDirs.includes('app') || srcDirs.includes('app')) {
        const appPath = topLevelDirs.includes('app')
            ? path.join(cwd, 'app')
            : path.join(cwd, 'src', 'app');
        if (await fileExists(appPath)) {
            const appContents = await getSubdirs(appPath);
            if (appContents.some((dir) => dir.startsWith('(') || dir === 'api')) {
                return { pattern: 'next-app-router', confidence: 'high' };
            }
            try {
                const files = await fs.readdir(appPath);
                if (files.some((file) => file.startsWith('page.') || file.startsWith('layout.'))) {
                    return { pattern: 'next-app-router', confidence: 'high' };
                }
            }
            catch (error) {
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
        return {
            pattern: 'atomic-design',
            confidence: atomicCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium',
        };
    }
    // Check for Domain-Driven Design
    const dddCount = hasIndicators(allDirs, DDD_INDICATORS);
    if (dddCount >= MIN_INDICATOR_MATCH) {
        return {
            pattern: 'domain-driven',
            confidence: dddCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium',
        };
    }
    // Check for Layer-based
    const layerCount = hasIndicators(allDirs, LAYER_INDICATORS);
    if (layerCount >= MIN_INDICATOR_MATCH) {
        return {
            pattern: 'layer-based',
            confidence: layerCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium',
        };
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
 * Check for special directories.
 * Identifies presence of commonly used directories like components, pages, hooks, etc.
 *
 * @param dirs - Array of directory names to check
 * @returns Object with boolean flags for each special directory type
 */
function checkSpecialDirs(dirs) {
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
        hasTests: dirs.includes('__tests__') ||
            dirs.includes('tests') ||
            dirs.includes('test'),
    };
}
/**
 * Calculate approximate folder depth.
 * Recursively walks the directory tree to find the maximum nesting level.
 *
 * @param cwd - The current working directory (project root)
 * @param maxDepth - Maximum depth to traverse (default: 5)
 * @returns Promise resolving to the maximum folder depth found
 */
async function calculateDepth(cwd, maxDepth = DEFAULT_MAX_DEPTH) {
    let maxFound = 0;
    async function walk(dir, currentDepth) {
        if (currentDepth > maxDepth) {
            return;
        }
        maxFound = Math.max(maxFound, currentDepth);
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() &&
                    !entry.name.startsWith('.') &&
                    entry.name !== 'node_modules') {
                    await walk(path.join(dir, entry.name), currentDepth + 1);
                }
            }
        }
        catch (error) {
            debug('folder-structure failed', { error: String(error) });
        }
    }
    await walk(cwd, 0);
    return maxFound;
}
/**
 * Analyze the folder structure of a project.
 * Performs comprehensive analysis to detect architecture pattern, special directories, and folder depth.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a FolderStructure object with pattern, confidence, and directory information
 *
 * @example
 * const structure = await analyzeFolderStructure('/my-next-app');
 * if (structure.pattern === 'next-app-router') {
 *   console.log('Next.js App Router detected');
 * }
 */
export async function analyzeFolderStructure(cwd) {
    const allTopLevelDirs = await getSubdirs(cwd);
    const topLevelDirs = allTopLevelDirs.filter((d) => !d.startsWith('.') &&
        d !== 'node_modules' &&
        d !== 'dist' &&
        d !== 'build');
    const srcPath = path.join(cwd, 'src');
    const srcDir = (await fileExists(srcPath)) ? 'src' : null;
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
 * Get human-readable pattern name.
 * Converts architecture pattern enum to a display-friendly string.
 *
 * @param pattern - The architecture pattern to format
 * @returns Human-readable name for the pattern
 */
function getPatternName(pattern) {
    return PATTERN_NAMES[pattern] || pattern;
}
/**
 * Format folder structure for display.
 * Generates a human-readable summary of the project architecture.
 *
 * @param structure - The FolderStructure object to format
 * @returns Formatted string with architecture pattern and key directories, or null if no data
 *
 * @example
 * const formatted = formatFolderStructure(structure);
 * // Returns: "Architecture: Next.js App Router (high confidence)\nKey Dirs: app/, components/, lib/"
 */
export function formatFolderStructure(structure) {
    const sections = [];
    const patternName = getPatternName(structure.pattern);
    sections.push(`**Architecture:** ${patternName} (${structure.confidence} confidence)`);
    const keyDirs = [];
    const special = structure.specialDirs;
    if (special.hasApp) {
        keyDirs.push('app/');
    }
    if (special.hasPages) {
        keyDirs.push('pages/');
    }
    if (special.hasComponents) {
        keyDirs.push('components/');
    }
    if (special.hasLib) {
        keyDirs.push('lib/');
    }
    if (special.hasServices) {
        keyDirs.push('services/');
    }
    if (special.hasHooks) {
        keyDirs.push('hooks/');
    }
    if (special.hasApi) {
        keyDirs.push('api/');
    }
    if (keyDirs.length > 0) {
        sections.push(`**Key Dirs:** ${keyDirs.join(', ')}`);
    }
    if (structure.srcDir) {
        sections.push(`**Source:** Uses \`${structure.srcDir}/\` directory`);
    }
    return sections.join('\n');
}
