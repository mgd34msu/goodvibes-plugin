/**
 * TODO Scanner
 *
 * Scans source files for TODO, FIXME, BUG, HACK, and XXX comments.
 */
import * as fs from 'fs';
import * as path from 'path';
const TODO_PATTERNS = ['FIXME', 'BUG', 'TODO', 'HACK', 'XXX'];
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const SKIP_DIRS = ['node_modules', 'dist', '.git', 'coverage', '.goodvibes', '__tests__', 'test', 'tests'];
/** Default maximum number of TODOs to return. */
const DEFAULT_TODO_LIMIT = 10;
/** Maximum text length to display in formatted output. */
const MAX_TODO_TEXT_LENGTH = 60;
/**
 * Recursively get all files matching the extensions
 */
function getFiles(dir, extensions, skipDirs) {
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!skipDirs.includes(entry.name)) {
                    files.push(...getFiles(fullPath, extensions, skipDirs));
                }
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }
    catch (_error) {
        // Skip directories we can't read (permission errors, etc.)
    }
    return files;
}
/**
 * Scan a single file for TODO patterns
 */
function scanFile(filePath, patterns) {
    const results = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of patterns) {
                // Match pattern followed by colon (e.g., "TODO:", "FIXME:")
                const regex = new RegExp(`\\b${pattern}:`, 'i');
                if (regex.test(line)) {
                    results.push({
                        type: pattern,
                        file: filePath,
                        line: i + 1,
                        text: line.trim(),
                    });
                    break; // Only count each line once
                }
            }
        }
    }
    catch (_error) {
        // Skip files we can't read
    }
    return results;
}
/** Scan project for TODO, FIXME, BUG, HACK, XXX comments. */
export function scanTodos(cwd, limit = DEFAULT_TODO_LIMIT) {
    const results = [];
    const files = getFiles(cwd, FILE_EXTENSIONS, SKIP_DIRS);
    for (const file of files) {
        if (results.length >= limit)
            break;
        const relativePath = path.relative(cwd, file).replace(/\\/g, '/');
        const todos = scanFile(file, TODO_PATTERNS);
        for (const todo of todos) {
            if (results.length >= limit)
                break;
            results.push({
                ...todo,
                file: relativePath,
            });
        }
    }
    return results;
}
/** Format TODO items for display in context output. */
export function formatTodos(todos) {
    if (todos.length === 0)
        return '';
    const lines = ['TODOs in code:'];
    for (const todo of todos) {
        lines.push(`- ${todo.type}: ${todo.file}:${todo.line} - ${todo.text.slice(0, MAX_TODO_TEXT_LENGTH)}`);
    }
    return lines.join('\n');
}
