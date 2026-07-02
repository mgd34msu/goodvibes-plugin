/**
 * Atomic-write regression tests (v2 mandatory fix): every shared state file is
 * written temp-then-rename, so a reader never observes a partial write and no
 * `.tmp` residue is left behind. The global SQLite DB, analytics config, and the
 * dashboard pane-state JSON all route through these helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFileSync, atomicWriteJson } from '../engine/runtime.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gv-analytics-atomic-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('atomicWriteFileSync', () => {
  it('writes a UTF-8 string and leaves no temp residue', () => {
    const file = join(dir, 'a.json');
    atomicWriteFileSync(file, '{"hello":"world"}');
    expect(readFileSync(file, 'utf-8')).toBe('{"hello":"world"}');
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('writes Buffer content (e.g. a SQLite export) byte-for-byte', () => {
    const file = join(dir, 'db.sqlite');
    const buf = Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x00, 0xff]);
    atomicWriteFileSync(file, buf);
    expect(Buffer.compare(readFileSync(file), buf)).toBe(0);
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('overwrites an existing file with the new content and no residue', () => {
    const file = join(dir, 'over.txt');
    writeFileSync(file, 'stale-original-content');
    atomicWriteFileSync(file, 'fresh');
    expect(readFileSync(file, 'utf-8')).toBe('fresh');
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('round-trips through repeated overwrites without corruption', () => {
    const file = join(dir, 'loop.txt');
    for (let i = 0; i < 20; i++) atomicWriteFileSync(file, `iteration-${i}`);
    expect(readFileSync(file, 'utf-8')).toBe('iteration-19');
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });
});

describe('atomicWriteJson', () => {
  it('serializes pretty JSON and round-trips', () => {
    const file = join(dir, 'state.json');
    const value = { sessions: [{ id: 'abc', tags: ['x', 'y'] }], n: 3 };
    atomicWriteJson(file, value);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual(value);
    // pretty-printed (2-space indent)
    expect(readFileSync(file, 'utf-8')).toContain('\n  ');
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });
});
