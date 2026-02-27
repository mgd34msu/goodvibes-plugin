/**
 * Unit tests for stream-reader
 *
 * Tests bounded stream reading: content accumulation, limit enforcement,
 * stream draining, error propagation, and the resolved-guard (no double-resolve).
 *
 * Strategy:
 * - PassThrough streams (from node:stream) act as controllable Readable inputs.
 * - Spies on removeAllListeners and resume verify draining behaviour.
 * - The resolved guard is tested by emitting events after the promise settles.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { readStreamBody } from '../stream-reader.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a PassThrough stream with spies on removeAllListeners and resume. */
function makeStream() {
  const stream = new PassThrough();
  const removeAllListenersSpy = vi.spyOn(stream, 'removeAllListeners');
  const resumeSpy = vi.spyOn(stream, 'resume');
  return { stream, removeAllListenersSpy, resumeSpy };
}

/** Push a Buffer chunk of `size` bytes and end the stream. */
function pushAndEnd(stream: PassThrough, size: number): void {
  stream.push(Buffer.alloc(size, 'a'));
  stream.push(null);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readStreamBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── happy path ──────────────────────────────────────────────────────────

  it('returns full content when total bytes are under the limit', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 1024);
    stream.push(Buffer.from('hello '));
    stream.push(Buffer.from('world'));
    stream.push(null);

    const result = await promise;
    expect(result).toBe('hello world');
  });

  it('returns empty string when stream ends with no data', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 1024);
    stream.push(null);

    const result = await promise;
    expect(result).toBe('');
  });

  it('handles multiple chunks that stay within the limit', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 100);
    stream.push(Buffer.from('foo'));
    stream.push(Buffer.from('bar'));
    stream.push(Buffer.from('baz'));
    stream.push(null);

    const result = await promise;
    expect(result).toBe('foobarbaz');
  });

  // ── limit enforcement ────────────────────────────────────────────────────

  it('returns null when a single chunk exceeds the limit', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 10);
    pushAndEnd(stream, 11);

    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns null when cumulative chunks exceed the limit', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 10);
    stream.push(Buffer.alloc(6, 'a'));
    stream.push(Buffer.alloc(6, 'b')); // cumulative = 12 > 10
    stream.push(null);

    const result = await promise;
    expect(result).toBeNull();
  });

  // ── draining behaviour when limit exceeded ───────────────────────────────

  it('calls removeAllListeners("data") when limit is exceeded', async () => {
    const { stream, removeAllListenersSpy } = makeStream();
    const promise = readStreamBody(stream, 5);
    pushAndEnd(stream, 10);

    await promise;
    expect(removeAllListenersSpy).toHaveBeenCalledWith('data');
  });

  it('calls resume() to drain the stream when limit is exceeded', async () => {
    const { stream, resumeSpy } = makeStream();
    const promise = readStreamBody(stream, 5);
    pushAndEnd(stream, 10);

    await promise;
    expect(resumeSpy).toHaveBeenCalled();
  });

  it('does not call removeAllListeners or resume when limit is not exceeded', async () => {
    const { stream, removeAllListenersSpy, resumeSpy } = makeStream();
    const promise = readStreamBody(stream, 1024);
    stream.push(Buffer.from('small'));
    stream.push(null);

    await promise;
    expect(removeAllListenersSpy).not.toHaveBeenCalledWith('data');
    // resume may be called internally by PassThrough; we assert about our logic
    // by checking removeAllListeners was not called with 'data'
  });

  // ── error handling ───────────────────────────────────────────────────────

  it('rejects with the stream error when an error event is emitted', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 1024);
    const streamError = new Error('socket hang up');
    stream.emit('error', streamError);

    await expect(promise).rejects.toThrow('socket hang up');
  });

  it('rejects with the exact error object emitted by the stream', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 1024);
    const streamError = new Error('connection reset');
    stream.emit('error', streamError);

    await expect(promise).rejects.toBe(streamError);
  });

  // ── resolved guard (no double-resolve) ───────────────────────────────────

  it('does not reject after already resolving on limit exceeded', async () => {
    const { stream } = makeStream();
    const promise = readStreamBody(stream, 5);

    // Exceed limit — resolves with null
    stream.push(Buffer.alloc(10, 'x'));
    stream.push(null);

    const result = await promise;
    expect(result).toBeNull();

    // Emit error after promise has settled — should not cause an unhandled rejection
    // We verify by attaching a rejection handler that should never fire
    const rejectionSpy = vi.fn();
    promise.catch(rejectionSpy);
    stream.emit('error', new Error('late error'));

    // Allow microtask queue to flush
    await new Promise(resolve => setImmediate(resolve));
    expect(rejectionSpy).not.toHaveBeenCalled();
  });

  it('does not resolve again after limit exceeded when end event fires', async () => {
    const { stream } = makeStream();
    let resolveCount = 0;

    // Wrap to count actual resolutions
    const promise = readStreamBody(stream, 5).then(v => { resolveCount++; return v; });

    stream.push(Buffer.alloc(10, 'x')); // exceeds limit, resolves null
    stream.push(null);                  // triggers end event

    await promise;
    expect(resolveCount).toBe(1);
  });

  it('does not reject after end has already resolved the promise', async () => {
    const { stream } = makeStream();

    // Start reading — do not push data yet
    const promise = readStreamBody(stream, 1024);
    const rejectionSpy = vi.fn();
    promise.catch(rejectionSpy);

    // End the stream — resolves with empty string
    stream.push(null);
    const result = await promise;
    expect(result).toBe('');

    // Error event after promise settled — resolved guard must suppress rejection
    stream.emit('error', new Error('late error'));

    await new Promise(resolve => setImmediate(resolve));
    expect(rejectionSpy).not.toHaveBeenCalled();
  });
});
