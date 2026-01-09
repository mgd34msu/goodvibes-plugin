/**
 * Tests for memory/decisions.ts
 *
 * Comprehensive test suite achieving 100% coverage for decision memory management,
 * including reading, writing, and formatting of architectural decisions.
 */

import * as fsSync from 'fs';
import * as _fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the parser module
vi.mock('../../memory/parser.js', () => ({
  parseMemoryFile: vi.fn(),
  ensureMemoryFile: vi.fn(),
  appendMemoryEntry: vi.fn(),
}));

import { readDecisions, writeDecision } from '../../memory/decisions.js';
import * as parser from '../../memory/parser.js';

import type { MemoryDecision } from '../../types/memory.js';

describe('memory/decisions', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'decisions-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fsSync.existsSync(testDir)) {
      fsSync.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('readDecisions', () => {
    it('should call parseMemoryFile with correct file path', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readDecisions(testDir);

      expect(mockParseMemoryFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockParseMemoryFile.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'decisions.md')
      );
    });

    it('should call parseMemoryFile with correct parser configuration', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readDecisions(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      expect(parserConfig).toMatchObject({
        primaryField: 'title',
        fields: {
          date: 'inline',
          agent: 'inline',
          alternatives: 'list',
          rationale: 'text',
          context: 'text',
        },
      });
    });

    it('should return parsed decisions from parseMemoryFile', async () => {
      const mockDecisions: MemoryDecision[] = [
        {
          title: 'Use React',
          date: '2024-01-01',
          alternatives: ['Vue', 'Angular'],
          rationale: 'Better ecosystem',
        },
        {
          title: 'Use TypeScript',
          date: '2024-01-02',
          alternatives: ['JavaScript'],
          rationale: 'Type safety',
          agent: 'architect',
          context: 'Project setup',
        },
      ];
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue(mockDecisions);

      const result = await readDecisions(testDir);

      expect(result).toEqual(mockDecisions);
    });

    it('should return empty array when no decisions exist', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      const result = await readDecisions(testDir);

      expect(result).toEqual([]);
    });

    it('should have validate function that checks required fields', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readDecisions(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      const validate = parserConfig.validate!;

      // Valid entry - has title, date, rationale
      expect(
        validate({ title: 'Test', date: '2024-01-01', rationale: 'reason' })
      ).toBe(true);

      // Invalid - missing title
      expect(validate({ date: '2024-01-01', rationale: 'reason' })).toBe(false);

      // Invalid - missing date
      expect(validate({ title: 'Test', rationale: 'reason' })).toBe(false);

      // Invalid - missing rationale
      expect(validate({ title: 'Test', date: '2024-01-01' })).toBe(false);

      // Invalid - all missing
      expect(validate({})).toBe(false);

      // Invalid - empty strings
      expect(
        validate({ title: '', date: '2024-01-01', rationale: 'reason' })
      ).toBe(false);
    });

    it('should have transform function that constructs MemoryDecision', async () => {
      const mockParseMemoryFile = vi.mocked(parser.parseMemoryFile);
      mockParseMemoryFile.mockResolvedValue([]);

      await readDecisions(testDir);

      const [, parserConfig] = mockParseMemoryFile.mock.calls[0];
      const transform = parserConfig.transform!;

      // Transform with all fields
      const fullEntry = {
        title: 'Test Decision',
        date: '2024-01-01',
        alternatives: ['Alt1', 'Alt2'],
        rationale: 'Because reasons',
        agent: 'test-agent',
        context: 'Test context',
      };
      expect(transform(fullEntry)).toEqual({
        title: 'Test Decision',
        date: '2024-01-01',
        alternatives: ['Alt1', 'Alt2'],
        rationale: 'Because reasons',
        agent: 'test-agent',
        context: 'Test context',
      });

      // Transform with minimal fields (alternatives defaults to empty array)
      const minimalEntry = {
        title: 'Minimal',
        date: '2024-01-02',
        rationale: 'Simple reason',
      };
      expect(transform(minimalEntry)).toEqual({
        title: 'Minimal',
        date: '2024-01-02',
        alternatives: [],
        rationale: 'Simple reason',
        agent: undefined,
        context: undefined,
      });

      // Transform with undefined alternatives defaults to empty array
      const noAlternatives = {
        title: 'No Alts',
        date: '2024-01-03',
        rationale: 'No alternatives',
        alternatives: undefined,
      };
      expect(transform(noAlternatives)).toEqual({
        title: 'No Alts',
        date: '2024-01-03',
        alternatives: [],
        rationale: 'No alternatives',
        agent: undefined,
        context: undefined,
      });
    });
  });

  describe('writeDecision', () => {
    it('should call ensureMemoryFile with correct path and header', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Test Decision',
        date: '2024-01-01',
        alternatives: ['Option A'],
        rationale: 'Test rationale',
      };

      await writeDecision(testDir, decision);

      expect(mockEnsureMemoryFile).toHaveBeenCalledTimes(1);
      const [filePath, header] = mockEnsureMemoryFile.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'decisions.md')
      );
      expect(header).toContain('# Architectural Decisions');
      expect(header).toContain('This file records architectural decisions');
    });

    it('should call appendMemoryEntry with formatted decision', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Use tRPC',
        date: '2024-01-04',
        alternatives: ['REST', 'GraphQL'],
        rationale: 'End-to-end type safety',
      };

      await writeDecision(testDir, decision);

      expect(mockAppendMemoryEntry).toHaveBeenCalledTimes(1);
      const [filePath, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(filePath).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'decisions.md')
      );
      expect(entry).toContain('## Use tRPC');
      expect(entry).toContain('**Date:** 2024-01-04');
      expect(entry).toContain('**Alternatives:**');
      expect(entry).toContain('- REST');
      expect(entry).toContain('- GraphQL');
      expect(entry).toContain('**Rationale:**');
      expect(entry).toContain('End-to-end type safety');
      expect(entry).toContain('---');
    });

    it('should format decision with agent when provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Use Vitest',
        date: '2024-01-05',
        alternatives: ['Jest'],
        rationale: 'Faster and Vite-native',
        agent: 'test-engineer',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Agent:** test-engineer');
    });

    it('should not include agent line when agent is not provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'No Agent Decision',
        date: '2024-01-06',
        alternatives: [],
        rationale: 'No agent specified',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Agent:**');
    });

    it('should format decision with context when provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Use PostgreSQL',
        date: '2024-01-07',
        alternatives: ['MySQL', 'MongoDB'],
        rationale: 'Better JSON support and reliability',
        context: 'Evaluated during database selection phase',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Context:**');
      expect(entry).toContain('Evaluated during database selection phase');
    });

    it('should not include context section when context is not provided', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'No Context Decision',
        date: '2024-01-08',
        alternatives: ['A', 'B'],
        rationale: 'Simple decision',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).not.toContain('**Context:**');
    });

    it('should format decision with empty alternatives array', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'No Alternatives',
        date: '2024-01-09',
        alternatives: [],
        rationale: 'Only one option existed',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('**Alternatives:**');
      // Should have alternatives section but no list items
      expect(entry).not.toContain('- ');
    });

    it('should format decision with multiple alternatives', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Many Options',
        date: '2024-01-10',
        alternatives: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        rationale: 'Chose the best one',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('- Option 1');
      expect(entry).toContain('- Option 2');
      expect(entry).toContain('- Option 3');
      expect(entry).toContain('- Option 4');
    });

    it('should format decision with all optional fields', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Full Decision',
        date: '2024-01-11',
        alternatives: ['Alt A', 'Alt B'],
        rationale: 'Complete rationale text',
        agent: 'senior-architect',
        context: 'Important context information',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('## Full Decision');
      expect(entry).toContain('**Date:** 2024-01-11');
      expect(entry).toContain('**Agent:** senior-architect');
      expect(entry).toContain('**Alternatives:**');
      expect(entry).toContain('- Alt A');
      expect(entry).toContain('- Alt B');
      expect(entry).toContain('**Rationale:**');
      expect(entry).toContain('Complete rationale text');
      expect(entry).toContain('**Context:**');
      expect(entry).toContain('Important context information');
      expect(entry).toContain('---');
    });

    it('should maintain correct markdown structure order', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Structure Test',
        date: '2024-01-12',
        alternatives: ['X'],
        rationale: 'Testing order',
        agent: 'tester',
        context: 'Order context',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];

      // Verify order: title -> date -> agent -> alternatives -> rationale -> context -> separator
      const titleIndex = entry.indexOf('## Structure Test');
      const dateIndex = entry.indexOf('**Date:**');
      const agentIndex = entry.indexOf('**Agent:**');
      const alternativesIndex = entry.indexOf('**Alternatives:**');
      const rationaleIndex = entry.indexOf('**Rationale:**');
      const contextIndex = entry.indexOf('**Context:**');
      const separatorIndex = entry.lastIndexOf('---');

      expect(titleIndex).toBeLessThan(dateIndex);
      expect(dateIndex).toBeLessThan(agentIndex);
      expect(agentIndex).toBeLessThan(alternativesIndex);
      expect(alternativesIndex).toBeLessThan(rationaleIndex);
      expect(rationaleIndex).toBeLessThan(contextIndex);
      expect(contextIndex).toBeLessThan(separatorIndex);
    });
  });

  describe('formatDecision (via writeDecision)', () => {
    // These tests verify the internal formatDecision function behavior
    // through the public writeDecision API

    it('should start entry with newline and heading', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Heading Test',
        date: '2024-01-13',
        alternatives: [],
        rationale: 'Test',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry.startsWith('\n## ')).toBe(true);
    });

    it('should end entry with separator line', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Separator Test',
        date: '2024-01-14',
        alternatives: [],
        rationale: 'Test',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry.endsWith('\n---\n')).toBe(true);
    });

    it('should handle special characters in decision fields', async () => {
      const mockEnsureMemoryFile = vi.mocked(parser.ensureMemoryFile);
      const mockAppendMemoryEntry = vi.mocked(parser.appendMemoryEntry);
      mockEnsureMemoryFile.mockResolvedValue();
      mockAppendMemoryEntry.mockResolvedValue();

      const decision: MemoryDecision = {
        title: 'Use "quotes" and <brackets>',
        date: '2024-01-15',
        alternatives: ['Option with *asterisks*', 'Option with `backticks`'],
        rationale: 'Rationale with **bold** and _italic_',
        agent: 'agent-with-dash',
        context: 'Context with\nmultiline\ntext',
      };

      await writeDecision(testDir, decision);

      const [, entry] = mockAppendMemoryEntry.mock.calls[0];
      expect(entry).toContain('Use "quotes" and <brackets>');
      expect(entry).toContain('- Option with *asterisks*');
      expect(entry).toContain('- Option with `backticks`');
      expect(entry).toContain('Rationale with **bold** and _italic_');
      expect(entry).toContain('agent-with-dash');
      expect(entry).toContain('Context with\nmultiline\ntext');
    });
  });
});
