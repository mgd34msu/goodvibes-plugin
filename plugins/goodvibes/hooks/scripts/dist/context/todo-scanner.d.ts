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
/** Scan project for TODO, FIXME, BUG, HACK, XXX comments. */
export declare function scanTodos(cwd: string, limit?: number): Promise<TodoItem[]>;
/** Format TODO items for display in context output. */
export declare function formatTodos(todos: TodoItem[]): string;
