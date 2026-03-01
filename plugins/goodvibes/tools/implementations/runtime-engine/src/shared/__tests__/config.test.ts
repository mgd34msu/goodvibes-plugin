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
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../config.js';
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
  it('has the expected schema_version', () => {
    expect(DEFAULT_CONFIG.schema_version).toBe('1.0.0');
  });

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
    expect(DEFAULT_CONFIG.executor.daemon.auto_tick).toBe(false);
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

  it('returns default config when file does not exist (ENOENT)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config = loadConfig('/some/project');
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(config.queue.max_size).toBe(DEFAULT_CONFIG.queue.max_size);
    // No stderr written for ENOENT
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('uses process.cwd() when no projectRoot is provided (ENOENT fallback)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config = loadConfig();
    expect(config.schema_version).toBe('1.0.0');
    const expectedPath = join(process.cwd(), '.goodvibes', 'state', 'runtime-config.json');
    expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf-8');
  });

  it('reads from the correct path inside the projectRoot', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    loadConfig('/my/project');
    const expectedPath = join('/my/project', '.goodvibes', 'state', 'runtime-config.json');
    expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf-8');
  });

  it('returns deep-merged config when file contains valid overrides', () => {
    const override = { queue: { max_size: 5000 } };
    mockReadFileSync.mockReturnValue(JSON.stringify(override));
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(5000);
    // Other queue fields should retain defaults
    expect(config.queue.max_attempts).toBe(DEFAULT_CONFIG.queue.max_attempts);
    expect(config.queue.backoff_base_ms).toBe(DEFAULT_CONFIG.queue.backoff_base_ms);
  });

  it('deep-merges nested objects (not shallow replace)', () => {
    const override = { triggers: { max_triggers: 200 } };
    mockReadFileSync.mockReturnValue(JSON.stringify(override));
    const config = loadConfig('/proj');
    // Overridden field
    expect(config.triggers.max_triggers).toBe(200);
    // Sibling fields retain defaults
    expect(config.triggers.default_cooldown_ms).toBe(DEFAULT_CONFIG.triggers.default_cooldown_ms);
    expect(config.triggers.max_fires_per_session).toBe(DEFAULT_CONFIG.triggers.max_fires_per_session);
    expect(config.triggers.handler_timeout_ms).toBe(DEFAULT_CONFIG.triggers.handler_timeout_ms);
  });

  it('deep-merges multiple sections simultaneously', () => {
    const override = {
      queue: { max_size: 999 },
      health: { memory_warn_mb: 128 },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(override));
    const config = loadConfig('/proj');
    expect(config.queue.max_size).toBe(999);
    expect(config.health.memory_warn_mb).toBe(128);
    // Other fields unaffected
    expect(config.queue.max_attempts).toBe(DEFAULT_CONFIG.queue.max_attempts);
    expect(config.health.check_interval_ms).toBe(DEFAULT_CONFIG.health.check_interval_ms);
  });

  it('deep-merges doubly-nested objects (executor.daemon)', () => {
    const override = { executor: { daemon: { auto_tick: true } } };
    mockReadFileSync.mockReturnValue(JSON.stringify(override));
    const config = loadConfig('/proj');
    expect(config.executor.daemon.auto_tick).toBe(true);
    // Sibling fields retained
    expect(config.executor.daemon.tick_command).toBe('tick');
    expect(config.executor.mode).toBe('engaged');
  });

  it('overrides arrays entirely (not merged)', () => {
    const override = { agents: { budget_thresholds: [25, 75] } };
    mockReadFileSync.mockReturnValue(JSON.stringify(override));
    const config = loadConfig('/proj');
    // Arrays are replaced, not merged
    expect(config.agents.budget_thresholds).toEqual([25, 75]);
  });

  it('returns defaults and writes to stderr when file contains non-object JSON (array)', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify([1, 2, 3]));
    const config = loadConfig('/proj');
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toContain('not an object');
  });

  it('returns defaults and writes to stderr when file contains non-object JSON (string)', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify('just a string'));
    const config = loadConfig('/proj');
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toContain('not an object');
  });

  it('returns defaults and writes to stderr when file contains null JSON', () => {
    mockReadFileSync.mockReturnValue('null');
    const config = loadConfig('/proj');
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toContain('not an object');
  });

  it('returns defaults and writes to stderr when file contains malformed JSON', () => {
    // safeJsonParse returns null for invalid JSON
    mockReadFileSync.mockReturnValue('{invalid json}');
    const config = loadConfig('/proj');
    // safeJsonParse returns fallback null → parsed is null → non-object branch
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('returns defaults and writes to stderr for non-ENOENT filesystem errors (EACCES)', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEaccesError(); });
    const config = loadConfig('/proj');
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toContain('failed to load config');
    expect(stderrSpy.mock.calls[0]![0]).toContain('EACCES');
  });

  it('returns defaults and writes to stderr for unexpected non-Error throws', () => {
    mockReadFileSync.mockImplementation(() => { throw 'unexpected string error'; });
    const config = loadConfig('/proj');
    expect(config.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('returned config is a copy of defaults, not the same reference', () => {
    mockReadFileSync.mockImplementation(() => { throw makeEnoentError(); });
    const config = loadConfig('/proj');
    expect(config).not.toBe(DEFAULT_CONFIG);
  });

  it('returned merged config is not the same reference as DEFAULT_CONFIG', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ queue: { max_size: 1 } }));
    const config = loadConfig('/proj');
    expect(config).not.toBe(DEFAULT_CONFIG);
    expect(config.queue).not.toBe(DEFAULT_CONFIG.queue);
  });
});

describe('saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeJsonSync with the correct config path', () => {
    const config: RuntimeConfig = { ...DEFAULT_CONFIG };
    saveConfig('/my/project', config);
    const expectedPath = join('/my/project', '.goodvibes', 'state', 'runtime-config.json');
    expect(mockWriteJsonSync).toHaveBeenCalledWith(expectedPath, config);
  });

  it('calls writeJsonSync exactly once', () => {
    saveConfig('/proj', { ...DEFAULT_CONFIG });
    expect(mockWriteJsonSync).toHaveBeenCalledTimes(1);
  });

  it('passes the exact config object to writeJsonSync', () => {
    const config: RuntimeConfig = {
      ...DEFAULT_CONFIG,
      queue: { ...DEFAULT_CONFIG.queue, max_size: 42 },
    };
    saveConfig('/proj', config);
    expect(mockWriteJsonSync).toHaveBeenCalledWith(expect.any(String), config);
    const passedConfig = mockWriteJsonSync.mock.calls[0]![1] as RuntimeConfig;
    expect(passedConfig.queue.max_size).toBe(42);
  });

  it('constructs path using the provided projectRoot', () => {
    saveConfig('/custom/root', { ...DEFAULT_CONFIG });
    const [calledPath] = mockWriteJsonSync.mock.calls[0]!;
    expect(calledPath).toContain('/custom/root');
    expect(calledPath).toContain('.goodvibes');
    expect(calledPath).toContain('state');
    expect(calledPath).toContain('runtime-config.json');
  });
});
