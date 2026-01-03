/**
 * TODO Scanner
 *
 * Scans source files for TODO, FIXME, HACK, and similar comments.
 */
import * as fs from 'fs';
import * as path from 'path';
const SCAN_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.vue', '.svelte', '.py', '.rb', '.go', '.rs',
    '.java', '.kt', '.swift', '.cs', '.php',
    '.css', '.scss', '.sass', '.less',
]);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out',
    '.next', '.nuxt', '.svelte-kit', 'coverage',
    '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target',
]);
const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\b[:\s]*(.+?)(?:\*\/|-->|$)/gi;
/**
 * Determine priority based on type and text
 */
function getPriority(type, text) {
    const upperType = type.toUpperCase();
    const lowerText = text.toLowerCase();
    if (upperType === 'FIXME' || upperType === 'BUG')
        return 'high';
    if (lowerText.includes('urgent') || lowerText.includes('critical') || lowerText.includes('important')) {
        return 'high';
    }
    if (lowerText.includes('security') || lowerText.includes('vulnerability'))
        return 'high';
    if (upperType === 'NOTE')
        return 'low';
    if (lowerText.includes('maybe') || lowerText.includes('consider') || lowerText.includes('nice to have')) {
        return 'low';
    }
    return 'medium';
}
/**
 * Scan a single file for TODOs
 */
function scanFile(filePath, relativePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const items = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            TODO_PATTERN.lastIndex = 0;
            let match;
            while ((match = TODO_PATTERN.exec(line)) !== null) {
                const type = match[1].toUpperCase();
                const text = match[2].trim();
                if (text.length < 3)
                    continue;
                items.push({
                    type,
                    text: text.slice(0, 100),
                    file: relativePath,
                    line: i + 1,
                    priority: getPriority(type, text),
                });
            }
        }
        return items;
    }
    catch {
        return [];
    }
}
/**
 * Recursively scan directory for TODOs
 */
function scanDirectory(dir, baseDir, items, maxFiles = 500) {
    if (items.length >= maxFiles * 10)
        return;
    let filesScanned = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (filesScanned >= maxFiles)
                break;
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) {
                    scanDirectory(fullPath, baseDir, items, maxFiles - filesScanned);
                }
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (SCAN_EXTENSIONS.has(ext)) {
                    filesScanned++;
                    const fileItems = scanFile(fullPath, relativePath);
                    items.push(...fileItems);
                }
            }
        }
    }
    catch {
        // Ignore directory read errors
    }
}
/**
 * Scan project for TODO comments
 */
export async function scanTodos(cwd) {
    const items = [];
    scanDirectory(cwd, cwd, items);
    const byType = {};
    const byFile = {};
    for (const item of items) {
        byType[item.type] = (byType[item.type] || 0) + 1;
        byFile[item.file] = (byFile[item.file] || 0) + 1;
    }
    items.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0)
            return priorityDiff;
        const typeOrder = { BUG: 0, FIXME: 1, HACK: 2, TODO: 3, XXX: 4, NOTE: 5 };
        return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
    });
    return {
        items: items.slice(0, 50),
        totalCount: items.length,
        byType,
        byFile,
    };
}
/**
 * Format TODO scan results for display
 */
export function formatTodos(result) {
    if (result.totalCount === 0) {
        return null;
    }
    const sections = [];
    const typeSummary = Object.entries(result.byType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
    sections.push(`**Code TODOs:** ${result.totalCount} total (${typeSummary})`);
    const highPriority = result.items.filter((i) => i.priority === 'high').slice(0, 5);
    if (highPriority.length > 0) {
        const lines = highPriority.map((i) => `- **${i.type}** in \`${i.file}:${i.line}\`: ${i.text}`);
        sections.push(`**High Priority:**\n${lines.join('\n')}`);
    }
    const otherItems = result.items.filter((i) => i.priority !== 'high').slice(0, 3);
    if (otherItems.length > 0 && highPriority.length < 5) {
        const lines = otherItems.map((i) => `- ${i.type} in \`${i.file}:${i.line}\`: ${i.text}`);
        sections.push(`**Other:**\n${lines.join('\n')}`);
    }
    return sections.join('\n\n');
}
