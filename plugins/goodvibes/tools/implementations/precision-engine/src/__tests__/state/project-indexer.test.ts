/**
 * Tests for buildProjectIndex — the canonical project indexer.
 * Covers: basic indexing, file exclusion, gitignore support,
 * logger injection, atomic write, sorted output, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Dirent, Stats } from 'fs';

// Mock fs/promises BEFORE importing the module under test.
vi.mock('fs/promises');

import * as fsp from 'fs/promises';
import { buildProjectIndex, IndexerLogger } from '../../state/project-indexer.js';
import { ProjectIndex } from '../../state/project-index.js';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock Dirent for a file.
 * Uses parentPath (Node 21+) with fallback to path (Node 18-20).
 */
function makeDirent(
  name: string,
  parentDir: string,
  isDir = false
): Dirent {
  return {
    name,
    parentPath: parentDir,
    path: parentDir, // Node 18-20 compatibility field
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as unknown as Dirent;
}

/** Build a minimal mock Stats for a given file size. */
function makeStat(size: number): Stats {
  return { size } as Stats;
}

/**
 * Build a mock no-op logger that records calls.
 */
function makeLogger(): IndexerLogger & { debugCalls: string[]; errorCalls: string[] } {
  const debugCalls: string[] = [];
  const errorCalls: string[] = [];
  return {
    debugCalls,
    errorCalls,
    debug(msg: string) { debugCalls.push(msg); },
    error(msg: string) { errorCalls.push(msg); },
  };
}

/** Parse the written JSON from the writeFile mock call. */
function getWrittenIndex(): Record<string, unknown> {
  const calls = vi.mocked(fsp.writeFile).mock.calls;
  if (calls.length === 0) throw new Error('writeFile was never called');
  const lastCall = calls[calls.length - 1];
  return JSON.parse(lastCall[1] as string);
}

const PROJECT_DIR = '/test/project';

// ──────────────────────────────────────────────────────────────────
// Setup / teardown
// ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no .gitignore
  vi.mocked(fsp.readFile).mockRejectedValue(new Error('ENOENT: no such file'));

  // Default: empty directory
  vi.mocked(fsp.readdir).mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

  // Default: stat returns 0-byte file
  vi.mocked(fsp.stat).mockResolvedValue(makeStat(0));

  // Default: mkdir/writeFile/rename resolve silently
  vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.rename).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────
// 1. Basic behavior
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — basic behavior', () => {
  it('writes index to .goodvibes/project-index.json via temp file', async () => {
    await buildProjectIndex(PROJECT_DIR, makeLogger());

    // writeFile called with a .tmp path
    const writeCall = vi.mocked(fsp.writeFile).mock.calls[0];
    expect(writeCall[0]).toContain('.goodvibes');
    expect(writeCall[0]).toContain('project-index.json.tmp');

    // rename moves temp to final path
    const renameCall = vi.mocked(fsp.rename).mock.calls[0];
    expect(renameCall[0]).toContain('.tmp');
    expect(renameCall[1]).toBe(`${PROJECT_DIR}/.goodvibes/project-index.json`);
  });

  it('creates the .goodvibes directory with recursive: true', async () => {
    await buildProjectIndex(PROJECT_DIR, makeLogger());

    expect(vi.mocked(fsp.mkdir)).toHaveBeenCalledWith(
      `${PROJECT_DIR}/.goodvibes`,
      { recursive: true }
    );
  });

  it('produces a valid v4 index structure', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('index.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(400));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    expect(idx.version).toBe(4);
    expect(idx._format).toBe(ProjectIndex.FORMAT_HINT);
    expect(typeof idx.created_at).toBe('string');
    expect(typeof idx.updated_at).toBe('string');
    expect(idx.project_root).toBe(PROJECT_DIR);
    expect(idx.stats).toMatchObject({
      total_files: expect.any(Number),
      total_dirs: expect.any(Number),
      index_duration_ms: expect.any(Number),
    });
    expect(typeof idx.tree).toBe('object');
  });

  it('groups files by directory in the tree', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('index.ts', `${PROJECT_DIR}/src`),
      makeDirent('utils.ts', `${PROJECT_DIR}/src/helpers`),
      makeDirent('README.md', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;

    expect(tree['src']).toBeDefined();
    expect(tree['src']['index.ts']).toBe(25); // ceil(100/4)
    expect(tree['src/helpers']).toBeDefined();
    expect(tree['src/helpers']['utils.ts']).toBe(25);
    expect(tree['']['README.md']).toBe(25);
  });

  it('computes token estimates as Math.ceil(fileSize / 4)', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('big.ts', `${PROJECT_DIR}/src`),
      makeDirent('tiny.ts', `${PROJECT_DIR}/src`),
      makeDirent('exact.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat)
      .mockResolvedValueOnce(makeStat(1001)) // ceil(1001/4) = 251
      .mockResolvedValueOnce(makeStat(1))    // ceil(1/4) = 1
      .mockResolvedValueOnce(makeStat(400)); // ceil(400/4) = 100

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src']['big.ts']).toBe(251);
    expect(tree['src']['tiny.ts']).toBe(1);
    expect(tree['src']['exact.ts']).toBe(100);
  });

  it('counts total_files and total_dirs correctly', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('a.ts', `${PROJECT_DIR}/src`),
      makeDirent('b.ts', `${PROJECT_DIR}/src`),
      makeDirent('c.ts', `${PROJECT_DIR}/lib`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(40));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const stats = idx.stats as { total_files: number; total_dirs: number };
    expect(stats.total_files).toBe(3);
    expect(stats.total_dirs).toBe(2); // src, lib
  });

  it('handles stat() failure gracefully (uses 0 tokens)', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('broken.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockRejectedValue(new Error('EPERM'));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src']['broken.ts']).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. File exclusion
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — file exclusion', () => {
  it('excludes node_modules directory', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('index.js', `${PROJECT_DIR}/node_modules/some-pkg`),
      makeDirent('keep.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['node_modules/some-pkg']).toBeUndefined();
    expect(tree['src']['keep.ts']).toBeDefined();
  });

  it('excludes .git directory', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('config', `${PROJECT_DIR}/.git`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['.git']).toBeUndefined();
  });

  it('excludes dist directory', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('bundle.js', `${PROJECT_DIR}/dist`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['dist']).toBeUndefined();
  });

  it('excludes .goodvibes directory', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('project-index.json', `${PROJECT_DIR}/.goodvibes`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['.goodvibes']).toBeUndefined();
  });

  it('excludes coverage, .next, .turbo, and other build dirs', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('report.json', `${PROJECT_DIR}/coverage`),
      makeDirent('cache.json', `${PROJECT_DIR}/.next`),
      makeDirent('meta.json', `${PROJECT_DIR}/.turbo`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['coverage']).toBeUndefined();
    expect(tree['.next']).toBeUndefined();
    expect(tree['.turbo']).toBeUndefined();
  });

  it('excludes __tests__ directory', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('foo.test.ts', `${PROJECT_DIR}/src/__tests__`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src/__tests__']).toBeUndefined();
  });

  it('excludes .test.ts files', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('foo.test.ts', `${PROJECT_DIR}/src`),
      makeDirent('foo.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src']['foo.test.ts']).toBeUndefined();
    expect(tree['src']['foo.ts']).toBeDefined();
  });

  it('excludes .spec.ts files', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('bar.spec.ts', `${PROJECT_DIR}/src`),
      makeDirent('bar.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src']['bar.spec.ts']).toBeUndefined();
    expect(tree['src']['bar.ts']).toBeDefined();
  });

  it('excludes .d.ts declaration files', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('types.d.ts', `${PROJECT_DIR}/src`),
      makeDirent('types.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src']['types.d.ts']).toBeUndefined();
    expect(tree['src']['types.ts']).toBeDefined();
  });

  it('excludes .map source map files', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('bundle.js.map', `${PROJECT_DIR}/dist`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['dist']).toBeUndefined();
  });

  it('excludes binary/media files (.png, .jpg, .svg, .woff2)', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('logo.png', `${PROJECT_DIR}/public`),
      makeDirent('photo.jpg', `${PROJECT_DIR}/public`),
      makeDirent('icon.svg', `${PROJECT_DIR}/public`),
      makeDirent('font.woff2', `${PROJECT_DIR}/public`),
      makeDirent('keep.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['public']).toBeUndefined();
    expect(tree['src']['keep.ts']).toBeDefined();
  });

  it('excludes package-lock.json', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('package-lock.json', PROJECT_DIR),
      makeDirent('package.json', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['package-lock.json']).toBeUndefined();
    expect(tree['']['package.json']).toBeDefined();
  });

  it('excludes yarn.lock and pnpm-lock.yaml', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('yarn.lock', PROJECT_DIR),
      makeDirent('pnpm-lock.yaml', PROJECT_DIR),
      makeDirent('keep.ts', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['yarn.lock']).toBeUndefined();
    expect(tree['']['pnpm-lock.yaml']).toBeUndefined();
    expect(tree['']['keep.ts']).toBeDefined();
  });

  it('excludes .DS_Store', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('.DS_Store', PROJECT_DIR),
      makeDirent('README.md', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['.DS_Store']).toBeUndefined();
    expect(tree['']['README.md']).toBeDefined();
  });

  it('excludes .stories.tsx files', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('Button.stories.tsx', `${PROJECT_DIR}/src`),
      makeDirent('Button.tsx', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src']['Button.stories.tsx']).toBeUndefined();
    expect(tree['src']['Button.tsx']).toBeDefined();
  });

  it('excludes .min.js and .min.css files', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('app.min.js', `${PROJECT_DIR}/dist`),
      makeDirent('style.min.css', `${PROJECT_DIR}/dist`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['dist']).toBeUndefined();
  });

  it('skips directory entries (isDirectory=true) in the tree', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('src', PROJECT_DIR, true),   // directory
      makeDirent('index.ts', `${PROJECT_DIR}/src`), // file inside
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    // The directory entry itself should not appear as a key containing itself
    expect(tree['src']['src']).toBeUndefined();
    expect(tree['src']['index.ts']).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. Gitignore support
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — gitignore support', () => {
  it('ignores files matching a simple gitignore pattern', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('*.log\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('server.log', PROJECT_DIR),
      makeDirent('README.md', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['server.log']).toBeUndefined();
    expect(tree['']['README.md']).toBeDefined();
  });

  it('ignores directories matching gitignore pattern', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('build/\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('output.js', `${PROJECT_DIR}/build`),
      makeDirent('main.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['build']).toBeUndefined();
    expect(tree['src']['main.ts']).toBeDefined();
  });

  it('respects negation patterns (!pattern)', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('*.log\n!important.log\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('server.log', PROJECT_DIR),
      makeDirent('important.log', PROJECT_DIR),
      makeDirent('README.md', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['server.log']).toBeUndefined();
    expect(tree['']['important.log']).toBeDefined();
    expect(tree['']['README.md']).toBeDefined();
  });

  it('ignores files in a gitignored directory (trailing slash pattern)', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('temp/\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('scratch.txt', `${PROJECT_DIR}/temp`),
      makeDirent('keep.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['temp']).toBeUndefined();
    expect(tree['src']['keep.ts']).toBeDefined();
  });

  it('handles glob patterns with wildcards in gitignore', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('*.tmp\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('session.tmp', PROJECT_DIR),
      makeDirent('data.tmp', PROJECT_DIR),
      makeDirent('index.ts', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['session.tmp']).toBeUndefined();
    expect(tree['']['data.tmp']).toBeUndefined();
    expect(tree['']['index.ts']).toBeDefined();
  });

  it('handles path-based gitignore patterns (containing /)', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('src/generated/\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('auto.ts', `${PROJECT_DIR}/src/generated`),
      makeDirent('manual.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['src/generated']).toBeUndefined();
    expect(tree['src']['manual.ts']).toBeDefined();
  });

  it('returns no gitignore patterns when .gitignore does not exist', async () => {
    // readFile already defaults to rejecting (no .gitignore)
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('index.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    // File should be indexed since no gitignore patterns applied
    expect(tree['src']['index.ts']).toBeDefined();
  });

  it('ignores comment lines and blank lines in .gitignore', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue(
      '# This is a comment\n\n*.log\n\n# Another comment\n' as unknown as Awaited<ReturnType<typeof fsp.readFile>>
    );
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('debug.log', PROJECT_DIR),
      makeDirent('keep.ts', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']['debug.log']).toBeUndefined();
    expect(tree['']['keep.ts']).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. Logger injection
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — logger injection', () => {
  it('calls logger.debug with initial build message', async () => {
    const logger = makeLogger();
    await buildProjectIndex(PROJECT_DIR, logger);

    expect(logger.debugCalls.some(msg => msg.includes('Building project file index'))).toBe(true);
  });

  it('calls logger.debug with gitignore count', async () => {
    const logger = makeLogger();
    await buildProjectIndex(PROJECT_DIR, logger);

    expect(logger.debugCalls.some(msg => msg.includes('gitignore'))).toBe(true);
  });

  it('calls logger.debug with completion stats', async () => {
    const logger = makeLogger();
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('a.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, logger);

    expect(logger.debugCalls.some(msg => msg.includes('Project index created'))).toBe(true);
  });

  it('does not throw when default logger is used (no custom logger provided)', async () => {
    // Default logger writes to stderr — just verify it does not throw
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('index.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await expect(buildProjectIndex(PROJECT_DIR)).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. Atomic write
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — atomic write', () => {
  it('writes to a .tmp file before renaming', async () => {
    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const writeArgs = vi.mocked(fsp.writeFile).mock.calls[0];
    const tmpPath = writeArgs[0] as string;
    expect(tmpPath).toMatch(/\.tmp$/);

    const renameArgs = vi.mocked(fsp.rename).mock.calls[0];
    expect(renameArgs[0]).toBe(tmpPath);
    expect(renameArgs[1]).not.toMatch(/\.tmp$/);
  });

  it('calls rename exactly once', async () => {
    await buildProjectIndex(PROJECT_DIR, makeLogger());

    expect(vi.mocked(fsp.rename)).toHaveBeenCalledTimes(1);
  });

  it('calls writeFile before rename (ordering)', async () => {
    const callOrder: string[] = [];
    vi.mocked(fsp.writeFile).mockImplementation(async () => {
      callOrder.push('writeFile');
    });
    vi.mocked(fsp.rename).mockImplementation(async () => {
      callOrder.push('rename');
    });

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    expect(callOrder).toEqual(['writeFile', 'rename']);
  });

  it('writes valid JSON with newline terminator', async () => {
    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const writeArgs = vi.mocked(fsp.writeFile).mock.calls[0];
    const content = writeArgs[1] as string;
    expect(content.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('throws if writeFile fails', async () => {
    vi.mocked(fsp.writeFile).mockRejectedValue(new Error('ENOSPC: disk full'));

    await expect(buildProjectIndex(PROJECT_DIR, makeLogger())).rejects.toThrow('ENOSPC');
  });

  it('throws if rename fails', async () => {
    vi.mocked(fsp.rename).mockRejectedValue(new Error('EXDEV: cross-device rename'));

    await expect(buildProjectIndex(PROJECT_DIR, makeLogger())).rejects.toThrow('EXDEV');
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. Sorted output
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — sorted output', () => {
  it('produces a deterministic tree (same input always produces same output)', async () => {
    const entries = [
      makeDirent('z.ts', `${PROJECT_DIR}/zoo`),
      makeDirent('a.ts', `${PROJECT_DIR}/alpha`),
      makeDirent('m.ts', `${PROJECT_DIR}/middle`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>;
    vi.mocked(fsp.readdir).mockResolvedValue(entries);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    // Verify all three directories are present
    expect(tree['zoo']).toBeDefined();
    expect(tree['alpha']).toBeDefined();
    expect(tree['middle']).toBeDefined();
    // File keys within each directory are sorted
    const zooKeys = Object.keys(tree['zoo']);
    expect(zooKeys).toEqual([...zooKeys].sort());
    const alphaKeys = Object.keys(tree['alpha']);
    expect(alphaKeys).toEqual([...alphaKeys].sort());
  });

  it('sorts file keys within each directory alphabetically', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('zebra.ts', `${PROJECT_DIR}/src`),
      makeDirent('alpha.ts', `${PROJECT_DIR}/src`),
      makeDirent('middle.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    const fileKeys = Object.keys(tree['src']);
    const sortedFileKeys = [...fileKeys].sort();
    expect(fileKeys).toEqual(sortedFileKeys);
  });
});

// ──────────────────────────────────────────────────────────────────
// 7. Edge cases
// ──────────────────────────────────────────────────────────────────

describe('buildProjectIndex — edge cases', () => {
  it('handles empty directory (no files indexed)', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const stats = idx.stats as { total_files: number; total_dirs: number };
    expect(stats.total_files).toBe(0);
    expect(stats.total_dirs).toBe(0);
    expect(idx.tree).toEqual({});
  });

  it('handles root-level files (empty string key in tree)', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('README.md', PROJECT_DIR),
      makeDirent('package.json', PROJECT_DIR),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(40));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['']).toBeDefined();
    expect(tree['']['README.md']).toBe(10);
    expect(tree['']['package.json']).toBe(10);
  });

  it('throws when readdir fails (non-existent directory)', async () => {
    vi.mocked(fsp.readdir).mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
    );

    await expect(buildProjectIndex(PROJECT_DIR, makeLogger())).rejects.toThrow('ENOENT');
  });

  it('sets project_root to the provided projectDir', async () => {
    await buildProjectIndex('/my/custom/path', makeLogger());

    const idx = getWrittenIndex();
    expect(idx.project_root).toBe('/my/custom/path');
  });

  it('sets partial: true in stats when timeout is reached', async () => {
    // Simulate timeout by mocking Date.now to advance past 30s after a few iterations
    const startTime = 1000000;
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call (startMs), subsequent calls advance past 30s threshold
      return callCount === 1 ? startTime : startTime + 31000;
    });

    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('a.ts', `${PROJECT_DIR}/src`),
      makeDirent('b.ts', `${PROJECT_DIR}/src`),
      makeDirent('c.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const stats = idx.stats as { partial?: boolean };
    expect(stats.partial).toBe(true);
  });

  it('does not include partial field in stats when indexing completes normally', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('index.ts', `${PROJECT_DIR}/src`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(100));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const stats = idx.stats as Record<string, unknown>;
    expect(stats['partial']).toBeUndefined();
  });

  it('handles nested deep paths correctly', async () => {
    vi.mocked(fsp.readdir).mockResolvedValue([
      makeDirent('leaf.ts', `${PROJECT_DIR}/a/b/c/d`),
    ] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    vi.mocked(fsp.stat).mockResolvedValue(makeStat(80));

    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    const tree = idx.tree as Record<string, Record<string, number>>;
    expect(tree['a/b/c/d']).toBeDefined();
    expect(tree['a/b/c/d']['leaf.ts']).toBe(20); // ceil(80/4)
  });

  it('includes _format field matching ProjectIndex.FORMAT_HINT', async () => {
    await buildProjectIndex(PROJECT_DIR, makeLogger());

    const idx = getWrittenIndex();
    expect(idx._format).toBe(ProjectIndex.FORMAT_HINT);
    expect(typeof idx._format).toBe('string');
    expect((idx._format as string).length).toBeGreaterThan(0);
  });
});
