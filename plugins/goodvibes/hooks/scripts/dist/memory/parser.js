/**
 * Generic memory file parser - consolidates duplicate parsing logic.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileExists } from '../shared/file-utils.js';
import { debug } from '../shared/logging.js';
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
export async function parseMemoryFile(filePath, parser) {
    if (!(await fileExists(filePath))) {
        return [];
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return parseMemoryContent(content, parser);
}
/**
 * Parses memory file content (useful for testing without file I/O).
 *
 * @param content - The markdown content to parse
 * @param parser - Configuration object defining how to parse each field
 * @returns Array of parsed objects
 */
export function parseMemoryContent(content, parser) {
    const results = [];
    const blocks = content.split(/\n## /).slice(1); // Skip header
    for (const block of blocks) {
        try {
            const entry = parseBlock(block, parser);
            // Validate entry if validator provided
            const isValid = parser.validate ? parser.validate(entry) : true;
            if (isValid) {
                // Transform entry if transformer provided
                const finalEntry = parser.transform
                    ? parser.transform(entry)
                    : entry;
                results.push(finalEntry);
            }
        }
        catch (error) {
            debug('Skipping malformed memory entry', {
                error: String(error),
                block: block.substring(0, 100),
            });
            continue;
        }
    }
    return results;
}
/** Handles code block markers and returns whether to continue to next line. */
function handleCodeBlockMarker(line, entry, state, parser) {
    if (!line.startsWith('```')) {
        return false;
    }
    state.inCodeBlock = !state.inCodeBlock;
    if (state.currentSection && parser.fields[state.currentSection] === 'code') {
        state.codeContent += line + '\n';
    }
    if (!state.inCodeBlock && state.currentSection) {
        entry[state.currentSection] = state.codeContent.trim();
        state.codeContent = '';
        state.currentSection = null;
    }
    return true;
}
/** Handles code block content accumulation. */
function handleCodeBlockContent(line, state, parser) {
    if (!state.inCodeBlock || !state.currentSection) {
        return false;
    }
    if (parser.fields[state.currentSection] === 'code') {
        state.codeContent += line + '\n';
        return true;
    }
    return false;
}
/** Handles field marker lines (e.g., **Date:** value). */
function handleFieldMarker(line, entry, state, parser) {
    const fieldMatch = line.match(/^\*\*([^:]+):\*\*(.*)$/);
    if (!fieldMatch) {
        return false;
    }
    const fieldName = fieldMatch[1].toLowerCase().trim();
    const fieldValue = fieldMatch[2].trim();
    const matchingField = Object.keys(parser.fields).find((key) => key.toLowerCase() === fieldName);
    if (!matchingField) {
        return true;
    }
    const fieldType = parser.fields[matchingField];
    if (fieldType === 'inline') {
        entry[matchingField] = fieldValue;
    }
    else {
        state.currentSection = matchingField;
        if (fieldType === 'code') {
            state.codeContent = '';
        }
    }
    return true;
}
/** Handles list item content. */
function handleListContent(line, entry, currentSection) {
    const listValue = line.replace('- ', '').trim();
    const currentValue = entry[currentSection];
    if (Array.isArray(currentValue)) {
        currentValue.push(listValue);
    }
    else {
        entry[currentSection] = [listValue];
    }
}
/** Handles multi-line text content. */
function handleTextContent(line, entry, currentSection) {
    const textValue = line.trim() + ' ';
    const currentValue = entry[currentSection];
    if (typeof currentValue === 'string') {
        entry[currentSection] = (currentValue + textValue);
    }
    else {
        entry[currentSection] = textValue;
    }
}
/** Processes content based on current section type. */
function handleSectionContent(line, entry, state, parser) {
    if (!state.currentSection) {
        return;
    }
    const fieldType = parser.fields[state.currentSection];
    if (fieldType === 'list' && line.startsWith('- ')) {
        handleListContent(line, entry, state.currentSection);
    }
    else if (fieldType === 'text' && line.trim()) {
        handleTextContent(line, entry, state.currentSection);
    }
}
/** Trims all string values in the entry. */
function trimStringFields(entry) {
    for (const field of Object.keys(entry)) {
        const value = entry[field];
        if (typeof value === 'string') {
            entry[field] = value.trim();
        }
    }
}
/**
 * Parses a single block (section) from the memory file.
 */
function parseBlock(block, parser) {
    const lines = block.split('\n');
    const entry = {};
    const primaryValue = lines[0]?.trim() || '';
    entry[parser.primaryField] = primaryValue;
    const state = {
        currentSection: null,
        inCodeBlock: false,
        codeContent: '',
    };
    for (const line of lines.slice(1)) {
        if (!state.inCodeBlock && line.trim() === '---') {
            continue;
        }
        if (handleCodeBlockMarker(line, entry, state, parser)) {
            continue;
        }
        if (handleCodeBlockContent(line, state, parser)) {
            continue;
        }
        if (handleFieldMarker(line, entry, state, parser)) {
            continue;
        }
        handleSectionContent(line, entry, state, parser);
    }
    trimStringFields(entry);
    return entry;
}
/**
 * Creates a memory file with a header if it doesn't exist.
 *
 * @param filePath - Absolute path to the memory file
 * @param header - Markdown header content to write
 * @returns A promise that resolves when the file is created or already exists
 */
export async function ensureMemoryFile(filePath, header) {
    if (!(await fileExists(filePath))) {
        const dir = path.dirname(filePath);
        if (!(await fileExists(dir))) {
            await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(filePath, header);
    }
}
/**
 * Appends an entry to a memory file.
 *
 * @param filePath - Absolute path to the memory file
 * @param entry - Formatted markdown entry to append
 * @returns A promise that resolves when the entry is appended
 */
export async function appendMemoryEntry(filePath, entry) {
    await fs.appendFile(filePath, entry);
}
