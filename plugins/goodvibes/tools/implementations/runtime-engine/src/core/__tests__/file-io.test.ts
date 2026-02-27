/**
 * Unit tests for file-io
 *
 * Tests atomic write behaviour, JSON serialization, and JSON read with error
 * handling.
 *
 * Strategy:
 * - node:fs (writeFileSync, renameSync, readFileSync, unlinkSync) is fully mocked.
 * - ./fs-utils.js (ensureDirSync) is mocked to avoid real filesystem side-effects.
 * - Logger is mocked to suppress output and assert warn() calls.
 * - tmpPath is captured from the first argument passed to writeFileSync.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const writeFileSync = vi.fn();
  const renameSync = vi.fn();
  const readFileSync = vi.fn();
  const unlinkSync = vi.fn();
  const ensureDirSync = vi.fn();
  const loggerWarn = vi.fn();
  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: loggerWarn,
    error: vi.fn(),
  });
  return { writeFileSync, renameSync, readFileSync, unlinkSync, ensureDirSync, loggerWarn, createLogger };
});

vi.mock('node:fs', () => ({
  writeFileSync: mocks.writeFileSync,
  renameSync: mocks.renameSync,
  readFileSync: mocks.readFileSync,
  unlinkSync: mocks.unlinkSync,
}));

vi.mock('../fs-utils.js', () => ({ ensureDirSync: mocks.ensureDirSync }));
vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { writeAtomicSync, writeJsonSync, readJsonSync } from '../file-io.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the tmpPath that writeAtomicSync passed to writeFileSync. */
function capturedTmpPath(): string {
  return mocks.writeFileSync.mock.calls[0]?.[0] as string;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('writeAtomicSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── directory creation ──────────────────────────────────────────────────

  it('creates parent directories via ensureDirSync', () => {
    writeAtomicSync('/some/dir/file.json', 'content');
    expect(mocks.ensureDirSync).toHaveBeenCalledWith('/some/dir');
  });

  // ── happy path ──────────────────────────────────────────────────────────

  it('writes to a tmp file in the same directory then renames to target', () => {
    writeAtomicSync('/some/dir/file.json', 'hello');
    const tmpPath = capturedTmpPath();

    // tmp file is in the same directory
    expect(tmpPath).toMatch(/^\/some\/dir\/.tmp_/);
    // written with correct content and encoding
    expect(mocks.writeFileSync).toHaveBeenCalledWith(tmpPath, 'hello', 'utf-8');
    // renamed from tmp to target
    expect(mocks.renameSync).toHaveBeenCalledWith(tmpPath, '/some/dir/file.json');
  });

  // ── cleanup on write failure ─────────────────────────────────────────────

  it('cleans up the tmp file when writeFileSync throws', () => {
    const writeError = new Error('disk full');
    mocks.writeFileSync.mockImplementationOnce(() => { throw writeError; });

    expect(() => writeAtomicSync('/some/dir/file.json', 'content')).toThrow(writeError);

    const tmpPath = capturedTmpPath();
    expect(mocks.unlinkSync).toHaveBeenCalledWith(tmpPath);
  });

  it('re-throws the original error after cleanup on write failure', () => {
    const writeError = new Error('write failed');
    mocks.writeFileSync.mockImplementationOnce(() => { throw writeError; });

    let caught: unknown;
    try { writeAtomicSync('/some/dir/file.json', 'x'); } catch (e) { caught = e; }
    expect(caught).toBe(writeError);
  });

  // ── cleanup on rename failure ────────────────────────────────────────────

  it('cleans up the tmp file when renameSync throws', () => {
    const renameError = new Error('rename failed');
    mocks.renameSync.mockImplementationOnce(() => { throw renameError; });

    expect(() => writeAtomicSync('/some/dir/file.json', 'content')).toThrow(renameError);

    const tmpPath = capturedTmpPath();
    expect(mocks.unlinkSync).toHaveBeenCalledWith(tmpPath);
  });

  it('re-throws the original error after cleanup on rename failure', () => {
    const renameError = new Error('rename failed');
    mocks.renameSync.mockImplementationOnce(() => { throw renameError; });

    let caught: unknown;
    try { writeAtomicSync('/some/dir/file.json', 'x'); } catch (e) { caught = e; }
    expect(caught).toBe(renameError);
  });

  // ── cleanup itself fails silently ────────────────────────────────────────

  it('still re-throws the original error even when unlinkSync also throws', () => {
    const writeError = new Error('write failed');
    mocks.writeFileSync.mockImplementationOnce(() => { throw writeError; });
    mocks.unlinkSync.mockImplementationOnce(() => { throw new Error('unlink failed'); });

    let caught: unknown;
    try { writeAtomicSync('/some/dir/file.json', 'x'); } catch (e) { caught = e; }
    expect(caught).toBe(writeError);
  });
});

// ─── writeJsonSync ─────────────────────────────────────────────────────────────

describe('writeJsonSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes data as pretty JSON with a trailing newline', () => {
    const data = { key: 'value', num: 42 };
    writeJsonSync('/some/dir/out.json', data);

    const tmpPath = capturedTmpPath();
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      tmpPath,
      JSON.stringify(data, null, 2) + '\n',
      'utf-8',
    );
  });

  it('delegates to writeAtomicSync — renames tmp to target', () => {
    writeJsonSync('/some/dir/out.json', { x: 1 });
    const tmpPath = capturedTmpPath();
    expect(mocks.renameSync).toHaveBeenCalledWith(tmpPath, '/some/dir/out.json');
  });

  it('works with nested objects, arrays, and null values', () => {
    const data = { arr: [1, null, 'three'], nested: { a: true } };
    writeJsonSync('/path/data.json', data);
    const tmpPath = capturedTmpPath();
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      tmpPath,
      JSON.stringify(data, null, 2) + '\n',
      'utf-8',
    );
  });
});

// ─── readJsonSync ──────────────────────────────────────────────────────────────

describe('readJsonSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── success ─────────────────────────────────────────────────────────────

  it('returns parsed JSON for a valid file', () => {
    const data = { id: 1, name: 'test' };
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify(data));

    const result = readJsonSync<typeof data>('/path/to/file.json');
    expect(result).toEqual(data);
    expect(mocks.readFileSync).toHaveBeenCalledWith('/path/to/file.json', 'utf-8');
  });

  it('preserves the generic type — TypeScript type passes through', () => {
    interface User { id: number; email: string }
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({ id: 99, email: 'a@b.com' }));

    const result = readJsonSync<User>('/users.json');
    // TypeScript would enforce this at compile time; at runtime we verify shape
    expect(result?.id).toBe(99);
    expect(result?.email).toBe('a@b.com');
  });

  // ── ENOENT ───────────────────────────────────────────────────────────────

  it('returns null for ENOENT without logging a warning', () => {
    const enoentError = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    mocks.readFileSync.mockImplementationOnce(() => { throw enoentError; });

    const result = readJsonSync('/missing.json');
    expect(result).toBeNull();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  // ── parse errors ─────────────────────────────────────────────────────────

  it('throws an error containing "Corrupt JSON" when the file contains invalid JSON', () => {
    mocks.readFileSync.mockReturnValueOnce('{ not valid json }');

    expect(() => readJsonSync('/corrupt.json')).toThrow(/Corrupt JSON in \/corrupt\.json/);
  });

  it('corrupt JSON error message includes the parse error details', () => {
    mocks.readFileSync.mockReturnValueOnce('not json {{');

    let caught: unknown;
    try { readJsonSync('/bad.json'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('Corrupt JSON in /bad.json');
  });

  // ── other read errors ────────────────────────────────────────────────────

  it('re-throws non-ENOENT filesystem errors (e.g. EACCES)', () => {
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mocks.readFileSync.mockImplementationOnce(() => { throw accessError; });

    expect(() => readJsonSync('/protected.json')).toThrow(accessError);
  });

  it('re-throws non-ENOENT errors with original error identity preserved', () => {
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mocks.readFileSync.mockImplementationOnce(() => { throw accessError; });

    let caught: unknown;
    try { readJsonSync('/protected.json'); } catch (e) { caught = e; }
    expect(caught).toBe(accessError);
  });
});
