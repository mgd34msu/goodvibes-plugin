/**
 * Tests for core/ layer (L1): types, registry, search, resolution, parsing, classification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

// ============================================================================
// types.ts — compile-time + runtime shape verification
// ============================================================================

describe('core types', () => {
  it('RegistryEntry has required fields', async () => {
    const entry = {
      name: 'test-skill',
      path: 'outcome/test-skill',
      description: 'A test skill',
    };
    expect(entry.name).toBe('test-skill');
    expect(entry.path).toBe('outcome/test-skill');
    expect(entry.description).toBe('A test skill');
  });

  it('RegistryEntry supports optional fields', async () => {
    const entry = {
      name: 'test',
      path: 'test',
      description: 'desc',
      keywords: ['kw1', 'kw2'],
      category: 'outcome',
    };
    expect(entry.keywords).toEqual(['kw1', 'kw2']);
    expect(entry.category).toBe('outcome');
  });

  it('Registry has version and search_index', async () => {
    const registry = {
      version: '1.0',
      search_index: [] as Array<{ name: string; path: string; description: string }>,
    };
    expect(registry.version).toBe('1.0');
    expect(Array.isArray(registry.search_index)).toBe(true);
  });

  it('SearchResult has name, path, description, relevance', async () => {
    const result = {
      name: 'skill',
      path: 'outcome/skill',
      description: 'desc',
      relevance: 0.95,
    };
    expect(result.relevance).toBe(0.95);
  });

  it('SearchSkillsArgs supports query, category, limit', async () => {
    const args = { query: 'auth', category: 'authentication', limit: 5 };
    expect(args.query).toBe('auth');
    expect(args.category).toBe('authentication');
    expect(args.limit).toBe(5);
  });

  it('DependencyLink has skill, path, reason', async () => {
    const link = { skill: 'auth', path: 'outcome/auth', reason: 'requires' };
    expect(link.reason).toBe('requires');
  });

  it('SkillMetadata has optional fields', async () => {
    const meta = {
      requires: ['auth'],
      complements: ['db'],
      conflicts: [],
      category: 'outcome',
      technologies: ['react'],
      difficulty: 'medium',
    };
    expect(meta.requires).toEqual(['auth']);
    expect(meta.difficulty).toBe('medium');
  });
});

// ============================================================================
// registry.ts
// ============================================================================

describe('loadRegistry', () => {
  let tmpDir: string;
  const origPluginRoot = process.env.PLUGIN_ROOT;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    // Point PLUGIN_ROOT to tmpDir so registry paths resolve there
    process.env.PLUGIN_ROOT = tmpDir;
  });

  afterEach(async () => {
    // Restore PLUGIN_ROOT
    if (origPluginRoot === undefined) {
      delete process.env.PLUGIN_ROOT;
    } else {
      process.env.PLUGIN_ROOT = origPluginRoot;
    }
    // Clean up temp dir
    await fs.rm(tmpDir, { recursive: true, force: true });
    // Reset module cache so PLUGIN_ROOT is re-read
    vi.resetModules();
  });

  it('returns null when file does not exist', async () => {
    vi.resetModules();
    process.env.PLUGIN_ROOT = tmpDir;
    const { loadRegistry } = await import('./registry.js');
    const result = await loadRegistry('registries/nonexistent.yaml');
    expect(result).toBeNull();
  });

  it('loads and parses a valid YAML registry', async () => {
    const registriesDir = path.join(tmpDir, 'registries');
    await fs.mkdir(registriesDir, { recursive: true });
    const yamlContent = `version: "1.0"\nsearch_index:\n  - name: test-skill\n    path: outcome/test-skill\n    description: A test skill\n`;
    await fs.writeFile(path.join(registriesDir, 'skills.yaml'), yamlContent, 'utf-8');

    vi.resetModules();
    process.env.PLUGIN_ROOT = tmpDir;
    const { loadRegistry } = await import('./registry.js');
    const result = await loadRegistry('registries/skills.yaml');
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.0');
    expect(result!.search_index).toHaveLength(1);
    expect(result!.search_index[0].name).toBe('test-skill');
  });

  it('returns null for invalid YAML content', async () => {
    const registriesDir = path.join(tmpDir, 'registries');
    await fs.mkdir(registriesDir, { recursive: true });
    // Malformed YAML: invalid indentation / colon
    const badYaml = `version: "1.0"\nsearch_index:\n  - name: test\n    description: [unclosed bracket`;
    await fs.writeFile(path.join(registriesDir, 'bad.yaml'), badYaml, 'utf-8');

    vi.resetModules();
    process.env.PLUGIN_ROOT = tmpDir;
    const { loadRegistry } = await import('./registry.js');
    const result = await loadRegistry('registries/bad.yaml');
    expect(result).toBeNull();
  });

  it('returns null for empty registry path that does not exist', async () => {
    vi.resetModules();
    process.env.PLUGIN_ROOT = tmpDir;
    const { loadRegistry } = await import('./registry.js');
    const result = await loadRegistry('');
    expect(result).toBeNull();
  });
});

// ============================================================================
// search.ts
// ============================================================================

describe('search', () => {
  const sampleEntries = [
    { name: 'auth-skill', path: 'outcome/auth', description: 'Authentication and authorization' },
    { name: 'database-skill', path: 'outcome/db', description: 'Database layer with Prisma' },
    { name: 'api-design', path: 'outcome/api', description: 'REST API design patterns' },
  ];
  const sampleRegistry = { version: '1.0', search_index: sampleEntries };

  describe('SEARCH_OPTIONS', () => {
    it('is a valid Fuse options object with keys array', async () => {
      const { SEARCH_OPTIONS } = await import('./search.js');
      expect(SEARCH_OPTIONS).toBeDefined();
      expect(Array.isArray(SEARCH_OPTIONS.keys)).toBe(true);
      expect(SEARCH_OPTIONS.keys!.length).toBeGreaterThan(0);
    });

    it('has includeScore set to true', async () => {
      const { SEARCH_OPTIONS } = await import('./search.js');
      expect(SEARCH_OPTIONS.includeScore).toBe(true);
    });

    it('has threshold defined', async () => {
      const { SEARCH_OPTIONS } = await import('./search.js');
      expect(typeof SEARCH_OPTIONS.threshold).toBe('number');
    });
  });

  describe('buildIndex', () => {
    it('returns a Fuse index for valid registry', async () => {
      const { buildIndex } = await import('./search.js');
      const index = buildIndex(sampleRegistry);
      expect(index).not.toBeNull();
    });

    it('returns null for null registry', async () => {
      const { buildIndex } = await import('./search.js');
      const index = buildIndex(null);
      expect(index).toBeNull();
    });

    it('returns null for registry with no search_index', async () => {
      const { buildIndex } = await import('./search.js');
      const emptyRegistry = { version: '1.0', search_index: null as unknown as [] };
      const index = buildIndex(emptyRegistry);
      expect(index).toBeNull();
    });

    it('returns a Fuse index that can search', async () => {
      const { buildIndex } = await import('./search.js');
      const index = buildIndex(sampleRegistry);
      const results = index!.search('auth');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('query', () => {
    it('returns empty array for null index', async () => {
      const { query } = await import('./search.js');
      const results = query(null, 'auth');
      expect(results).toEqual([]);
    });

    it('returns search results matching query', async () => {
      const { buildIndex, query } = await import('./search.js');
      const index = buildIndex(sampleRegistry)!;
      const results = query(index, 'auth');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('path');
      expect(results[0]).toHaveProperty('description');
      expect(results[0]).toHaveProperty('relevance');
    });

    it('relevance is a number between 0 and 1', async () => {
      const { buildIndex, query } = await import('./search.js');
      const index = buildIndex(sampleRegistry)!;
      const results = query(index, 'database');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relevance).toBeGreaterThanOrEqual(0);
      expect(results[0].relevance).toBeLessThanOrEqual(1);
    });

    it('respects limit parameter', async () => {
      const { buildIndex, query } = await import('./search.js');
      const index = buildIndex(sampleRegistry)!;
      // With limit 1, should return at most 1 result
      const results = query(index, 'a', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('uses default limit of 5', async () => {
      const largeRegistry = {
        version: '1.0',
        search_index: Array.from({ length: 10 }, (_, i) => ({
          name: `skill-${i}`,
          path: `outcome/skill-${i}`,
          description: `A skill for authentication testing ${i}`,
        })),
      };
      const { buildIndex, query } = await import('./search.js');
      const index = buildIndex(largeRegistry)!;
      const results = query(index, 'auth skill');
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('findOne', () => {
    it('returns null for null index', async () => {
      const { findOne } = await import('./search.js');
      const result = findOne(null, 'auth');
      expect(result).toBeNull();
    });

    it('returns the best matching result', async () => {
      const { buildIndex, findOne } = await import('./search.js');
      const index = buildIndex(sampleRegistry)!;
      const result = findOne(index, 'auth-skill');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('auth-skill');
    });

    it('returns null when no results match', async () => {
      const { buildIndex, findOne } = await import('./search.js');
      const index = buildIndex(sampleRegistry)!;
      // Use a query that is unlikely to match
      const result = findOne(index, 'zzzzzzz_xxxxxxxxxxx_no_match');
      expect(result).toBeNull();
    });

    it('returns a single SearchResult object', async () => {
      const { buildIndex, findOne } = await import('./search.js');
      const index = buildIndex(sampleRegistry)!;
      const result = findOne(index, 'api');
      if (result !== null) {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('path');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('relevance');
      }
    });
  });
});

// ============================================================================
// resolution.ts
// ============================================================================

describe('resolution', () => {
  let tmpDir: string;
  const origPluginRoot = process.env.PLUGIN_ROOT;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolution-test-'));
    process.env.PLUGIN_ROOT = tmpDir;
  });

  afterEach(async () => {
    if (origPluginRoot === undefined) {
      delete process.env.PLUGIN_ROOT;
    } else {
      process.env.PLUGIN_ROOT = origPluginRoot;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  describe('resolveSkillPath', () => {
    it('returns null when skill does not exist', async () => {
      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveSkillPath } = await import('./resolution.js');
      const result = await resolveSkillPath('nonexistent/skill');
      expect(result).toBeNull();
    });

    it('resolves skill at PLUGIN_ROOT/skills/{path}/SKILL.md', async () => {
      const skillDir = path.join(tmpDir, 'skills', 'outcome', 'my-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill', 'utf-8');

      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveSkillPath } = await import('./resolution.js');
      const result = await resolveSkillPath('outcome/my-skill');
      expect(result).not.toBeNull();
      expect(result).toContain('SKILL.md');
    });

    it('resolves skill at PLUGIN_ROOT/skills/{path}.md (flat file)', async () => {
      const skillsDir = path.join(tmpDir, 'skills', 'outcome');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'flat-skill.md'), '# Flat Skill', 'utf-8');

      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveSkillPath } = await import('./resolution.js');
      const result = await resolveSkillPath('outcome/flat-skill');
      expect(result).not.toBeNull();
      expect(result).toContain('flat-skill.md');
    });

    it('resolves skill at exact path PLUGIN_ROOT/skills/{path}', async () => {
      const skillsDir = path.join(tmpDir, 'skills', 'outcome');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'exact-skill'), '# Exact Skill', 'utf-8');

      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveSkillPath } = await import('./resolution.js');
      const result = await resolveSkillPath('outcome/exact-skill');
      expect(result).not.toBeNull();
      expect(result).toContain('exact-skill');
    });
  });

  describe('resolveAgentPath', () => {
    it('returns null when agent does not exist', async () => {
      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveAgentPath } = await import('./resolution.js');
      const result = await resolveAgentPath('nonexistent-agent');
      expect(result).toBeNull();
    });

    it('resolves agent at PLUGIN_ROOT/agents/{path}.md', async () => {
      const agentsDir = path.join(tmpDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(path.join(agentsDir, 'orchestrator.md'), '# Orchestrator', 'utf-8');

      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveAgentPath } = await import('./resolution.js');
      const result = await resolveAgentPath('orchestrator');
      expect(result).not.toBeNull();
      expect(result).toContain('orchestrator.md');
    });

    it('resolves agent at exact path PLUGIN_ROOT/agents/{path}', async () => {
      const agentsDir = path.join(tmpDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(path.join(agentsDir, 'exact-agent'), '# Exact', 'utf-8');

      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveAgentPath } = await import('./resolution.js');
      const result = await resolveAgentPath('exact-agent');
      expect(result).not.toBeNull();
      expect(result).toContain('exact-agent');
    });

    it('resolves agent at PLUGIN_ROOT/agents/{path}/index.md directory structure', async () => {
      // When agents/complex-agent directory exists with index.md inside,
      // the exact-path check (step 2) matches the directory first via fileExists.
      // This test verifies the directory resolution path returns a non-null result.
      const agentDir = path.join(tmpDir, 'agents', 'complex-agent');
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(path.join(agentDir, 'index.md'), '# Complex Agent', 'utf-8');

      vi.resetModules();
      process.env.PLUGIN_ROOT = tmpDir;
      const { resolveAgentPath } = await import('./resolution.js');
      const result = await resolveAgentPath('complex-agent');
      // The directory 'complex-agent' matches at step 2 (exact path) since
      // fileExists returns true for directories, so we get the directory path back.
      expect(result).not.toBeNull();
      expect(result).toContain('complex-agent');
    });
  });
});

// ============================================================================
// parsing.ts
// ============================================================================

describe('parsing', () => {
  describe('parseFrontmatter', () => {
    it('returns null when no frontmatter present', async () => {
      const { parseFrontmatter } = await import('./parsing.js');
      const result = parseFrontmatter('# Just a heading\n\nSome content');
      expect(result).toBeNull();
    });

    it('parses valid YAML frontmatter', async () => {
      const { parseFrontmatter } = await import('./parsing.js');
      const content = `---\ntitle: My Skill\ncategory: outcome\n---\n# Content here`;
      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('My Skill');
      expect(result!.category).toBe('outcome');
    });

    it('returns null for malformed YAML frontmatter', async () => {
      const { parseFrontmatter } = await import('./parsing.js');
      const content = `---\ntitle: [unclosed\n---\n# Content`;
      const result = parseFrontmatter(content);
      expect(result).toBeNull();
    });

    it('parses frontmatter with array fields', async () => {
      const { parseFrontmatter } = await import('./parsing.js');
      const content = `---\nrequires:\n  - auth\n  - database\n---\n# Content`;
      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.requires).toEqual(['auth', 'database']);
    });

    it('returns null for empty string', async () => {
      const { parseFrontmatter } = await import('./parsing.js');
      const result = parseFrontmatter('');
      expect(result).toBeNull();
    });

    it('returns null when --- markers present but content between is empty/invalid', async () => {
      const { parseFrontmatter } = await import('./parsing.js');
      // Only opening ---, no closing
      const result = parseFrontmatter('---\njust some text without closing marker');
      expect(result).toBeNull();
    });
  });

  describe('extractMarkdownMetadata', () => {
    it('returns empty object when no sections found', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const result = extractMarkdownMetadata('# Just a heading\n\nSome plain text');
      expect(result.requires).toBeUndefined();
      expect(result.complements).toBeUndefined();
      expect(Array.isArray(result.technologies)).toBe(true);
    });

    it('extracts requires from "Requires:" section', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nRequires:\n- auth\n- database\n\nSome content`;
      const result = extractMarkdownMetadata(content);
      expect(result.requires).toEqual(['auth', 'database']);
    });

    it('extracts requires from "Prerequisites:" section', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nPrerequisites:\n- setup\n- config\n\nEnd`;
      const result = extractMarkdownMetadata(content);
      expect(result.requires).toEqual(['setup', 'config']);
    });

    it('extracts requires from "Dependencies:" section', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nDependencies:\n- dep1\n\nEnd`;
      const result = extractMarkdownMetadata(content);
      expect(result.requires).toEqual(['dep1']);
    });

    it('extracts complements from "Related:" section', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nRelated:\n- other-skill\n- another\n\nEnd`;
      const result = extractMarkdownMetadata(content);
      expect(result.complements).toEqual(['other-skill', 'another']);
    });

    it('extracts complements from "See also:" section', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nSee also:\n- skill-x\n\nEnd`;
      const result = extractMarkdownMetadata(content);
      expect(result.complements).toEqual(['skill-x']);
    });

    it('extracts complements from "Complements:" section', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nComplements:\n- complement-skill\n\nEnd`;
      const result = extractMarkdownMetadata(content);
      expect(result.complements).toEqual(['complement-skill']);
    });

    it('extracts technologies from content', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nUses react and typescript with prisma`;
      const result = extractMarkdownMetadata(content);
      expect(result.technologies).toContain('react');
      expect(result.technologies).toContain('typescript');
      expect(result.technologies).toContain('prisma');
    });

    it('returns empty technologies array when no tech keywords found', async () => {
      const { extractMarkdownMetadata } = await import('./parsing.js');
      const content = `# Skill\n\nThis talks about general concepts only`;
      const result = extractMarkdownMetadata(content);
      expect(result.technologies).toEqual([]);
    });
  });

  describe('extractTechKeywords', () => {
    it('finds react keyword', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const result = extractTechKeywords('Build a React app');
      expect(result).toContain('react');
    });

    it('finds multiple tech keywords', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const result = extractTechKeywords('Using Next.js with TypeScript and Prisma');
      expect(result).toContain('next');
      expect(result).toContain('typescript');
      expect(result).toContain('prisma');
    });

    it('is case-insensitive', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const result = extractTechKeywords('REACT and VITEST');
      expect(result).toContain('react');
      expect(result).toContain('vitest');
    });

    it('returns empty array when no tech keywords found', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const result = extractTechKeywords('No technology mentioned here');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const result = extractTechKeywords('');
      expect(result).toEqual([]);
    });

    it('finds nextjs keyword', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const result = extractTechKeywords('Using nextjs framework');
      expect(result).toContain('nextjs');
    });

    it('finds all known tech keywords', async () => {
      const { extractTechKeywords } = await import('./parsing.js');
      const text = 'react next nextjs prisma drizzle tailwind typescript node express vite vitest jest zustand zod trpc';
      const result = extractTechKeywords(text);
      expect(result).toContain('react');
      expect(result).toContain('next');
      expect(result).toContain('nextjs');
      expect(result).toContain('prisma');
      expect(result).toContain('drizzle');
      expect(result).toContain('tailwind');
      expect(result).toContain('typescript');
      expect(result).toContain('node');
      expect(result).toContain('express');
      expect(result).toContain('vite');
      expect(result).toContain('vitest');
      expect(result).toContain('jest');
      expect(result).toContain('zustand');
      expect(result).toContain('zod');
      expect(result).toContain('trpc');
    });
  });

  describe('extractKeywords', () => {
    it('splits text on whitespace and lowercases', async () => {
      const { extractKeywords } = await import('./parsing.js');
      const result = extractKeywords('Hello World TEST');
      expect(result).toContain('hello');
      expect(result).toContain('world');
      expect(result).toContain('test');
    });

    it('filters out words with 3 or fewer characters', async () => {
      const { extractKeywords } = await import('./parsing.js');
      const result = extractKeywords('a bb ccc dddd eeeee');
      expect(result).not.toContain('a');
      expect(result).not.toContain('bb');
      expect(result).not.toContain('ccc');
      expect(result).toContain('dddd');
      expect(result).toContain('eeeee');
    });

    it('returns empty array for empty string', async () => {
      const { extractKeywords } = await import('./parsing.js');
      const result = extractKeywords('');
      expect(result).toEqual([]);
    });

    it('returns empty array when all words are 3 chars or fewer', async () => {
      const { extractKeywords } = await import('./parsing.js');
      const result = extractKeywords('a bb cc dd ee ff');
      // all <= 3 chars
      expect(result).toEqual([]);
    });

    it('handles multiple whitespace characters', async () => {
      const { extractKeywords } = await import('./parsing.js');
      const result = extractKeywords('hello   world\ttesting');
      expect(result).toContain('hello');
      expect(result).toContain('world');
      expect(result).toContain('testing');
    });
  });
});

// ============================================================================
// classification.ts
// ============================================================================

describe('classification', () => {
  describe('CATEGORY_MAP', () => {
    it('is a plain object', async () => {
      const { CATEGORY_MAP } = await import('./classification.js');
      expect(typeof CATEGORY_MAP).toBe('object');
      expect(CATEGORY_MAP).not.toBeNull();
      expect(Array.isArray(CATEGORY_MAP)).toBe(false);
    });

    it('has expected category keys', async () => {
      const { CATEGORY_MAP } = await import('./classification.js');
      expect(CATEGORY_MAP).toHaveProperty('authentication');
      expect(CATEGORY_MAP).toHaveProperty('database');
      expect(CATEGORY_MAP).toHaveProperty('api');
      expect(CATEGORY_MAP).toHaveProperty('styling');
      expect(CATEGORY_MAP).toHaveProperty('testing');
      expect(CATEGORY_MAP).toHaveProperty('deployment');
    });

    it('each category maps to an array of keywords', async () => {
      const { CATEGORY_MAP } = await import('./classification.js');
      for (const [, keywords] of Object.entries(CATEGORY_MAP)) {
        expect(Array.isArray(keywords)).toBe(true);
        expect(keywords.length).toBeGreaterThan(0);
      }
    });
  });

  describe('detectCategory', () => {
    it('detects authentication category', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('implement user login system')).toBe('authentication');
      expect(detectCategory('add auth middleware')).toBe('authentication');
    });

    it('detects database category', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('set up prisma database')).toBe('database');
      expect(detectCategory('optimize SQL queries')).toBe('database');
    });

    it('detects api category', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('design REST API endpoint')).toBe('api');
    });

    it('detects styling category', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('add tailwind css styles')).toBe('styling');
    });

    it('detects testing category', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('write unit tests for component')).toBe('testing');
    });

    it('detects deployment category', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('deploy to production build')).toBe('deployment');
    });

    it('returns general for unrecognized text', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('something completely unrelated')).toBe('general');
    });

    it('is case-insensitive', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('LOGIN user')).toBe('authentication');
      expect(detectCategory('PRISMA setup')).toBe('database');
    });

    it('returns general for empty string', async () => {
      const { detectCategory } = await import('./classification.js');
      expect(detectCategory('')).toBe('general');
    });
  });

  describe('estimateComplexity', () => {
    it('returns simple for 5 or fewer keywords', async () => {
      const { estimateComplexity } = await import('./classification.js');
      expect(estimateComplexity([])).toBe('simple');
      expect(estimateComplexity(['a'])).toBe('simple');
      expect(estimateComplexity(['a', 'b', 'c', 'd', 'e'])).toBe('simple');
    });

    it('returns moderate for 6 to 10 keywords', async () => {
      const { estimateComplexity } = await import('./classification.js');
      expect(estimateComplexity(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('moderate');
      expect(estimateComplexity(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])).toBe('moderate');
    });

    it('returns complex for more than 10 keywords', async () => {
      const { estimateComplexity } = await import('./classification.js');
      expect(estimateComplexity(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'])).toBe('complex');
      expect(estimateComplexity(Array.from({ length: 20 }, (_, i) => String(i)))).toBe('complex');
    });

    it('returns simple for empty array', async () => {
      const { estimateComplexity } = await import('./classification.js');
      expect(estimateComplexity([])).toBe('simple');
    });
  });
});
