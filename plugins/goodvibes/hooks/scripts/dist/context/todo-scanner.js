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
const SKIP_DIRS = [
    'node_modules',
    'dist',
    '.git',
    'coverage',
    '.goodvibes',
    '__tests__',
    'test',
    'tests',
];
/**
 * Default maximum number of TODOs to return.
 * Limits the number of TODO items to prevent overwhelming output.
 */
const DEFAULT_TODO_LIMIT = 10;
/**
 * Maximum text length to display in formatted output.
 * Truncates long TODO comments for readability.
 */
const MAX_TODO_TEXT_LENGTH = 60;
/**
 * Recursively get all files matching the extensions.
 * Scans the directory tree while skipping common build/dependency folders.
 *
 * @param dir - The directory path to scan
 * @param extensions - Array of file extensions to include (e.g., ['.ts', '.tsx'])
 * @param skipDirs - Array of directory names to skip
 * @returns Promise resolving to array of file paths
 */
async function getFiles(dir, extensions, skipDirs) {
    const files = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!skipDirs.includes(entry.name)) {
                    files.push(...(await getFiles(fullPath, extensions, skipDirs)));
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
 * Scan a single file for TODO patterns.
 * Searches for TODO, FIXME, BUG, HACK, and XXX comments.
 *
 * @param filePath - The file path to scan
 * @param patterns - Array of patterns to search for (e.g., ['TODO', 'FIXME'])
 * @returns Promise resolving to array of TodoItem objects found in the file
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
/**
 * Scan project for TODO, FIXME, BUG, HACK, XXX comments.
 * Recursively searches TypeScript and JavaScript files for TODO-style comments.
 *
 * @param cwd - The current working directory (project root)
 * @param limit - Maximum number of TODO items to return (default: 10)
 * @returns Promise resolving to array of TodoItem objects
 *
 * @example
 * const todos = await scanTodos('/my-project');
 * const highPriority = todos.filter(t => t.type === 'FIXME' || t.type === 'BUG');
 */
export async function scanTodos(cwd, limit = DEFAULT_TODO_LIMIT) {
    const results = [];
    const files = await getFiles(cwd, FILE_EXTENSIONS, SKIP_DIRS);
    for (const file of files) {
        if (results.length >= limit) {
            break;
        }
        const relativePath = path.relative(cwd, file).replace(/\\/g, '/');
        const todos = await scanFile(file, TODO_PATTERNS);
        for (const todo of todos) {
            if (results.length >= limit) {
                break;
            }
            results.push({
                ...todo,
                file: relativePath,
            });
        }
    }
    return results;
}
/**
 * Format TODO items for display in context output.
 * Creates a list of TODO comments with file location and truncated text.
 *
 * @param todos - Array of TodoItem objects to format
 * @returns Formatted string with TODO list, or empty string if no TODOs
 *
 * @example
 * const formatted = formatTodos(todos);
 * // Returns: "TODOs in code:\n- FIXME: src/utils.ts:42 - Fix edge case handling..."
 */
export function formatTodos(todos) {
    if (todos.length === 0) {
        return '';
    }
    const lines = ['TODOs in code:'];
    for (const todo of todos) {
        lines.push(`- ${todo.type}: ${todo.file}:${todo.line} - ${todo.text.slice(0, MAX_TODO_TEXT_LENGTH)}`);
    }
    return lines.join('\n');
}
