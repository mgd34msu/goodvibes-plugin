/**
 * Keyword Categories
 *
 * Consolidated keyword definitions used for:
 * - Tech stack detection (shared.ts)
 * - Transcript classification (telemetry/transcript.ts)
 * - Task categorization
 *
 * This is the single authoritative source for keyword categories.
 * Keyword data is stored in keywords-data.json for maintainability.
 */
/**
 * Keyword categories optimized for tech stack detection.
 * Used by shared.ts for extractKeywords() and stack detection.
 */
export declare const STACK_KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Keyword categories optimized for transcript and task classification.
 * More comprehensive coverage for understanding what tasks are about.
 */
export declare const TRANSCRIPT_KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Default keyword categories - uses stack detection keywords.
 * This is the primary export for backwards compatibility with shared.ts.
 */
export declare const KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Flat list of all stack detection keywords.
 */
export declare const ALL_STACK_KEYWORDS: string[];
/**
 * Flat list of all transcript classification keywords.
 */
export declare const ALL_TRANSCRIPT_KEYWORDS: string[];
/**
 * Combined flat list of all unique keywords from both categories.
 */
export declare const ALL_KEYWORDS: string[];
/**
 * Extract known keywords from text using stack detection categories.
 * Uses pre-compiled regex patterns for performance.
 *
 * @param text - Text to search for keywords
 * @returns Array of found keywords (max 50)
 */
export declare function extractStackKeywords(text: string): string[];
/**
 * Extract keywords from text with category metadata.
 * Used for transcript classification.
 * Uses pre-compiled regex patterns for performance.
 *
 * @param taskDescription - Optional task description
 * @param transcriptContent - Optional transcript content
 * @param agentType - Optional agent type
 * @returns Array of keywords including category meta-keywords
 */
export declare function extractTranscriptKeywords(taskDescription?: string, transcriptContent?: string, agentType?: string): string[];
