/**
 * Tests for transcript parsing utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TranscriptData } from '../../shared/transcript.js';

// Mock fs/promises module
const mockReadFile = vi.fn();

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

// Mock logging module
const mockDebug = vi.fn();

vi.mock('../../shared/logging.js', () => ({
  debug: mockDebug,
}));

describe('transcript utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseTranscript', () => {
    it('should parse transcript with tools used and files modified', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/index.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } }),
        JSON.stringify({ role: 'assistant', content: 'I have completed the changes' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toContain('Bash');
      expect(result.toolsUsed).toContain('Write');
      expect(result.toolsUsed).toContain('Edit');
      expect(result.filesModified).toContain('/src/index.ts');
      expect(result.filesModified).toContain('/src/app.ts');
      expect(result.summary).toBe('I have completed the changes');
    });

    it('should handle empty transcript file', async () => {
      mockReadFile.mockResolvedValue('');

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/empty.jsonl');

      expect(result.toolsUsed).toEqual([]);
      expect(result.filesModified).toEqual([]);
      expect(result.summary).toBe('');
    });

    it('should handle file read error', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT: file not found'));

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/nonexistent.jsonl');

      expect(result.toolsUsed).toEqual([]);
      expect(result.filesModified).toEqual([]);
      expect(result.summary).toBe('');
      expect(mockDebug).toHaveBeenCalledWith(
        'parseTranscript read failed',
        expect.objectContaining({
          error: expect.stringContaining('ENOENT'),
        })
      );
    });

    it('should handle invalid JSON lines gracefully', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
        'invalid json line',
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/test.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toContain('Bash');
      expect(result.toolsUsed).toContain('Write');
      expect(result.filesModified).toContain('/src/test.ts');
      expect(mockDebug).toHaveBeenCalledWith(
        'parseTranscript line parse failed',
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('should deduplicate tools used', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'pwd' } }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'cat' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual(['Bash']);
    });

    it('should deduplicate files modified', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/index.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/index.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/index.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/index.ts']);
    });

    it('should only track Write and Edit tools for filesModified', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Read', input: { file_path: '/src/read.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/write.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/edit.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/write.ts', '/src/edit.ts']);
      expect(result.filesModified).not.toContain('/src/read.ts');
    });

    it('should ignore Write/Edit tools without file_path', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Write', input: {} }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { old_string: 'test' } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/valid.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/valid.ts']);
    });

    it('should capture last assistant message with string content', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: 'First message' }),
        JSON.stringify({ role: 'assistant', content: 'Second message' }),
        JSON.stringify({ role: 'assistant', content: 'Final message' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('Final message');
    });

    it('should handle assistant message with object content', async () => {
      const contentObject = { type: 'text', text: 'Message content' };
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: contentObject }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe(JSON.stringify(contentObject));
    });

    it('should truncate summary to 500 characters', async () => {
      const longMessage = 'a'.repeat(1000);
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: longMessage }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary.length).toBe(500);
      expect(result.summary).toBe(longMessage.slice(0, 500));
    });

    it('should handle transcript with only whitespace lines', async () => {
      const transcriptContent = '\n\n  \n\t\n\n';

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual([]);
      expect(result.filesModified).toEqual([]);
      expect(result.summary).toBe('');
    });

    it('should handle events without type field', async () => {
      const transcriptContent = [
        JSON.stringify({ name: 'Bash' }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/test.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual(['Write']);
      expect(result.filesModified).toEqual(['/src/test.ts']);
    });

    it('should handle events without role field', async () => {
      const transcriptContent = [
        JSON.stringify({ content: 'Some content' }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual(['Bash']);
      expect(result.summary).toBe('');
    });

    it('should handle assistant messages without content field', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant' }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('');
    });

    it('should handle mixed valid and invalid lines', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
        'not json',
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/test.ts' } }),
        '{broken json',
        JSON.stringify({ role: 'assistant', content: 'Final summary' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual(['Bash', 'Write']);
      expect(result.filesModified).toEqual(['/src/test.ts']);
      expect(result.summary).toBe('Final summary');
      expect(mockDebug).toHaveBeenCalledTimes(2);
    });

    it('should handle tool_use events without name field', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', input: { file_path: '/src/test.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual(['Bash']);
    });

    it('should handle empty string content in assistant messages', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: '' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('');
    });

    it('should handle null content in assistant messages', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: null }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('');
    });

    it('should handle numeric content in assistant messages', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: 12345 }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('12345');
    });

    it('should handle boolean content in assistant messages', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: true }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('true');
    });

    it('should handle array content in assistant messages', async () => {
      const contentArray = ['item1', 'item2', 'item3'];
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: contentArray }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe(JSON.stringify(contentArray));
    });

    it('should handle complex nested object content', async () => {
      const complexContent = {
        nested: {
          data: {
            values: [1, 2, 3],
            text: 'test',
          },
        },
      };
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: complexContent }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe(JSON.stringify(complexContent));
    });

    it('should handle multiple file modifications in single Edit event', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/a.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/b.ts' } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/c.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/a.ts', '/src/b.ts', '/src/c.ts']);
    });

    it('should handle Write tool with file_path set to empty string', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '' } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/valid.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/valid.ts']);
    });

    it('should handle transcript with user messages', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'user', content: 'Please do something' }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
        JSON.stringify({ role: 'assistant', content: 'Done' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual(['Bash']);
      expect(result.summary).toBe('Done');
    });

    it('should handle exactly 500 character summary', async () => {
      const exactMessage = 'a'.repeat(500);
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: exactMessage }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary.length).toBe(500);
      expect(result.summary).toBe(exactMessage);
    });

    it('should handle summary shorter than 500 characters', async () => {
      const shortMessage = 'Short message';
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: shortMessage }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe(shortMessage);
    });

    it('should handle file read error with non-Error object', async () => {
      mockReadFile.mockRejectedValue('string error');

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toEqual([]);
      expect(result.filesModified).toEqual([]);
      expect(result.summary).toBe('');
      expect(mockDebug).toHaveBeenCalledWith(
        'parseTranscript read failed',
        expect.objectContaining({
          error: 'string error',
        })
      );
    });

    it('should handle JSON parse error with non-Error object', async () => {
      const transcriptContent = [
        'not valid json at all',
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(mockDebug).toHaveBeenCalledWith(
        'parseTranscript line parse failed',
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('should handle Write tool with null file_path', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: null } }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/valid.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/valid.ts']);
    });

    it('should handle Edit tool with undefined file_path', async () => {
      const transcriptContent = [
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: undefined } }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/valid.ts' } }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.filesModified).toEqual(['/src/valid.ts']);
    });

    it('should handle multiple assistant messages and keep only the last one', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'assistant', content: 'First' }),
        JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }),
        JSON.stringify({ role: 'assistant', content: 'Second' }),
        JSON.stringify({ type: 'tool_use', name: 'Read', input: { file_path: '/test' } }),
        JSON.stringify({ role: 'assistant', content: 'Third and final' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.summary).toBe('Third and final');
    });

    it('should handle real-world transcript format', async () => {
      const transcriptContent = [
        JSON.stringify({ role: 'user', content: 'Please update the config' }),
        JSON.stringify({ type: 'tool_use', name: 'Read', input: { file_path: '/config.json' } }),
        JSON.stringify({ type: 'tool_result', content: '{"key": "value"}' }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/config.json', old_string: '"key": "value"', new_string: '"key": "newvalue"' } }),
        JSON.stringify({ type: 'tool_result', content: 'Success' }),
        JSON.stringify({ role: 'assistant', content: 'I have updated the config file as requested.' }),
      ].join('\n');

      mockReadFile.mockResolvedValue(transcriptContent);

      const { parseTranscript } = await import('../../shared/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.toolsUsed).toContain('Read');
      expect(result.toolsUsed).toContain('Edit');
      expect(result.filesModified).toEqual(['/config.json']);
      expect(result.summary).toBe('I have updated the config file as requested.');
    });
  });
});
