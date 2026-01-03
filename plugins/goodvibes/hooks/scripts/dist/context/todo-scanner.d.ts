/**
 * TODO Scanner
 *
 * Scans source files for TODO, FIXME, HACK, and similar comments.
 */
export interface TodoItem {
    type: 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'BUG' | 'NOTE';
    text: string;
    file: string;
    line: number;
    priority: 'high' | 'medium' | 'low';
}
export interface TodoScanResult {
    items: TodoItem[];
    totalCount: number;
    byType: Record<string, number>;
    byFile: Record<string, number>;
}
/**
 * Scan project for TODO comments
 */
export declare function scanTodos(cwd: string): Promise<TodoScanResult>;
/**
 * Format TODO scan results for display
 */
export declare function formatTodos(result: TodoScanResult): string | null;
