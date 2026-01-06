/**
 * TODO Scanner
 *
 * Scans source files for TODO, FIXME, BUG, HACK, and XXX comments.
 */
/** A TODO comment found in source code. */
export interface TodoItem {
    type: string;
    file: string;
    line: number;
    text: string;
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
export declare function scanTodos(cwd: string, limit?: number): Promise<TodoItem[]>;
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
export declare function formatTodos(todos: TodoItem[]): string;
