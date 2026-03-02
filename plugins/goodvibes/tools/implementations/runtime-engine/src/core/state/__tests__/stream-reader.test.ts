import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { readStreamBody } from '../stream-reader.js';

/**
 * Create a Readable stream that emits the given chunks and then ends.
 */
function makeStream(...chunks: string[]): Readable {
  return Readable.from(
    (async function* () {
      for (const chunk of chunks) {
        yield Buffer.from(chunk, 'utf-8');
      }
    })(),
  );
}

/**
 * Create a Readable stream that emits an error after optional initial chunks.
 */
function makeErrorStream(message: string, beforeChunks: string[] = []): Readable {
  const r = new Readable({ read() {} });
  setImmediate(() => {
    for (const chunk of beforeChunks) {
      r.push(Buffer.from(chunk, 'utf-8'));
    }
    r.destroy(new Error(message));
  });
  return r;
}

describe('readStreamBody', () => {
  // ─── happy path ─────────────────────────────────────────────────────────────

  it('returns string content from a single-chunk stream', async () => {
    const stream = makeStream('hello world');
    const result = await readStreamBody(stream, 1024);
    expect(result).toBe('hello world');
  });

  it('returns empty string for an empty stream', async () => {
    const stream = makeStream();
    const result = await readStreamBody(stream, 1024);
    expect(result).toBe('');
  });

  it('concatenates multiple chunks correctly', async () => {
    const stream = makeStream('foo', 'bar', 'baz');
    const result = await readStreamBody(stream, 1024);
    expect(result).toBe('foobarbaz');
  });

  // ─── maxBytes enforcement ────────────────────────────────────────────────────

  it('returns null when stream exceeds maxBytes', async () => {
    // 'hello world' = 11 bytes, maxBytes = 5
    const stream = makeStream('hello world');
    const result = await readStreamBody(stream, 5);
    expect(result).toBeNull();
  });

  it('returns the content when stream size exactly equals maxBytes', async () => {
    // 'hello' = 5 bytes, maxBytes = 5 — not exceeded (totalBytes > maxBytes, not >=)
    const stream = makeStream('hello');
    const result = await readStreamBody(stream, 5);
    expect(result).toBe('hello');
  });

  it('returns null when stream size is one byte over maxBytes', async () => {
    // 'hello!' = 6 bytes, maxBytes = 5
    const stream = makeStream('hello!');
    const result = await readStreamBody(stream, 5);
    expect(result).toBeNull();
  });

  it('returns null for zero maxBytes when stream has content', async () => {
    const stream = makeStream('x');
    const result = await readStreamBody(stream, 0);
    expect(result).toBeNull();
  });

  it('returns empty string for zero maxBytes with empty stream', async () => {
    const stream = makeStream();
    const result = await readStreamBody(stream, 0);
    expect(result).toBe('');
  });

  // ─── error handling ──────────────────────────────────────────────────────────

  it('rejects with the stream error', async () => {
    const stream = makeErrorStream('socket hang up');
    await expect(readStreamBody(stream, 1024)).rejects.toThrow('socket hang up');
  });

  it('rejects with correct error message when error occurs after some chunks', async () => {
    const stream = makeErrorStream('read error', ['partial']);
    await expect(readStreamBody(stream, 1024)).rejects.toThrow('read error');
  });

  // ─── multi-chunk accumulation ────────────────────────────────────────────────

  it('handles a stream with many small chunks', async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => String(i));
    const expected = chunks.join('');
    const stream = makeStream(...chunks);
    const result = await readStreamBody(stream, 10000);
    expect(result).toBe(expected);
  });

  it('returns null when accumulated multi-chunk content exceeds maxBytes', async () => {
    // Each chunk is 4 bytes, 3 chunks = 12 bytes, maxBytes = 10
    const stream = makeStream('abcd', 'efgh', 'ijkl');
    const result = await readStreamBody(stream, 10);
    expect(result).toBeNull();
  });
});
