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
 * Default keyword categories for tech stack detection.
 *
 * This is the primary export for backwards compatibility with shared.ts.
 * Alias for STACK_KEYWORD_CATEGORIES.
 *
 * @see {@link STACK_KEYWORD_CATEGORIES}
 */
export declare const KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Flat array of all stack detection keywords.
 *
 * Contains all keywords from all categories in STACK_KEYWORD_CATEGORIES,
 * useful for iterating over all keywords without category grouping.
 */
export declare const ALL_STACK_KEYWORDS: string[];
/**
 * Flat array of all transcript classification keywords.
 *
 * Contains all keywords from all categories in TRANSCRIPT_KEYWORD_CATEGORIES,
 * useful for comprehensive text analysis.
 */
export declare const ALL_TRANSCRIPT_KEYWORDS: string[];
/**
 * Combined flat array of all unique keywords from both categories.
 *
 * Deduplicates keywords that appear in both stack and transcript categories.
 */
export declare const ALL_KEYWORDS: string[];
/**
 * Extracts known keywords from text using stack detection categories.
 *
 * Uses pre-compiled regex patterns for performance. Scans the input text
 * for all keywords in STACK_KEYWORD_CATEGORIES and returns matches.
 *
 * @param text - Text to search for keywords
 * @returns Array of found keywords (max 50), deduplicated
 *
 * @example
 * const keywords = extractStackKeywords('Using React with TypeScript and Prisma');
 * // => ['react', 'typescript', 'prisma']
 */
export declare function extractStackKeywords(text: string): string[];
/**
 * Extracts keywords from text with category metadata for transcript classification.
 *
 * Scans the combined input text for keywords and adds category meta-keywords
 * (e.g., 'category:frontend') when matches are found. Also adds agent type
 * as a meta-keyword if provided.
 *
 * Uses pre-compiled regex patterns for performance.
 *
 * @param taskDescription - Optional task description to analyze
 * @param transcriptContent - Optional transcript content to analyze
 * @param agentType - Optional agent type (e.g., 'goodvibes:frontend-architect')
 * @returns Sorted array of keywords including 'category:*' and 'agent:*' meta-keywords
 *
 * @example
 * const keywords = extractTranscriptKeywords('Build a React component', '', 'goodvibes:frontend-architect');
 * // => ['agent:frontend architect', 'category:frontend', 'react']
 */
export declare function extractTranscriptKeywords(taskDescription?: string, transcriptContent?: string, agentType?: string): string[];
