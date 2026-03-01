import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { writeAtomicSync, writeJsonSync, readJsonSync } from '../file-io.js';
import { ParseError } from '../errors.js';

const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockRenameSync = vi.mocked(fs.renameSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);

function makeEnoentError(): NodeJS.ErrnoException {
  const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

function makeEaccesError(): NodeJS.ErrnoException {
  const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
  err.code = 'EACCES';
  return err;
}

describe('writeAtomicSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('creates the parent directory recursively', () => {
    writeAtomicSync('/some/deep/path/file.json', 'content');
    expect(mockMkdirSync).toHaveBeenCalledWith('/some/deep/path', { recursive: true });
  });

  it('writes content to a temp file before renaming', () => {
    writeAtomicSync('/dir/file.json', 'hello');
    // writeFileSync should be called with a temp path (not the final path)
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [tmpPath, content, encoding] = mockWriteFileSync.mock.calls[0]!;
    expect(tmpPath as string).not.toBe('/dir/file.json');
    expect(tmpPath as string).toContain('/dir/');
    expect(tmpPath as string).toContain('.tmp_');
    expect(content).toBe('hello');
    expect(encoding).toBe('utf-8');
  });

  it('renames the temp file to the final path', () => {
    writeAtomicSync('/dir/file.json', 'data');
    expect(mockRenameSync).toHaveBeenCalledTimes(1);
    const [src, dest] = mockRenameSync.mock.calls[0]!;
    expect(src as string).toContain('.tmp_');
    expect(dest).toBe('/dir/file.json');
  });

  it('uses the same temp path for writeFileSync and renameSync', () => {
    writeAtomicSync('/dir/out.json', 'x');
    const writtenTmpPath = mockWriteFileSync.mock.calls[0]![0] as string;
    const renamedFromPath = mockRenameSync.mock.calls[0]![0] as string;
    expect(writtenTmpPath).toBe(renamedFromPath);
  });

  it('temp filename includes process.pid', () => {
    writeAtomicSync('/dir/file.json', '');
    const tmpPath = mockWriteFileSync.mock.calls[0]![0] as string;
    expect(tmpPath).toContain(String(process.pid));
  });

  it('does not call unlinkSync on success', () => {
    writeAtomicSync('/dir/file.json', 'ok');
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('unlinks temp file and rethrows when writeFileSync throws', () => {
    const writeError = new Error('disk full');
    mockWriteFileSync.mockImplementation(() => { throw writeError; });
    expect(() => writeAtomicSync('/dir/file.json', 'x')).toThrow('disk full');
    // unlinkSync called with the same tmp path that was attempted
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    const unlinkedPath = mockUnlinkSync.mock.calls[0]![0] as string;
    expect(unlinkedPath).toContain('.tmp_');
  });

  it('unlinks temp file and rethrows when renameSync throws', () => {
    const renameError = new Error('rename failed');
    mockRenameSync.mockImplementation(() => { throw renameError; });
    expect(() => writeAtomicSync('/dir/file.json', 'x')).toThrow('rename failed');
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    const unlinkedPath = mockUnlinkSync.mock.calls[0]![0] as string;
    expect(unlinkedPath).toContain('.tmp_');
  });

  it('silently ignores unlinkSync failure during error cleanup', () => {
    mockWriteFileSync.mockImplementation(() => { throw new Error('write fail'); });
    mockUnlinkSync.mockImplementation(() => { throw new Error('unlink fail'); });
    // Should throw the original write error, not the unlink error
    expect(() => writeAtomicSync('/dir/file.json', 'x')).toThrow('write fail');
  });

  it('handles file in root directory (no parent dir separator issue)', () => {
    writeAtomicSync('/file.json', 'data');
    expect(mockMkdirSync).toHaveBeenCalledWith('/', { recursive: true });
  });

  it('writes empty string content without error', () => {
    expect(() => writeAtomicSync('/dir/file.json', '')).not.toThrow();
    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), '', 'utf-8');
  });
});

describe('writeJsonSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes pretty-printed JSON with 2-space indent', () => {
    writeJsonSync('/path/data.json', { key: 'value', num: 42 });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toBe(JSON.stringify({ key: 'value', num: 42 }, null, 2) + '\n');
  });

  it('appends a trailing newline to the JSON output', () => {
    writeJsonSync('/path/data.json', { x: 1 });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content.endsWith('\n')).toBe(true);
  });

  it('writes to the correct file path via writeAtomicSync', () => {
    writeJsonSync('/my/config.json', {});
    const dest = mockRenameSync.mock.calls[0]![1] as string;
    expect(dest).toBe('/my/config.json');
  });

  it('serializes nested objects correctly', () => {
    const data = { a: { b: { c: 1 } }, arr: [1, 2, 3] };
    writeJsonSync('/path/nested.json', data);
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(data);
  });

  it('serializes arrays at the root level', () => {
    writeJsonSync('/path/arr.json', [1, 2, 3]);
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(JSON.parse(content)).toEqual([1, 2, 3]);
  });

  it('serializes null at the root level', () => {
    writeJsonSync('/path/null.json', null);
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content.trim()).toBe('null');
  });

  it('serializes a string value', () => {
    writeJsonSync('/path/str.json', 'hello world');
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(JSON.parse(content)).toBe('hello world');
  });

  it('calls mkdirSync for the parent directory', () => {
    writeJsonSync('/deep/path/file.json', {});
    expect(mockMkdirSync).toHaveBeenCalledWith('/deep/path', { recursive: true });
  });
});

describe('readJsonSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses and returns a valid JSON object', () => {
    const data = { id: '123', value: 42 };
    mockReadFileSync.mockReturnValue(JSON.stringify(data));
    const result = readJsonSync<typeof data>('/path/file.json');
    expect(result).toEqual(data);
  });

  it('parses and returns a JSON array', () => {
    mockReadFileSync.mockReturnValue('[1, 2, 3]');
    const result = readJsonSync<number[]>('/path/arr.json');
    expect(result).toEqual([1, 2, 3]);
  });

  it('parses and returns a JSON number', () => {
    mockReadFileSync.mockReturnValue('42');
    const result = readJsonSync<number>('/path/num.json');
    expect(result).toBe(42);
  });

  it('parses and returns null JSON value', () => {
    mockReadFileSync.mockReturnValue('null');
    const result = readJsonSync<null>('/path/null.json');
    expect(result).toBeNull();
  });

  it('reads from the provided file path', () => {
    mockReadFileSync.mockReturnValue('{}');
    readJsonSync('/specific/path/config.json');
    expect(mockReadFileSync).toHaveBeenCalledWith('/specific/path/config.json', 'utf-8');
  });

  it('returns null when the file does not exist (ENOENT)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const result = readJsonSync('/missing/file.json');
    expect(result).toBeNull();
  });

  it('throws ParseError when file contains invalid JSON', () => {
    mockReadFileSync.mockReturnValue('{invalid json}');
    expect(() => readJsonSync('/path/bad.json')).toThrow(ParseError);
  });

  it('ParseError message includes the file path', () => {
    mockReadFileSync.mockReturnValue('{bad}');
    expect(() => readJsonSync('/path/corrupt.json')).toThrow('/path/corrupt.json');
  });

  it('ParseError has the SyntaxError as cause', () => {
    mockReadFileSync.mockReturnValue('{bad}');
    let caught: unknown;
    try {
      readJsonSync('/path/corrupt.json');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).cause).toBeInstanceOf(SyntaxError);
  });

  it('ParseError has code PARSE_ERROR', () => {
    mockReadFileSync.mockReturnValue('{bad}');
    let caught: unknown;
    try {
      readJsonSync('/path/file.json');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).code).toBe('PARSE_ERROR');
  });

  it('rethrows non-ENOENT filesystem errors (EACCES)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEaccesError(); });
    expect(() => readJsonSync('/protected/file.json')).toThrow('EACCES');
  });

  it('rethrows non-ENOENT errors that are not SyntaxError', () => {
    const customErr = new Error('unexpected io error');
    mockReadFileSync.mockImplementation(() => { throw customErr; });
    expect(() => readJsonSync('/path/file.json')).toThrow(customErr);
  });

  it('does not throw ParseError for non-ENOENT errors', () => {
    const customErr = makeEaccesError();
    mockReadFileSync.mockImplementation(() => { throw customErr; });
    expect(() => readJsonSync('/path/file.json')).not.toThrow(ParseError);
  });

  it('handles deeply nested JSON structures correctly', () => {
    const nested = { a: { b: { c: { d: [1, 2, { e: true }] } } } };
    mockReadFileSync.mockReturnValue(JSON.stringify(nested));
    const result = readJsonSync<typeof nested>('/path/deep.json');
    expect(result).toEqual(nested);
  });

  it('handles empty object JSON', () => {
    mockReadFileSync.mockReturnValue('{}');
    expect(readJsonSync('/path/empty.json')).toEqual({});
  });

  it('handles empty array JSON', () => {
    mockReadFileSync.mockReturnValue('[]');
    expect(readJsonSync('/path/empty-arr.json')).toEqual([]);
  });

  it('throws ParseError for empty string content', () => {
    mockReadFileSync.mockReturnValue('');
    expect(() => readJsonSync('/path/empty-file.json')).toThrow(ParseError);
  });
});
