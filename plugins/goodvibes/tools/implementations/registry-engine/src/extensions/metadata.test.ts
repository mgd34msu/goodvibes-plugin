/**
 * Tests for the real loadSkillMetadata() implementation.
 *
 * This file intentionally does NOT mock ../core/parsing.js so that the real
 * loadSkillMetadata (defined there, re-exported by ./metadata.ts) is tested
 * with its actual parsing logic. Only the I/O boundary dependencies are mocked:
 *   - resolveSkillPath  (from resolution.ts)
 *   - node:fs/promises  (readFile)
 *
 * parseFrontmatter, extractMarkdownMetadata, and extractTechKeywords are real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — ONLY I/O boundaries; parsing.js is NOT mocked
// ---------------------------------------------------------------------------

vi.mock('../core/resolution.js', () => ({
  resolveSkillPath: vi.fn(),
  resolveAgentPath: vi.fn(),
}));

vi.mock('../shared/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { resolveSkillPath } from '../core/resolution.js';
import * as fsPromises from 'node:fs/promises';

import { loadSkillMetadata } from './metadata.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadSkillMetadata() - real implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when skill path cannot be resolved', async () => {
    (resolveSkillPath as Mock).mockResolvedValue(null);

    const result = await loadSkillMetadata('outcome/missing');
    expect(result).toEqual({});
  });

  it('returns frontmatter metadata when YAML frontmatter is present', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\nrequires:\n  - auth\ncategory: outcome\ndifficulty: intermediate\n---\n# Skill'
    );

    const result = await loadSkillMetadata('outcome/skill');

    expect(result).toMatchObject({
      requires: ['auth'],
      category: 'outcome',
      difficulty: 'intermediate',
    });
  });

  it('extracts complements from frontmatter.complements array', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\ncomplements:\n  - skill-a\n  - skill-b\n---\n# Skill'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.complements).toEqual(['skill-a', 'skill-b']);
  });

  it('extracts complements from frontmatter.related when complements absent', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\nrelated:\n  - related-skill\n---\n# Skill'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.complements).toEqual(['related-skill']);
  });

  it('extracts technologies from frontmatter.technologies', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\ntechnologies:\n  - react\n  - typescript\n---\n# Skill'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.technologies).toEqual(['react', 'typescript']);
  });

  it('extracts technologies from frontmatter.tech when technologies absent', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\ntech:\n  - vitest\n---\n# Skill'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.technologies).toEqual(['vitest']);
  });

  it('falls back to markdown extraction when no frontmatter', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '# Skill without frontmatter\n\nRequires:\n- auth\n\nRelated:\n- other-skill\n'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.requires).toEqual(['auth']);
    expect(result.complements).toEqual(['other-skill']);
  });

  it('uses extractTechKeywords when markdown fallback has no technologies section', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '# Skill\n\nThis skill uses react and vitest for testing.'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.technologies).toContain('react');
    expect(result.technologies).toContain('vitest');
  });

  it('returns empty object when readFile throws', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockRejectedValue(new Error('ENOENT'));

    const result = await loadSkillMetadata('any/skill');
    expect(result).toEqual({});
  });

  it('omits undefined fields when frontmatter only has category', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\ncategory: general\n---\n# Skill'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.category).toBe('general');
    expect(result.requires).toBeUndefined();
    expect(result.complements).toBeUndefined();
    expect(result.conflicts).toBeUndefined();
    expect(result.technologies).toBeUndefined();
    expect(result.difficulty).toBeUndefined();
  });

  it('extracts conflicts from frontmatter.conflicts array', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\nconflicts:\n  - conflicting-skill\n---\n# Skill'
    );

    const result = await loadSkillMetadata('any/skill');
    expect(result.conflicts).toEqual(['conflicting-skill']);
  });

  it('returns empty requires/complements from markdown when sections found but empty', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    // No frontmatter, no sections, no tech keywords
    (fsPromises.readFile as Mock).mockResolvedValue(
      '# Plain markdown skill with no dependency info'
    );

    const result = await loadSkillMetadata('any/skill');
    // No requires or complements sections found in markdown
    expect(result.requires).toBeUndefined();
    expect(result.complements).toBeUndefined();
  });
});
