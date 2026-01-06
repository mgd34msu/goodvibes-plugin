/**
 * TODO Scanner
 *
 * Scans source files for TODO, FIXME, BUG, HACK, and XXX comments.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';
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
async function getFiles(dir, extensions, skipDirs) {
    const files = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!skipDirs.includes(entry.name)) {
                    files.push(...await getFiles(fullPath, extensions, skipDirs));
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
    catch (error) {
        // Skip directories we can't read (permission errors, etc.)
        // Intentionally silent - this is expected for permission-denied directories
        debug('Directory scan skipped', { error: String(error) });
    }
    return files;
}
/**
 * Scan a single file for TODO patterns
 */
async function scanFile(filePath, patterns) {
    const results = [];
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of patterns) {
                // Match pattern followed by colon (e.g., "T0D0:", "F1XME:")
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
    catch (error) {
        // Skip files we can't read
        // Intentionally silent - this is expected for permission-denied files
        debug('File scan skipped', { error: String(error) });
    }
    return results;
}
/** Scan project for TODO, FIXME, BUG, HACK, XXX comments. */
export async function scanTodos(cwd, limit = DEFAULT_TODO_LIMIT) {
    const results = [];
    const files = await getFiles(cwd, FILE_EXTENSIONS, SKIP_DIRS);
    for (const file of files) {
        if (results.length >= limit)
            break;
        const relativePath = path.relative(cwd, file).replace(/\\/g, '/');
        const todos = await scanFile(file, TODO_PATTERNS);
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
