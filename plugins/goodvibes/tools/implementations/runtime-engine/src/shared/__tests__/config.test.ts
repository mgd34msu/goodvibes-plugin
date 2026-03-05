import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// Mock node:fs before importing config module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock file-io (used by saveConfig)
vi.mock('../file-io.js', () => ({
  writeJsonSync: vi.fn(),
}));

import * as fs from 'node:fs';
import * as fileIo from '../file-io.js';
import { loadConfig, saveConfig, ensureRuntimeSections, DEFAULT_CONFIG } from '../config.js';
import type { RuntimeConfig } from '../config.js';

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteJsonSync = vi.mocked(fileIo.writeJsonSync);

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

describe('DEFAULT_CONFIG', () => {
  it('has correct ipc defaults', () => {
    expect(DEFAULT_CONFIG.ipc.connect_timeout_ms).toBe(500);
    expect(DEFAULT_CONFIG.ipc.query_timeout_ms).toBe(200);
    expect(typeof DEFAULT_CONFIG.ipc.socket_dir).toBe('string');
    expect(DEFAULT_CONFIG.ipc.socket_dir.length).toBeGreaterThan(0);
  });

  it('has correct queue defaults', () => {
    expect(DEFAULT_CONFIG.queue.max_size).toBe(10000);
    expect(DEFAULT_CONFIG.queue.max_attempts).toBe(3);
    expect(DEFAULT_CONFIG.queue.backoff_base_ms).toBe(1000);
    expect(DEFAULT_CONFIG.queue.backoff_multiplier).toBe(2);
    expect(DEFAULT_CONFIG.queue.process_interval_ms).toBe(10);
  });

  it('has correct persistence defaults', () => {
    expect(DEFAULT_CONFIG.persistence.checkpoint_interval_ms).toBe(30000);
    expect(DEFAULT_CONFIG.persistence.event_log_max_size_mb).toBe(50);
    expect(DEFAULT_CONFIG.persistence.compact_after_hours).toBe(24);
    expect(DEFAULT_CONFIG.persistence.state_dir).toBe('.goodvibes/state');
  });

  it('has correct workflows defaults', () => {
    expect(DEFAULT_CONFIG.workflows.max_active).toBe(10);
    expect(DEFAULT_CONFIG.workflows.max_transitions_per_workflow).toBe(100);
    expect(DEFAULT_CONFIG.workflows.wrfc_max_fix_iterations).toBe(3);
    expect(DEFAULT_CONFIG.workflows.fix_loop_max_attempts).toBe(5);
  });

  it('has correct triggers defaults', () => {
    expect(DEFAULT_CONFIG.triggers.max_triggers).toBe(100);
    expect(DEFAULT_CONFIG.triggers.default_cooldown_ms).toBe(5000);
    expect(DEFAULT_CONFIG.triggers.max_fires_per_session).toBe(50);
    expect(DEFAULT_CONFIG.triggers.handler_timeout_ms).toBe(30000);
  });

  it('has correct health defaults', () => {
    expect(DEFAULT_CONFIG.health.check_interval_ms).toBe(60000);
    expect(DEFAULT_CONFIG.health.memory_warn_mb).toBe(256);
    expect(DEFAULT_CONFIG.health.memory_critical_mb).toBe(512);
    expect(DEFAULT_CONFIG.health.queue_depth_warn).toBe(100);
  });

  it('has correct features defaults', () => {
    expect(DEFAULT_CONFIG.features.ipc_enabled).toBe(true);
    expect(DEFAULT_CONFIG.features.workflows_enabled).toBe(true);
    expect(DEFAULT_CONFIG.features.agents_enabled).toBe(true);
    expect(DEFAULT_CONFIG.features.full_integration).toBe(true);
  });

  it('has correct agents defaults', () => {
    expect(DEFAULT_CONFIG.agents.max_concurrent).toBe(6);
    expect(DEFAULT_CONFIG.agents.session_budget).toBe(0);
    expect(DEFAULT_CONFIG.agents.budget_thresholds).toEqual([50, 80, 95]);
    expect(DEFAULT_CONFIG.agents.default_budget).toBe(200000);
    expect(DEFAULT_CONFIG.agents.max_review_iterations).toBe(3);
  });

  it('has correct executor defaults', () => {
    expect(DEFAULT_CONFIG.executor.mode).toBe('engaged');
    expect(DEFAULT_CONFIG.executor.daemon.clear_context_after_batch).toBe(true);
    expect(DEFAULT_CONFIG.executor.daemon.tmux_session_name).toBe('claude-daemon');
    expect(DEFAULT_CONFIG.executor.daemon.tick_command).toBe('tick');
    expect(DEFAULT_CONFIG.executor.daemon.tick_interval_ms).toBe(30000);
    expect(DEFAULT_CONFIG.executor.daemon.auto_tick).toBe(true);
    expect(DEFAULT_CONFIG.executor.daemon.eval_interval_ms).toBe(10000);
    expect(DEFAULT_CONFIG.executor.budget.warning_threshold).toBe(0.8);
    expect(DEFAULT_CONFIG.executor.budget.daily_reset_hour).toBe(0);
  });

  it('has correct time plugin defaults', () => {
    expect(DEFAULT_CONFIG.time.heartbeat.interval_ms).toBe(60000);
    expect(DEFAULT_CONFIG.time.heartbeat.enabled).toBe(true);
    expect(DEFAULT_CONFIG.time.scheduler.max_scheduled_items).toBe(100);
    expect(DEFAULT_CONFIG.time.scheduler.persist_schedules).toBe(true);
  });

  it('has correct external plugin defaults', () => {
    expect(DEFAULT_CONFIG.external.file_watcher.incoming_dir).toBe('.goodvibes/events/incoming');
    expect(DEFAULT_CONFIG.external.file_watcher.processed_dir).toBe('.goodvibes/events/processed');
    expect(DEFAULT_CONFIG.external.file_watcher.error_dir).toBe('.goodvibes/events/errors');
    expect(DEFAULT_CONFIG.external.file_watcher.max_files_per_scan).toBe(50);
    expect(DEFAULT_CONFIG.external.http_listener.enabled).toBe(false);
    expect(DEFAULT_CONFIG.external.http_listener.port).toBe(3847);
    expect(DEFAULT_CONFIG.external.http_listener.bind_mode).toBe('localhost');
    expect(DEFAULT_CONFIG.external.http_listener.address).toBe('127.0.0.1');
    expect(DEFAULT_CONFIG.external.http_listener.max_payload_bytes).toBe(1048576);
  });
});

describe('loadConfig', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns default config when both files do not exist (ENOENT)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config = loadConfig('/some/project');
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    // No stderr written for ENOENT
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('uses process.cwd() when no projectRoot is provided (ENOENT fallback)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    loadConfig();
    const goodvibesPath = join(process.cwd(), '.goodvibes', 'goodvibes.json');
    const legacyPath = join(process.cwd(), '.goodvibes', 'state', 'runtime-config.json');
    expect(mockReadFileSync).toHaveBeenCalledWith(goodvibesPath, 'utf-8');
    expect(mockReadFileSync).toHaveBeenCalledWith(legacyPath, 'utf-8');
  });

  it('reads from goodvibes.json first, then falls back to runtime-config.json', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    loadConfig('/my/project');
    const goodvibesPath = join('/my/project', '.goodvibes', 'goodvibes.json');
    const legacyPath = join('/my/project', '.goodvibes', 'state', 'runtime-config.json');
    expect(mockReadFileSync).toHaveBeenCalledWith(goodvibesPath, 'utf-8');
    expect(mockReadFileSync).toHaveBeenCalledWith(legacyPath, 'utf-8');
  });

  it('loads config from goodvibes.json under "runtime" key', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    const legacyPath = join('/proj', '.goodvibes', 'state', 'runtime-config.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) return JSON.stringify({ runtime: { queue: { max_size: 7777 } } });
      if (p === legacyPath) throw makeEnoentError();
      throw makeEnoentError();
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(7777);
    expect(config.queue.max_attempts).toBe(DEFAULT_CONFIG.queue.max_attempts);
  });

  it('falls back to runtime-config.json when goodvibes.json has no "runtime" key', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    const legacyPath = join('/proj', '.goodvibes', 'state', 'runtime-config.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) return JSON.stringify({ sandbox: false });
      if (p === legacyPath) return JSON.stringify({ queue: { max_size: 4321 } });
      throw makeEnoentError();
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(4321);
  });

  it('falls back to runtime-config.json when goodvibes.json has non-object "runtime" value', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    const legacyPath = join('/proj', '.goodvibes', 'state', 'runtime-config.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) return JSON.stringify({ runtime: 42 });
      if (p === legacyPath) return JSON.stringify({ queue: { max_size: 8888 } });
      throw makeEnoentError();
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(8888);
  });

  it('ignores non-RuntimeConfig keys in runtime section (e.g. wrfc)', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) return JSON.stringify({ runtime: {
        wrfc: { score_threshold: 9.9 },
        queue: { max_size: 2222 },
      }});
      throw makeEnoentError();
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(2222);
    // wrfc is not in RuntimeConfig, should not exist on config
    expect((config as unknown as Record<string, unknown>).wrfc).toBeUndefined();
  });

  it('deep-merges config from legacy runtime-config.json', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return JSON.stringify({ queue: { max_size: 5000 } });
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(5000);
    // Other queue fields should retain defaults
    expect(config.queue.max_attempts).toBe(DEFAULT_CONFIG.queue.max_attempts);
    expect(config.queue.backoff_base_ms).toBe(DEFAULT_CONFIG.queue.backoff_base_ms);
  });

  it('deep-merges nested objects from legacy file (not shallow replace)', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return JSON.stringify({ triggers: { max_triggers: 200 } });
    });
    const config = loadConfig('/proj');
    expect(config.triggers.max_triggers).toBe(200);
    expect(config.triggers.default_cooldown_ms).toBe(DEFAULT_CONFIG.triggers.default_cooldown_ms);
    expect(config.triggers.max_fires_per_session).toBe(DEFAULT_CONFIG.triggers.max_fires_per_session);
    expect(config.triggers.handler_timeout_ms).toBe(DEFAULT_CONFIG.triggers.handler_timeout_ms);
  });

  it('deep-merges multiple sections simultaneously from legacy file', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return JSON.stringify({ queue: { max_size: 999 }, health: { memory_warn_mb: 128 } });
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(999);
    expect(config.health.memory_warn_mb).toBe(128);
    expect(config.queue.max_attempts).toBe(DEFAULT_CONFIG.queue.max_attempts);
    expect(config.health.check_interval_ms).toBe(DEFAULT_CONFIG.health.check_interval_ms);
  });

  it('deep-merges doubly-nested objects (executor.daemon) from legacy file', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return JSON.stringify({ executor: { daemon: { auto_tick: true } } });
    });
    const config = loadConfig('/proj');
    expect(config.executor.daemon.auto_tick).toBe(true);
    expect(config.executor.daemon.tick_command).toBe('tick');
    expect(config.executor.mode).toBe('engaged');
  });

  it('overrides arrays entirely (not merged) from legacy file', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return JSON.stringify({ agents: { budget_thresholds: [25, 75] } });
    });
    const config = loadConfig('/proj');
    expect(config.agents.budget_thresholds).toEqual([25, 75]);
  });

  it('returns defaults and writes to stderr when legacy file contains non-object JSON (array)', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return JSON.stringify([1, 2, 3]);
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toContain('not an object');
  });

  it('returns defaults and writes to stderr when legacy file contains null JSON', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return 'null';
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toContain('not an object');
  });

  it('returns defaults and writes to stderr when legacy file contains malformed JSON', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) throw makeEnoentError();
      return '{invalid json}';
    });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('returns defaults and writes to stderr for non-ENOENT filesystem errors (EACCES)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEaccesError(); });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    // EACCES on goodvibes.json writes warning, then EACCES on legacy writes warning
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('returns defaults and writes to stderr for unexpected non-Error throws', () => {
    mockReadFileSync.mockImplementation(() => { throw 'unexpected string error'; });
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('returned config is a copy of defaults, not the same reference', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config = loadConfig('/proj');
    expect(config).not.toBe(DEFAULT_CONFIG);
  });

  it('returned merged config is not the same reference as DEFAULT_CONFIG', () => {
    const goodvibesPath = join('/proj', '.goodvibes', 'goodvibes.json');
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === goodvibesPath) return JSON.stringify({ runtime: { queue: { max_size: 1 } } });
      throw makeEnoentError();
    });
    const config = loadConfig('/proj');
    expect(config).not.toBe(DEFAULT_CONFIG);
    expect(config.queue).not.toBe(DEFAULT_CONFIG.queue);
  });
});

describe('saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes to goodvibes.json (not runtime-config.json)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config: RuntimeConfig = { ...DEFAULT_CONFIG };
    saveConfig('/my/project', config);
    const expectedPath = join('/my/project', '.goodvibes', 'goodvibes.json');
    expect(mockWriteJsonSync).toHaveBeenCalledWith(expectedPath, expect.any(Object));
  });

  it('writes config under "runtime" key', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config: RuntimeConfig = {
      ...DEFAULT_CONFIG,
      queue: { ...DEFAULT_CONFIG.queue, max_size: 42 },
    };
    saveConfig('/proj', config);
    const written = mockWriteJsonSync.mock.calls[0]![1] as Record<string, unknown>;
    expect(written.runtime).toBeDefined();
    const runtimeSection = written.runtime as Record<string, unknown>;
    expect((runtimeSection.queue as Record<string, unknown>).max_size).toBe(42);
  });

  it('preserves existing non-RuntimeConfig keys (e.g. sandbox, fetch)', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      sandbox: false,
      fetch: { services: {} },
      runtime: { wrfc: { score_threshold: 9.9 } },
    }));
    saveConfig('/proj', { ...DEFAULT_CONFIG });
    const written = mockWriteJsonSync.mock.calls[0]![1] as Record<string, unknown>;
    expect(written.sandbox).toBe(false);
    expect(written.fetch).toBeDefined();
  });

  it('preserves runtime.wrfc key when saving config', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      runtime: { wrfc: { score_threshold: 9.9, auto_commit: true } },
    }));
    saveConfig('/proj', { ...DEFAULT_CONFIG });
    const written = mockWriteJsonSync.mock.calls[0]![1] as Record<string, unknown>;
    const runtimeSection = written.runtime as Record<string, unknown>;
    expect(runtimeSection.wrfc).toEqual({ score_threshold: 9.9, auto_commit: true });
  });

  it('calls writeJsonSync exactly once', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    saveConfig('/proj', { ...DEFAULT_CONFIG });
    expect(mockWriteJsonSync).toHaveBeenCalledTimes(1);
  });

  it('constructs path using the provided projectRoot', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    saveConfig('/custom/root', { ...DEFAULT_CONFIG });
    const [calledPath] = mockWriteJsonSync.mock.calls[0]!;
    expect(calledPath).toContain('/custom/root');
    expect(calledPath).toContain('.goodvibes');
    expect(calledPath).toContain('goodvibes.json');
  });
});

describe('ensureRuntimeSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when goodvibes.json does not exist (ENOENT)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    // Should not throw
    ensureRuntimeSections('/proj');
    // No write should have occurred (writeFileSync not mocked — if called it throws)
  });

  it('does not overwrite existing runtime sections', () => {
    const existingContent = JSON.stringify({
      runtime: { queue: { max_size: 1234 } },
    });
    mockReadFileSync.mockReturnValue(existingContent);
    ensureRuntimeSections('/proj');
    // writeJsonSync should have been called since other sections are missing
    if (mockWriteJsonSync.mock.calls.length > 0) {
      const written = mockWriteJsonSync.mock.calls[0]![1] as Record<string, unknown>;
      const rt = written.runtime as Record<string, unknown>;
      expect((rt.queue as Record<string, unknown>).max_size).toBe(1234);
    }
  });

  it('adds missing runtime sections with defaults', () => {
    const existingContent = JSON.stringify({
      runtime: { queue: { max_size: 5000 } },
    });
    mockReadFileSync.mockReturnValue(existingContent);
    ensureRuntimeSections('/proj');
    // Since queue section already exists, only missing sections are added
    expect(mockWriteJsonSync).toHaveBeenCalled();
    const written = mockWriteJsonSync.mock.calls[0]![1] as Record<string, unknown>;
    const rt = written.runtime as Record<string, unknown>;
    expect(rt.ipc).toBeDefined();
    expect(rt.persistence).toBeDefined();
  });

  it('does not write when all sections already present', () => {
    const allSections = Object.fromEntries(
      Object.keys(DEFAULT_CONFIG).map(k => [k, (DEFAULT_CONFIG as Record<string, unknown>)[k]])
    );
    mockReadFileSync.mockReturnValue(JSON.stringify({ runtime: allSections }));
    ensureRuntimeSections('/proj');
    expect(mockWriteJsonSync).not.toHaveBeenCalled();
  });
});
