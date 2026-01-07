/**
 * Tests for memory/preferences.ts
 *
 * Comprehensive test suite achieving 100% coverage for preference memory management,
 * including reading, writing, and formatting of user preferences.
 */

import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { MemoryPreference } from '../../types/memory.js';

// Mock the parser module
vi.mock('../../memory/parser.js', () => ({
  parseMemoryFile: vi.fn(),
  ensureMemoryFile: vi.fn(),
  appendMemoryEntry: vi.fn(),
}));

import { readPreferences, writePreference } from '../../memory/preferences.js';
import * as parser from '../../memory/parser.js';

describe('memory/preferences', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'preferences-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fsSync.existsSync(testDir)) {
      fsSync.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('readPreferences', () => {
    it('should call parseMemoryFile with correct file path', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readPreferences(testDir);

      expect(mockParseMemoryFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockParseMemoryFile.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'preferences.md')
      );
    });

    it('should call parseMemoryFile with correct parser configuration', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readPreferences(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      expect(parserConfig).toMatchObject({
        primaryField: 'key',
        fields: {
          value: 'inline',
          date: 'inline',
          notes: 'text',
        },
      });
    });

    it('should return parsed preferences from parseMemoryFile', async () => {
      const mockPreferences: MemoryPreference[] = [
        {
          key: 'code-style',
          value: 'functional',
          date: '2024-01-01',
          notes: 'Prefer functional components',
        },
        {
          key: 'test-framework',
          value: 'vitest',
          date: '2024-01-02',
        },
      ];
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue(mockPreferences);

      const result = await readPreferences(testDir);

      expect(result).toEqual(mockPreferences);
    });

    it('should return empty array when no preferences exist', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      const result = await readPreferences(testDir);

      expect(result).toEqual([]);
    });

    it('should have validate function that checks required fields', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readPreferences(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      const validate = parserConfig.validate!;

      // Valid entry - has key, value, date
      expect(
        validate({ key: 'test-key', value: 'test-value', date: '2024-01-01' })
      ).toBe(true);

      // Invalid - missing key
      expect(validate({ value: 'test-value', date: '2024-01-01' })).toBe(false);

      // Invalid - missing value
      expect(validate({ key: 'test-key', date: '2024-01-01' })).toBe(false);

      // Invalid - missing date
      expect(validate({ key: 'test-key', value: 'test-value' })).toBe(false);

      // Invalid - all missing
      expect(validate({})).toBe(false);

      // Invalid - empty strings
      expect(
        validate({ key: '', value: 'test-value', date: '2024-01-01' })
      ).toBe(false);
      expect(validate({ key: 'test-key', value: '', date: '2024-01-01' })).toBe(
        false
      );
      expect(validate({ key: 'test-key', value: 'test-value', date: '' })).toBe(
        false
      );
    });

    it('should have transform function that constructs MemoryPreference', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readPreferences(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      const transform = parserConfig.transform!;

      // Transform with all fields
      const fullEntry = {
        key: 'code-style',
        value: 'functional',
        date: '2024-01-01',
        notes: 'Prefer functional components over class components',
      };
      expect(transform(fullEntry)).toEqual({
        key: 'code-style',
        value: 'functional',
        date: '2024-01-01',
        notes: 'Prefer functional components over class components',
      });

      // Transform with minimal fields (no notes)
      const minimalEntry = {
        key: 'theme',
        value: 'dark',
        date: '2024-01-02',
      };
      expect(transform(minimalEntry)).toEqual({
        key: 'theme',
        value: 'dark',
        date: '2024-01-02',
        notes: undefined,
      });

      // Transform with undefined notes
      const noNotes = {
        key: 'language',
        value: 'typescript',
        date: '2024-01-03',
        notes: undefined,
      };
      expect(transform(noNotes)).toEqual({
        key: 'language',
        value: 'typescript',
        date: '2024-01-03',
        notes: undefined,
      });
    });
  });

  describe('writePreference', () => {
    it('should call ensureMemoryFile with correct path and header', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'test-key',
        value: 'test-value',
        date: '2024-01-01',
      };

      await writePreference(testDir, preference);

      expect(mockEnsureMemoryFile).toHaveBeenCalledTimes(1);
      const [filePath, header] = mockEnsureMemoryFile.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'preferences.md')
      );
      expect(header).toContain('# User Preferences');
      expect(header).toContain('This file stores user preferences');
      expect(header).toContain('These preferences guide agent behavior');
    });

    it('should call appendMemoryEntry with formatted preference', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'code-style',
        value: 'functional',
        date: '2024-01-04',
      };

      await writePreference(testDir, preference);

      expect(mockAppendMemoryEntry).toHaveBeenCalledTimes(1);
      const [filePath, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'preferences.md')
      );
      expect(entry).toContain('## code-style');
      expect(entry).toContain('**Value:** functional');
      expect(entry).toContain('**Date:** 2024-01-04');
      expect(entry).toContain('---');
    });

    it('should format preference with notes when provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'test-framework',
        value: 'vitest',
        date: '2024-01-05',
        notes: 'Faster than Jest and integrates better with Vite',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Notes:**');
      expect(entry).toContain(
        'Faster than Jest and integrates better with Vite'
      );
    });

    it('should not include notes section when notes is not provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'no-notes-preference',
        value: 'some-value',
        date: '2024-01-06',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Notes:**');
    });

    it('should not include notes section when notes is undefined', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'undefined-notes',
        value: 'value',
        date: '2024-01-07',
        notes: undefined,
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Notes:**');
    });

    it('should format preference with all fields', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'full-preference',
        value: 'complete-value',
        date: '2024-01-08',
        notes: 'Detailed notes about this preference',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('## full-preference');
      expect(entry).toContain('**Value:** complete-value');
      expect(entry).toContain('**Date:** 2024-01-08');
      expect(entry).toContain('**Notes:**');
      expect(entry).toContain('Detailed notes about this preference');
      expect(entry).toContain('---');
    });

    it('should maintain correct markdown structure order', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'structure-test',
        value: 'test-value',
        date: '2024-01-09',
        notes: 'Order verification notes',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];

      // Verify order: key (heading) -> value -> date -> notes -> separator
      const keyIndex = entry.indexOf('## structure-test');
      const valueIndex = entry.indexOf('**Value:**');
      const dateIndex = entry.indexOf('**Date:**');
      const notesIndex = entry.indexOf('**Notes:**');
      const separatorIndex = entry.lastIndexOf('---');

      expect(keyIndex).toBeLessThan(valueIndex);
      expect(valueIndex).toBeLessThan(dateIndex);
      expect(dateIndex).toBeLessThan(notesIndex);
      expect(notesIndex).toBeLessThan(separatorIndex);
    });
  });

  describe('formatPreference (via writePreference)', () => {
    // These tests verify the internal formatPreference function behavior
    // through the public writePreference API

    it('should start entry with newline and heading', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'heading-test',
        value: 'value',
        date: '2024-01-10',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry.startsWith('\n## ')).toBe(true);
    });

    it('should end entry with separator line', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'separator-test',
        value: 'value',
        date: '2024-01-11',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry.endsWith('\n---\n')).toBe(true);
    });

    it('should handle special characters in preference fields', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'use-"quotes"-and-<brackets>',
        value: 'value with *asterisks* and `backticks`',
        date: '2024-01-12',
        notes: 'Notes with **bold** and _italic_\nand multiline\ncontent',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('use-"quotes"-and-<brackets>');
      expect(entry).toContain('value with *asterisks* and `backticks`');
      expect(entry).toContain(
        'Notes with **bold** and _italic_\nand multiline\ncontent'
      );
    });

    it('should handle empty string notes (truthy check)', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const preference: MemoryPreference = {
        key: 'empty-notes',
        value: 'value',
        date: '2024-01-13',
        notes: '',
      };

      await writePreference(testDir, preference);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      // Empty string is falsy, so notes section should not be included
      expect(entry).not.toContain('**Notes:**');
    });
  });
});
