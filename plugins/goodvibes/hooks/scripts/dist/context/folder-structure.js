/**
 * Folder Structure Analyzer
 *
 * Detects the architecture pattern used in the project.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared/logging.js';
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
function getSubdirs(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase());
    }
    catch (error) {
        debug('folder-structure failed', { error: String(error) });
        return [];
    }
}
/**
 * Check if any indicators are present
 */
function hasIndicators(dirs, indicators) {
    return dirs.filter((d) => indicators.includes(d)).length;
}
/**
 * Detect the architecture pattern
 */
function detectPattern(cwd, topLevelDirs, srcDirs) {
    const allDirs = [...topLevelDirs, ...srcDirs];
    // Check for Next.js App Router
    if (topLevelDirs.includes('app') || srcDirs.includes('app')) {
        const appPath = topLevelDirs.includes('app')
            ? path.join(cwd, 'app')
            : path.join(cwd, 'src', 'app');
        if (fs.existsSync(appPath)) {
            const appContents = getSubdirs(appPath);
            if (appContents.some((d) => d.startsWith('(') || d === 'api')) {
                return { pattern: 'next-app-router', confidence: 'high' };
            }
            try {
                const files = fs.readdirSync(appPath);
                if (files.some((f) => f.startsWith('page.') || f.startsWith('layout.'))) {
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
        hasTests: dirs.includes('__tests__') || dirs.includes('tests') || dirs.includes('test'),
    };
}
/**
 * Calculate approximate folder depth
 */
function calculateDepth(cwd, maxDepth = DEFAULT_MAX_DEPTH) {
    let maxFound = 0;
    function walk(dir, currentDepth) {
        if (currentDepth > maxDepth)
            return;
        maxFound = Math.max(maxFound, currentDepth);
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    walk(path.join(dir, entry.name), currentDepth + 1);
                }
            }
        }
        catch (error) {
            debug('folder-structure failed', { error: String(error) });
        }
    }
    walk(cwd, 0);
    return maxFound;
}
/**
 * Analyze the folder structure of a project
 */
export async function analyzeFolderStructure(cwd) {
    const topLevelDirs = getSubdirs(cwd).filter((d) => !d.startsWith('.') && d !== 'node_modules' && d !== 'dist' && d !== 'build');
    const srcPath = path.join(cwd, 'src');
    const srcDir = fs.existsSync(srcPath) ? 'src' : null;
    const srcDirs = srcDir ? getSubdirs(srcPath) : [];
    const { pattern, confidence } = detectPattern(cwd, topLevelDirs, srcDirs);
    const allDirs = [...topLevelDirs, ...srcDirs];
    const specialDirs = checkSpecialDirs(allDirs);
    const depth = calculateDepth(cwd);
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
function getPatternName(pattern) {
    const names = {
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
export function formatFolderStructure(structure) {
    const sections = [];
    const patternName = getPatternName(structure.pattern);
    sections.push(`**Architecture:** ${patternName} (${structure.confidence} confidence)`);
    const keyDirs = [];
    const special = structure.specialDirs;
    if (special.hasApp)
        keyDirs.push('app/');
    if (special.hasPages)
        keyDirs.push('pages/');
    if (special.hasComponents)
        keyDirs.push('components/');
    if (special.hasLib)
        keyDirs.push('lib/');
    if (special.hasServices)
        keyDirs.push('services/');
    if (special.hasHooks)
        keyDirs.push('hooks/');
    if (special.hasApi)
        keyDirs.push('api/');
    if (keyDirs.length > 0) {
        sections.push(`**Key Dirs:** ${keyDirs.join(', ')}`);
    }
    if (structure.srcDir) {
        sections.push(`**Source:** Uses \`${structure.srcDir}/\` directory`);
    }
    return sections.join('\n');
}
