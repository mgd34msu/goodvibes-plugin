/**
 * Tests for PrecisionRuntime singleton — lifecycle, subsystem wiring,
 * graceful degradation, telemetry integration, and shutdown.
 *
 * Uses real singletons (Telemetry, KVState, ProjectIndex) in temp directories
 * to validate actual behavior. No mocks for subsystem internals.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

let tmpDir: string;

function makeTempDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precision-runtime-test-'));
  return tmpDir;
}

function cleanupTempDir() {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors in CI
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ───────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  makeTempDir();

  // Reset all singletons before each test to ensure isolation
  const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
  const { Telemetry } = await import('../../state/telemetry.js');
  const { KVState } = await import('../../state/kv-state.js');
  const { ProjectIndex } = await import('../../state/project-index.js');

  PrecisionRuntime.resetInstance();
  Telemetry.resetInstance();
  KVState.resetInstance();
  ProjectIndex.resetInstance();
});

afterEach(async () => {
  const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
  const { Telemetry } = await import('../../state/telemetry.js');
  const { KVState } = await import('../../state/kv-state.js');
  const { ProjectIndex } = await import('../../state/project-index.js');

  PrecisionRuntime.resetInstance();
  Telemetry.resetInstance();
  KVState.resetInstance();
  ProjectIndex.resetInstance();

  cleanupTempDir();
});

// ───────────────────────────────────────────────────────────────────────────
// Singleton lifecycle
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — singleton lifecycle', () => {
  it('get() returns null before initialization', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
    expect(PrecisionRuntime.get()).toBeNull();
  });

  it('initialize() creates and stores the singleton', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime).toBeTruthy();
    expect(PrecisionRuntime.get()).toBe(runtime);
  });

  it('initialize() is idempotent — returns same instance on repeated calls', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const first = await PrecisionRuntime.initialize();
    const second = await PrecisionRuntime.initialize();

    expect(second).toBe(first);
  });

  it('resetInstance() clears the singleton without throwing', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    await PrecisionRuntime.initialize();
    expect(PrecisionRuntime.get()).not.toBeNull();

    PrecisionRuntime.resetInstance();
    expect(PrecisionRuntime.get()).toBeNull();
  });

  it('can re-initialize after resetInstance()', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
    const { Telemetry } = await import('../../state/telemetry.js');

    await PrecisionRuntime.initialize();
    const first = PrecisionRuntime.get();

    PrecisionRuntime.resetInstance();
    Telemetry.resetInstance(); // Required: telemetry has its own singleton

    await PrecisionRuntime.initialize();
    const second = PrecisionRuntime.get();

    expect(second).not.toBeNull();
    // Second instance is a new object (different reference)
    expect(first).not.toBe(second);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Subsystem references
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — subsystem references', () => {
  it('exposes config after initialization', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.config).toBeTruthy();
    expect(typeof runtime.config.sandbox).toBe('boolean');
  });

  it('exposes telemetry after initialization', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
    const { Telemetry } = await import('../../state/telemetry.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.telemetry).toBeTruthy();
    expect(runtime.telemetry).toBe(Telemetry.getInstance());
  });

  it('exposes state (KVState) after initialization', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
    const { KVState } = await import('../../state/kv-state.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.state).toBeTruthy();
    expect(runtime.state).toBe(KVState.getInstance());
  });

  it('exposes index (ProjectIndex) after initialization', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');
    const { ProjectIndex } = await import('../../state/project-index.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.index).toBeTruthy();
    expect(runtime.index).toBe(ProjectIndex.getInstance());
  });

  it('exposes session info after initialization', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.session).toBeTruthy();
    expect(runtime.session.id).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof runtime.session.startedAt).toBe('string');
    expect(runtime.session.toolCalls).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SessionInfo
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — SessionInfo', () => {
  it('getSessionId() returns an 8-char hex string', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    const id = runtime.getSessionId();

    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('session.id matches getSessionId()', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.session.id).toBe(runtime.getSessionId());
  });

  it('session.id matches telemetry.getSessionId()', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.session.id).toBe(runtime.telemetry.getSessionId());
  });

  it('session.startedAt is a valid ISO timestamp', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const before = new Date();
    const runtime = await PrecisionRuntime.initialize();
    const after = new Date();

    const startedAt = new Date(runtime.session.startedAt);
    expect(startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('session.toolCalls starts at 0', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    expect(runtime.session.toolCalls).toBe(0);
  });

  it('session.toolCalls can be incremented externally', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    runtime.session.toolCalls++;
    runtime.session.toolCalls++;

    expect(runtime.session.toolCalls).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// generateId()
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — generateId()', () => {
  it('produces a string with three underscore-delimited segments', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    const id = runtime.generateId('precision_read');

    const parts = id.split('_');
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  it('includes the session ID in the generated precision_id', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    const id = runtime.generateId('precision_read');

    expect(id).toContain(runtime.getSessionId());
  });

  it('produces unique IDs on repeated calls', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    const ids = new Set(
      Array.from({ length: 10 }, () => runtime.generateId('precision_read')),
    );

    expect(ids.size).toBe(10);
  });

  it('delegates to telemetry.generateId() for consistent format', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();

    // Both use the same telemetry instance — verify format consistency
    const runtimeId = runtime.generateId('precision_read');
    const telemetryId = runtime.telemetry.generateId('precision_read');

    // Same format: shortTool_sessionId_uniqueHex
    const runtimeParts = runtimeId.split('_');
    const telemetryParts = telemetryId.split('_');
    expect(runtimeParts.length).toBe(telemetryParts.length);
    // Middle segment (session ID) is the same
    expect(runtimeParts[1]).toBe(telemetryParts[1]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Telemetry integration
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — telemetry integration', () => {
  it('can record a telemetry entry through the runtime', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    const id = runtime.generateId('precision_read');

    runtime.telemetry.record({
      id,
      tool: 'precision_read',
      status: 'success',
      tokens_in: 10,
      tokens_out: 50,
      duration_ms: 5,
    });

    const records = runtime.telemetry.query({
      session_id: runtime.getSessionId(),
    });

    expect(records.length).toBe(1);
    expect(records[0].id).toBe(id);
    expect(records[0].tool).toBe('precision_read');
    expect(records[0].status).toBe('success');
  });

  it('Telemetry.estimateTokens() produces a numeric estimate', async () => {
    const { Telemetry } = await import('../../state/telemetry.js');
    const est = Telemetry.estimateTokens({ hello: 'world', count: 42 });
    expect(typeof est).toBe('number');
    expect(est).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Graceful degradation
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — graceful degradation', () => {
  it('get() returns null when runtime is not initialized', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    // Confirm not initialized
    expect(PrecisionRuntime.get()).toBeNull();
  });

  it('handler dispatch logic degrades gracefully when runtime is null', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    // Simulate a handler wrapper checking for runtime
    let precisionId: string | undefined;
    const runtime = PrecisionRuntime.get(); // Returns null
    if (runtime) {
      precisionId = runtime.generateId('precision_read');
      runtime.session.toolCalls++;
    }

    // No crash — undefined is the graceful degradation
    expect(precisionId).toBeUndefined();
    expect(runtime).toBeNull();
  });

  it('runtime is optional — tools can function without it', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    // Simulate tool execution pattern
    const result = simulateToolExecution(PrecisionRuntime.get());

    // Tool runs successfully without runtime
    expect(result.success).toBe(true);
    expect(result.precisionId).toBeUndefined();
  });
});

/**
 * Simulates a tool handler execution with optional runtime integration.
 * Mirrors the pattern used in src/index.ts handler wrapper.
 */
function simulateToolExecution(
  runtime: { generateId: (t: string) => string; session: { toolCalls: number } } | null,
): {
  success: boolean;
  precisionId?: string;
} {
  let precisionId: string | undefined;

  if (runtime) {
    precisionId = runtime.generateId('test_tool');
    runtime.session.toolCalls++;
  }

  // Tool logic would run here
  return { success: true, precisionId };
}

// ───────────────────────────────────────────────────────────────────────────
// Shutdown
// ───────────────────────────────────────────────────────────────────────────

describe('PrecisionRuntime — shutdown', () => {
  it('shutdown() completes without throwing', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    await expect(runtime.shutdown()).resolves.toBeUndefined();
  });

  it('shutdown() sets instance to null', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime = await PrecisionRuntime.initialize();
    await runtime.shutdown();

    expect(PrecisionRuntime.get()).toBeNull();
  });

  it('can initialize again after shutdown', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const first = await PrecisionRuntime.initialize();
    await first.shutdown();

    // After shutdown, subsystems are reset — re-initialize should work
    const second = await PrecisionRuntime.initialize();
    expect(second).not.toBeNull();
    expect(PrecisionRuntime.get()).toBe(second);
  });

  it('re-initialize after shutdown creates fresh subsystem instances', async () => {
    const { PrecisionRuntime } = await import('../../state/precision-runtime.js');

    const runtime1 = await PrecisionRuntime.initialize();
    const sessionId1 = runtime1.getSessionId();
    await runtime1.shutdown();

    const runtime2 = await PrecisionRuntime.initialize();
    expect(runtime2.getSessionId()).not.toBe(sessionId1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractMetadata helper
// ───────────────────────────────────────────────────────────────────────────

describe('extractMetadata()', () => {
  it('extracts file paths from precision_read args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_read', {
      files: [{ path: 'src/foo.ts' }, { path: 'src/bar.ts' }],
    });

    expect(meta.files).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('extracts file paths from precision_write args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_write', {
      files: [{ path: 'src/out.ts', content: '...' }],
    });

    expect(meta.files).toEqual(['src/out.ts']);
  });

  it('deduplicates file paths from precision_edit args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_edit', {
      edits: [
        { path: 'src/foo.ts', find: 'a', replace: 'b' },
        { path: 'src/foo.ts', find: 'c', replace: 'd' },
        { path: 'src/bar.ts', find: 'e', replace: 'f' },
      ],
    });

    expect((meta.files as string[]).length).toBe(2);
    expect(meta.files).toContain('src/foo.ts');
    expect(meta.files).toContain('src/bar.ts');
  });

  it('extracts command prefixes from precision_exec args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_exec', {
      commands: [{ cmd: 'npm run build' }, { cmd: 'npm run test' }],
    });

    expect(meta.commands).toEqual(['npm run build', 'npm run test']);
  });

  it('counts queries for precision_grep', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_grep', {
      queries: [{ pattern: 'foo' }, { pattern: 'bar' }],
    });

    expect(meta.queries).toBe(2);
  });

  it('counts patterns for precision_glob', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_glob', {
      patterns: ['**/*.ts', '**/*.tsx'],
    });

    expect(meta.patterns).toBe(2);
  });

  it('counts queries for discover', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('discover', {
      queries: [{ id: 'q1', type: 'glob', patterns: [] }],
    });

    expect(meta.queries).toBe(1);
  });

  it('returns empty object for unknown tool', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('unknown_tool', { foo: 'bar' });

    expect(meta).toEqual({});
  });

  it('handles missing args gracefully', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_read', {});

    expect(meta.files).toBeUndefined();
  });

  it('handles undefined arrays gracefully', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');
    expect(extractMetadata('precision_exec', {})).toEqual({ commands: undefined });
    expect(extractMetadata('precision_read', {})).toEqual({ files: undefined });
  });

  it('extracts query and kinds from precision_symbols args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_symbols', {
      query: 'useAuth',
      kinds: ['function', 'method'],
    });

    expect(meta.query).toBe('useAuth');
    expect(meta.kinds).toEqual(['function', 'method']);
  });

  it('extracts path from precision_notebook args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_notebook', {
      path: 'notebooks/analysis.ipynb',
    });

    expect(meta.path).toBe('notebooks/analysis.ipynb');
  });

  it('counts URLs from precision_fetch args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_fetch', {
      urls: [{ url: 'https://example.com' }, { url: 'https://other.com' }],
    });

    expect(meta.urls).toBe(2);
  });

  it('extracts action and key from precision_config args', async () => {
    const { extractMetadata } = await import('../../state/precision-runtime.js');

    const meta = extractMetadata('precision_config', {
      action: 'get',
      key: 'sandbox',
    });

    expect(meta.action).toBe('get');
    expect(meta.key).toBe('sandbox');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractCacheHit helper
// ───────────────────────────────────────────────────────────────────────────

describe('extractCacheHit()', () => {
  it('returns false for null/undefined/non-objects', async () => {
    const { extractCacheHit } = await import('../../state/precision-runtime.js');

    expect(extractCacheHit(null)).toBe(false);
    expect(extractCacheHit(undefined)).toBe(false);
    expect(extractCacheHit('string')).toBe(false);
    expect(extractCacheHit(42)).toBe(false);
  });

  it('reads top-level cache_hit boolean', async () => {
    const { extractCacheHit } = await import('../../state/precision-runtime.js');

    expect(extractCacheHit({ cache_hit: true })).toBe(true);
    expect(extractCacheHit({ cache_hit: false })).toBe(false);
  });

  it('reads nested data.cache_hit boolean', async () => {
    const { extractCacheHit } = await import('../../state/precision-runtime.js');

    expect(extractCacheHit({ data: { cache_hit: true } })).toBe(true);
    expect(extractCacheHit({ data: { cache_hit: false } })).toBe(false);
  });

  it('returns false when cache_hit is not a boolean', async () => {
    const { extractCacheHit } = await import('../../state/precision-runtime.js');

    expect(extractCacheHit({ cache_hit: 'yes' })).toBe(false);
    expect(extractCacheHit({ cache_hit: 1 })).toBe(false);
    expect(extractCacheHit({ data: {} })).toBe(false);
  });
});
