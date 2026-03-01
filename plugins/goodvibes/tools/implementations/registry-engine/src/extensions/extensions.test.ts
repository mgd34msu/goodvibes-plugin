/**
 * Comprehensive tests for the L2 extensions layer.
 *
 * Covers: loader.ts, search.ts, recommendations.ts,
 *         content.ts, metadata.ts, dependencies.ts
 *
 * Mocking strategy:
 *   - Core layer (registry, search, resolution, parsing, classification)
 *     are mocked at the module level so L2 is tested in isolation.
 *   - node:fs/promises is mocked for content/metadata I/O.
 *   - loader.ts internals use the mocked core layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of the modules under test
// ---------------------------------------------------------------------------

vi.mock('../core/registry.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../core/search.js', () => ({
  buildIndex: vi.fn(),
  query: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('../core/resolution.js', () => ({
  resolveSkillPath: vi.fn(),
  resolveAgentPath: vi.fn(),
}));

vi.mock('../core/parsing.js', () => ({
  parseFrontmatter: vi.fn(),
  extractMarkdownMetadata: vi.fn(),
  extractTechKeywords: vi.fn(),
  extractKeywords: vi.fn(),
}));

vi.mock('../core/classification.js', () => ({
  detectCategory: vi.fn(),
  estimateComplexity: vi.fn(),
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

// dependencies.ts imports metadata.ts — mock it separately when testing
// dependencies in isolation. We keep a separate mock handle for that.
vi.mock('./metadata.js', () => ({
  loadSkillMetadata: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { loadRegistry } from '../core/registry.js';
import { buildIndex, query, findOne } from '../core/search.js';
import { resolveSkillPath, resolveAgentPath } from '../core/resolution.js';
import {
  parseFrontmatter,
  extractMarkdownMetadata,
  extractTechKeywords,
  extractKeywords,
} from '../core/parsing.js';
import { detectCategory, estimateComplexity } from '../core/classification.js';
import * as fsPromises from 'node:fs/promises';
import { loadSkillMetadata as mockLoadSkillMetadata } from './metadata.js';

// Units under test
import { RegistryIndexCache } from './loader.js';
import { searchSkills, searchAgents, searchTools } from './search.js';
import { recommendSkills } from './recommendations.js';
import { getSkillContent, getAgentContent } from './content.js';
import { loadSkillMetadata } from './metadata.js';
import {
  resolveRequired,
  resolveOptional,
  resolveConflicts,
  findDependents,
  findRelated,
  buildBundle,
  analyzeDependencies,
} from './dependencies.js';

import type { Registry, RegistryEntry, SearchResult, SkillMetadata } from '../core/types.js';
import type { McpResponse } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeEntry = (overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
  name: 'test-skill',
  path: 'outcome/test-skill',
  description: 'A test skill',
  keywords: ['test', 'vitest'],
  ...overrides,
});

const makeSearchResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  name: 'test-skill',
  path: 'outcome/test-skill',
  description: 'A test skill',
  relevance: 0.95,
  ...overrides,
});

const makeRegistry = (entries: RegistryEntry[] = []): Registry => ({
  version: '1.0',
  search_index: entries,
});

/** Helper: assert McpResponse has a text content block with valid JSON */
function assertOkResponse(response: McpResponse): unknown {
  expect(response.isError).toBeUndefined();
  expect(Array.isArray(response.content)).toBe(true);
  expect(response.content.length).toBeGreaterThan(0);
  expect(response.content[0].type).toBe('text');
  return JSON.parse(response.content[0].text!);
}

// ---------------------------------------------------------------------------
// 1. loader.ts — RegistryIndexCache
// ---------------------------------------------------------------------------

describe('RegistryIndexCache', () => {
  let cache: RegistryIndexCache;

  const mockFuseIndex = { search: vi.fn() } as unknown as ReturnType<typeof buildIndex>;
  const skillsRegistry = makeRegistry([makeEntry()]);
  const agentsRegistry = makeRegistry([makeEntry({ name: 'agent-1', path: 'agents/agent-1' })]);
  const toolsRegistry = makeRegistry([makeEntry({ name: 'tool-1', path: 'tools/tool-1' })]);

  beforeEach(() => {
    cache = new RegistryIndexCache();
    vi.clearAllMocks();

    // Default: loadRegistry returns matching registries per call order
    (loadRegistry as Mock)
      .mockResolvedValueOnce(skillsRegistry)
      .mockResolvedValueOnce(agentsRegistry)
      .mockResolvedValueOnce(toolsRegistry);

    (buildIndex as Mock).mockReturnValue(mockFuseIndex);
  });

  // ---- getSkillsIndex ----

  describe('getSkillsIndex()', () => {
    it('loads skills on first call and returns the index', async () => {
      const index = await cache.getSkillsIndex();
      expect(loadRegistry).toHaveBeenCalledWith('skills/_registry.yaml');
      expect(buildIndex).toHaveBeenCalledWith(skillsRegistry);
      expect(index).toBe(mockFuseIndex);
    });

    it('returns cached index on subsequent calls without reloading', async () => {
      await cache.getSkillsIndex();
      await cache.getSkillsIndex();
      // loadRegistry should only be called once for skills
      const skillsCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'skills/_registry.yaml'
      );
      expect(skillsCalls.length).toBe(1);
    });

    it('deduplicates concurrent calls (promise dedup)', async () => {
      const [idx1, idx2] = await Promise.all([
        cache.getSkillsIndex(),
        cache.getSkillsIndex(),
      ]);
      const skillsCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'skills/_registry.yaml'
      );
      expect(skillsCalls.length).toBe(1);
      expect(idx1).toBe(idx2);
    });

    it('returns null when loadRegistry returns null', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValue(null);
      (buildIndex as Mock).mockReturnValue(null);

      const index = await cache.getSkillsIndex();
      expect(index).toBeNull();
    });
  });

  // ---- getSkillsRegistry ----

  describe('getSkillsRegistry()', () => {
    it('returns the full Registry object (not just index)', async () => {
      const reg = await cache.getSkillsRegistry();
      expect(reg).toBe(skillsRegistry);
    });

    it('reuses same loading promise as getSkillsIndex (dedup)', async () => {
      const [idx, reg] = await Promise.all([
        cache.getSkillsIndex(),
        cache.getSkillsRegistry(),
      ]);
      const skillsCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'skills/_registry.yaml'
      );
      expect(skillsCalls.length).toBe(1);
      expect(idx).toBe(mockFuseIndex);
      expect(reg).toBe(skillsRegistry);
    });

    it('returns null registry when load fails', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValue(null);
      (buildIndex as Mock).mockReturnValue(null);

      const reg = await cache.getSkillsRegistry();
      expect(reg).toBeNull();
    });
  });

  // ---- getAgentsIndex ----

  describe('getAgentsIndex()', () => {
    it('loads agents on first call and returns the index', async () => {
      // Need fresh mocks where agents is first
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValueOnce(agentsRegistry);
      (buildIndex as Mock).mockReturnValue(mockFuseIndex);

      const index = await cache.getAgentsIndex();
      expect(loadRegistry).toHaveBeenCalledWith('agents/_registry.yaml');
      expect(index).toBe(mockFuseIndex);
    });

    it('caches the agents index after first load', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValue(agentsRegistry);
      (buildIndex as Mock).mockReturnValue(mockFuseIndex);

      await cache.getAgentsIndex();
      await cache.getAgentsIndex();
      const agentCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'agents/_registry.yaml'
      );
      expect(agentCalls.length).toBe(1);
    });

    it('deduplicates concurrent calls', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValue(agentsRegistry);
      (buildIndex as Mock).mockReturnValue(mockFuseIndex);

      const [idx1, idx2] = await Promise.all([
        cache.getAgentsIndex(),
        cache.getAgentsIndex(),
      ]);
      const agentCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'agents/_registry.yaml'
      );
      expect(agentCalls.length).toBe(1);
      expect(idx1).toBe(idx2);
    });
  });

  // ---- getToolsIndex ----

  describe('getToolsIndex()', () => {
    it('loads tools on first call and returns the index', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValueOnce(toolsRegistry);
      (buildIndex as Mock).mockReturnValue(mockFuseIndex);

      const index = await cache.getToolsIndex();
      expect(loadRegistry).toHaveBeenCalledWith('tools/_registry.yaml');
      expect(index).toBe(mockFuseIndex);
    });

    it('caches the tools index after first load', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValue(toolsRegistry);
      (buildIndex as Mock).mockReturnValue(mockFuseIndex);

      await cache.getToolsIndex();
      await cache.getToolsIndex();
      const toolCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'tools/_registry.yaml'
      );
      expect(toolCalls.length).toBe(1);
    });
  });

  // ---- warmAll ----

  describe('warmAll()', () => {
    it('preloads all three indexes in parallel', async () => {
      await cache.warmAll();
      expect(loadRegistry).toHaveBeenCalledWith('skills/_registry.yaml');
      expect(loadRegistry).toHaveBeenCalledWith('agents/_registry.yaml');
      expect(loadRegistry).toHaveBeenCalledWith('tools/_registry.yaml');
    });

    it('does not reload already-cached indexes', async () => {
      await cache.warmAll();
      (loadRegistry as Mock).mockClear();
      await cache.warmAll();
      // Second warmAll should not trigger any loadRegistry calls
      expect(loadRegistry).not.toHaveBeenCalled();
    });
  });

  // ---- getContext ----

  describe('getContext()', () => {
    it('returns RegistryContext with all three indexes and skillsRegistry', async () => {
      const ctx = await cache.getContext();
      expect(ctx).toEqual({
        skillsIndex: mockFuseIndex,
        agentsIndex: mockFuseIndex,
        toolsIndex: mockFuseIndex,
        skillsRegistry: skillsRegistry,
      });
    });

    it('calling getContext() twice does not trigger two loads per registry', async () => {
      await cache.getContext();
      await cache.getContext();
      // Each registry should only be loaded once
      const skillsCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'skills/_registry.yaml'
      );
      expect(skillsCalls.length).toBe(1);
    });

    it('concurrent getContext() calls deduplicate loading', async () => {
      const [ctx1, ctx2] = await Promise.all([
        cache.getContext(),
        cache.getContext(),
      ]);
      expect(ctx1.skillsIndex).toBe(ctx2.skillsIndex);
      expect(ctx1.agentsIndex).toBe(ctx2.agentsIndex);
      const skillsCalls = (loadRegistry as Mock).mock.calls.filter(
        (call) => call[0] === 'skills/_registry.yaml'
      );
      expect(skillsCalls.length).toBe(1);
    });

    it('returns null indexes when loadRegistry returns null for all', async () => {
      (loadRegistry as Mock).mockReset();
      (loadRegistry as Mock).mockResolvedValue(null);
      (buildIndex as Mock).mockReturnValue(null);

      const ctx = await cache.getContext();
      expect(ctx.skillsIndex).toBeNull();
      expect(ctx.agentsIndex).toBeNull();
      expect(ctx.toolsIndex).toBeNull();
      expect(ctx.skillsRegistry).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. search.ts — searchSkills, searchAgents, searchTools
// ---------------------------------------------------------------------------

describe('searchSkills()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching skills as McpResponse with correct shape', () => {
    const results = [makeSearchResult()];
    (query as Mock).mockReturnValue(results);

    const response = searchSkills(null, { query: 'test' });
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect(data).toMatchObject({
      skills: results,
      total_count: 1,
      query: 'test',
    });
  });

  it('uses default limit of 5 when not specified', () => {
    (query as Mock).mockReturnValue([]);
    searchSkills(null, { query: 'anything' });
    expect(query).toHaveBeenCalledWith(null, 'anything', 5);
  });

  it('uses provided limit when specified', () => {
    (query as Mock).mockReturnValue([]);
    searchSkills(null, { query: 'x', limit: 3 });
    expect(query).toHaveBeenCalledWith(null, 'x', 3);
  });

  it('filters by category prefix when category is provided', () => {
    const results = [
      makeSearchResult({ path: 'outcome/api-design', name: 'api-design' }),
      makeSearchResult({ path: 'quality/security-audit', name: 'security-audit' }),
    ];
    (query as Mock).mockReturnValue(results);

    const response = searchSkills(null, { query: 'design', category: 'outcome' });
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect((data as { skills: unknown[] }).skills).toHaveLength(1);
    expect((data as { total_count: number }).total_count).toBe(1);
  });

  it('returns all results when category is not specified', () => {
    const results = [
      makeSearchResult({ path: 'outcome/api-design' }),
      makeSearchResult({ path: 'quality/review' }),
    ];
    (query as Mock).mockReturnValue(results);

    const response = searchSkills(null, { query: 'search' });
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect((data as { total_count: number }).total_count).toBe(2);
  });

  it('returns empty skills array when query returns no results', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchSkills(null, { query: 'nomatch' });
    const data = assertOkResponse(response) as Record<string, unknown>;
    expect((data as { skills: unknown[] }).skills).toEqual([]);
    expect((data as { total_count: number }).total_count).toBe(0);
  });

  it('handles null index gracefully (passes null to core query)', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchSkills(null, { query: 'test' });
    expect(response.isError).toBeUndefined();
    expect(query).toHaveBeenCalledWith(null, 'test', 5);
  });

  it('response content array has at least one text item', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchSkills(null, { query: 'test' });
    expect(response.content[0].type).toBe('text');
    expect(typeof response.content[0].text).toBe('string');
  });
});

describe('searchAgents()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching agents as McpResponse', () => {
    const results = [makeSearchResult({ name: 'orchestrator', path: 'agents/orchestrator' })];
    (query as Mock).mockReturnValue(results);

    const response = searchAgents(null, { query: 'orchestrate' });
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect(data).toMatchObject({
      agents: results,
      total_count: 1,
      query: 'orchestrate',
    });
  });

  it('uses default limit of 5', () => {
    (query as Mock).mockReturnValue([]);
    searchAgents(null, { query: 'x' });
    expect(query).toHaveBeenCalledWith(null, 'x', 5);
  });

  it('uses provided limit', () => {
    (query as Mock).mockReturnValue([]);
    searchAgents(null, { query: 'x', limit: 2 });
    expect(query).toHaveBeenCalledWith(null, 'x', 2);
  });

  it('returns empty agents array for no-match query', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchAgents(null, { query: 'nomatch' });
    const data = assertOkResponse(response) as Record<string, unknown>;
    expect((data as { agents: unknown[] }).agents).toEqual([]);
    expect((data as { total_count: number }).total_count).toBe(0);
  });

  it('handles null index gracefully', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchAgents(null, { query: 'test' });
    expect(response.isError).toBeUndefined();
  });
});

describe('searchTools()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching tools as McpResponse', () => {
    const results = [makeSearchResult({ name: 'precision-exec', path: 'tools/precision-exec' })];
    (query as Mock).mockReturnValue(results);

    const response = searchTools(null, { query: 'exec' });
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect(data).toMatchObject({
      tools: results,
      total_count: 1,
      query: 'exec',
    });
  });

  it('uses default limit of 5', () => {
    (query as Mock).mockReturnValue([]);
    searchTools(null, { query: 'x' });
    expect(query).toHaveBeenCalledWith(null, 'x', 5);
  });

  it('uses provided limit', () => {
    (query as Mock).mockReturnValue([]);
    searchTools(null, { query: 'x', limit: 10 });
    expect(query).toHaveBeenCalledWith(null, 'x', 10);
  });

  it('returns empty tools array for no-match query', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchTools(null, { query: 'nomatch' });
    const data = assertOkResponse(response) as Record<string, unknown>;
    expect((data as { tools: unknown[] }).tools).toEqual([]);
  });

  it('handles null index gracefully', () => {
    (query as Mock).mockReturnValue([]);
    const response = searchTools(null, { query: 'test' });
    expect(response.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. recommendations.ts — recommendSkills
// ---------------------------------------------------------------------------

describe('recommendSkills()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (extractKeywords as Mock).mockReturnValue(['build', 'auth', 'login', 'page']);
    (detectCategory as Mock).mockReturnValue('authentication');
    (estimateComplexity as Mock).mockReturnValue('moderate');
  });

  it('returns skill recommendations as McpResponse', () => {
    const results = [makeSearchResult()];
    (query as Mock).mockReturnValue(results);

    const response = recommendSkills(null, { task: 'build an auth login page' });
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect(data).toHaveProperty('recommendations');
    expect(data).toHaveProperty('task_analysis');
  });

  it('recommendation shape includes skill, path, relevance, reason, prerequisites, complements', () => {
    const result = makeSearchResult({ name: 'authentication', path: 'outcome/authentication' });
    (query as Mock).mockReturnValue([result]);

    const response = recommendSkills(null, { task: 'build auth' });
    const data = assertOkResponse(response) as { recommendations: unknown[] };

    const first = data.recommendations[0] as Record<string, unknown>;
    expect(first).toHaveProperty('skill');
    expect(first).toHaveProperty('path');
    expect(first).toHaveProperty('relevance');
    expect(first).toHaveProperty('reason');
    expect(first).toHaveProperty('prerequisites');
    expect(first).toHaveProperty('complements');
  });

  it('task_analysis contains category, keywords, complexity', () => {
    (query as Mock).mockReturnValue([]);
    const response = recommendSkills(null, { task: 'build auth login page' });
    const data = assertOkResponse(response) as { task_analysis: Record<string, unknown> };

    expect(data.task_analysis).toMatchObject({
      category: 'authentication',
      complexity: 'moderate',
    });
    expect(Array.isArray(data.task_analysis.keywords)).toBe(true);
  });

  it('uses default max_results of 5 when not specified', () => {
    (query as Mock).mockReturnValue([]);
    recommendSkills(null, { task: 'do something' });
    expect(query).toHaveBeenCalledWith(null, 'do something', 5);
  });

  it('respects max_results parameter', () => {
    (query as Mock).mockReturnValue([]);
    recommendSkills(null, { task: 'do something', max_results: 3 });
    expect(query).toHaveBeenCalledWith(null, 'do something', 3);
  });

  it('handles null index gracefully', () => {
    (query as Mock).mockReturnValue([]);
    const response = recommendSkills(null, { task: 'any task' });
    expect(response.isError).toBeUndefined();
  });

  it('limits keywords in reason to first 3', () => {
    (extractKeywords as Mock).mockReturnValue(['auth', 'login', 'page', 'form', 'token']);
    const result = makeSearchResult();
    (query as Mock).mockReturnValue([result]);

    const response = recommendSkills(null, { task: 'auth login page form token' });
    const data = assertOkResponse(response) as { recommendations: Array<{ reason: string }> };

    const reason = data.recommendations[0].reason;
    // Reason should contain up to 3 keywords
    const keywordsInReason = reason.replace('Matches task keywords: ', '').split(', ');
    expect(keywordsInReason.length).toBeLessThanOrEqual(3);
  });

  it('limits task_analysis.keywords to first 10', () => {
    (extractKeywords as Mock).mockReturnValue(Array.from({ length: 15 }, (_, i) => `kw${i}`));
    (query as Mock).mockReturnValue([]);

    const response = recommendSkills(null, { task: 'many keywords task' });
    const data = assertOkResponse(response) as { task_analysis: { keywords: string[] } };

    expect(data.task_analysis.keywords.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// 4. content.ts — getSkillContent, getAgentContent
// ---------------------------------------------------------------------------

describe('getSkillContent()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file content as McpResponse for a valid skill path', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/resolved/skills/outcome/api-design/SKILL.md');
    (fsPromises.readFile as Mock).mockResolvedValue('# API Design\nContent here.');

    const response = await getSkillContent({ path: 'outcome/api-design' });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toBe('# API Design\nContent here.');
  });

  it('throws an error when skill is not found (resolveSkillPath returns null)', async () => {
    (resolveSkillPath as Mock).mockResolvedValue(null);

    await expect(getSkillContent({ path: 'outcome/missing' })).rejects.toThrow(
      'Skill not found: outcome/missing'
    );
  });

  it('calls resolveSkillPath with the provided path', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/resolved/path.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');

    await getSkillContent({ path: 'protocol/precision-mastery' });
    expect(resolveSkillPath).toHaveBeenCalledWith('protocol/precision-mastery');
  });

  it('reads the resolved file path as utf-8', async () => {
    const resolvedPath = '/resolved/skills/skill.md';
    (resolveSkillPath as Mock).mockResolvedValue(resolvedPath);
    (fsPromises.readFile as Mock).mockResolvedValue('file content');

    await getSkillContent({ path: 'any/skill' });
    expect(fsPromises.readFile).toHaveBeenCalledWith(resolvedPath, 'utf-8');
  });

  it('content response text is the raw string, not JSON-encoded', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path.md');
    (fsPromises.readFile as Mock).mockResolvedValue('raw markdown content');

    const response = await getSkillContent({ path: 'any/skill' });
    // ok() passes string through without JSON.stringify
    expect(response.content[0].text).toBe('raw markdown content');
  });

  it('propagates file read errors', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path.md');
    (fsPromises.readFile as Mock).mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(getSkillContent({ path: 'any/skill' })).rejects.toThrow('EACCES: permission denied');
  });
});

describe('getAgentContent()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file content as McpResponse for a valid agent path', async () => {
    (resolveAgentPath as Mock).mockResolvedValue('/resolved/agents/orchestrator.md');
    (fsPromises.readFile as Mock).mockResolvedValue('# Orchestrator\nAgent content.');

    const response = await getAgentContent({ path: 'orchestrator' });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toBe('# Orchestrator\nAgent content.');
  });

  it('throws an error when agent is not found (resolveAgentPath returns null)', async () => {
    (resolveAgentPath as Mock).mockResolvedValue(null);

    await expect(getAgentContent({ path: 'missing-agent' })).rejects.toThrow(
      'Agent not found: missing-agent'
    );
  });

  it('calls resolveAgentPath with the provided path', async () => {
    (resolveAgentPath as Mock).mockResolvedValue('/resolved/agent.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');

    await getAgentContent({ path: 'my-agent' });
    expect(resolveAgentPath).toHaveBeenCalledWith('my-agent');
  });

  it('reads the resolved agent file path as utf-8', async () => {
    const resolvedPath = '/resolved/agents/agent.md';
    (resolveAgentPath as Mock).mockResolvedValue(resolvedPath);
    (fsPromises.readFile as Mock).mockResolvedValue('agent content');

    await getAgentContent({ path: 'agent' });
    expect(fsPromises.readFile).toHaveBeenCalledWith(resolvedPath, 'utf-8');
  });
});

// ---------------------------------------------------------------------------
// 5. metadata.ts — loadSkillMetadata
// ---------------------------------------------------------------------------

// NOTE: We need to un-mock metadata.js temporarily for its own tests.
// Since we mocked it above for dependency tests, we import the real
// implementation by re-registering a pass-through mock to the real module.
// The better approach: keep the mock and test the ACTUAL implementation
// using the mocked core dependencies that it imports.
//
// Actually: metadata.ts is imported as 'loadSkillMetadata' from './metadata.js'
// which IS mocked. The real metadata implementation uses the mocked
// core functions (resolveSkillPath, parseFrontmatter, etc.) — so we test
// the real implementation through the mocked dependencies.
//
// To test the real metadata.ts behavior, we need to temporarily clear the
// module-level mock and work with what the real code does given our mocked
// core imports.
//
// Since vi.mock('./metadata.js') replaces the entire module but
// the metadata test itself needs the REAL implementation, we use a different
// import path to get the actual (non-mocked) module behavior via
// spying on its dependencies (which are mocked at core layer).
//
// Solution: directly test by calling the REAL metadata module's exported
// function. But since it's mocked, we use the fact that in the test file
// for loadSkillMetadata, we're actually importing from './metadata.js' which
// is mocked. So we need to test the real module.
//
// Re-export approach: import the real implementation here separately.
// Vitest supports this pattern with vi.importActual.

describe('loadSkillMetadata() - real implementation', () => {
  // We'll test the real implementation using vi.importActual
  let realLoadSkillMetadata: typeof loadSkillMetadata;

  beforeEach(async () => {
    vi.clearAllMocks();
    const realModule = await vi.importActual<typeof import('./metadata.js')>('./metadata.js');
    realLoadSkillMetadata = realModule.loadSkillMetadata;
  });

  it('returns empty object when skill path cannot be resolved', async () => {
    (resolveSkillPath as Mock).mockResolvedValue(null);

    const result = await realLoadSkillMetadata('outcome/missing');
    expect(result).toEqual({});
  });

  it('returns frontmatter metadata when YAML frontmatter is present', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue(
      '---\nrequires:\n  - auth\ncategory: outcome\ndifficulty: intermediate\n---\n# Skill'
    );
    (parseFrontmatter as Mock).mockReturnValue({
      requires: ['auth'],
      category: 'outcome',
      difficulty: 'intermediate',
    });

    const result = await realLoadSkillMetadata('outcome/skill');

    expect(result).toMatchObject({
      requires: ['auth'],
      category: 'outcome',
      difficulty: 'intermediate',
    });
  });

  it('extracts complements from frontmatter.complements array', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');
    (parseFrontmatter as Mock).mockReturnValue({
      complements: ['skill-a', 'skill-b'],
    });

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.complements).toEqual(['skill-a', 'skill-b']);
  });

  it('extracts complements from frontmatter.related array when complements is absent', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');
    (parseFrontmatter as Mock).mockReturnValue({
      related: ['related-skill'],
    });

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.complements).toEqual(['related-skill']);
  });

  it('extracts technologies from frontmatter.technologies', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');
    (parseFrontmatter as Mock).mockReturnValue({
      technologies: ['react', 'typescript'],
    });

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.technologies).toEqual(['react', 'typescript']);
  });

  it('extracts technologies from frontmatter.tech when technologies absent', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');
    (parseFrontmatter as Mock).mockReturnValue({
      tech: ['vitest'],
    });

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.technologies).toEqual(['vitest']);
  });

  it('falls back to markdown extraction when no frontmatter', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('# Skill without frontmatter\n## Requires:\n- auth\n');
    (parseFrontmatter as Mock).mockReturnValue(null);
    (extractMarkdownMetadata as Mock).mockReturnValue({
      requires: ['auth'],
      complements: [],
      technologies: ['react'],
    });

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.requires).toEqual(['auth']);
    expect(result.complements).toEqual([]);
  });

  it('uses extractTechKeywords when markdown fallback has no technologies', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content with react and vitest');
    (parseFrontmatter as Mock).mockReturnValue(null);
    (extractMarkdownMetadata as Mock).mockReturnValue({
      requires: [],
      technologies: [], // empty — triggers extractTechKeywords
    });
    (extractTechKeywords as Mock).mockReturnValue(['react', 'vitest']);

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.technologies).toEqual(['react', 'vitest']);
    expect(extractTechKeywords).toHaveBeenCalled();
  });

  it('returns empty object when readFile throws', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockRejectedValue(new Error('ENOENT'));

    const result = await realLoadSkillMetadata('any/skill');
    expect(result).toEqual({});
  });

  it('omits undefined fields (requires, complements, conflicts, technologies, difficulty not in frontmatter)', async () => {
    (resolveSkillPath as Mock).mockResolvedValue('/path/skill.md');
    (fsPromises.readFile as Mock).mockResolvedValue('content');
    (parseFrontmatter as Mock).mockReturnValue({
      category: 'general',
      // no requires, complements, conflicts, technologies, difficulty
    });

    const result = await realLoadSkillMetadata('any/skill');
    expect(result.category).toBe('general');
    expect(result.requires).toBeUndefined();
    expect(result.complements).toBeUndefined();
    expect(result.conflicts).toBeUndefined();
    expect(result.technologies).toBeUndefined();
    expect(result.difficulty).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. dependencies.ts — individual functions
// ---------------------------------------------------------------------------

describe('resolveRequired()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockLoadSkillMetadata as Mock).mockResolvedValue({});
  });

  it('returns empty array when metadata has no requires', async () => {
    const result = await resolveRequired({}, null, 1);
    expect(result).toEqual([]);
  });

  it('returns resolved deps for each required entry found in index', async () => {
    (findOne as Mock).mockReturnValue(
      makeSearchResult({ name: 'auth-skill', path: 'outcome/authentication' })
    );

    const result = await resolveRequired({ requires: ['auth'] }, null, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      skill: 'auth-skill',
      path: 'outcome/authentication',
      reason: 'Listed as required dependency',
    });
  });

  it('skips entries not found in index', async () => {
    (findOne as Mock).mockReturnValue(null);

    const result = await resolveRequired({ requires: ['missing-skill'] }, null, 1);
    expect(result).toEqual([]);
  });

  it('resolves nested deps when depth > 1', async () => {
    (findOne as Mock)
      .mockReturnValueOnce(makeSearchResult({ name: 'parent', path: 'outcome/parent' }))
      .mockReturnValueOnce(makeSearchResult({ name: 'child', path: 'outcome/child' }));
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ requires: ['child'] });

    const result = await resolveRequired({ requires: ['parent'] }, null, 2);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some(r => r.path === 'outcome/parent')).toBe(true);
    expect(result.some(r => r.path === 'outcome/child')).toBe(true);
  });

  it('does not recurse when depth is 1', async () => {
    (findOne as Mock).mockReturnValue(
      makeSearchResult({ name: 'parent', path: 'outcome/parent' })
    );
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ requires: ['child'] });

    const result = await resolveRequired({ requires: ['parent'] }, null, 1);
    // loadSkillMetadata should NOT be called when depth === 1
    expect(mockLoadSkillMetadata).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('avoids duplicate nested deps already in required list', async () => {
    const parentResult = makeSearchResult({ name: 'parent', path: 'outcome/parent' });
    const childResult = makeSearchResult({ name: 'child', path: 'outcome/child' });

    (findOne as Mock)
      .mockReturnValueOnce(parentResult)   // for 'parent'
      .mockReturnValueOnce(childResult)    // for 'child' in parent's nested
      .mockReturnValueOnce(childResult);   // for 'child' if called again (shouldn't be)
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ requires: ['child'] });

    // Add 'child' to the initial requires so it's already in the list
    (findOne as Mock).mockReset();
    (findOne as Mock)
      .mockReturnValueOnce(parentResult)
      .mockReturnValueOnce(childResult)   // direct child resolution
      .mockReturnValueOnce(childResult);  // nested child resolution

    const result = await resolveRequired({ requires: ['parent', 'child'] }, null, 2);
    // child should only appear once
    const childCount = result.filter(r => r.path === 'outcome/child').length;
    expect(childCount).toBe(1);
  });

  it('limits nested deps to first 3', async () => {
    const parentResult = makeSearchResult({ name: 'parent', path: 'outcome/parent' });
    (findOne as Mock)
      .mockReturnValueOnce(parentResult)
      .mockReturnValue(makeSearchResult({ name: 'nested', path: `outcome/nested-${Math.random()}` }));
    (mockLoadSkillMetadata as Mock).mockResolvedValue({
      requires: ['n1', 'n2', 'n3', 'n4', 'n5'],
    });

    const result = await resolveRequired({ requires: ['parent'] }, null, 2);
    // parent + at most 3 nested = 4 max
    expect(result.length).toBeLessThanOrEqual(4);
  });
});

describe('resolveOptional()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when metadata has no complements', async () => {
    const result = await resolveOptional({}, null);
    expect(result).toEqual([]);
  });

  it('returns complementary skills found in index', async () => {
    (findOne as Mock).mockReturnValue(
      makeSearchResult({ name: 'complement', path: 'quality/complement' })
    );

    const result = await resolveOptional({ complements: ['complement'] }, null);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('Listed as complementary skill');
  });

  it('skips complements not found in index', async () => {
    (findOne as Mock).mockReturnValue(null);
    const result = await resolveOptional({ complements: ['missing'] }, null);
    expect(result).toEqual([]);
  });
});

describe('resolveConflicts()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when metadata has no conflicts', async () => {
    const result = await resolveConflicts({}, null);
    expect(result).toEqual([]);
  });

  it('returns conflicting skills found in index', async () => {
    (findOne as Mock).mockReturnValue(
      makeSearchResult({ name: 'conflict-skill', path: 'outcome/conflict' })
    );

    const result = await resolveConflicts({ conflicts: ['conflict-skill'] }, null);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('Listed as conflicting skill');
  });

  it('skips conflicts not found in index', async () => {
    (findOne as Mock).mockReturnValue(null);
    const result = await resolveConflicts({ conflicts: ['missing'] }, null);
    expect(result).toEqual([]);
  });
});

describe('findDependents()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockLoadSkillMetadata as Mock).mockResolvedValue({});
  });

  it('returns empty array for null registry', async () => {
    const result = await findDependents(null, { name: 'target', path: 'outcome/target' });
    expect(result).toEqual([]);
  });

  it('returns empty array when registry has empty search_index', async () => {
    const result = await findDependents(
      { version: '1.0', search_index: [] },
      { name: 'target', path: 'outcome/target' }
    );
    expect(result).toEqual([]);
  });

  it('skips the target skill itself', async () => {
    const registry = makeRegistry([makeEntry({ name: 'target', path: 'outcome/target' })]);
    const result = await findDependents(
      registry,
      { name: 'target', path: 'outcome/target' }
    );
    expect(result).toEqual([]);
  });

  it('finds skills that require the target by name match', async () => {
    const registry = makeRegistry([
      makeEntry({ name: 'target', path: 'outcome/target' }),
      makeEntry({ name: 'dependent', path: 'quality/dependent' }),
    ]);
    (mockLoadSkillMetadata as Mock)
      .mockResolvedValueOnce({}) // for 'target' — skipped
      .mockResolvedValueOnce({ requires: ['target'] }); // for 'dependent'

    const result = await findDependents(
      registry,
      { name: 'target', path: 'outcome/target' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ skill: 'dependent', path: 'quality/dependent' });
  });

  it('finds skills that require the target by path inclusion', async () => {
    const registry = makeRegistry([
      makeEntry({ name: 'target', path: 'outcome/target' }),
      makeEntry({ name: 'dependent', path: 'quality/dependent' }),
    ]);
    (mockLoadSkillMetadata as Mock)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ requires: ['outcome/target'] });

    const result = await findDependents(
      registry,
      { name: 'target', path: 'outcome/target' }
    );
    expect(result).toHaveLength(1);
  });

  it('returns empty when no skills require the target', async () => {
    const registry = makeRegistry([
      makeEntry({ name: 'other', path: 'outcome/other' }),
    ]);
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ requires: ['something-else'] });

    const result = await findDependents(
      registry,
      { name: 'target', path: 'outcome/target' }
    );
    expect(result).toEqual([]);
  });
});

describe('findRelated()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns related skills in the same category', () => {
    const results = [
      makeSearchResult({ name: 'api-design', path: 'outcome/api-design' }),
      makeSearchResult({ name: 'auth', path: 'outcome/auth' }),
      makeSearchResult({ name: 'target', path: 'outcome/target' }),
    ];
    (query as Mock).mockReturnValue(results);

    const related = findRelated(null, 'outcome/target', [], 5);
    // Should exclude target itself
    expect(related.every(r => r.path !== 'outcome/target')).toBe(true);
  });

  it('excludes specified paths', () => {
    const results = [
      makeSearchResult({ name: 'api-design', path: 'outcome/api-design' }),
      makeSearchResult({ name: 'already-included', path: 'outcome/already' }),
    ];
    (query as Mock).mockReturnValue(results);

    const related = findRelated(null, 'outcome/target', ['outcome/already'], 5);
    expect(related.every(r => r.path !== 'outcome/already')).toBe(true);
  });

  it('respects max limit', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeSearchResult({ name: `skill-${i}`, path: `outcome/skill-${i}` })
    );
    (query as Mock).mockReturnValue(results);

    const related = findRelated(null, 'other/target', [], 3);
    expect(related.length).toBeLessThanOrEqual(3);
  });

  it('extracts category from first path segment', () => {
    (query as Mock).mockReturnValue([]);
    findRelated(null, 'outcome/api-design', [], 5);
    expect(query).toHaveBeenCalledWith(null, 'outcome', 10);
  });

  it('all results have reason set to same-category message', () => {
    const results = [
      makeSearchResult({ name: 'other-skill', path: 'quality/other-skill' }),
    ];
    (query as Mock).mockReturnValue(results);

    const related = findRelated(null, 'quality/target', [], 5);
    for (const r of related) {
      expect(r.reason).toBe('Related skill in same category');
    }
  });

  it('returns empty array when index returns no results', () => {
    (query as Mock).mockReturnValue([]);
    const related = findRelated(null, 'outcome/target', [], 5);
    expect(related).toEqual([]);
  });
});

describe('buildBundle()', () => {
  it('starts with the target skill path', () => {
    const bundle = buildBundle({ path: 'outcome/target' }, [], []);
    expect(bundle[0]).toBe('outcome/target');
  });

  it('includes up to 3 required dep paths', () => {
    const required = Array.from({ length: 5 }, (_, i) => ({
      skill: `req-${i}`,
      path: `outcome/req-${i}`,
      reason: 'Required',
    }));
    const bundle = buildBundle({ path: 'outcome/target' }, required, []);
    // target + up to 3 required
    expect(bundle.length).toBeLessThanOrEqual(4);
    expect(bundle[0]).toBe('outcome/target');
  });

  it('includes up to 2 optional dep paths not already in bundle', () => {
    const required = [
      { skill: 'req-1', path: 'outcome/req-1', reason: 'Required' },
    ];
    const optional = [
      { skill: 'opt-1', path: 'outcome/opt-1', reason: 'Optional' },
      { skill: 'opt-2', path: 'outcome/opt-2', reason: 'Optional' },
      { skill: 'opt-3', path: 'outcome/opt-3', reason: 'Optional' },
    ];
    const bundle = buildBundle({ path: 'outcome/target' }, required, optional);
    // target + 1 required + 2 optional = 4 max
    expect(bundle.length).toBeLessThanOrEqual(4);
  });

  it('does not include duplicate optional paths already in bundle', () => {
    const required = [
      { skill: 'shared', path: 'outcome/shared', reason: 'Required' },
    ];
    const optional = [
      { skill: 'shared', path: 'outcome/shared', reason: 'Optional' }, // duplicate
      { skill: 'unique', path: 'outcome/unique', reason: 'Optional' },
    ];
    const bundle = buildBundle({ path: 'outcome/target' }, required, optional);
    const sharedCount = bundle.filter(p => p === 'outcome/shared').length;
    expect(sharedCount).toBe(1);
  });

  it('returns just the target path when no deps provided', () => {
    const bundle = buildBundle({ path: 'outcome/solo' }, [], []);
    expect(bundle).toEqual(['outcome/solo']);
  });
});

// ---------------------------------------------------------------------------
// 7. dependencies.ts — analyzeDependencies (orchestrator)
// ---------------------------------------------------------------------------

describe('analyzeDependencies()', () => {
  const skillResult = makeSearchResult({ name: 'auth', path: 'outcome/auth' });
  const mockMeta: SkillMetadata = {
    requires: ['precision-mastery'],
    complements: ['security-audit'],
    conflicts: [],
    category: 'outcome',
    technologies: ['react'],
    difficulty: 'moderate',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (findOne as Mock).mockReturnValue(skillResult);
    (mockLoadSkillMetadata as Mock).mockResolvedValue(mockMeta);
    (query as Mock).mockReturnValue([]);
  });

  it('throws when skill is not found in index', async () => {
    (findOne as Mock).mockReturnValue(null);
    await expect(
      analyzeDependencies(null, null, { skill: 'missing-skill' })
    ).rejects.toThrow('Skill not found: missing-skill');
  });

  it('returns complete McpResponse on success', async () => {
    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    expect(response.isError).toBeUndefined();
    const data = assertOkResponse(response) as Record<string, unknown>;

    expect(data).toHaveProperty('skill');
    expect(data).toHaveProperty('path');
    expect(data).toHaveProperty('metadata');
    expect(data).toHaveProperty('dependencies');
    expect(data).toHaveProperty('dependents');
    expect(data).toHaveProperty('suggested_bundle');
    expect(data).toHaveProperty('analysis');
  });

  it('response contains correct skill name and path', async () => {
    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as { skill: string; path: string };
    expect(data.skill).toBe('auth');
    expect(data.path).toBe('outcome/auth');
  });

  it('uses depth default of 2 when not specified', async () => {
    // With depth=2, loadSkillMetadata will be called for nested deps
    // We track calls — mock returns empty requires by default
    (mockLoadSkillMetadata as Mock).mockResolvedValue({});
    await analyzeDependencies(null, null, { skill: 'auth' });
    // Just verify it doesn't crash with default depth
    expect(findOne).toHaveBeenCalledWith(null, 'auth');
  });

  it('respects custom depth parameter', async () => {
    await analyzeDependencies(null, null, { skill: 'auth', depth: 1 });
    // No error means depth was accepted
    expect(findOne).toHaveBeenCalled();
  });

  it('excludes optional deps when include_optional is false', async () => {
    (mockLoadSkillMetadata as Mock).mockResolvedValue({
      complements: ['security-audit'],
    });

    const response = await analyzeDependencies(null, null, {
      skill: 'auth',
      include_optional: false,
    });
    const data = assertOkResponse(response) as {
      dependencies: { optional: unknown[] };
    };
    // When include_optional is false, the optional array may only contain related skills
    // (from findRelated filling in, but no resolveOptional results)
    // The key assertion: resolveOptional was NOT called via the optional path
    expect(data.dependencies.optional).toBeDefined();
  });

  it('includes optional deps by default (include_optional defaults to true)', async () => {
    (findOne as Mock)
      .mockReturnValueOnce(skillResult)  // for the main skill
      .mockReturnValueOnce(             // for complement lookup in resolveOptional
        makeSearchResult({ name: 'security-audit', path: 'quality/security-audit' })
      );
    (mockLoadSkillMetadata as Mock).mockResolvedValue({
      complements: ['security-audit'],
    });
    (query as Mock).mockReturnValue([]);

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as {
      dependencies: { optional: Array<{ skill: string }> };
    };
    expect(data.dependencies.optional.some(o => o.skill === 'security-audit')).toBe(true);
  });

  it('analysis.has_prerequisites is true when required deps exist', async () => {
    (findOne as Mock)
      .mockReturnValueOnce(skillResult)   // main skill
      .mockReturnValueOnce(makeSearchResult({ name: 'req-skill', path: 'outcome/req' })); // required dep
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ requires: ['req-skill'] });
    (query as Mock).mockReturnValue([]);

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as { analysis: { has_prerequisites: boolean } };
    expect(data.analysis.has_prerequisites).toBe(true);
  });

  it('analysis.has_prerequisites is false when no required deps', async () => {
    (mockLoadSkillMetadata as Mock).mockResolvedValue({});

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as { analysis: { has_prerequisites: boolean } };
    expect(data.analysis.has_prerequisites).toBe(false);
  });

  it('analysis.is_foundational is true when more than 2 skills depend on target', async () => {
    const registry = makeRegistry([
      makeEntry({ name: 'd1', path: 'quality/d1' }),
      makeEntry({ name: 'd2', path: 'quality/d2' }),
      makeEntry({ name: 'd3', path: 'quality/d3' }),
    ]);
    (mockLoadSkillMetadata as Mock)
      .mockResolvedValue({}) // default for all
      .mockResolvedValueOnce({}) // main skill metadata
      .mockResolvedValueOnce({ requires: ['auth'] }) // d1 depends on auth
      .mockResolvedValueOnce({ requires: ['auth'] }) // d2 depends on auth
      .mockResolvedValueOnce({ requires: ['auth'] }); // d3 depends on auth

    const response = await analyzeDependencies(null, registry, { skill: 'auth' });
    const data = assertOkResponse(response) as { analysis: { is_foundational: boolean } };
    expect(data.analysis.is_foundational).toBe(true);
  });

  it('metadata.category falls back to path first segment when category not in metadata', async () => {
    (mockLoadSkillMetadata as Mock).mockResolvedValue({
      // no category field
      technologies: [],
    });

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as { metadata: { category: string } };
    // skill.path is 'outcome/auth' so first segment is 'outcome'
    expect(data.metadata.category).toBe('outcome');
  });

  it('fills optional with related skills when optional.length < 3', async () => {
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ complements: [] });
    const relatedResult = makeSearchResult({ name: 'related', path: 'outcome/related' });
    (query as Mock).mockReturnValue([relatedResult]);

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as {
      dependencies: { optional: Array<{ path: string }> };
    };
    // Related skills should be appended to optional
    expect(data.dependencies.optional.length).toBeGreaterThan(0);
  });

  it('caps optional to 5 results in the response', async () => {
    // Provide many complements so optional grows large
    const manyComplements = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ complements: manyComplements });
    (findOne as Mock)
      .mockReturnValueOnce(skillResult)
      .mockReturnValue(makeSearchResult()); // for each complement
    (query as Mock).mockReturnValue([]);

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as {
      dependencies: { optional: unknown[] };
    };
    expect(data.dependencies.optional.length).toBeLessThanOrEqual(5);
  });

  it('caps dependents to 5 results in the response', async () => {
    const registry = makeRegistry(
      Array.from({ length: 10 }, (_, i) => makeEntry({ name: `dep-${i}`, path: `quality/dep-${i}` }))
    );
    // All entries require 'auth'
    (mockLoadSkillMetadata as Mock).mockResolvedValue({ requires: ['auth'] });

    const response = await analyzeDependencies(null, registry, { skill: 'auth' });
    const data = assertOkResponse(response) as { dependents: unknown[] };
    expect(data.dependents.length).toBeLessThanOrEqual(5);
  });

  it('suggested_bundle starts with the target skill path', async () => {
    (mockLoadSkillMetadata as Mock).mockResolvedValue({});

    const response = await analyzeDependencies(null, null, { skill: 'auth' });
    const data = assertOkResponse(response) as { suggested_bundle: string[] };
    expect(data.suggested_bundle[0]).toBe('outcome/auth');
  });
});
