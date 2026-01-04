/**
 * Transcript Parsing
 *
 * Utilities for parsing Claude Code transcript files.
 */
/** Parsed transcript data containing tools used and files modified. */
export interface TranscriptData {
    toolsUsed: string[];
    filesModified: string[];
    summary: string;
}
/**
 * Parses a Claude Code transcript file to extract tools used and files modified.
 *
 * Reads the JSONL transcript file and extracts:
 * - All unique tool names that were used
 * - All file paths that were modified (via Write or Edit tools)
 * - A summary from the last assistant message (truncated to 500 chars)
 *
 * @param transcriptPath - The absolute path to the transcript JSONL file
 * @returns Promise resolving to a TranscriptData object with toolsUsed, filesModified, and summary
 *
 * @example
 * const data = await parseTranscript('/path/to/transcript.jsonl');
 * console.log('Tools:', data.toolsUsed); // ['Bash', 'Edit', 'Write']
 * console.log('Files:', data.filesModified); // ['/src/index.ts']
 * console.log('Summary:', data.summary); // 'I have completed the changes...'
 */
export declare function parseTranscript(transcriptPath: string): Promise<TranscriptData>;
