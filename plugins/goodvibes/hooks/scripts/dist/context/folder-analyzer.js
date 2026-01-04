/**
 * Folder Analyzer
 *
 * Analyzes folder structure to detect architecture patterns.
 */
import * as fs from 'fs';
import * as path from 'path';
/** Analyze folder structure to detect architecture patterns. */
export function analyzeFolderStructure(cwd) {
    const srcDir = fs.existsSync(path.join(cwd, 'src')) ? 'src' : '.';
    const srcPath = path.join(cwd, srcDir);
    // Detect architecture pattern
    let pattern = 'unknown';
    if (fs.existsSync(path.join(srcPath, 'features'))) {
        pattern = 'feature-based';
    }
    else if (fs.existsSync(path.join(srcPath, 'modules'))) {
        pattern = 'module-based';
    }
    else if (fs.existsSync(path.join(srcPath, 'components')) &&
        fs.existsSync(path.join(srcPath, 'hooks')) &&
        fs.existsSync(path.join(srcPath, 'utils'))) {
        pattern = 'layer-based';
    }
    // Detect routing
    let routing = null;
    if (fs.existsSync(path.join(srcPath, 'app'))) {
        routing = 'App Router';
    }
    else if (fs.existsSync(path.join(srcPath, 'pages'))) {
        routing = 'Pages Router';
    }
    // Check for API layer
    const hasApi = fs.existsSync(path.join(srcPath, 'api')) ||
        fs.existsSync(path.join(srcPath, 'server')) ||
        fs.existsSync(path.join(cwd, 'api'));
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
