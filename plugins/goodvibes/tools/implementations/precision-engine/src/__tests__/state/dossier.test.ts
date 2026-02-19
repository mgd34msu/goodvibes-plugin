/**
 * Tests for DossierGenerator — Phase 5H agent context package generator.
 *
 * Tests cover:
 * - Full dossier generation with all options
 * - Memory injection (with and without memory files)
 * - Scope-based filtering (decisions/patterns/failures)
 * - Project summary generation (with and without index)
 * - Default reminders content
 * - Prompt formatting (minified JSON after separator)
 * - Output format inclusion (null vs structured)
 * - Graceful degradation (missing memory, missing index)
 * - Prior results passthrough
 * - Constraint merging with defaults
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fsPromises from 'fs/promises';

// Mock fs/promises before importing DossierGenerator
vi.mock('fs/promises');

import { DossierGenerator } from '../../state/dossier.js';
import type {
  AgentDossier,
  DossierOptions,
  DossierOutputFormat,
} from '../../state/dossier.js';
import type { ProjectIndex, FileEntry } from '../../state/project-index.js';

// ───────────────────────────────────────────────────────────────────────────
// Test helpers
// ───────────────────────────────────────────────────────────────────────────

/** Create a minimal mock ProjectIndex. */
function makeMockIndex(overrides: Partial<{
  files: FileEntry[];
  typeCounts: Record<string, number>;
  filesByPrefix: FileEntry[];
}> = {}): ProjectIndex {
  const files = overrides.files ?? [];
  const typeCounts = overrides.typeCounts ?? {};
  return {
    getFiles: vi.fn().mockReturnValue(files),
    getTypeCounts: vi.fn().mockReturnValue(typeCounts),
    getFilesByPrefix: vi.fn().mockImplementation((prefix: string) =>
      overrides.filesByPrefix ?? files.filter((f) => f.p.startsWith(prefix)),
    ),
  } as unknown as ProjectIndex;
}

/** Build sample FileEntry objects. */
function makeFileEntry(p: string, tokens = 100, size = 1000): FileEntry {
  return { p, size, tokens };
}

/** Sample decisions JSON content. */
const SAMPLE_DECISIONS_JSON = JSON.stringify({
  decisions: [
    { id: 'dec-1', what: 'Use Prisma ORM', why: 'Type safety + migrations', scope: ['src/db/'] },
    { id: 'dec-2', what: 'Use NextAuth', why: 'Best DX for Next.js', scope: ['src/auth/'] },
    { id: 'dec-3', what: 'Use Tailwind', why: 'Rapid prototyping', scope: [] },
    { id: 'dec-4', what: 'Use Zustand', why: 'Simpler than Redux', scope: ['src/store/'] },
    { id: 'dec-5', what: 'Use tRPC', why: 'Full-stack type safety', scope: ['src/api/'] },
    { id: 'dec-6', what: 'Use shadcn/ui', why: 'Customizable components', scope: ['src/components/'] },
  ],
});

/** Sample patterns JSON content. */
const SAMPLE_PATTERNS_JSON = JSON.stringify({
  patterns: [
    {
      id: 'pat-1',
      name: 'DPB Loop',
      description: 'Discover-Plan-Batch execution pattern',
      keywords: ['discover', 'batch', 'plan'],
      applies_to: ['tooling', 'orchestration'],
    },
    {
      id: 'pat-2',
      name: 'Singleton Registry',
      description: 'Using getInstance() for singleton management',
      keywords: ['singleton', 'registry'],
      applies_to: ['state'],
    },
    {
      id: 'pat-3',
      name: 'Graceful Degradation',
      description: 'Returning null/empty on missing resources',
      keywords: ['degradation', 'fallback', 'null'],
      applies_to: ['error-handling'],
    },
  ],
  meta: { last_updated: '2026-02-18', total_patterns: 3, version: '1.0.0' },
});

/** Sample failures JSON content. */
const SAMPLE_FAILURES_JSON = JSON.stringify({
  failures: [
    {
      error: 'Missing .js extension in ESM imports',
      resolution: 'Always add .js extension for ESM imports',
      keywords: ['esm', 'import', 'extension'],
      scope: ['src/'],
    },
    {
      error: 'fs/promises mock must be set up before import',
      resolution: 'Call vi.mock before importing modules that use fs',
      keywords: ['vitest', 'mock', 'fs'],
      scope: ['src/__tests__/'],
    },
    {
      error: 'Tree-sitter segfault on large files',
      resolution: 'Use symbols() fallback with TS compiler API',
      keywords: ['tree-sitter', 'symbols', 'parse'],
      scope: ['src/core/'],
    },
  ],
});

// ───────────────────────────────────────────────────────────────────────────
// Setup
// ───────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — constructor
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — constructor', () => {
  it('instantiates with index and default memory dir', () => {
    const index = makeMockIndex();
    const gen = new DossierGenerator(index);
    expect(gen).toBeInstanceOf(DossierGenerator);
  });

  it('instantiates with custom memory dir', () => {
    const index = makeMockIndex();
    const gen = new DossierGenerator(index, '/custom/memory/path');
    expect(gen).toBeInstanceOf(DossierGenerator);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — getDefaultReminders
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — getDefaultReminders', () => {
  it('returns a non-empty array of reminder strings', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const reminders = gen.getDefaultReminders();
    expect(Array.isArray(reminders)).toBe(true);
    expect(reminders.length).toBeGreaterThan(0);
    for (const r of reminders) {
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('includes DPB loop reminder', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const reminders = gen.getDefaultReminders();
    expect(reminders.some((r) => r.toLowerCase().includes('dpb'))).toBe(true);
  });

  it('includes precision_engine reminder', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const reminders = gen.getDefaultReminders();
    expect(reminders.some((r) => r.toLowerCase().includes('precision_engine'))).toBe(true);
  });

  it('includes precision_exec restriction reminder', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const reminders = gen.getDefaultReminders();
    expect(reminders.some((r) => r.includes('precision_exec'))).toBe(true);
  });

  it('includes sandbox reminder', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const reminders = gen.getDefaultReminders();
    expect(reminders.some((r) => r.toLowerCase().includes('sandbox'))).toBe(true);
  });

  it('returns a fresh copy each call (not shared reference)', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const r1 = gen.getDefaultReminders();
    const r2 = gen.getDefaultReminders();
    expect(r1).not.toBe(r2); // different array instances
    expect(r1).toEqual(r2);  // same content
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — formatForPrompt
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — formatForPrompt', () => {
  const minimalDossier: AgentDossier = {
    task: { description: 'Test task', acceptance_criteria: [], scope: [] },
    constraints: {
      tools: 'precision_engine only',
      quality: 'Enterprise-grade',
      budget: { max_tokens: null, max_cost: null },
    },
    context: { decisions: [], patterns: [], failures: [], prior_results: [] },
    project: { stack: [], index_summary: '', key_files: [] },
    reminders: ['Reminder 1'],
    output_format: null,
  };

  it('starts with the separator line', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const result = gen.formatForPrompt(minimalDossier);
    expect(result.startsWith('--- AGENT DOSSIER ---\n')).toBe(true);
  });

  it('contains minified (no pretty-print newlines in JSON body) JSON', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const result = gen.formatForPrompt(minimalDossier);
    const lines = result.split('\n');
    // First line is separator, second line is JSON
    expect(lines[0]).toBe('--- AGENT DOSSIER ---');
    const jsonLine = lines[1];
    expect(jsonLine).toBeTruthy();
    // Minified: parseable as JSON
    const parsed = JSON.parse(jsonLine);
    expect(parsed).toHaveProperty('dossier');
  });

  it('wraps dossier under a {dossier: ...} key', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const result = gen.formatForPrompt(minimalDossier);
    const jsonLine = result.split('\n')[1];
    const parsed = JSON.parse(jsonLine);
    expect(parsed.dossier).toBeDefined();
    expect(parsed.dossier.task.description).toBe('Test task');
  });

  it('preserves all dossier fields in the JSON output', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const result = gen.formatForPrompt(minimalDossier);
    const parsed = JSON.parse(result.split('\n')[1]);
    const d = parsed.dossier as AgentDossier;
    expect(d).toHaveProperty('task');
    expect(d).toHaveProperty('constraints');
    expect(d).toHaveProperty('context');
    expect(d).toHaveProperty('project');
    expect(d).toHaveProperty('reminders');
    expect(d).toHaveProperty('output_format');
  });

  it('includes output_format when set', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const dossierWithFormat: AgentDossier = {
      ...minimalDossier,
      output_format: { type: 'json', schema: { type: 'object' } },
    };
    const result = gen.formatForPrompt(dossierWithFormat);
    const parsed = JSON.parse(result.split('\n')[1]);
    expect(parsed.dossier.output_format).toEqual({ type: 'json', schema: { type: 'object' } });
  });

  it('includes null output_format when not set', () => {
    const gen = new DossierGenerator(makeMockIndex());
    const result = gen.formatForPrompt(minimalDossier);
    const parsed = JSON.parse(result.split('\n')[1]);
    expect(parsed.dossier.output_format).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — injectMemory (graceful degradation)
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — injectMemory (graceful degradation)', () => {
  it('returns empty context when all memory files are missing (ENOENT)', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    const gen = new DossierGenerator(makeMockIndex(), '/nonexistent/memory');
    const ctx = await gen.injectMemory([], 'some task');
    expect(ctx.decisions).toEqual([]);
    expect(ctx.patterns).toEqual([]);
    expect(ctx.failures).toEqual([]);
    expect(ctx.prior_results).toEqual([]);
  });

  it('returns empty context when files contain invalid JSON', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('not valid json { broken');
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory([], 'task');
    expect(ctx.decisions).toEqual([]);
    expect(ctx.patterns).toEqual([]);
    expect(ctx.failures).toEqual([]);
  });

  it('returns empty context when files contain empty JSON objects', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('{}');
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory([], 'task');
    expect(ctx.decisions).toEqual([]);
    expect(ctx.patterns).toEqual([]);
    expect(ctx.failures).toEqual([]);
  });

  it('handles partial failure (one file missing, others valid)', async () => {
    let callCount = 0;
    vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
      callCount++;
      const p = String(filePath);
      if (p.endsWith('decisions.json')) return SAMPLE_DECISIONS_JSON;
      if (p.endsWith('patterns.json')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (p.endsWith('failures.json')) return SAMPLE_FAILURES_JSON;
      throw new Error(`unexpected path: ${p}`);
    });

    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    // Use a broad scope so decisions with scopes can match, and description for failures
    const ctx = await gen.injectMemory(['src/'], 'esm import task');
    expect(callCount).toBe(3);
    // At least dec-3 (empty scope = always included) or others that overlap src/ should pass
    expect(ctx.decisions.length).toBeGreaterThan(0);
    expect(ctx.patterns).toEqual([]);  // missing file → empty
    expect(ctx.failures.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — injectMemory (scope-based filtering)
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — injectMemory (scope-based filtering)', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('decisions.json')) return SAMPLE_DECISIONS_JSON;
      if (p.endsWith('patterns.json')) return SAMPLE_PATTERNS_JSON;
      if (p.endsWith('failures.json')) return SAMPLE_FAILURES_JSON;
      throw new Error(`unexpected path: ${p}`);
    });
  });

  it('returns decisions matching scope overlap', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory(['src/auth/'], 'implement auth');
    const ids = ctx.decisions.map((d) => d.id);
    // dec-2 has scope src/auth/, dec-3 has empty scope (always include)
    expect(ids).toContain('dec-2');
    expect(ids).toContain('dec-3');
    // dec-1 is src/db/ - no overlap with src/auth/
    expect(ids).not.toContain('dec-1');
  });

  it('includes decisions with empty scope in all contexts', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory(['src/totally/unrelated/'], 'task');
    const ids = ctx.decisions.map((d) => d.id);
    // dec-3 has empty scope → always included
    expect(ids).toContain('dec-3');
  });

  it('caps decisions at 5 (most recent)', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    // Empty scope means all decisions pass the filter
    const ctx = await gen.injectMemory([], 'task');
    expect(ctx.decisions.length).toBeLessThanOrEqual(5);
  });

  it('filters patterns by keyword match against task description', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory([], 'implement batch discover orchestration');
    const names = ctx.patterns.map((p) => p.name);
    // 'DPB Loop' has keywords 'discover', 'batch', 'plan' — matches 'batch' and 'discover'
    expect(names).toContain('DPB Loop');
  });

  it('caps patterns at 3', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    // Match all patterns by using generic description
    const ctx = await gen.injectMemory([], 'singleton registry null degradation fallback discover batch');
    expect(ctx.patterns.length).toBeLessThanOrEqual(3);
  });

  it('filters failures by keyword match', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory([], 'using esm import statements in TypeScript');
    const errors = ctx.failures.map((f) => f.error);
    // failure about esm/import should match
    expect(errors.some((e) => e.toLowerCase().includes('esm') || e.toLowerCase().includes('.js'))).toBe(true);
  });

  it('caps failures at 3 (most recent)', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory([], 'task with no matching keywords');
    expect(ctx.failures.length).toBeLessThanOrEqual(3);
  });

  it('maps decisions to id/what/why shape', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory(['src/auth/'], 'implement auth');
    for (const d of ctx.decisions) {
      expect(typeof d.id).toBe('string');
      expect(typeof d.what).toBe('string');
      expect(typeof d.why).toBe('string');
    }
  });

  it('maps patterns to name/description shape', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory([], 'batch discover plan');
    for (const p of ctx.patterns) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
    }
  });

  it('maps failures to error/resolution shape', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const ctx = await gen.injectMemory(['src/'], 'task');
    for (const f of ctx.failures) {
      expect(typeof f.error).toBe('string');
      expect(typeof f.resolution).toBe('string');
    }
  });

  it('scope overlap works for parent/child path relationships', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    // src/db/ is a child of src/ — should overlap
    const ctx = await gen.injectMemory(['src/'], 'implement database layer');
    const ids = ctx.decisions.map((d) => d.id);
    // All 6 decisions overlap with src/, but slice(-5) keeps the most recent 5.
    // dec-1 is oldest (index 0) so it may be excluded by the cap.
    // Verify that scope overlap logic works by confirming recent decisions are included.
    expect(ctx.decisions.length).toBeLessThanOrEqual(5);
    expect(ctx.decisions.length).toBeGreaterThan(0);
    // dec-6 (src/components/) overlaps src/ and is recent — should be in results
    expect(ids).toContain('dec-6');
    // dec-2 (src/auth/) overlaps src/ and is recent — should be in results
    expect(ids).toContain('dec-2');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — getProjectSummary
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — getProjectSummary', () => {
  it('returns empty project when index has no files', async () => {
    const index = makeMockIndex({ files: [], typeCounts: {} });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.key_files).toEqual([]);
    expect(proj.index_summary).toContain('not available');
  });

  it('generates index_summary with TS file count', async () => {
    const files = [
      makeFileEntry('src/index.ts', 200),
      makeFileEntry('src/types.ts', 150),
    ];
    const index = makeMockIndex({
      files,
      typeCounts: { ts: 2 },
    });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.index_summary).toContain('2 TS files');
  });

  it('generates index_summary with token total', async () => {
    const files = [
      makeFileEntry('src/index.ts', 500),
      makeFileEntry('src/utils.ts', 300),
    ];
    const index = makeMockIndex({ files, typeCounts: { ts: 2 } });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.index_summary).toContain('tokens total');
  });

  it('caps key_files at 10', async () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      makeFileEntry(`src/file${i}.ts`, 100 + i),
    );
    const index = makeMockIndex({ files, typeCounts: { ts: 20 } });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.key_files.length).toBeLessThanOrEqual(10);
  });

  it('sorts key_files by token count descending', async () => {
    const files = [
      makeFileEntry('src/small.ts', 50),
      makeFileEntry('src/large.ts', 500),
      makeFileEntry('src/medium.ts', 200),
    ];
    const index = makeMockIndex({ files, typeCounts: { ts: 3 } });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.key_files[0].tokens).toBe(500);
    expect(proj.key_files[1].tokens).toBe(200);
    expect(proj.key_files[2].tokens).toBe(50);
  });

  it('filters by scope when scope is provided', async () => {
    const allFiles = [
      makeFileEntry('src/auth/login.ts', 300),
      makeFileEntry('src/api/users.ts', 400),
      makeFileEntry('src/components/Button.tsx', 150),
    ];
    const index = makeMockIndex({
      files: allFiles,
      typeCounts: { ts: 2, tsx: 1 },
      filesByPrefix: [makeFileEntry('src/auth/login.ts', 300)],
    });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary(['src/auth/']);
    // Only auth files should be in key_files
    expect(proj.key_files.every((f) => f.path.startsWith('src/auth/'))).toBe(true);
  });

  it('assigns roles to key_files', async () => {
    const files = [
      makeFileEntry('src/components/Button.tsx', 200),
      makeFileEntry('src/handlers/precision-read.ts', 400),
      makeFileEntry('src/state/session-state.ts', 300),
    ];
    const index = makeMockIndex({ files, typeCounts: { ts: 2, tsx: 1 } });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    const byPath = Object.fromEntries(proj.key_files.map((f) => [f.path, f.role]));
    expect(byPath['src/components/Button.tsx']).toBe('component');
    expect(byPath['src/handlers/precision-read.ts']).toBe('handler');
    expect(byPath['src/state/session-state.ts']).toBe('state');
  });

  it('detects typescript stack from type counts', async () => {
    const index = makeMockIndex({
      files: [makeFileEntry('src/index.ts', 100)],
      typeCounts: { ts: 5 },
    });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.stack).toContain('typescript');
  });

  it('detects react stack from tsx type counts', async () => {
    const index = makeMockIndex({
      files: [makeFileEntry('src/App.tsx', 100)],
      typeCounts: { ts: 2, tsx: 3 },
    });
    const gen = new DossierGenerator(index);
    const proj = await gen.getProjectSummary([]);
    expect(proj.stack).toContain('typescript');
    expect(proj.stack).toContain('react');
  });

  it('deduplicates files when scope prefixes overlap', async () => {
    const sharedFile = makeFileEntry('src/auth/login.ts', 300);
    const index = makeMockIndex({
      files: [sharedFile],
      typeCounts: { ts: 1 },
      filesByPrefix: [sharedFile],  // same file returned for both prefixes
    });
    const gen = new DossierGenerator(index);
    // Overlapping scopes
    const proj = await gen.getProjectSummary(['src/', 'src/auth/']);
    const paths = proj.key_files.map((f) => f.path);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — generate (full integration)
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — generate', () => {
  beforeEach(() => {
    // Default: all memory files succeed
    vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('decisions.json')) return SAMPLE_DECISIONS_JSON;
      if (p.endsWith('patterns.json')) return SAMPLE_PATTERNS_JSON;
      if (p.endsWith('failures.json')) return SAMPLE_FAILURES_JSON;
      throw new Error(`unexpected path: ${p}`);
    });
  });

  it('generates a dossier with the required top-level shape', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Implement auth module', scope: ['src/auth/'] },
    });
    expect(dossier).toHaveProperty('task');
    expect(dossier).toHaveProperty('constraints');
    expect(dossier).toHaveProperty('context');
    expect(dossier).toHaveProperty('project');
    expect(dossier).toHaveProperty('reminders');
    expect(dossier).toHaveProperty('output_format');
  });

  it('sets task fields from options', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: {
        description: 'Build dashboard page',
        acceptance_criteria: ['Renders correctly', 'Passes tests'],
        scope: ['src/app/dashboard/'],
      },
    });
    expect(dossier.task.description).toBe('Build dashboard page');
    expect(dossier.task.acceptance_criteria).toEqual(['Renders correctly', 'Passes tests']);
    expect(dossier.task.scope).toEqual(['src/app/dashboard/']);
  });

  it('defaults acceptance_criteria and scope to empty arrays when not provided', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Simple task' },
    });
    expect(dossier.task.acceptance_criteria).toEqual([]);
    expect(dossier.task.scope).toEqual([]);
  });

  it('uses default constraints when none provided', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
    });
    expect(dossier.constraints.tools).toContain('precision_engine');
    expect(dossier.constraints.quality).toBeTruthy();
    expect(dossier.constraints.budget.max_tokens).toBeNull();
    expect(dossier.constraints.budget.max_cost).toBeNull();
  });

  it('merges partial constraints with defaults', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
      constraints: {
        budget: { max_tokens: 50000, max_cost: null },
      },
    });
    expect(dossier.constraints.budget.max_tokens).toBe(50000);
    expect(dossier.constraints.budget.max_cost).toBeNull();
    // Other defaults preserved
    expect(dossier.constraints.tools).toContain('precision_engine');
  });

  it('overrides tools constraint when provided', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
      constraints: { tools: 'custom tools only' },
    });
    expect(dossier.constraints.tools).toBe('custom tools only');
  });

  it('passes prior_results through to context', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const priorResults = [{ agent: 'types-agent', output: 'UserType defined' }];
    const dossier = await gen.generate({
      task: { description: 'Task' },
      prior_results: priorResults,
    });
    expect(dossier.context.prior_results).toEqual(priorResults);
  });

  it('sets prior_results to empty array when not provided', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
    });
    expect(dossier.context.prior_results).toEqual([]);
  });

  it('sets output_format to null when not provided', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
    });
    expect(dossier.output_format).toBeNull();
  });

  it('sets output_format when provided', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const fmt: DossierOutputFormat = { type: 'json', schema: { type: 'object', properties: {} } };
    const dossier = await gen.generate({
      task: { description: 'Task' },
      output_format: fmt,
    });
    expect(dossier.output_format).toEqual(fmt);
  });

  it('explicitly setting output_format to null produces null', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
      output_format: null,
    });
    expect(dossier.output_format).toBeNull();
  });

  it('includes default reminders', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
    });
    expect(dossier.reminders.length).toBeGreaterThan(0);
  });

  it('appends extra_reminders after defaults', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const extras = ['Custom reminder A', 'Custom reminder B'];
    const dossier = await gen.generate({
      task: { description: 'Task' },
      extra_reminders: extras,
    });
    const last2 = dossier.reminders.slice(-2);
    expect(last2).toEqual(extras);
  });

  it('skips memory injection when include_memory is false', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
      include_memory: false,
    });
    // fs.readFile is called once for package.json (stack detection), but NOT for memory files
    expect(vi.mocked(fsPromises.readFile)).toHaveBeenCalledTimes(1);
    expect(dossier.context.decisions).toEqual([]);
    expect(dossier.context.patterns).toEqual([]);
    expect(dossier.context.failures).toEqual([]);
  });

  it('skips project summary when include_project is false', async () => {
    const index = makeMockIndex({
      files: [makeFileEntry('src/index.ts', 500)],
      typeCounts: { ts: 1 },
    });
    const gen = new DossierGenerator(index, '/memory');
    const dossier = await gen.generate({
      task: { description: 'Task' },
      include_project: false,
    });
    expect(vi.mocked(index.getFiles)).not.toHaveBeenCalled();
    expect(dossier.project.key_files).toEqual([]);
    expect(dossier.project.index_summary).toContain('not available');
  });

  it('skips memory injection when include_memory is true but still reads files', async () => {
    const gen = new DossierGenerator(makeMockIndex(), '/memory');
    await gen.generate({
      task: { description: 'Task' },
      include_memory: true,
    });
    // 3 memory files (decisions, patterns, failures) + 1 package.json for stack detection
    expect(vi.mocked(fsPromises.readFile)).toHaveBeenCalledTimes(4);
  });

  it('produces a valid JSON-serializable dossier', async () => {
    const files = [makeFileEntry('src/main.ts', 200)];
    const index = makeMockIndex({ files, typeCounts: { ts: 1 } });
    const gen = new DossierGenerator(index, '/memory');
    const dossier = await gen.generate({
      task: {
        description: 'Full integration test',
        acceptance_criteria: ['Pass typecheck', 'Pass tests'],
        scope: ['src/'],
      },
      prior_results: [{ step: 1, result: 'ok' }],
      extra_reminders: ['Extra A'],
      output_format: { type: 'json', schema: {} },
    });
    // Must serialize without errors
    expect(() => JSON.stringify(dossier)).not.toThrow();
  });

  it('full dossier round-trips through formatForPrompt', async () => {
    const files = [makeFileEntry('src/api.ts', 300)];
    const index = makeMockIndex({ files, typeCounts: { ts: 1 } });
    const gen = new DossierGenerator(index, '/memory');
    const dossier = await gen.generate({
      task: { description: 'Build API endpoint', scope: ['src/api/'] },
    });
    const prompt = gen.formatForPrompt(dossier);
    expect(prompt).toContain('--- AGENT DOSSIER ---');
    const jsonPart = prompt.split('\n')[1];
    const parsed = JSON.parse(jsonPart);
    expect(parsed.dossier.task.description).toBe('Build API endpoint');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator — integration with PrecisionRuntime
// ───────────────────────────────────────────────────────────────────────────

describe('DossierGenerator — PrecisionRuntime integration', () => {
  it('PrecisionRuntime.initialize() exposes a dossier property', async () => {
    // Import the real modules (no mock needed here for the dossier property check)
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
    const { Telemetry } = await import('../../state/telemetry.js');
    const { KVState } = await import('../../state/kv-state.js');
    const { ProjectIndex } = await import('../../state/project-index.js');

    // Reset first
    PrecisionRuntime.resetInstance();
    Telemetry.resetInstance();
    KVState.resetInstance();
    ProjectIndex.resetInstance();

    const runtime = await PrecisionRuntime.initialize();
    try {
      expect(runtime.dossier).toBeDefined();
      expect(runtime.dossier).toBeInstanceOf(DossierGenerator);
    } finally {
      await runtime.shutdown();
      PrecisionRuntime.resetInstance();
      Telemetry.resetInstance();
      KVState.resetInstance();
      ProjectIndex.resetInstance();
    }
  });
});
