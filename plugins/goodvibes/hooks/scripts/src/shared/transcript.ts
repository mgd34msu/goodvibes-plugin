/**
 * Transcript Parsing
 *
 * Utilities for parsing Claude Code transcript files.
 */

import * as fs from 'fs/promises';

import { debug } from './logging.js';

/** Maximum length for transcript summary text. */
const TRANSCRIPT_SUMMARY_MAX_LENGTH = 500;

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
 * debug('Tools:', data.toolsUsed); // ['Bash', 'Edit', 'Write']
 * debug('Files:', data.filesModified); // ['/src/index.ts']
 * debug('Summary:', data.summary); // 'I have completed the changes...'
 */
export async function parseTranscript(
  transcriptPath: string
): Promise<TranscriptData> {
  const toolsUsed = new Set<string>();
  const filesModified: string[] = [];
  let lastAssistantMessage = '';

  try {
    const content = await fs.readFile(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const event: unknown = JSON.parse(line);
        if (typeof event !== 'object' || event === null) {
          continue;
        }

        const eventObj = event as Record<string, unknown>;

        if (eventObj.type === 'tool_use' && typeof eventObj.name === 'string') {
          toolsUsed.add(eventObj.name);
          if (['Write', 'Edit'].includes(eventObj.name)) {
            const input = eventObj.input as Record<string, unknown> | undefined;
            if (input?.file_path && typeof input.file_path === 'string') {
              filesModified.push(input.file_path);
            }
          }
        }

        if (eventObj.role === 'assistant' && eventObj.content) {
          lastAssistantMessage =
            typeof eventObj.content === 'string'
              ? eventObj.content
              : JSON.stringify(eventObj.content);
        }
      } catch (error: unknown) {
        debug('parseTranscript line parse failed', { error: String(error) });
      }
    }
  } catch (error: unknown) {
    debug('parseTranscript read failed', { error: String(error) });
  }

  return {
    toolsUsed: Array.from(toolsUsed),
    filesModified: [...new Set(filesModified)],
    summary: lastAssistantMessage.slice(0, TRANSCRIPT_SUMMARY_MAX_LENGTH),
  };
}
