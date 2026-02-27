/**
 * Unit tests for ensureDirSync
 *
 * Verifies that ensureDirSync delegates to mkdirSync with { recursive: true }.
 *
 * Strategy:
 * - Mock node:fs to intercept mkdirSync calls.
 * - No timer manipulation needed — all synchronous.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mkdirSync = vi.fn();
  return { mkdirSync };
});

vi.mock('node:fs', () => ({ mkdirSync: mocks.mkdirSync }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ensureDirSync } from '../fs-utils.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ensureDirSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── basic invocation ────────────────────────────────────────────────────

  it('calls mkdirSync with the provided path and { recursive: true }', () => {
    ensureDirSync('/tmp/test-dir');
    expect(mocks.mkdirSync).toHaveBeenCalledOnce();
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/tmp/test-dir', { recursive: true });
  });

  it('works with nested paths', () => {
    ensureDirSync('/a/b/c/d');
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/a/b/c/d', { recursive: true });
  });

  it('works with relative paths', () => {
    ensureDirSync('some/relative/path');
    expect(mocks.mkdirSync).toHaveBeenCalledWith('some/relative/path', { recursive: true });
  });

  it('calls mkdirSync exactly once per call', () => {
    ensureDirSync('/single-call');
    expect(mocks.mkdirSync).toHaveBeenCalledTimes(1);
  });

  it('passes through mkdirSync errors to the caller', () => {
    mocks.mkdirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    expect(() => ensureDirSync('/protected/path')).toThrow('EACCES: permission denied');
  });
});
