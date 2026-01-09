/**
 * Folder Analyzer
 *
 * Analyzes folder structure to detect architecture patterns.
 */
import * as path from 'path';
import { fileExists } from '../shared/file-utils.js';
/**
 * Analyze folder structure to detect architecture patterns.
 * Identifies project organization patterns like feature-based, layer-based, and routing type.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to FolderAnalysis with structure details
 *
 * @example
 * const analysis = await analyzeFolderStructure('/my-project');
 * if (analysis.routing === 'App Router') {
 *   debug('Using Next.js App Router');
 * }
 */
export async function analyzeFolderStructure(cwd) {
    const hasSrcDir = await fileExists(path.join(cwd, 'src'));
    const srcDir = hasSrcDir ? 'src' : '.';
    const srcPath = path.join(cwd, srcDir);
    // Parallelize all file existence checks
    const [hasFeatures, hasModules, hasComponents, hasHooks, hasUtils, hasApp, hasPages, hasApiInSrc, hasServerInSrc, hasApiRoot,] = await Promise.all([
        fileExists(path.join(srcPath, 'features')),
        fileExists(path.join(srcPath, 'modules')),
        fileExists(path.join(srcPath, 'components')),
        fileExists(path.join(srcPath, 'hooks')),
        fileExists(path.join(srcPath, 'utils')),
        fileExists(path.join(srcPath, 'app')),
        fileExists(path.join(srcPath, 'pages')),
        fileExists(path.join(srcPath, 'api')),
        fileExists(path.join(srcPath, 'server')),
        fileExists(path.join(cwd, 'api')),
    ]);
    // Detect architecture pattern
    let pattern = 'unknown';
    if (hasFeatures) {
        pattern = 'feature-based';
    }
    else if (hasModules) {
        pattern = 'module-based';
    }
    else if (hasComponents && hasHooks && hasUtils) {
        pattern = 'layer-based';
    }
    // Detect routing
    let routing = null;
    if (hasApp) {
        routing = 'App Router';
    }
    else if (hasPages) {
        routing = 'Pages Router';
    }
    // Check for API layer
    const hasApi = hasApiInSrc || hasServerInSrc || hasApiRoot;
    return { srcDir, pattern, routing, hasApi };
}
/**
 * Format folder analysis for display in context output.
 * Creates a concise summary of the project structure and architecture.
 *
 * @param analysis - The FolderAnalysis object to format
 * @returns Formatted string with structure pattern, routing type, and API presence
 *
 * @example
 * const formatted = formatFolderAnalysis(analysis);
 * // Returns: "Structure: feature-based, App Router, has API layer"
 */
export function formatFolderAnalysis(analysis) {
    const parts = [];
    if (analysis.pattern !== 'unknown') {
        parts.push(`Structure: ${analysis.pattern}`);
    }
    if (analysis.routing) {
        parts.push(analysis.routing);
    }
    if (analysis.hasApi) {
        parts.push('has API layer');
    }
    return parts.length > 0 ? parts.join(', ') : '';
}
