/**
 * Generic memory file parser - consolidates duplicate parsing logic.
 */
/**
 * Configuration for parsing a memory file section.
 */
export interface SectionParser<T> {
    /**
     * The primary field name that appears as the section heading.
     * For decisions, this is "title"; for patterns, it's "name", etc.
     */
    primaryField: keyof T;
    /**
     * Map of field names to their parsing strategy.
     * - 'inline': Field value is on the same line after the marker (e.g., "**Date:** 2024-01-04")
     * - 'text': Multi-line text that accumulates until the next section
     * - 'list': Bulleted list items that start with "- "
     * - 'code': Code block that may span multiple lines (between ``` markers)
     */
    fields: {
        [K in keyof Partial<T>]: 'inline' | 'text' | 'list' | 'code';
    };
    /**
     * Optional validation function to check if a parsed entry is valid.
     * Return true if the entry should be included, false to skip it.
     */
    validate?: (_entry: Partial<T>) => boolean;
    /**
     * Optional transformation function to convert the parsed object to the final type.
     * This allows for type coercion, default values, and field cleanup.
     */
    transform?: (_entry: Partial<T>) => T;
}
/**
 * Generic memory file parser that reads and parses markdown-based memory files.
 *
 * This function consolidates the duplicate parsing logic found across all memory modules.
 * Each memory type (decisions, patterns, failures, preferences) follows the same structure:
 * - Sections separated by "## " headings
 * - Structured fields marked with "**FieldName:**"
 * - Support for inline values, multi-line text, lists, and code blocks
 *
 * @param filePath - Absolute path to the memory file
 * @param parser - Configuration object defining how to parse each field
 * @returns Promise resolving to array of parsed objects
 *
 * @example
 * // Parse decisions file
 * const decisions = await parseMemoryFile<MemoryDecision>(
 *   '/path/to/decisions.md',
 *   {
 *     primaryField: 'title',
 *     fields: {
 *       date: 'inline',
 *       agent: 'inline',
 *       alternatives: 'list',
 *       rationale: 'text',
 *       context: 'text'
 *     },
 *     validate: (entry) => !!(entry.title && entry.date && entry.rationale),
 *     transform: (entry) => ({
 *       title: entry.title!,
 *       date: entry.date!,
 *       alternatives: entry.alternatives || [],
 *       rationale: entry.rationale!,
 *       agent: entry.agent,
 *       context: entry.context
 *     })
 *   }
 * );
 */
export declare function parseMemoryFile<T>(filePath: string, parser: SectionParser<T>): Promise<T[]>;
/**
 * Parses memory file content (useful for testing without file I/O).
 *
 * @param content - The markdown content to parse
 * @param parser - Configuration object defining how to parse each field
 * @returns Array of parsed objects
 */
export declare function parseMemoryContent<T>(content: string, parser: SectionParser<T>): T[];
/**
 * Creates a memory file with a header if it doesn't exist.
 *
 * @param filePath - Absolute path to the memory file
 * @param header - Markdown header content to write
 * @returns A promise that resolves when the file is created or already exists
 */
export declare function ensureMemoryFile(filePath: string, header: string): Promise<void>;
/**
 * Appends an entry to a memory file.
 *
 * @param filePath - Absolute path to the memory file
 * @param entry - Formatted markdown entry to append
 * @returns A promise that resolves when the entry is appended
 */
export declare function appendMemoryEntry(filePath: string, entry: string): Promise<void>;
