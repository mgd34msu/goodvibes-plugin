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
/** Keyword categories for classifying agent tasks and transcript content. */
export declare const KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Parse a transcript file to extract useful information
 */
export declare function parseTranscript(transcriptPath: string): ParsedTranscript;
/**
 * Extract keywords from task description and transcript content
 */
export declare function extractKeywords(taskDescription?: string, transcriptContent?: string, agentType?: string): string[];
