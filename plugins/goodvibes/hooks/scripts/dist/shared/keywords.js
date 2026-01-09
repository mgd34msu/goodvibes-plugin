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
import keywordData from './keywords-data.json' with { type: 'json' };
// =============================================================================
// Stack Detection Keywords (for tech stack identification)
// =============================================================================
/**
 * Keyword categories optimized for tech stack detection.
 * Used by shared.ts for extractKeywords() and stack detection.
 */
export const STACK_KEYWORD_CATEGORIES = keywordData.stackKeywords;
// =============================================================================
// Transcript Classification Keywords (for task/content analysis)
// =============================================================================
/**
 * Keyword categories optimized for transcript and task classification.
 * More comprehensive coverage for understanding what tasks are about.
 */
export const TRANSCRIPT_KEYWORD_CATEGORIES = keywordData.transcriptKeywords;
// =============================================================================
// Unified Access
// =============================================================================
/**
 * Default keyword categories - uses stack detection keywords.
 * This is the primary export for backwards compatibility with shared.ts.
 */
export const KEYWORD_CATEGORIES = STACK_KEYWORD_CATEGORIES;
/**
 * Flat list of all stack detection keywords.
 */
export const ALL_STACK_KEYWORDS = Object.values(STACK_KEYWORD_CATEGORIES).flat();
/**
 * Flat list of all transcript classification keywords.
 */
export const ALL_TRANSCRIPT_KEYWORDS = Object.values(TRANSCRIPT_KEYWORD_CATEGORIES).flat();
/**
 * Combined flat list of all unique keywords from both categories.
 */
export const ALL_KEYWORDS = [
    ...new Set([...ALL_STACK_KEYWORDS, ...ALL_TRANSCRIPT_KEYWORDS]),
];
// =============================================================================
// Pre-compiled Regex Maps (Performance Optimization)
// =============================================================================
/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Pre-compiled regex patterns for stack keywords.
 * Created at module initialization to avoid repeated regex compilation.
 */
const STACK_KEYWORD_REGEX_MAP = new Map(ALL_STACK_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i'),
]));
/**
 * Pre-compiled regex patterns for transcript keywords.
 * Created at module initialization to avoid repeated regex compilation.
 */
const TRANSCRIPT_KEYWORD_REGEX_MAP = new Map(ALL_TRANSCRIPT_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i'),
]));
// =============================================================================
// Utility Functions
// =============================================================================
/** Maximum number of keywords to extract from text. */
const MAX_EXTRACTED_KEYWORDS = 50;
/**
 * Extract known keywords from text using stack detection categories.
 * Uses pre-compiled regex patterns for performance.
 *
 * @param text - Text to search for keywords
 * @returns Array of found keywords (max 50)
 */
export function extractStackKeywords(text) {
    const found = new Set();
    const lowerText = text.toLowerCase();
    for (const keyword of ALL_STACK_KEYWORDS) {
        if (STACK_KEYWORD_REGEX_MAP.get(keyword)?.test(lowerText)) {
            found.add(keyword);
        }
    }
    return Array.from(found).slice(0, MAX_EXTRACTED_KEYWORDS);
}
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
export function extractTranscriptKeywords(taskDescription, transcriptContent, agentType) {
    const keywords = new Set();
    const searchText = [
        taskDescription ?? '',
        transcriptContent ?? '',
        agentType ?? '',
    ]
        .join(' ')
        .toLowerCase();
    // Check for each keyword category using pre-compiled regex patterns
    for (const [category, categoryKeywords] of Object.entries(TRANSCRIPT_KEYWORD_CATEGORIES)) {
        for (const keyword of categoryKeywords) {
            // Use pre-compiled regex pattern for performance
            if (TRANSCRIPT_KEYWORD_REGEX_MAP.get(keyword)?.test(searchText)) {
                keywords.add(keyword);
                // Also add the category as a meta-keyword
                keywords.add('category:' + category);
            }
        }
    }
    // Add agent type as keyword if it's a known type
    if (agentType) {
        const agentKeyword = agentType
            .replace(/^goodvibes:/, '')
            .replace(/-/g, ' ');
        keywords.add('agent:' + agentKeyword);
    }
    return Array.from(keywords).sort();
}
