/**
 * Folder Analyzer
 *
 * Analyzes folder structure to detect architecture patterns.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * Check if a file or directory exists (async).
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/** Analyze folder structure to detect architecture patterns. */
export async function analyzeFolderStructure(cwd) {
    const hasSrcDir = await fileExists(path.join(cwd, 'src'));
    const srcDir = hasSrcDir ? 'src' : '.';
    const srcPath = path.join(cwd, srcDir);
    // Detect architecture pattern
    let pattern = 'unknown';
    if (await fileExists(path.join(srcPath, 'features'))) {
        pattern = 'feature-based';
    }
    else if (await fileExists(path.join(srcPath, 'modules'))) {
        pattern = 'module-based';
    }
    else {
        const [hasComponents, hasHooks, hasUtils] = await Promise.all([
            fileExists(path.join(srcPath, 'components')),
            fileExists(path.join(srcPath, 'hooks')),
            fileExists(path.join(srcPath, 'utils')),
        ]);
        if (hasComponents && hasHooks && hasUtils) {
            pattern = 'layer-based';
        }
    }
    // Detect routing
    let routing = null;
    if (await fileExists(path.join(srcPath, 'app'))) {
        routing = 'App Router';
    }
    else if (await fileExists(path.join(srcPath, 'pages'))) {
        routing = 'Pages Router';
    }
    // Check for API layer
    const [hasApiInSrc, hasServerInSrc, hasApiRoot] = await Promise.all([
        fileExists(path.join(srcPath, 'api')),
        fileExists(path.join(srcPath, 'server')),
        fileExists(path.join(cwd, 'api')),
    ]);
    const hasApi = hasApiInSrc || hasServerInSrc || hasApiRoot;
    return { srcDir, pattern, routing, hasApi };
}
/** Format folder analysis for display in context output. */
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
