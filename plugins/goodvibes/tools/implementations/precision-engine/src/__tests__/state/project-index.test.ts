/**
 * Tests for ProjectIndex singleton — tree format load/save, upsert, remove, query.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

// We must mock fs/promises BEFORE importing ProjectIndex so the module uses the mock.
vi.mock('fs/promises');
vi.mock('fs');

import { ProjectIndex, categorizeFileType } from '../../state/project-index.js';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Build a v4 index JSON string (current format: filename→tokens dict per dir). */
function makeV4Index(tree: Record<string, Record<string, number>>, extra?: object) {
  return JSON.stringify({
    version: 4,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    project_root: '/test/project',
    stats: { total_files: 3, total_dirs: 2, index_duration_ms: 10 },
    tree,
    ...extra,
  });
}

/** Build a v3 index JSON string (legacy format with array-of-objects per dir). */
function makeV3Index(tree: Record<string, Array<{name: string; size: number; tokens: number}>>, extra?: object) {
  return JSON.stringify({
    version: 3,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    project_root: '/test/project',
    stats: { total_files: 3, total_dirs: 2, index_duration_ms: 10 },
    tree,
    ...extra,
  });
}

/** Build a legacy v2 index JSON string (string arrays per directory). */
function makeV2Index(tree: Record<string, string[]>, extra?: object) {
  return JSON.stringify({
    version: 2,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    project_root: '/test/project',
    stats: { total_files: 3, total_dirs: 2, index_duration_ms: 10 },
    tree,
    ...extra,
  });
}

function makeV1Index(files: Array<{ p: string; s: number; m: number }>) {
  return JSON.stringify({
    version: 1,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    project_root: '/test/project',
    stats: { total_files: files.length, total_dirs: 1, total_size_bytes: 100, index_duration_ms: 5 },
    files,
  });
}

// ──────────────────────────────────────────────
// Setup / teardown
// ──────────────────────────────────────────────

beforeEach(() => {
  ProjectIndex.resetInstance();
  vi.clearAllMocks();

  // Default: index file does not exist
  vi.mocked(fsSync.existsSync).mockReturnValue(false);
  // Default: mkdir/rename/writeFile resolve silently
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.rename).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
});

afterEach(() => {
  ProjectIndex.resetInstance();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────
// load() — v4 tree format (current)
// ──────────────────────────────────────────────

describe('load() — v4 tree format (current)', () => {
  it('loads v4 tree with nested dirs and root-level files', async () => {
    const tree = {
      '': { 'README.md': 125, 'package.json': 200 },
      'src': { 'index.ts': 300 },
      'src/utils': { 'helper.ts': 100 },
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    const files = idx.getFiles();
    // localeCompare places lowercase before uppercase, so 'package.json' < 'README.md'
    expect(files.map((f) => f.p)).toEqual([
      'package.json',
      'README.md',
      'src/index.ts',
      'src/utils/helper.ts',
    ]);
    // Verify tokens are preserved
    const indexTs = files.find((f) => f.p === 'src/index.ts')!;
    expect(indexTs.tokens).toBe(300);
  });

  it('loads v4 tree with only root-level files (empty string key)', async () => {
    const tree = { '': { 'a.ts': 25, 'b.ts': 50 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    const files = idx.getFiles();
    expect(files.map((f) => f.p)).toEqual(['a.ts', 'b.ts']);
  });

  it('loads v4 tree with deeply nested paths', async () => {
    const tree = {
      'a/b/c': { 'deep.ts': 0 },
      'a/b': { 'mid.ts': 0 },
      '': { 'root.ts': 0 },
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    const paths = idx.getFiles().map((f) => f.p);
    expect(paths).toContain('root.ts');
    expect(paths).toContain('a/b/mid.ts');
    expect(paths).toContain('a/b/c/deep.ts');
  });

  it('returns loaded index via getIndexLoaded()', async () => {
    const tree = { 'src': { 'index.ts': 310 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    const result = await idx.getIndexLoaded();

    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);
  });

  it('does not reload if already loaded (idempotent)', async () => {
    const tree = { '': { 'once.ts': 0 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();
    await idx.load();

    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────
// load() — v2 tree format migration (v2→v4)
// ──────────────────────────────────────────────

describe('load() — v2 tree format migration (v2→v4)', () => {
  it('migrates v2 string arrays to v4 filename→tokens dict with tokens=0', async () => {
    const tree = {
      'src': ['index.ts', 'auth.ts'],
      '': ['README.md'],
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV2Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    const result = await idx.getIndexLoaded();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);

    const files = idx.getFiles();
    expect(files.map((f) => f.p)).toContain('src/index.ts');
    expect(files.map((f) => f.p)).toContain('README.md');
    // Tokens should be 0 (unknown during migration)
    const indexFile = files.find((f) => f.p === 'src/index.ts')!;
    expect(indexFile.tokens).toBe(0);
  });

  it('preserves created_at and project_root from v2 during migration', async () => {
    const tree = { 'src': ['app.ts'] };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV2Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    const result = await idx.getIndexLoaded();

    expect(result!.created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(result!.project_root).toBe('/test/project');
  });

  it('v2 migration does not trigger automatic flush', async () => {
    // By design: v2→v4 migration marks the index dirty but does NOT auto-flush.
    // The next indexer run will rebuild from scratch with correct token data.
    const tree = { 'src': ['index.ts', 'utils.ts'], '': ['README.md'] };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV2Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    // writeFile should NOT have been called after load() — no auto-flush on migration
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// load() — v3 tree format migration (v3→v4)
// ──────────────────────────────────────────────

describe('load() — v3 tree format migration (v3→v4)', () => {
  it('migrates v3 array-of-objects tree to v4 filename→tokens dict', async () => {
    const tree = {
      'src': [{name: 'index.ts', size: 400, tokens: 100}, {name: 'auth.ts', size: 800, tokens: 200}],
      '': [{name: 'README.md', size: 200, tokens: 50}],
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV3Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    const result = await idx.getIndexLoaded();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);

    const files = idx.getFiles();
    expect(files.map((f) => f.p)).toContain('src/index.ts');
    expect(files.map((f) => f.p)).toContain('README.md');
    // Tokens preserved from v3 entry
    const indexFile = files.find((f) => f.p === 'src/index.ts')!;
    expect(indexFile.tokens).toBe(100);
  });

  it('preserves created_at and project_root from v3 during migration', async () => {
    const tree = { 'src': [{name: 'app.ts', size: 0, tokens: 0}] };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV3Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    const result = await idx.getIndexLoaded();

    expect(result!.created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(result!.project_root).toBe('/test/project');
  });
});

// ──────────────────────────────────────────────
// load() — v1 legacy format migration
// ──────────────────────────────────────────────

describe('load() — v1 legacy format', () => {
  it('migrates v1 flat files array to v4 tree format', async () => {
    const legacyFiles = [
      { p: 'src/index.ts', s: 100, m: 1000 },
      { p: 'README.md', s: 200, m: 1001 },
    ];
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV1Index(legacyFiles) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    const result = await idx.getIndexLoaded();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);

    const paths = idx.getFiles().map((f) => f.p);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('README.md');
  });

  it('preserves created_at and project_root from v1 during migration', async () => {
    const legacyFiles = [{ p: 'src/app.ts', s: 50, m: 999 }];
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV1Index(legacyFiles) as any);

    const idx = ProjectIndex.getInstance();
    const result = await idx.getIndexLoaded();

    expect(result!.created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(result!.project_root).toBe('/test/project');
  });
});

// ──────────────────────────────────────────────
// load() — error handling / malformed data
// ──────────────────────────────────────────────

describe('load() — error handling', () => {
  it('handles missing index file gracefully (no file)', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(false);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getIndex()).toBeNull();
    expect(idx.getFiles()).toHaveLength(0);
  });

  it('handles corrupt JSON gracefully', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue('{invalid json' as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getIndex()).toBeNull();
    expect(idx.getFiles()).toHaveLength(0);
  });

  it('handles null JSON value gracefully', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue('null' as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getIndex()).toBeNull();
    expect(idx.getFiles()).toHaveLength(0);
  });

  it('handles unsupported version gracefully', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 99 }) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getIndex()).toBeNull();
    expect(idx.getFiles()).toHaveLength(0);
  });

  it('handles readFile rejection gracefully', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getIndex()).toBeNull();
    expect(idx.getFiles()).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// upsertFile()
// ──────────────────────────────────────────────

describe('upsertFile()', () => {
  async function loadedIndex() {
    const tree = { 'src': { 'existing.ts': 125 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    // Use correct total_files matching actual tree contents (1 file)
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      version: 4,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      project_root: '/test/project',
      stats: { total_files: 1, total_dirs: 1, index_duration_ms: 10 },
      tree,
    }) as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();
    return idx;
  }

  it('inserts a new file and increments total_files', async () => {
    const idx = await loadedIndex();
    idx.upsertFile('src/new.ts');

    const paths = idx.getFiles().map((f) => f.p);
    expect(paths).toContain('src/new.ts');
    expect(idx.getStats()!.total_files).toBe(2);
  });

  it('inserts a new file with token count', async () => {
    const idx = await loadedIndex();
    idx.upsertFile('src/sized.ts', 1000);

    const entry = idx.getFiles().find((f) => f.p === 'src/sized.ts')!;
    expect(entry).toBeDefined();
    expect(entry.tokens).toBe(1000);
  });

  it('inserts a new file with zero tokens when no count provided', async () => {
    const idx = await loadedIndex();
    idx.upsertFile('src/odd.ts');

    const entry = idx.getFiles().find((f) => f.p === 'src/odd.ts')!;
    expect(entry.tokens).toBe(0);
  });

  it('updates an existing file without changing total_files', async () => {
    const idx = await loadedIndex();
    const before = idx.getStats()!.total_files;
    idx.upsertFile('src/existing.ts');

    expect(idx.getStats()!.total_files).toBe(before);
    // Only one entry for the path
    const matches = idx.getFiles().filter((f) => f.p === 'src/existing.ts');
    expect(matches).toHaveLength(1);
  });

  it('maintains sorted order after insert', async () => {
    const idx = await loadedIndex();
    idx.upsertFile('src/aaa.ts');
    idx.upsertFile('src/zzz.ts');

    const paths = idx.getFiles().map((f) => f.p);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it('marks dirty flag (triggers flush schedule)', async () => {
    const idx = await loadedIndex();
    // No flush should be called yet — timers are faked by vi
    idx.upsertFile('src/dirty-check.ts');
    // Just verify the file is tracked (dirty behavior is internal)
    expect(idx.getFiles().map((f) => f.p)).toContain('src/dirty-check.ts');
  });

  it('does nothing when index is null', () => {
    const idx = ProjectIndex.getInstance();
    // Index not loaded — should not throw
    expect(() => idx.upsertFile('any/file.ts')).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// touchFile()
// ──────────────────────────────────────────────

describe('touchFile()', () => {
  it('delegates to upsertFile', async () => {
    const tree = { 'src': { 'app.ts': 250 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();

    const before = idx.getStats()!.total_files;
    idx.touchFile('src/new.ts');

    expect(idx.getFiles().map((f) => f.p)).toContain('src/new.ts');
    expect(idx.getStats()!.total_files).toBe(before + 1);
  });

  it('preserves existing tokens when touching an existing file', async () => {
    const tree = { 'src': { 'app.ts': 512 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();

    idx.touchFile('src/app.ts');

    const entry = idx.getFiles().find((f) => f.p === 'src/app.ts')!;
    expect(entry.tokens).toBe(512);
  });
});

// ──────────────────────────────────────────────
// removeFile()
// ──────────────────────────────────────────────

describe('removeFile()', () => {
  async function loadedIndex() {
    const tree = {
      'src': { 'a.ts': 0, 'b.ts': 0 },
      '': { 'root.ts': 0 },
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    // Build correct total_files count
    const raw = JSON.stringify({
      version: 4,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      project_root: '/test/project',
      stats: { total_files: 3, total_dirs: 2, index_duration_ms: 10 },
      tree,
    });
    vi.mocked(fs.readFile).mockResolvedValue(raw as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();
    return idx;
  }

  it('removes an existing file and decrements total_files', async () => {
    const idx = await loadedIndex();
    idx.removeFile('src/a.ts');

    expect(idx.getFiles().map((f) => f.p)).not.toContain('src/a.ts');
    expect(idx.getStats()!.total_files).toBe(2);
  });

  it('handles removing a non-existent file gracefully', async () => {
    const idx = await loadedIndex();
    const before = idx.getStats()!.total_files;
    // Should not throw
    expect(() => idx.removeFile('does/not/exist.ts')).not.toThrow();
    expect(idx.getStats()!.total_files).toBe(before);
  });

  it('removes a root-level file (no dir prefix)', async () => {
    const idx = await loadedIndex();
    idx.removeFile('root.ts');

    expect(idx.getFiles().map((f) => f.p)).not.toContain('root.ts');
    expect(idx.getStats()!.total_files).toBe(2);
  });

  it('does nothing when index is null', () => {
    const idx = ProjectIndex.getInstance();
    expect(() => idx.removeFile('any/file.ts')).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// getFilesByPrefix()
// ──────────────────────────────────────────────

describe('getFilesByPrefix()', () => {
  beforeEach(async () => {
    const tree = {
      'src/components': { 'Button.tsx': 0, 'Input.tsx': 0 },
      'src/utils': { 'helper.ts': 0 },
      'test': { 'app.test.ts': 0 },
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();
  });

  it('returns files matching a directory prefix', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByPrefix('src/');

    expect(results.map((f) => f.p)).toEqual([
      'src/components/Button.tsx',
      'src/components/Input.tsx',
      'src/utils/helper.ts',
    ]);
  });

  it('returns exact prefix match', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByPrefix('src/utils/');
    expect(results.map((f) => f.p)).toEqual(['src/utils/helper.ts']);
  });

  it('returns empty array for non-matching prefix', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByPrefix('nonexistent/');
    expect(results).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// getFilesByType()
// ──────────────────────────────────────────────

describe('getFilesByType()', () => {
  beforeEach(async () => {
    const tree = {
      'src': { 'index.ts': 0, 'app.tsx': 0, 'utils.js': 0 },
      '': { 'README.md': 0, 'config.json': 0 },
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();
  });

  it('returns TypeScript files for type ts', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByType('ts');
    const paths = results.map((f) => f.p);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/app.tsx');
    expect(paths).not.toContain('src/utils.js');
  });

  it('returns JavaScript files for type js', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByType('js');
    expect(results.map((f) => f.p)).toContain('src/utils.js');
  });

  it('returns markdown files for type md', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByType('md');
    expect(results.map((f) => f.p)).toContain('README.md');
  });

  it('returns json files for type json', () => {
    const idx = ProjectIndex.getInstance();
    const results = idx.getFilesByType('json');
    expect(results.map((f) => f.p)).toContain('config.json');
  });

  it('returns empty for unknown type', () => {
    const idx = ProjectIndex.getInstance();
    expect(idx.getFilesByType('nonexistent-type')).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// getTypeCounts()
// ──────────────────────────────────────────────

describe('getTypeCounts()', () => {
  it('returns correct counts by derived type', async () => {
    const tree = {
      'src': { 'a.ts': 0, 'b.tsx': 0, 'c.js': 0 },
      '': { 'README.md': 0 },
    };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);
    const idx = ProjectIndex.getInstance();
    await idx.load();

    const counts = idx.getTypeCounts();
    expect(counts['ts']).toBe(2); // a.ts + b.tsx
    expect(counts['js']).toBe(1);
    expect(counts['md']).toBe(1);
  });

  it('returns empty object for empty tree', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(false);
    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getTypeCounts()).toEqual({});
  });
});

// ──────────────────────────────────────────────
// flush() — v4 tree format output (current) + round-trip
// ──────────────────────────────────────────────

describe('flush() via forceFlush()', () => {
  it('produces correct v4 tree format on disk', async () => {
    const tree = { 'src': { 'a.ts': 250 }, '': { 'root.md': 50 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    // Trigger dirty
    idx.upsertFile('src/b.ts', 200);

    let writtenContent = '';
    vi.mocked(fs.writeFile).mockImplementation(async (_path: any, content: any) => {
      writtenContent = content as string;
    });

    await idx.forceFlush();

    // Should have called writeFile
    expect(fs.writeFile).toHaveBeenCalled();

    // Content should be valid JSON ending with newline
    expect(writtenContent.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(writtenContent);
    expect(parsed.version).toBe(4);
    expect(typeof parsed.tree).toBe('object');
    // Tree entries are filename→tokens dicts
    const srcDir = parsed.tree['src'] as Record<string, number>;
    expect(typeof srcDir).toBe('object');
    expect(Array.isArray(srcDir)).toBe(false);
    expect(srcDir['b.ts']).toBe(200);
  });

  it('produces round-trip correct tree after upsert', async () => {
    const tree = { 'src': { 'index.ts': 310 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();
    idx.upsertFile('src/new.ts', 100);
    idx.upsertFile('lib/util.ts', 150);

    let writtenContent = '';
    vi.mocked(fs.writeFile).mockImplementation(async (_path: any, content: any) => {
      writtenContent = content as string;
    });

    await idx.forceFlush();

    const parsed = JSON.parse(writtenContent);
    // src dir should contain both files
    const srcDir = parsed.tree['src'] as Record<string, number>;
    expect(Object.keys(srcDir).sort()).toEqual(['index.ts', 'new.ts']);
    // lib dir should have its file
    const libDir = parsed.tree['lib'] as Record<string, number>;
    expect(Object.keys(libDir)).toEqual(['util.ts']);
  });

  it('does not flush when not dirty', async () => {
    const tree = { 'src': { 'a.ts': 0 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();
    // No mutations — index is not dirty

    await idx.forceFlush();

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('places root-level files under empty string key', async () => {
    const tree = { '': { 'root.ts': 0 } };
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV4Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();
    idx.upsertFile('another-root.md');

    let writtenContent = '';
    vi.mocked(fs.writeFile).mockImplementation(async (_path: any, content: any) => {
      writtenContent = content as string;
    });

    await idx.forceFlush();

    const parsed = JSON.parse(writtenContent);
    const rootDir = parsed.tree[''] as Record<string, number>;
    expect(typeof rootDir).toBe('object');
    expect(Array.isArray(rootDir)).toBe(false);
    expect('root.ts' in rootDir).toBe(true);
    expect('another-root.md' in rootDir).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty tree (no files)', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV2Index({}) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getFiles()).toHaveLength(0);
    expect(idx.getTypeCounts()).toEqual({});
  });

  it('handles single file at root level', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV2Index({ '': ['only.ts'] }) as any);

    const idx = ProjectIndex.getInstance();
    await idx.load();

    expect(idx.getFiles().map((f) => f.p)).toEqual(['only.ts']);
  });

  it('handles directory path with trailing slash in tree key (defensive)', async () => {
    // Non-standard: tree key with trailing slash shouldn't crash
    const tree = { 'src/': ['a.ts'] }; // unusual but shouldn't throw
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(makeV2Index(tree) as any);

    const idx = ProjectIndex.getInstance();
    await expect(idx.load()).resolves.not.toThrow();
  });

  it('getStats returns null when index is not loaded', () => {
    const idx = ProjectIndex.getInstance();
    expect(idx.getStats()).toBeNull();
  });

  it('getIndex returns null when not loaded', () => {
    const idx = ProjectIndex.getInstance();
    expect(idx.getIndex()).toBeNull();
  });
});

// ──────────────────────────────────────────────
// categorizeFileType() (exported utility)
// ──────────────────────────────────────────────

describe('categorizeFileType()', () => {
  it.each([
    ['src/app.ts', 'ts'],
    ['src/App.tsx', 'ts'],
    ['utils/helper.js', 'js'],
    ['utils/module.mjs', 'js'],
    ['utils/module.cjs', 'js'],
    ['components/Page.jsx', 'js'],
    ['config/settings.json', 'json'],
    ['docs/README.md', 'md'],
    ['docs/guide.mdx', 'md'],
    ['styles/main.css', 'css'],
    ['styles/theme.scss', 'css'],
    ['styles/base.less', 'css'],
    ['pages/index.html', 'html'],
    ['pages/index.htm', 'html'],
    ['scripts/run.py', 'py'],
    ['cmd/main.go', 'go'],
    ['src/lib.rs', 'rs'],
    ['config/app.yaml', 'yaml'],
    ['config/app.yml', 'yaml'],
    ['binary.wasm', 'other'],
    ['no-extension', 'other'],
  ])('categorizes %s as %s', (filePath, expected) => {
    expect(categorizeFileType(filePath)).toBe(expected);
  });
});
