/**
 * Transcript Parsing
 *
 * Provides transcript parsing, keyword extraction, and content analysis.
 */
import * as fs from 'fs/promises';
import { debug, logError } from '../shared.js';
import { TRANSCRIPT_KEYWORD_CATEGORIES, extractTranscriptKeywords, } from '../shared/keywords.js';
// ============================================================================
// File System Helpers
// ============================================================================
/**
 * Check if a file exists (async replacement for existsSync)
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
// ============================================================================
// Constants
// ============================================================================
/** Maximum length for truncated output text. */
export const MAX_OUTPUT_LENGTH = 500;
/** Regex patterns for detecting tool usage in plain text lines. */
const TOOL_PATTERNS = [
    /using\s+(\w+)\s+tool/i,
    /calling\s+(\w+)/i,
    /<tool_use\s+name="(\w+)"/i,
    /invoke\s+name="(\w+)"/i,
];
// ============================================================================
// Keyword Categories (Re-export from consolidated module)
// ============================================================================
/**
 * Keyword categories for classifying agent tasks and transcript content.
 * Re-exported from the consolidated keywords module for backwards compatibility.
 */
export const KEYWORD_CATEGORIES = TRANSCRIPT_KEYWORD_CATEGORIES;
// ============================================================================
// Transcript Parsing
// ============================================================================
/**
 * Parse a transcript file to extract useful information
 */
export async function parseTranscript(transcriptPath) {
    const result = {
        files_modified: [],
        tools_used: [],
        error_count: 0,
        success_indicators: [],
    };
    if (!transcriptPath || !(await fileExists(transcriptPath))) {
        debug('Transcript file not found: ' + transcriptPath);
        return result;
    }
    try {
        const content = await fs.readFile(transcriptPath, 'utf-8');
        // Try to parse as JSONL (each line is a JSON object)
        const lines = content.split('\n').filter(line => line.trim());
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                processTranscriptEntry(entry, result);
            }
            catch (parseError) {
                // Not JSON, try to parse as plain text
                debug('Line not JSON, parsing as plain text');
                processPlainTextLine(line, result);
            }
        }
        // Extract final output (last assistant message)
        const lastOutput = extractLastOutput(content);
        if (lastOutput) {
            result.final_output = lastOutput;
        }
    }
    catch (error) {
        logError('parseTranscript', error);
    }
    // Deduplicate arrays
    result.files_modified = [...new Set(result.files_modified)];
    result.tools_used = [...new Set(result.tools_used)];
    result.success_indicators = [...new Set(result.success_indicators)];
    return result;
}
/**
 * Process a single transcript entry (JSON format)
 */
function processTranscriptEntry(entry, result) {
    // Check for tool usage
    if (entry.type === 'tool_use' || entry.tool_name || entry.name) {
        const toolName = (entry.tool_name || entry.name);
        if (toolName) {
            result.tools_used.push(toolName);
            // Check for file modifications
            if (toolName === 'Write' || toolName === 'Edit' || toolName === 'write_file' || toolName === 'edit_file') {
                const input = entry.tool_input || entry.input || entry.parameters;
                if (input && typeof input === 'object') {
                    const inputObj = input;
                    const filePath = inputObj.file_path || inputObj.path || inputObj.file;
                    if (typeof filePath === 'string') {
                        result.files_modified.push(filePath);
                    }
                }
            }
        }
    }
    // Check for errors
    if (entry.type === 'error' || entry.error) {
        result.error_count++;
    }
    // Check for success indicators
    const text = String(entry.content || entry.text || entry.message || '').toLowerCase();
    if (text.includes('successfully') || text.includes('completed') || text.includes('done')) {
        result.success_indicators.push(text.substring(0, 100));
    }
}
/**
 * Process a plain text line from transcript
 */
function processPlainTextLine(line, result) {
    const lowerLine = line.toLowerCase();
    // Look for tool usage patterns
    for (const pattern of TOOL_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
            result.tools_used.push(match[1]);
        }
    }
    // Look for file paths being modified
    const filePatterns = [
        /(?:writing|editing|creating|modifying)\s+["']?([^\s"']+\.[a-z]{1,4})["']?/i,
        /file[_\s]path["']?\s*[:=]\s*["']([^"']+)["']/i,
    ];
    for (const pattern of filePatterns) {
        const match = line.match(pattern);
        if (match) {
            result.files_modified.push(match[1]);
        }
    }
    // Count errors
    if (lowerLine.includes('error:') || lowerLine.includes('failed:') || lowerLine.includes('exception')) {
        result.error_count++;
    }
}
/**
 * Extract the last assistant output from transcript
 */
function extractLastOutput(content) {
    // Try to find the last assistant message in various formats
    const patterns = [
        /"role"\s*:\s*"assistant"[^}]*"content"\s*:\s*"([^"]+)"/g,
        /Assistant:\s*(.+?)(?=\n\n|Human:|$)/gs,
    ];
    let lastOutput;
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            lastOutput = match[1];
        }
    }
    // Truncate if too long
    if (lastOutput && lastOutput.length > MAX_OUTPUT_LENGTH) {
        lastOutput = lastOutput.substring(0, MAX_OUTPUT_LENGTH) + '...';
    }
    return lastOutput;
}
// ============================================================================
// Keyword Extraction
// ============================================================================
/**
 * Extract keywords from task description and transcript content.
 * Delegates to the consolidated keywords module.
 */
export function extractKeywords(taskDescription, transcriptContent, agentType) {
    return extractTranscriptKeywords(taskDescription, transcriptContent, agentType);
}
