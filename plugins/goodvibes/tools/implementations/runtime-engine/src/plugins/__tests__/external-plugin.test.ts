/**
 * External Plugin Tests — Layer 3
 *
 * Comprehensive tests for normalizers, NormalizerRegistry, FileWatcher,
 * HttpListener, and ExternalPlugin.
 * Target: 100% coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ─── Module Mocks ─────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// The http mock uses a stable object reference so tests can mutate listen/close etc.
const mockServer = {
  listen: vi.fn(),
  close: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('node:http', () => ({
  createServer: vi.fn(),
}));

import * as fsMock from 'node:fs/promises';
import * as httpMock from 'node:http';

// SUT modules
import { normalizeGeneric } from '../external/normalizers/generic.js';
import { normalizeGithub } from '../external/normalizers/github.js';
import {
  NormalizerRegistry,
  createDefaultRegistry,
} from '../external/normalizers/index.js';
import { FileWatcher } from '../external/file-watcher.js';
import type { FileWatcherConfig } from '../external/file-watcher.js';
import { HttpListener } from '../external/http-listener.js';
import type { HttpListenerConfig } from '../external/http-listener.js';
import { ExternalPlugin } from '../external/external-plugin.js';
import type { EventQueueInterface } from '../../core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeQueue(): EventQueueInterface {
  return {
    enqueue: vi.fn(),
    drain: vi.fn().mockResolvedValue({ processed: 0, remaining: 0 }),
    peek: vi.fn().mockReturnValue(undefined),
    depth: vi.fn().mockReturnValue(0),
    deduplicate: vi.fn().mockReturnValue(0),
    cancel: vi.fn().mockReturnValue(false),
    cancelByRef: vi.fn().mockReturnValue(0),
    requeue: vi.fn(),
  } as unknown as EventQueueInterface;
}

const BASE_WATCHER_CONFIG: FileWatcherConfig = {
  incoming_dir: '/tmp/incoming',
  processed_dir: '/tmp/processed',
  error_dir: '/tmp/errors',
  max_files_per_scan: 50,
};

const BASE_HTTP_CONFIG: HttpListenerConfig = {
  port: 3847,
  host: '127.0.0.1',
  max_payload_bytes: 1024 * 1024,
};

// ─── normalizeGeneric ─────────────────────────────────────────────────────────

describe('normalizeGeneric', () => {
  it('sets external_source to the provided source', () => {
    const event = normalizeGeneric({ data: 1 }, 'my-source');
    expect(event.external_source).toBe('my-source');
    expect(event.source).toBe('external');
  });

  it('falls back to generic event type when payload has no type fields', () => {
    const event = normalizeGeneric({ unrelated: true }, 'svc');
    expect(event.type).toBe('webhook:svc:event');
  });

  it('extracts event type from payload.event field', () => {
    const event = normalizeGeneric({ event: 'push' }, 'svc');
    expect(event.type).toBe('webhook:svc:push');
  });

  it('extracts event type from payload.type field when event is absent', () => {
    const event = normalizeGeneric({ type: 'payment_succeeded' }, 'stripe');
    expect(event.type).toBe('webhook:stripe:payment_succeeded');
  });

  it('extracts event type from payload.action field when event and type are absent', () => {
    const event = normalizeGeneric({ action: 'opened' }, 'svc');
    expect(event.type).toBe('webhook:svc:opened');
  });

  it('sanitizes special characters in extracted event type', () => {
    const event = normalizeGeneric({ event: 'my event!' }, 'svc');
    expect(event.type).toBe('webhook:svc:my_event_');
  });

  it('ignores empty string event field and uses fallback', () => {
    const event = normalizeGeneric({ event: '' }, 'svc');
    expect(event.type).toBe('webhook:svc:event');
  });

  it('handles null payload gracefully', () => {
    const event = normalizeGeneric(null, 'svc');
    expect(event.type).toBe('webhook:svc:event');
    expect(event.raw_payload).toBeNull();
  });

  it('handles non-object primitive payload', () => {
    const event = normalizeGeneric('raw-string', 'svc');
    expect(event.type).toBe('webhook:svc:event');
    expect(event.raw_payload).toBe('raw-string');
  });

  it('sets normalized=false (passthrough normalizer)', () => {
    const event = normalizeGeneric({ x: 1 }, 'svc');
    expect(event.normalized).toBe(false);
  });

  it('includes headers in the payload when provided', () => {
    const event = normalizeGeneric({ x: 1 }, 'svc', { 'x-custom': 'value' });
    const p = event.payload as Record<string, unknown>;
    expect(p['headers']).toEqual({ 'x-custom': 'value' });
  });

  it('omits headers from payload when none are provided', () => {
    const event = normalizeGeneric({ x: 1 }, 'svc');
    const p = event.payload as Record<string, unknown>;
    expect(p['headers']).toBeUndefined();
  });

  it('omits headers from payload when empty object is provided', () => {
    const event = normalizeGeneric({ x: 1 }, 'svc', {});
    const p = event.payload as Record<string, unknown>;
    expect(p['headers']).toBeUndefined();
  });

  it('includes raw data under payload.data', () => {
    const raw = { foo: 'bar' };
    const event = normalizeGeneric(raw, 'svc');
    const p = event.payload as Record<string, unknown>;
    expect(p['data']).toEqual(raw);
  });

  it('raw_payload is the original unmodified value', () => {
    const raw = { a: 1, b: [2, 3] };
    const event = normalizeGeneric(raw, 'svc');
    expect(event.raw_payload).toBe(raw);
  });
});

// ─── normalizeGithub ──────────────────────────────────────────────────────────

describe('normalizeGithub', () => {
  const pushPayload = {
    ref: 'refs/heads/main',
    commits: [{ id: 'abc' }, { id: 'def' }],
    head_commit: { id: 'abc', message: 'fix: something' },
    repository: { full_name: 'owner/repo', name: 'repo', html_url: 'https://github.com/owner/repo' },
    sender: { login: 'user1', type: 'User' },
  };

  it('sets external_source to "github"', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    expect(event.external_source).toBe('github');
  });

  it('sets normalized=true', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    expect(event.normalized).toBe(true);
  });

  it('derives event type from x-github-event header (push)', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    expect(event.type).toBe('webhook:github:push');
  });

  it('appends action to event type for pull_request events', () => {
    const payload = { action: 'opened', pull_request: { number: 1, title: 'PR', state: 'open', html_url: 'https://github.com/pr/1' } };
    const event = normalizeGithub(payload, { 'x-github-event': 'pull_request' });
    expect(event.type).toBe('webhook:github:pull_request:opened');
  });

  it('falls back to "unknown" event type when header is missing', () => {
    const event = normalizeGithub(pushPayload, {});
    expect(event.type).toBe('webhook:github:unknown');
  });

  it('works without headers argument', () => {
    const event = normalizeGithub(pushPayload);
    expect(event.type).toBe('webhook:github:unknown');
  });

  it('extracts repository info into normalized payload', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    expect((p['repository'] as Record<string, unknown>)?.['full_name']).toBe('owner/repo');
  });

  it('extracts sender info into normalized payload', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    expect((p['sender'] as Record<string, unknown>)?.['login']).toBe('user1');
  });

  it('extracts ref for push events', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    expect(p['ref']).toBe('refs/heads/main');
  });

  it('extracts commit_count from commits array', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    expect(p['commit_count']).toBe(2);
  });

  it('extracts head_commit info', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    const hc = p['head_commit'] as Record<string, unknown>;
    expect(hc?.['id']).toBe('abc');
    expect(hc?.['message']).toBe('fix: something');
  });

  it('includes delivery_id from x-github-delivery header', () => {
    const event = normalizeGithub(pushPayload, {
      'x-github-event': 'push',
      'x-github-delivery': 'uuid-123',
    });
    const p = event.payload as Record<string, unknown>;
    expect(p['delivery_id']).toBe('uuid-123');
  });

  it('sanitizes action with non-alphanumeric characters', () => {
    const payload = { action: 're opened' };
    const event = normalizeGithub(payload, { 'x-github-event': 'issues' });
    expect(event.type).toBe('webhook:github:issues:re_opened');
  });

  it('handles non-object payload gracefully', () => {
    const event = normalizeGithub('not-an-object', { 'x-github-event': 'ping' });
    expect(event.type).toBe('webhook:github:ping');
    expect(event.external_source).toBe('github');
  });

  it('does not include pull_request in payload when absent', () => {
    const event = normalizeGithub(pushPayload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    expect(p['pull_request']).toBeUndefined();
  });

  it('does not include commit_count when commits is not an array', () => {
    const payload = { ref: 'main' };
    const event = normalizeGithub(payload, { 'x-github-event': 'push' });
    const p = event.payload as Record<string, unknown>;
    expect(p['commit_count']).toBeUndefined();
  });

  it('event field in normalized payload is the github event string', () => {
    const event = normalizeGithub({}, { 'x-github-event': 'create' });
    const p = event.payload as Record<string, unknown>;
    expect(p['event']).toBe('create');
  });
});

// ─── NormalizerRegistry ───────────────────────────────────────────────────────

describe('NormalizerRegistry', () => {
  let registry: NormalizerRegistry;

  beforeEach(() => {
    registry = new NormalizerRegistry();
  });

  it('register and get: returns registered normalizer', () => {
    const normalizer = vi.fn();
    registry.register('my-source', normalizer);
    expect(registry.get('my-source')).toBe(normalizer);
  });

  it('get returns undefined for unregistered source', () => {
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('register overwrites existing normalizer for same source', () => {
    const first = vi.fn();
    const second = vi.fn();
    registry.register('src', first);
    registry.register('src', second);
    expect(registry.get('src')).toBe(second);
  });

  it('unregister returns true when the source existed', () => {
    registry.register('r', vi.fn());
    expect(registry.unregister('r')).toBe(true);
    expect(registry.get('r')).toBeUndefined();
  });

  it('unregister returns false for unknown source', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  it('sources() returns all registered source names', () => {
    registry.register('a', vi.fn());
    registry.register('b', vi.fn());
    expect(registry.sources().sort()).toEqual(['a', 'b']);
  });

  it('normalize calls the registered normalizer', () => {
    const mockEvent = normalizeGeneric({ data: 1 }, 'custom');
    const normalizer = vi.fn().mockReturnValue(mockEvent);
    registry.register('custom', normalizer);
    registry.normalize('custom', { data: 1 }, { 'x-header': 'value' });
    expect(normalizer).toHaveBeenCalledWith({ data: 1 }, { 'x-header': 'value' });
  });

  it('normalize falls back to generic when no normalizer registered, preserving original source', () => {
    const event = registry.normalize('unknown-source', { event: 'ping' });
    expect(event.external_source).toBe('unknown-source');
    expect(event.type).toBe('webhook:unknown-source:ping');
  });

  it('normalize generic fallback preserves source even for special source names', () => {
    const event = registry.normalize('special-src', { type: 'pay' });
    expect(event.external_source).toBe('special-src');
  });
});

// ─── createDefaultRegistry ──────────────────────────────────────────────────

describe('createDefaultRegistry', () => {
  it('has github normalizer pre-registered', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('github')).toBeDefined();
  });

  it('has generic normalizer pre-registered', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('generic')).toBeDefined();
  });

  it('github normalizer normalizes a push payload', () => {
    const registry = createDefaultRegistry();
    const event = registry.normalize(
      'github',
      { ref: 'refs/heads/main' },
      { 'x-github-event': 'push' },
    );
    expect(event.external_source).toBe('github');
    expect(event.type).toBe('webhook:github:push');
  });

  it('generic normalizer produces a generic ExternalEvent', () => {
    const registry = createDefaultRegistry();
    const event = registry.normalize('generic', { action: 'test' });
    expect(event.external_source).toBe('generic');
    expect(event.type).toBe('webhook:generic:test');
  });
});

// ─── FileWatcher ──────────────────────────────────────────────────────────────

describe('FileWatcher', () => {
  let queue: EventQueueInterface;
  let registry: NormalizerRegistry;
  let watcher: FileWatcher;

  beforeEach(() => {
    queue = makeQueue();
    registry = createDefaultRegistry();
    watcher = new FileWatcher(queue, registry, BASE_WATCHER_CONFIG);
    vi.clearAllMocks();
  });

  function mockReaddir(files: string[]) {
    (fsMock.readdir as unknown as MockInstance).mockResolvedValueOnce(files);
  }

  function mockReadFile(content: string) {
    (fsMock.readFile as unknown as MockInstance).mockResolvedValueOnce(content);
  }

  it('enqueues valid JSON event files and returns events_ingested count', async () => {
    const dropPayload = { source: 'github', payload: { ref: 'main' }, headers: { 'x-github-event': 'push' } };
    mockReaddir(['event1.json']);
    mockReadFile(JSON.stringify(dropPayload));
    (fsMock.rename as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(1);
    expect(queue.enqueue).toHaveBeenCalledOnce();
  });

  it('moves processed files to processed_dir with UUID prefix', async () => {
    const dropPayload = { source: 'github', payload: {} };
    mockReaddir(['test.json']);
    mockReadFile(JSON.stringify(dropPayload));
    (fsMock.rename as unknown as MockInstance).mockResolvedValueOnce(undefined);
    await watcher.scan();
    const renameMock = fsMock.rename as unknown as MockInstance;
    expect(renameMock).toHaveBeenCalledOnce();
    const destPath = renameMock.mock.calls[0]![1] as string;
    expect(destPath).toContain('/tmp/processed/');
    expect(destPath).toMatch(/test\.json$/);
  });

  it('moves invalid JSON files to error_dir', async () => {
    mockReaddir(['bad.json']);
    mockReadFile('not-valid-json{{{');
    (fsMock.rename as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(0);
    const renameMock = fsMock.rename as unknown as MockInstance;
    expect(renameMock).toHaveBeenCalledOnce();
    const destPath = renameMock.mock.calls[0]![1] as string;
    expect(destPath).toContain('/tmp/errors/');
  });

  it('moves malformed structure (missing source) to error_dir', async () => {
    const badPayload = { payload: { data: 1 } };
    mockReaddir(['malformed.json']);
    mockReadFile(JSON.stringify(badPayload));
    (fsMock.rename as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(0);
    const renameMock = fsMock.rename as unknown as MockInstance;
    const destPath = renameMock.mock.calls[0]![1] as string;
    expect(destPath).toContain('/tmp/errors/');
  });

  it('moves file with empty source string to error_dir', async () => {
    const badPayload = { source: '', payload: { data: 1 } };
    mockReaddir(['empty-src.json']);
    mockReadFile(JSON.stringify(badPayload));
    (fsMock.rename as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(0);
  });

  it('respects max_files_per_scan cap', async () => {
    const limitedWatcher = new FileWatcher(
      queue,
      registry,
      { ...BASE_WATCHER_CONFIG, max_files_per_scan: 2 },
    );
    (fsMock.readdir as unknown as MockInstance).mockResolvedValueOnce(['a.json', 'b.json', 'c.json']);
    const payload = JSON.stringify({ source: 'generic', payload: {} });
    (fsMock.readFile as unknown as MockInstance)
      .mockResolvedValueOnce(payload)
      .mockResolvedValueOnce(payload);
    (fsMock.rename as unknown as MockInstance).mockResolvedValue(undefined);
    const result = await limitedWatcher.scan();
    expect(result.events_ingested).toBe(2);
  });

  it('only processes .json files (ignores other extensions)', async () => {
    mockReaddir(['event.json', 'readme.txt', 'data.csv']);
    const payload = JSON.stringify({ source: 'generic', payload: {} });
    (fsMock.readFile as unknown as MockInstance).mockResolvedValueOnce(payload);
    (fsMock.rename as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(1);
  });

  it('creates directories and returns 0 when ENOENT error occurs on readdir', async () => {
    const enoentErr = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    (fsMock.readdir as unknown as MockInstance).mockRejectedValueOnce(enoentErr);
    (fsMock.mkdir as unknown as MockInstance).mockResolvedValue(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(0);
    expect(fsMock.mkdir).toHaveBeenCalledTimes(3);
  });

  it('rethrows non-ENOENT errors from readdir', async () => {
    const otherErr = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    (fsMock.readdir as unknown as MockInstance).mockRejectedValueOnce(otherErr);
    await expect(watcher.scan()).rejects.toThrow('EACCES');
  });

  it('enqueuedInScan dedup: same filename not enqueued twice in one scan cycle', async () => {
    const dropPayload = { source: 'generic', payload: {} };
    mockReaddir(['file1.json', 'file1.json']);
    (fsMock.readFile as unknown as MockInstance)
      .mockResolvedValueOnce(JSON.stringify(dropPayload))
      .mockResolvedValueOnce(JSON.stringify(dropPayload));
    (fsMock.rename as unknown as MockInstance).mockResolvedValue(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(1);
  });

  it('falls back to unlink when rename to error_dir fails', async () => {
    mockReaddir(['bad.json']);
    mockReadFile('not-json');
    (fsMock.rename as unknown as MockInstance).mockRejectedValueOnce(new Error('cross-device'));
    (fsMock.unlink as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(0);
    expect(fsMock.unlink).toHaveBeenCalledOnce();
  });

  it('survives when both rename and unlink fail on error path', async () => {
    mockReaddir(['bad.json']);
    mockReadFile('not-json');
    (fsMock.rename as unknown as MockInstance).mockRejectedValueOnce(new Error('rename-fail'));
    (fsMock.unlink as unknown as MockInstance).mockRejectedValueOnce(new Error('unlink-fail'));
    await expect(watcher.scan()).resolves.toEqual({ events_ingested: 0 });
  });

  it('logs error but continues when move to processed_dir fails', async () => {
    const dropPayload = { source: 'generic', payload: {} };
    mockReaddir(['event.json']);
    mockReadFile(JSON.stringify(dropPayload));
    (fsMock.rename as unknown as MockInstance).mockRejectedValueOnce(new Error('rename-fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await watcher.scan();
    expect(result.events_ingested).toBe(1);
    consoleSpy.mockRestore();
  });

  it('ensureDirs creates all three directories', async () => {
    (fsMock.mkdir as unknown as MockInstance).mockResolvedValue(undefined);
    await watcher.ensureDirs();
    const mkdirMock = fsMock.mkdir as unknown as MockInstance;
    const dirs = mkdirMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(dirs).toContain('/tmp/incoming');
    expect(dirs).toContain('/tmp/processed');
    expect(dirs).toContain('/tmp/errors');
    expect(mkdirMock).toHaveBeenCalledTimes(3);
  });
});

// ─── HttpListener ─────────────────────────────────────────────────────────────

/**
 * HttpListener tests use manual server start simulation.
 *
 * Pattern:
 * 1. Call listener.start() — this calls http.createServer(handler) then server.listen(port, host, cb)
 * 2. Capture the handler from the createServer mock call
 * 3. Trigger the listen callback to resolve the start() promise
 * 4. Use captured handler to simulate HTTP requests
 */
describe('HttpListener', () => {
  /**
   * Start an HttpListener by triggering the listen callback.
   * Returns the captured request handler for simulating requests.
   */
  async function startAndGetHandler(
    config: HttpListenerConfig = BASE_HTTP_CONFIG,
  ): Promise<{
    listener: HttpListener;
    handler: (req: unknown, res: unknown) => void;
  }> {
    // Reset all mocks on the stable mockServer object
    vi.clearAllMocks();
    mockServer.listen.mockReset();
    mockServer.close.mockReset();
    mockServer.once.mockReset();
    mockServer.on.mockReset();
    mockServer.removeListener.mockReset();

    // Auto-invoke the listen callback so start() resolves fully when awaited
    mockServer.listen.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as () => void;
      cb();
    });

    (httpMock.createServer as unknown as MockInstance).mockReturnValue(mockServer);

    const listener = new HttpListener('/tmp/drop', config);

    // Await fully — fs.mkdir completes, createServer is called, listen callback fires
    await listener.start();

    // Now createServer has been called — extract the captured request handler
    const createServerCalls = (httpMock.createServer as unknown as MockInstance).mock.calls;
    const handler = createServerCalls[createServerCalls.length - 1]![0] as
      (req: unknown, res: unknown) => void;

    return { listener, handler };
  }

  function makeResponse() {
    return { writeHead: vi.fn(), end: vi.fn() };
  }

  /**
   * Build a mock IncomingMessage that emits body data asynchronously.
   */
  function makeRequest(opts: {
    url?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    body?: string;
  } = {}) {
    const { url = '/', method = 'GET', headers = {}, body = '{}' } = opts;
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const req = {
      url,
      method,
      headers,
      resume: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(cb);
      }),
    };
    Promise.resolve().then(() => {
      (listeners['data'] ?? []).forEach((cb) => cb(Buffer.from(body)));
      (listeners['end'] ?? []).forEach((cb) => cb());
    });
    return req;
  }

  it('isRunning returns false before start', () => {
    vi.clearAllMocks();
    (httpMock.createServer as unknown as MockInstance).mockReturnValue(mockServer);
    const listener = new HttpListener('/tmp/drop', BASE_HTTP_CONFIG);
    expect(listener.isRunning()).toBe(false);
  });

  it('getPort returns the configured port', () => {
    vi.clearAllMocks();
    (httpMock.createServer as unknown as MockInstance).mockReturnValue(mockServer);
    const listener = new HttpListener('/tmp/drop', BASE_HTTP_CONFIG);
    expect(listener.getPort()).toBe(3847);
  });

  it('start resolves and sets isRunning to true', async () => {
    const { listener } = await startAndGetHandler();
    expect(listener.isRunning()).toBe(true);
  });

  it('start throws if already running', async () => {
    const { listener } = await startAndGetHandler();
    await expect(listener.start()).rejects.toThrow('already running');
  });

  it('stop resolves and sets isRunning to false', async () => {
    const { listener } = await startAndGetHandler();
    const stopPromise = listener.stop();
    const closeCb = mockServer.close.mock.calls[0]![0] as (err?: Error) => void;
    closeCb();
    await stopPromise;
    expect(listener.isRunning()).toBe(false);
  });

  it('stop is a no-op when not running', async () => {
    vi.clearAllMocks();
    (httpMock.createServer as unknown as MockInstance).mockReturnValue(mockServer);
    const listener = new HttpListener('/tmp/drop', BASE_HTTP_CONFIG);
    await expect(listener.stop()).resolves.toBeUndefined();
  });

  it('stop rejects when server.close returns an error', async () => {
    const { listener } = await startAndGetHandler();
    const stopPromise = listener.stop();
    const closeCb = mockServer.close.mock.calls[0]![0] as (err?: Error) => void;
    closeCb(new Error('close failed'));
    await expect(stopPromise).rejects.toThrow('close failed');
  });

  it('health endpoint returns 200 ok', async () => {
    const { listener, handler } = await startAndGetHandler();
    const req = makeRequest({ url: '/health', method: 'GET' });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const body = JSON.parse(res.end.mock.calls[0]![0] as string);
    expect(body.status).toBe('ok');
    // listener cleanup
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('returns 404 for unknown routes', async () => {
    const { listener, handler } = await startAndGetHandler();
    const req = makeRequest({ url: '/unknown', method: 'GET' });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('webhook POST without auth token accepts payload and returns 202', async () => {
    const { listener, handler } = await startAndGetHandler();
    (fsMock.writeFile as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const req = makeRequest({
      url: '/webhook/github',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'push' }),
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
    const body = JSON.parse(res.end.mock.calls[0]![0] as string);
    expect(body.accepted).toBe(true);
    expect(typeof body.id).toBe('string');
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('response id matches the fileId written to disk', async () => {
    const { listener, handler } = await startAndGetHandler();
    (fsMock.writeFile as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const req = makeRequest({
      url: '/webhook/stripe',
      method: 'POST',
      body: JSON.stringify({ event: 'charge' }),
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    const responseBody = JSON.parse(res.end.mock.calls[0]![0] as string);
    const fileId = responseBody.id as string;
    const writeCallPath = (fsMock.writeFile as unknown as MockInstance).mock.calls[0]![0] as string;
    expect(writeCallPath).toContain(fileId);
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('webhook POST with valid auth token succeeds', async () => {
    const { listener, handler } = await startAndGetHandler({
      ...BASE_HTTP_CONFIG,
      auth_token: 'secret-token',
    });
    (fsMock.writeFile as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const req = makeRequest({
      url: '/webhook/test',
      method: 'POST',
      headers: { authorization: 'Bearer secret-token' },
      body: JSON.stringify({ x: 1 }),
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('webhook POST with invalid auth token returns 401', async () => {
    const { listener, handler } = await startAndGetHandler({
      ...BASE_HTTP_CONFIG,
      auth_token: 'secret-token',
    });
    const req = makeRequest({
      url: '/webhook/test',
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ x: 1 }),
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('returns 413 when payload exceeds max_payload_bytes', async () => {
    const { listener, handler } = await startAndGetHandler({
      ...BASE_HTTP_CONFIG,
      max_payload_bytes: 5,
    });
    // Build a request that emits a chunk larger than 5 bytes
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const req = {
      url: '/webhook/test',
      method: 'POST',
      headers: {},
      resume: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(cb);
      }),
    };
    Promise.resolve().then(() => {
      (listeners['data'] ?? []).forEach((cb) =>
        cb(Buffer.from('this is more than 5 bytes'))
      );
      (listeners['end'] ?? []).forEach((cb) => cb());
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('returns 400 for non-JSON body', async () => {
    const { listener, handler } = await startAndGetHandler();
    const req = makeRequest({
      url: '/webhook/test',
      method: 'POST',
      body: 'not-json',
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('extracts array headers and joins them with ", "', async () => {
    const { listener, handler } = await startAndGetHandler();
    (fsMock.writeFile as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const req = {
      url: '/webhook/test',
      method: 'POST',
      headers: { 'x-multi': ['a', 'b', 'c'] },
      resume: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(cb);
      }),
    };
    Promise.resolve().then(() => {
      (listeners['data'] ?? []).forEach((cb) => cb(Buffer.from(JSON.stringify({ x: 1 }))));
      (listeners['end'] ?? []).forEach((cb) => cb());
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
    const written = JSON.parse(
      (fsMock.writeFile as unknown as MockInstance).mock.calls[0]![1] as string
    ) as Record<string, unknown>;
    expect((written['headers'] as Record<string, string>)['x-multi']).toBe('a, b, c');
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('handles request error event causing readBody to reject', async () => {
    const { listener, handler } = await startAndGetHandler();
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const req = {
      url: '/webhook/test',
      method: 'POST',
      headers: {},
      resume: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(cb);
      }),
    };
    Promise.resolve().then(() => {
      (listeners['error'] ?? []).forEach((cb) => cb(new Error('network error')));
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    // Error causes handleRequest to reject, caught in createServer callback and sends 500
    expect(res.end).toHaveBeenCalled();
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });

  it('matches webhook routes with trailing path segments', async () => {
    const { listener, handler } = await startAndGetHandler();
    (fsMock.writeFile as unknown as MockInstance).mockResolvedValueOnce(undefined);
    const req = makeRequest({
      url: '/webhook/github/extra/segments',
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
    });
    const res = makeResponse();
    await new Promise<void>((resolve) => {
      res.end.mockImplementation(() => resolve());
      handler(req, res);
    });
    expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
    const stopP = listener.stop();
    (mockServer.close.mock.calls[0]![0] as (e?: Error) => void)();
    await stopP;
  });
});

// ─── ExternalPlugin ───────────────────────────────────────────────────────────

describe('ExternalPlugin', () => {
  let queue: EventQueueInterface;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = makeQueue();
    (fsMock.mkdir as unknown as MockInstance).mockResolvedValue(undefined);
    mockServer.listen.mockReset();
    mockServer.close.mockReset();
    mockServer.once.mockReset();
    mockServer.on.mockReset();
    mockServer.removeListener.mockReset();
    (httpMock.createServer as unknown as MockInstance).mockReturnValue(mockServer);
  });

  it('initialize calls ensureDirs on the watcher', async () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    await plugin.initialize();
    expect(fsMock.mkdir).toHaveBeenCalled();
  });

  it('onTick delegates to FileWatcher.scan', async () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    (fsMock.readdir as unknown as MockInstance).mockResolvedValueOnce([]);
    const result = await plugin.onTick();
    expect(result.events_ingested).toBe(0);
  });

  it('isHttpListenerRunning returns false when no listener started', () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    expect(plugin.isHttpListenerRunning()).toBe(false);
  });

  it('getNormalizerRegistry returns a NormalizerRegistry with github pre-registered', () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    const registry = plugin.getNormalizerRegistry();
    expect(registry).toBeInstanceOf(NormalizerRegistry);
    expect(registry.get('github')).toBeDefined();
  });

  async function startPluginListener(plugin: ExternalPlugin): Promise<void> {
    // Auto-invoke the listen callback so startHttpListener() resolves fully
    mockServer.listen.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as () => void;
      cb();
    });
    await plugin.startHttpListener();
  }

  it('startHttpListener creates and starts a listener using default config', async () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    await startPluginListener(plugin);
    expect(plugin.isHttpListenerRunning()).toBe(true);
  });

  it('startHttpListener uses http_listener config from constructor when provided', async () => {
    const plugin = new ExternalPlugin(queue, {
      file_watcher: BASE_WATCHER_CONFIG,
      http_listener: { ...BASE_HTTP_CONFIG, port: 9999 },
    });
    await startPluginListener(plugin);
    expect(plugin.isHttpListenerRunning()).toBe(true);
  });

  it('stopHttpListener is a no-op when listener is not running', async () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    await expect(plugin.stopHttpListener()).resolves.toBeUndefined();
  });

  it('stopHttpListener stops a running listener', async () => {
    const plugin = new ExternalPlugin(queue, { file_watcher: BASE_WATCHER_CONFIG });
    await startPluginListener(plugin);
    expect(plugin.isHttpListenerRunning()).toBe(true);
    const stopP = plugin.stopHttpListener();
    (mockServer.close.mock.calls[0]![0] as (err?: Error) => void)();
    await stopP;
    expect(plugin.isHttpListenerRunning()).toBe(false);
  });

  it('createDefaultExternalPluginConfig provides sensible defaults', async () => {
    const { createDefaultExternalPluginConfig } = await import('../external/external-plugin.js');
    const config = createDefaultExternalPluginConfig();
    expect(config.file_watcher.incoming_dir).toContain('incoming');
    expect(config.http_listener).toBeUndefined();
  });
});
