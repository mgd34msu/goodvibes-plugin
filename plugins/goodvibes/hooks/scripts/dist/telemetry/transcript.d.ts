/**
 * Transcript Parsing
 *
 * Provides transcript parsing, keyword extraction, and content analysis.
 */
/** Maximum length for truncated output text. */
export declare const MAX_OUTPUT_LENGTH = 500;
/** Parsed transcript data extracted from session logs. */
export interface ParsedTranscript {
    files_modified: string[];
    tools_used: string[];
    final_output?: string;
    error_count: number;
    success_indicators: string[];
}
/**
 * Keyword categories for classifying agent tasks and transcript content.
 * Re-exported from the consolidated keywords module for backwards compatibility.
 */
export declare const KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Parses a transcript file to extract useful information.
 * Handles both JSON and plain text formats.
 *
 * @param transcriptPath - Path to the transcript file
 * @returns Promise resolving to ParsedTranscript with extracted data
 *
 * @example
 * const transcript = await parseTranscript('/path/to/transcript.jsonl');
 * console.log(`Modified ${transcript.files_modified.length} files`);
 */
export declare function parseTranscript(transcriptPath: string): Promise<ParsedTranscript>;
/**
 * Extract keywords from task description and transcript content.
 * Delegates to the consolidated keywords module.
 */
export declare function extractKeywords(taskDescription?: string, transcriptContent?: string, agentType?: string): string[];
