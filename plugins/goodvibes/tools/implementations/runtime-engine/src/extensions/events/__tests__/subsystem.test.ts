import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Hoisted mock instances (must be defined before vi.mock factories) ────────────

const {
  mockEventBus,
  mockEventLog,
  MockEventBus,
  MockEventLog,
} = vi.hoisted(() => {
  const mockEventBus = {
    setEventLog: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
  };

  const mockEventLog = {
    initialize: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    append: vi.fn(),
  };

  // Use regular functions so they can be used as constructors with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockEventBus = vi.fn().mockImplementation(function(this: any) {
    return mockEventBus;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockEventLog = vi.fn().mockImplementation(function(this: any) {
    return mockEventLog;
  });

  return { mockEventBus, mockEventLog, MockEventBus, MockEventLog };
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../core/utils/fs-utils.js', () => ({
  ensureDirSync: vi.fn(),
}));

vi.mock('../event-bus.js', () => ({ EventBus: MockEventBus }));
vi.mock('../event-log.js', () => ({ EventLog: MockEventLog }));

// ─── Subject ─────────────────────────────────────────────────────────────────

import { createEventSubsystem } from '../subsystem.js';
import { DEFAULT_CONFIG } from '../../../shared/config.js';
import { ensureDirSync } from '../../../core/utils/fs-utils.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createEventSubsystem', () => {
  const projectRoot = join(tmpdir(), 'gv-test-events');
  const config = DEFAULT_CONFIG;

  beforeEach(() => {
    vi.clearAllMocks();
    MockEventBus.mockClear();
    MockEventLog.mockClear();
    // Re-apply implementations after clearAllMocks
    MockEventBus.mockImplementation(function() { return mockEventBus; });
    MockEventLog.mockImplementation(function() { return mockEventLog; });
    mockEventLog.initialize.mockResolvedValue(undefined);
    mockEventLog.flush.mockResolvedValue(undefined);
    mockEventLog.close.mockResolvedValue(undefined);
  });

  it('returns all expected fields', async () => {
    const subsystem = await createEventSubsystem(config, projectRoot);

    expect(subsystem).toHaveProperty('eventBus');
    expect(subsystem).toHaveProperty('eventLog');
    expect(subsystem).toHaveProperty('shutdown');
    expect(typeof subsystem.shutdown).toBe('function');
  });

  it('returns correct instances', async () => {
    const subsystem = await createEventSubsystem(config, projectRoot);

    expect(subsystem.eventBus).toBe(mockEventBus);
    expect(subsystem.eventLog).toBe(mockEventLog);
  });

  it('creates state directory using projectRoot and config.persistence.state_dir', async () => {
    await createEventSubsystem(config, projectRoot);

    const expectedDir = join(projectRoot, config.persistence.state_dir);
    expect(ensureDirSync).toHaveBeenCalledWith(expectedDir);
  });

  it('initializes EventLog during creation', async () => {
    await createEventSubsystem(config, projectRoot);

    expect(mockEventLog.initialize).toHaveBeenCalledOnce();
  });

  it('wires EventLog to EventBus', async () => {
    await createEventSubsystem(config, projectRoot);

    expect(mockEventBus.setEventLog).toHaveBeenCalledWith(mockEventLog);
  });

  it('constructs EventLog with stateDir and persistence config', async () => {
    await createEventSubsystem(config, projectRoot);

    const expectedDir = join(projectRoot, config.persistence.state_dir);
    expect(MockEventLog).toHaveBeenCalledWith(expectedDir, config.persistence);
  });

  describe('shutdown()', () => {
    it('removes all EventBus listeners', async () => {
      const subsystem = await createEventSubsystem(config, projectRoot);
      await subsystem.shutdown();

      expect(mockEventBus.removeAllListeners).toHaveBeenCalledOnce();
    });

    it('flushes and closes EventLog', async () => {
      const subsystem = await createEventSubsystem(config, projectRoot);
      await subsystem.shutdown();

      expect(mockEventLog.flush).toHaveBeenCalledOnce();
      expect(mockEventLog.close).toHaveBeenCalledOnce();
    });

    it('can be called without throwing', async () => {
      const subsystem = await createEventSubsystem(config, projectRoot);
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });
  });

  it('handles a custom persistence state_dir', async () => {
    const customConfig = {
      ...config,
      persistence: { ...config.persistence, state_dir: '.custom/state' },
    };
    await createEventSubsystem(customConfig, projectRoot);

    const expectedDir = join(projectRoot, '.custom/state');
    expect(ensureDirSync).toHaveBeenCalledWith(expectedDir);
  });
});
