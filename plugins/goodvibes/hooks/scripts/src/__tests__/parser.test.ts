/**
 * Tests for the generic memory parser
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  parseMemoryFile,
  parseMemoryContent,
  ensureMemoryFile,
  appendMemoryEntry,
} from '../memory/parser.js';

interface TestEntry {
  title: string;
  date: string;
  content: string;
  tags?: string[];
  notes?: string;
}

describe('parser', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseMemoryContent', () => {
    it('should parse a simple entry with inline and text fields', () => {
      const content = `# Header

---

## First Entry

**Date:** 2024-01-15

**Content:**
This is multi-line content
that spans multiple lines.

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        validate: (entry) => !!(entry.title && entry.date && entry.content),
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('First Entry');
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].content).toContain('multi-line content');
      expect(result[0].content).toContain('spans multiple lines');
    });

    it('should parse list fields correctly', () => {
      const content = `# Header

## Entry with List

**Date:** 2024-01-15

**Content:**
Some content here.

**Tags:**
- tag1
- tag2
- tag3

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
          tags: 'list',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
          tags: entry.tags,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse code blocks correctly', () => {
      const content = `# Header

## Code Example

**Date:** 2024-01-15

**Content:**
\`\`\`typescript
function example() {
  return 42;
}
\`\`\`

---
`;

      interface CodeEntry {
        title: string;
        date: string;
        content: string;
      }

      const result = parseMemoryContent<CodeEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'code',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('function example()');
      expect(result[0].content).toContain('return 42');
      expect(result[0].content).toContain('```typescript');
    });

    it('should handle multiple entries', () => {
      const content = `# Header

## Entry 1

**Date:** 2024-01-01

**Content:**
First entry content.

---

## Entry 2

**Date:** 2024-01-02

**Content:**
Second entry content.

---

## Entry 3

**Date:** 2024-01-03

**Content:**
Third entry content.

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Entry 1');
      expect(result[1].title).toBe('Entry 2');
      expect(result[2].title).toBe('Entry 3');
    });

    it('should skip malformed entries', () => {
      const content = `# Header

## Good Entry

**Date:** 2024-01-01

**Content:**
Valid content.

---

## Bad Entry

**Content:**
Missing date field.

---

## Another Good Entry

**Date:** 2024-01-03

**Content:**
More valid content.

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        validate: (entry) => !!(entry.title && entry.date && entry.content),
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      // Should skip the middle entry due to missing date
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Good Entry');
      expect(result[1].title).toBe('Another Good Entry');
    });

    it('should handle optional fields', () => {
      const content = `# Header

## With Notes

**Date:** 2024-01-01

**Content:**
Main content.

**Notes:**
Additional notes here.

---

## Without Notes

**Date:** 2024-01-02

**Content:**
Main content only.

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
          notes: 'text',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
          notes: entry.notes,
        }),
      });

      expect(result).toHaveLength(2);
      expect(result[0].notes).toContain('Additional notes');
      expect(result[1].notes).toBeUndefined();
    });

    it('should trim accumulated text', () => {
      const content = `# Header

## Entry

**Date:** 2024-01-01

**Content:**
   Content with extra spaces

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result[0].content).toBe('Content with extra spaces');
      expect(result[0].content).not.toMatch(/^\s+/);
      expect(result[0].content).not.toMatch(/\s+$/);
    });

    it('should handle empty lists', () => {
      const content = `# Header

## Entry

**Date:** 2024-01-01

**Content:**
Some content.

**Tags:**

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
          tags: 'list',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
          tags: entry.tags,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].tags).toBeUndefined();
    });

    it('should be case-insensitive for field names', () => {
      const content = `# Header

## Entry

**DATE:** 2024-01-01

**CONTENT:**
Some content.

---
`;

      const result = parseMemoryContent<TestEntry>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].content).toBe('Some content.');
    });
  });

  describe('parseMemoryFile', () => {
    it('should return empty array for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.md');

      const result = await parseMemoryFile<TestEntry>(filePath, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result).toEqual([]);
    });

    it('should parse an existing file', async () => {
      const filePath = path.join(testDir, 'test.md');
      const content = `# Header

## Test Entry

**Date:** 2024-01-15

**Content:**
Test content.

---
`;
      fs.writeFileSync(filePath, content);

      const result = await parseMemoryFile<TestEntry>(filePath, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          content: 'text',
        },
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          content: entry.content!,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Entry');
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].content).toBe('Test content.');
    });
  });

  describe('ensureMemoryFile', () => {
    it('should create file with header if it does not exist', async () => {
      const filePath = path.join(testDir, 'new.md');
      const header = '# Test Header\n\nSome description.\n\n---\n\n';

      await ensureMemoryFile(filePath, header);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe(header);
    });

    it('should not overwrite existing file', async () => {
      const filePath = path.join(testDir, 'existing.md');
      const existingContent = 'Existing content';
      fs.writeFileSync(filePath, existingContent);

      await ensureMemoryFile(filePath, 'New header');

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe(existingContent);
    });

    it('should create parent directories if needed', async () => {
      const filePath = path.join(testDir, 'sub', 'dir', 'file.md');
      const header = '# Header\n';

      await ensureMemoryFile(filePath, header);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.dirname(filePath))).toBe(true);
    });
  });

  describe('appendMemoryEntry', () => {
    it('should append entry to file', async () => {
      const filePath = path.join(testDir, 'append.md');
      fs.writeFileSync(filePath, 'Header\n\n');

      await appendMemoryEntry(filePath, 'Entry 1\n');
      await appendMemoryEntry(filePath, 'Entry 2\n');

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('Header\n\nEntry 1\nEntry 2\n');
    });
  });

  describe('real-world integration', () => {
    it('should parse decisions format', () => {
      const content = `# Architectural Decisions

---

## Use TypeScript

**Date:** 2024-01-15
**Agent:** backend-engineer

**Alternatives:**
- JavaScript
- Flow

**Rationale:**
Type safety and better IDE support
make development more efficient.

**Context:**
Building a large-scale application
with multiple developers.

---
`;

      interface Decision {
        title: string;
        date: string;
        agent?: string;
        alternatives: string[];
        rationale: string;
        context?: string;
      }

      const result = parseMemoryContent<Decision>(content, {
        primaryField: 'title',
        fields: {
          date: 'inline',
          agent: 'inline',
          alternatives: 'list',
          rationale: 'text',
          context: 'text',
        },
        validate: (entry) => !!(entry.title && entry.date && entry.rationale),
        transform: (entry) => ({
          title: entry.title!,
          date: entry.date!,
          alternatives: entry.alternatives ?? [],
          rationale: entry.rationale!,
          agent: entry.agent,
          context: entry.context,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Use TypeScript');
      expect(result[0].agent).toBe('backend-engineer');
      expect(result[0].alternatives).toEqual(['JavaScript', 'Flow']);
      expect(result[0].rationale).toContain('Type safety');
      expect(result[0].context).toContain('large-scale application');
    });

    it('should parse patterns format with code', () => {
      const content = `# Project Patterns

---

## Repository Pattern

**Date:** 2024-01-15

**Description:**
Use repository pattern for data access abstraction.

**Example:**
\`\`\`typescript
class UserRepository {
  async findById(id: string) {
    return db.user.findUnique({ where: { id } });
  }
}
\`\`\`

**Files:**
- src/repositories/user.ts
- src/repositories/post.ts

---
`;

      interface Pattern {
        name: string;
        date: string;
        description: string;
        example?: string;
        files?: string[];
      }

      const result = parseMemoryContent<Pattern>(content, {
        primaryField: 'name',
        fields: {
          date: 'inline',
          description: 'text',
          example: 'code',
          files: 'list',
        },
        validate: (entry) => !!(entry.name && entry.date && entry.description),
        transform: (entry) => ({
          name: entry.name!,
          date: entry.date!,
          description: entry.description!,
          example: entry.example,
          files: entry.files,
        }),
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Repository Pattern');
      expect(result[0].description).toContain('data access abstraction');
      expect(result[0].example).toContain('class UserRepository');
      expect(result[0].files).toEqual([
        'src/repositories/user.ts',
        'src/repositories/post.ts',
      ]);
    });
  });
});
