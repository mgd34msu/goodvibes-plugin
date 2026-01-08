/**
 * Tests for memory/failures.ts
 *
 * Comprehensive test suite achieving 100% coverage for failure memory management,
 * including reading, writing, and formatting of failed approaches.
 */

import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the parser module
vi.mock('../../memory/parser.js', () => ({
  parseMemoryFile: vi.fn(),
  ensureMemoryFile: vi.fn(),
  appendMemoryEntry: vi.fn(),
}));

import { readFailures, writeFailure } from '../../memory/failures.js';
import * as parser from '../../memory/parser.js';

import type { MemoryFailure } from '../../types/memory.js';

describe('memory/failures', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'failures-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fsSync.existsSync(testDir)) {
      fsSync.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('readFailures', () => {
    it('should call parseMemoryFile with correct file path', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readFailures(testDir);

      expect(mockParseMemoryFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockParseMemoryFile.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'failures.md')
      );
    });

    it('should call parseMemoryFile with correct parser configuration', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readFailures(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      expect(parserConfig).toMatchObject({
        primaryField: 'approach',
        fields: {
          date: 'inline',
          reason: 'text',
          context: 'text',
          suggestion: 'text',
        },
      });
    });

    it('should return parsed failures from parseMemoryFile', async () => {
      const mockFailures: MemoryFailure[] = [
        {
          approach: 'Direct DOM manipulation in React',
          date: '2024-01-01',
          reason: 'Conflicts with virtual DOM',
        },
        {
          approach: 'Using var instead of const/let',
          date: '2024-01-02',
          reason: 'Causes scoping issues',
          context: 'Legacy code migration',
          suggestion: 'Use const by default, let when needed',
        },
      ];
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue(mockFailures);

      const result = await readFailures(testDir);

      expect(result).toEqual(mockFailures);
    });

    it('should return empty array when no failures exist', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      const result = await readFailures(testDir);

      expect(result).toEqual([]);
    });

    it('should have validate function that checks required fields', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readFailures(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      const validate = parserConfig.validate!;

      // Valid entry - has approach, date, reason
      expect(
        validate({ approach: 'Test', date: '2024-01-01', reason: 'reason' })
      ).toBe(true);

      // Invalid - missing approach
      expect(validate({ date: '2024-01-01', reason: 'reason' })).toBe(false);

      // Invalid - missing date
      expect(validate({ approach: 'Test', reason: 'reason' })).toBe(false);

      // Invalid - missing reason
      expect(validate({ approach: 'Test', date: '2024-01-01' })).toBe(false);

      // Invalid - all missing
      expect(validate({})).toBe(false);

      // Invalid - empty strings
      expect(
        validate({ approach: '', date: '2024-01-01', reason: 'reason' })
      ).toBe(false);
    });

    it('should have transform function that constructs MemoryFailure', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readFailures(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      const transform = parserConfig.transform!;

      // Transform with all fields
      const fullEntry = {
        approach: 'Using global state',
        date: '2024-01-01',
        reason: 'Causes tight coupling',
        context: 'State management research',
        suggestion: 'Use React context or Redux',
      };
      expect(transform(fullEntry)).toEqual({
        approach: 'Using global state',
        date: '2024-01-01',
        reason: 'Causes tight coupling',
        context: 'State management research',
        suggestion: 'Use React context or Redux',
      });

      // Transform with minimal fields (optional fields are undefined)
      const minimalEntry = {
        approach: 'Minimal',
        date: '2024-01-02',
        reason: 'Simple reason',
      };
      expect(transform(minimalEntry)).toEqual({
        approach: 'Minimal',
        date: '2024-01-02',
        reason: 'Simple reason',
        context: undefined,
        suggestion: undefined,
      });

      // Transform with undefined optional fields
      const noOptionals = {
        approach: 'No optionals',
        date: '2024-01-03',
        reason: 'No context or suggestion',
        context: undefined,
        suggestion: undefined,
      };
      expect(transform(noOptionals)).toEqual({
        approach: 'No optionals',
        date: '2024-01-03',
        reason: 'No context or suggestion',
        context: undefined,
        suggestion: undefined,
      });
    });
  });

  describe('writeFailure', () => {
    it('should call ensureMemoryFile with correct path and header', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Test Approach',
        date: '2024-01-01',
        reason: 'Test reason',
      };

      await writeFailure(testDir, failure);

      expect(mockEnsureMemoryFile).toHaveBeenCalledTimes(1);
      const [filePath, header] = mockEnsureMemoryFile.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'failures.md')
      );
      expect(header).toContain('# Failed Approaches');
      expect(header).toContain('approaches that were tried and failed');
    });

    it('should call appendMemoryEntry with formatted failure', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Using synchronous file reads',
        date: '2024-01-04',
        reason: 'Blocks the event loop and causes performance issues',
      };

      await writeFailure(testDir, failure);

      expect(mockAppendMemoryEntry).toHaveBeenCalledTimes(1);
      const [filePath, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'failures.md')
      );
      expect(entry).toContain('## Using synchronous file reads');
      expect(entry).toContain('**Date:** 2024-01-04');
      expect(entry).toContain('**Reason:**');
      expect(entry).toContain(
        'Blocks the event loop and causes performance issues'
      );
      expect(entry).toContain('---');
    });

    it('should format failure with context when provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Storing passwords in plain text',
        date: '2024-01-05',
        reason: 'Security vulnerability',
        context: 'During user authentication implementation',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Context:**');
      expect(entry).toContain('During user authentication implementation');
    });

    it('should not include context section when context is not provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'No Context Failure',
        date: '2024-01-06',
        reason: 'Simple failure without context',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Context:**');
    });

    it('should format failure with suggestion when provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Using any type extensively',
        date: '2024-01-07',
        reason: 'Defeats the purpose of TypeScript',
        suggestion: 'Use proper type definitions or unknown',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Suggestion:**');
      expect(entry).toContain('Use proper type definitions or unknown');
    });

    it('should not include suggestion section when suggestion is not provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'No Suggestion Failure',
        date: '2024-01-08',
        reason: 'Failure without suggestion',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Suggestion:**');
    });

    it('should format failure with all optional fields', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Full Failure Record',
        date: '2024-01-09',
        reason: 'Complete reason text',
        context: 'Important context information',
        suggestion: 'Helpful suggestion for future',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('## Full Failure Record');
      expect(entry).toContain('**Date:** 2024-01-09');
      expect(entry).toContain('**Reason:**');
      expect(entry).toContain('Complete reason text');
      expect(entry).toContain('**Context:**');
      expect(entry).toContain('Important context information');
      expect(entry).toContain('**Suggestion:**');
      expect(entry).toContain('Helpful suggestion for future');
      expect(entry).toContain('---');
    });

    it('should maintain correct markdown structure order', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Structure Test',
        date: '2024-01-10',
        reason: 'Testing order',
        context: 'Order context',
        suggestion: 'Order suggestion',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];

      // Verify order: approach (title) -> date -> reason -> context -> suggestion -> separator
      const titleIndex = entry.indexOf('## Structure Test');
      const dateIndex = entry.indexOf('**Date:**');
      const reasonIndex = entry.indexOf('**Reason:**');
      const contextIndex = entry.indexOf('**Context:**');
      const suggestionIndex = entry.indexOf('**Suggestion:**');
      const separatorIndex = entry.lastIndexOf('---');

      expect(titleIndex).toBeLessThan(dateIndex);
      expect(dateIndex).toBeLessThan(reasonIndex);
      expect(reasonIndex).toBeLessThan(contextIndex);
      expect(contextIndex).toBeLessThan(suggestionIndex);
      expect(suggestionIndex).toBeLessThan(separatorIndex);
    });
  });

  describe('formatFailure (via writeFailure)', () => {
    // These tests verify the internal formatFailure function behavior
    // through the public writeFailure API

    it('should start entry with newline and heading', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Heading Test',
        date: '2024-01-11',
        reason: 'Test',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry.startsWith('\n## ')).toBe(true);
    });

    it('should end entry with separator line', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Separator Test',
        date: '2024-01-12',
        reason: 'Test',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry.endsWith('\n---\n')).toBe(true);
    });

    it('should handle special characters in failure fields', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Using "quotes" and <brackets>',
        date: '2024-01-13',
        reason: 'Reason with **bold** and _italic_',
        context: 'Context with\nmultiline\ntext',
        suggestion: 'Suggestion with `code` and *emphasis*',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('Using "quotes" and <brackets>');
      expect(entry).toContain('Reason with **bold** and _italic_');
      expect(entry).toContain('Context with\nmultiline\ntext');
      expect(entry).toContain('Suggestion with `code` and *emphasis*');
    });

    it('should format failure with only context (no suggestion)', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Context Only',
        date: '2024-01-14',
        reason: 'Has context but no suggestion',
        context: 'Some context here',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Context:**');
      expect(entry).toContain('Some context here');
      expect(entry).not.toContain('**Suggestion:**');
    });

    it('should format failure with only suggestion (no context)', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const failure: MemoryFailure = {
        approach: 'Suggestion Only',
        date: '2024-01-15',
        reason: 'Has suggestion but no context',
        suggestion: 'Try this instead',
      };

      await writeFailure(testDir, failure);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Context:**');
      expect(entry).toContain('**Suggestion:**');
      expect(entry).toContain('Try this instead');
    });
  });
});
