/**
 * Tests for telemetry/transcript.ts
 *
 * Achieves 100% line and branch coverage for transcript parsing utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

// Mock shared/index.js
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockFileExists = vi.fn();

vi.mock('../../shared/index.js', () => ({
  debug: mockDebug,
  logError: mockLogError,
  fileExists: mockFileExists,
}));

// Mock shared/keywords.js
const mockExtractTranscriptKeywords = vi.fn();
vi.mock('../../shared/keywords.js', () => ({
  TRANSCRIPT_KEYWORD_CATEGORIES: {
    testing: ['vitest', 'jest'],
    frameworks: ['react', 'vue'],
  },
  extractTranscriptKeywords: mockExtractTranscriptKeywords,
}));

describe('telemetry/transcript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exports', () => {
    it('should export MAX_OUTPUT_LENGTH constant', async () => {
      const { MAX_OUTPUT_LENGTH } = await import('../../telemetry/transcript.js');
      expect(MAX_OUTPUT_LENGTH).toBe(500);
    });

    it('should export KEYWORD_CATEGORIES from shared keywords module', async () => {
      const { KEYWORD_CATEGORIES } = await import('../../telemetry/transcript.js');
      expect(KEYWORD_CATEGORIES).toBeDefined();
      expect(KEYWORD_CATEGORIES.testing).toContain('vitest');
    });
  });

  describe('parseTranscript', () => {
    describe('path validation', () => {
      it('should return empty result for empty path', async () => {
        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('');

        expect(result).toEqual({
          files_modified: [],
          tools_used: [],
          error_count: 0,
          success_indicators: [],
        });
        expect(mockDebug).toHaveBeenCalledWith('Transcript file not found: ');
      });

      it('should return empty result when file does not exist', async () => {
        mockFileExists.mockResolvedValue(false);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/nonexistent/path.jsonl');

        expect(result).toEqual({
          files_modified: [],
          tools_used: [],
          error_count: 0,
          success_indicators: [],
        });
        expect(mockDebug).toHaveBeenCalledWith('Transcript file not found: /nonexistent/path.jsonl');
      });
    });

    describe('JSONL parsing', () => {
      it('should parse valid JSON lines and extract tool usage', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = [
          JSON.stringify({ type: 'tool_use', tool_name: 'Bash' }),
          JSON.stringify({ type: 'tool_use', name: 'Write', tool_input: { file_path: '/src/test.ts' } }),
        ].join('\n');
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.tools_used).toContain('Bash');
        expect(result.tools_used).toContain('Write');
        expect(result.files_modified).toContain('/src/test.ts');
      });

      it('should fall back to plain text parsing for non-JSON lines', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = 'using Bash tool to run commands';
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(mockDebug).toHaveBeenCalledWith('Line not JSON, parsing as plain text');
        expect(result.tools_used).toContain('Bash');
      });

      it('should skip empty lines', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = '\n\n  \n';
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.tools_used).toEqual([]);
      });
    });

    describe('error handling', () => {
      it('should handle file read errors gracefully', async () => {
        mockFileExists.mockResolvedValue(true);
        mockReadFile.mockRejectedValue(new Error('ENOENT: file not found'));

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(mockLogError).toHaveBeenCalledWith('parseTranscript', expect.any(Error));
        expect(result).toEqual({
          files_modified: [],
          tools_used: [],
          error_count: 0,
          success_indicators: [],
        });
      });
    });

    describe('deduplication', () => {
      it('should deduplicate files_modified', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = [
          JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/test.ts' } }),
          JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/test.ts' } }),
        ].join('\n');
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.files_modified).toEqual(['/src/test.ts']);
      });

      it('should deduplicate tools_used', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = [
          JSON.stringify({ type: 'tool_use', name: 'Bash' }),
          JSON.stringify({ type: 'tool_use', name: 'Bash' }),
        ].join('\n');
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.tools_used).toEqual(['Bash']);
      });

      it('should deduplicate success_indicators', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = [
          JSON.stringify({ content: 'Task completed successfully' }),
          JSON.stringify({ content: 'Task completed successfully' }),
        ].join('\n');
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.success_indicators.length).toBe(1);
      });
    });

    describe('final output extraction', () => {
      it('should extract final output from JSON format', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = '{"role":"assistant","content":"This is the final output"}';
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.final_output).toBe('This is the final output');
      });

      it('should extract final output from Assistant: format', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = 'Assistant: This is the assistant response\n\nHuman: Next message';
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.final_output).toBe('This is the assistant response');
      });

      it('should truncate final output longer than MAX_OUTPUT_LENGTH', async () => {
        mockFileExists.mockResolvedValue(true);
        const longContent = 'a'.repeat(600);
        const content = `{"role":"assistant","content":"${longContent}"}`;
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.final_output).toBe('a'.repeat(500) + '...');
        expect(result.final_output?.length).toBe(503);
      });

      it('should return undefined when no output is found', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = JSON.stringify({ type: 'tool_use', name: 'Bash' });
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.final_output).toBeUndefined();
      });

      it('should use the last assistant message when multiple exist', async () => {
        mockFileExists.mockResolvedValue(true);
        const content = [
          '{"role":"assistant","content":"First message"}',
          '{"role":"assistant","content":"Second message"}',
          '{"role":"assistant","content":"Final message"}',
        ].join('\n');
        mockReadFile.mockResolvedValue(content);

        const { parseTranscript } = await import('../../telemetry/transcript.js');
        const result = await parseTranscript('/path/to/transcript.jsonl');

        expect(result.final_output).toBe('Final message');
      });
    });
  });

  describe('processToolUsage (via parseTranscript)', () => {
    beforeEach(() => {
      mockFileExists.mockResolvedValue(true);
    });

    it('should skip entries that are not tool_use', async () => {
      const content = JSON.stringify({ type: 'message', content: 'hello' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toEqual([]);
    });

    it('should detect tool_use by type field', async () => {
      const content = JSON.stringify({ type: 'tool_use', name: 'Read' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Read');
    });

    it('should detect tool_use by tool_name field', async () => {
      const content = JSON.stringify({ tool_name: 'Grep' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Grep');
    });

    it('should detect tool_use by name field alone', async () => {
      const content = JSON.stringify({ name: 'Glob' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Glob');
    });

    it('should skip entries with tool indicators but no tool name', async () => {
      const content = JSON.stringify({ type: 'tool_use' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toEqual([]);
    });

    it('should track Write tool file modifications', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        tool_input: { file_path: '/src/new-file.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/src/new-file.ts');
    });

    it('should track Edit tool file modifications', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Edit',
        input: { path: '/src/edited.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/src/edited.ts');
    });

    it('should track write_file tool file modifications', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'write_file',
        parameters: { file: '/src/written.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/src/written.ts');
    });

    it('should track edit_file tool file modifications', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'edit_file',
        tool_input: { file_path: '/src/edit-file.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/src/edit-file.ts');
    });

    it('should not add file path when file modification tool has no path', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        input: {},
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toEqual([]);
    });
  });

  describe('extractFilePathFromEntry (via parseTranscript)', () => {
    beforeEach(() => {
      mockFileExists.mockResolvedValue(true);
    });

    it('should return null when input is missing', async () => {
      const content = JSON.stringify({ type: 'tool_use', name: 'Write' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toEqual([]);
    });

    it('should return null when input is not an object', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        input: 'not an object',
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toEqual([]);
    });

    it('should extract file_path from input', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        input: { file_path: '/via/file_path.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/via/file_path.ts');
    });

    it('should extract path from input when file_path is missing', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Edit',
        input: { path: '/via/path.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/via/path.ts');
    });

    it('should extract file from input when file_path and path are missing', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        input: { file: '/via/file.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/via/file.ts');
    });

    it('should return null when file path is not a string', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        input: { file_path: 123 },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toEqual([]);
    });
  });

  describe('processErrors (via parseTranscript)', () => {
    beforeEach(() => {
      mockFileExists.mockResolvedValue(true);
    });

    it('should count entries with type error', async () => {
      const content = [
        JSON.stringify({ type: 'error', message: 'Something went wrong' }),
        JSON.stringify({ type: 'error', message: 'Another error' }),
      ].join('\n');
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.error_count).toBe(2);
    });

    it('should count entries with error property', async () => {
      const content = JSON.stringify({ error: 'Something failed' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.error_count).toBe(1);
    });
  });

  describe('processSuccessIndicators (via parseTranscript)', () => {
    beforeEach(() => {
      mockFileExists.mockResolvedValue(true);
    });

    it('should detect "successfully" in content', async () => {
      const content = JSON.stringify({ content: 'Task was successfully completed' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.success_indicators.length).toBe(1);
      expect(result.success_indicators[0]).toContain('successfully');
    });

    it('should detect "completed" in text', async () => {
      const content = JSON.stringify({ text: 'Operation completed' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.success_indicators.length).toBe(1);
    });

    it('should detect "done" in message', async () => {
      const content = JSON.stringify({ message: 'All done!' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.success_indicators.length).toBe(1);
    });

    it('should truncate success indicators to 100 characters', async () => {
      const longText = 'successfully ' + 'x'.repeat(200);
      const content = JSON.stringify({ content: longText });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.success_indicators[0].length).toBe(100);
    });

    it('should not add indicator when no success keywords found', async () => {
      const content = JSON.stringify({ content: 'Just a regular message' });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.success_indicators).toEqual([]);
    });
  });

  describe('processPlainTextLine (via parseTranscript)', () => {
    beforeEach(() => {
      mockFileExists.mockResolvedValue(true);
    });

    it('should match "using X tool" pattern', async () => {
      const content = 'I am using Read tool to view the file';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Read');
    });

    it('should match "calling X" pattern', async () => {
      const content = 'Now calling Write to save the file';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Write');
    });

    it('should match <tool_use name="X" pattern', async () => {
      const content = '<tool_use name="Glob" param="value">';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Glob');
    });

    it('should match invoke name="X" pattern', async () => {
      const content = '<invoke name="Grep">';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Grep');
    });

    it('should match writing/editing/creating/modifying file pattern', async () => {
      const content = 'writing "test.txt" to disk';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('test.txt');
    });

    it('should match file_path assignment pattern', async () => {
      const content = 'file_path: "/src/config.json"';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/src/config.json');
    });

    it('should count "error:" in plain text', async () => {
      const content = 'error: something went wrong';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.error_count).toBe(1);
    });

    it('should count "failed:" in plain text', async () => {
      const content = 'Operation failed: timeout';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.error_count).toBe(1);
    });

    it('should count "exception" in plain text', async () => {
      const content = 'Caught an exception during processing';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.error_count).toBe(1);
    });

    it('should match editing file pattern', async () => {
      const content = 'editing index.html in the project';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('index.html');
    });

    it('should match creating file pattern', async () => {
      const content = 'creating new-file.ts in the source directory';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('new-file.ts');
    });

    it('should match modifying file pattern', async () => {
      const content = 'modifying config.yaml settings';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('config.yaml');
    });

    it('should match file_path with equals sign pattern', async () => {
      const content = 'file_path="/data/output.log"';
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/data/output.log');
    });
  });

  describe('extractKeywords', () => {
    it('should delegate to extractTranscriptKeywords', async () => {
      mockExtractTranscriptKeywords.mockReturnValue(['react', 'typescript']);

      const { extractKeywords } = await import('../../telemetry/transcript.js');
      const result = extractKeywords('task description', 'transcript content', 'test-agent');

      expect(mockExtractTranscriptKeywords).toHaveBeenCalledWith(
        'task description',
        'transcript content',
        'test-agent'
      );
      expect(result).toEqual(['react', 'typescript']);
    });

    it('should handle undefined parameters', async () => {
      mockExtractTranscriptKeywords.mockReturnValue([]);

      const { extractKeywords } = await import('../../telemetry/transcript.js');
      const result = extractKeywords();

      expect(mockExtractTranscriptKeywords).toHaveBeenCalledWith(undefined, undefined, undefined);
      expect(result).toEqual([]);
    });
  });

  describe('ParsedTranscript type interface', () => {
    it('should work with all properties of ParsedTranscript', async () => {
      mockFileExists.mockResolvedValue(true);
      const content = [
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/test.ts' } }),
        JSON.stringify({ type: 'error', message: 'An error occurred' }),
        JSON.stringify({ content: 'Successfully completed the task' }),
        '{"role":"assistant","content":"All done"}',
      ].join('\n');
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      // Verify the type shape
      expect(Array.isArray(result.files_modified)).toBe(true);
      expect(Array.isArray(result.tools_used)).toBe(true);
      expect(typeof result.error_count).toBe('number');
      expect(Array.isArray(result.success_indicators)).toBe(true);
      expect(result.final_output === undefined || typeof result.final_output === 'string').toBe(true);

      // Verify values
      expect(result.files_modified).toContain('/test.ts');
      expect(result.tools_used).toContain('Write');
      expect(result.error_count).toBe(1);
      expect(result.success_indicators.length).toBeGreaterThan(0);
      expect(result.final_output).toBe('All done');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockFileExists.mockResolvedValue(true);
    });

    it('should handle mixed JSON and plain text content', async () => {
      const content = [
        JSON.stringify({ type: 'tool_use', name: 'Bash' }),
        'using Read tool for inspection',
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/test.ts' } }),
        'editing config.js file',
      ].join('\n');
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('Bash');
      expect(result.tools_used).toContain('Read');
      expect(result.tools_used).toContain('Write');
      expect(result.files_modified).toContain('/test.ts');
      expect(result.files_modified).toContain('config.js');
    });

    it('should handle tool_name preference over name', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        tool_name: 'PreferredTool',
        name: 'FallbackTool',
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toContain('PreferredTool');
    });

    it('should handle file_path preference in extractFilePathFromEntry', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        input: {
          file_path: '/preferred.ts',
          path: '/fallback1.ts',
          file: '/fallback2.ts',
        },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toEqual(['/preferred.ts']);
    });

    it('should prefer tool_input over input over parameters', async () => {
      const content = JSON.stringify({
        type: 'tool_use',
        name: 'Write',
        tool_input: { file_path: '/from-tool-input.ts' },
        input: { file_path: '/from-input.ts' },
        parameters: { file_path: '/from-parameters.ts' },
      });
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.files_modified).toContain('/from-tool-input.ts');
    });

    it('should handle complex real-world transcript', async () => {
      const content = [
        JSON.stringify({ role: 'user', content: 'Please create a new component' }),
        JSON.stringify({ type: 'tool_use', name: 'Read', input: { file_path: '/src/existing.ts' } }),
        JSON.stringify({ type: 'tool_result', content: 'file contents...' }),
        JSON.stringify({ type: 'tool_use', name: 'Write', input: { file_path: '/src/new-component.tsx' } }),
        JSON.stringify({ type: 'tool_result', content: 'File written successfully' }),
        JSON.stringify({ type: 'tool_use', name: 'Edit', input: { file_path: '/src/index.ts' } }),
        JSON.stringify({ type: 'tool_result', content: 'Edit successful' }),
        JSON.stringify({ content: 'Task completed successfully' }),
        JSON.stringify({ role: 'assistant', content: 'I have created the new component and updated the exports.' }),
      ].join('\n');
      mockReadFile.mockResolvedValue(content);

      const { parseTranscript } = await import('../../telemetry/transcript.js');
      const result = await parseTranscript('/path/to/transcript.jsonl');

      expect(result.tools_used).toEqual(['Read', 'Write', 'Edit']);
      expect(result.files_modified).toEqual(['/src/new-component.tsx', '/src/index.ts']);
      expect(result.error_count).toBe(0);
      expect(result.success_indicators.length).toBeGreaterThan(0);
      expect(result.final_output).toBe('I have created the new component and updated the exports.');
    });
  });
});
