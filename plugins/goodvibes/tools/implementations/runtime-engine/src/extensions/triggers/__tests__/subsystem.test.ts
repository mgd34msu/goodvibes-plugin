import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock instances ───────────────────────────────────────────────────────

const {
  mockTriggerRegistry,
  MockTriggerRegistry,
  mockBuiltinTriggers,
  mockGetBuiltinTriggers,
} = vi.hoisted(() => {
  const mockTriggerRegistry = {
    register: vi.fn(),
    unregister: vi.fn(),
    list: vi.fn().mockReturnValue([]),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockTriggerRegistry = vi.fn().mockImplementation(function(this: any) {
    return mockTriggerRegistry;
  });

  const mockBuiltinTriggers = [
    { id: 'trigger-1', name: 'Trigger One' },
    { id: 'trigger-2', name: 'Trigger Two' },
  ];

  const mockGetBuiltinTriggers = vi.fn(() => mockBuiltinTriggers);

  return { mockTriggerRegistry, MockTriggerRegistry, mockBuiltinTriggers, mockGetBuiltinTriggers };
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

vi.mock('../../../core/trigger-registry.js', () => ({ TriggerRegistry: MockTriggerRegistry }));
vi.mock('../condition-evaluator.js', () => ({ ConditionEvaluator: vi.fn().mockImplementation(function() { return {}; }) }));
vi.mock('../trigger-action-executor.js', () => ({ TriggerActionExecutor: vi.fn().mockImplementation(function() { return {}; }) }));
vi.mock('../builtins.js', () => ({ getBuiltinTriggers: mockGetBuiltinTriggers }));

// ─── Subject ─────────────────────────────────────────────────────────────────

import { createTriggerSubsystem, type TriggerSubsystemDeps } from '../subsystem.js';
import { DEFAULT_CONFIG } from '../../../shared/config.js';

function makeDeps(overrides?: Partial<TriggerSubsystemDeps>): TriggerSubsystemDeps {
  return {
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any,
    directiveQueue: null,
    workflowEngine: null,
    contextProvider: undefined,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createTriggerSubsystem', () => {
  const config = DEFAULT_CONFIG;

  beforeEach(() => {
    vi.clearAllMocks();
    MockTriggerRegistry.mockClear();
    MockTriggerRegistry.mockImplementation(function() { return mockTriggerRegistry; });
    mockGetBuiltinTriggers.mockReturnValue(mockBuiltinTriggers);
  });

  it('returns all expected fields', () => {
    const subsystem = createTriggerSubsystem(config, makeDeps());

    expect(subsystem).toHaveProperty('triggerRegistry');
  });

  it('returns the TriggerRegistry instance', () => {
    const subsystem = createTriggerSubsystem(config, makeDeps());

    expect(subsystem.triggerRegistry).toBe(mockTriggerRegistry);
  });

  it('constructs TriggerRegistry with triggers config', () => {
    createTriggerSubsystem(config, makeDeps());

    expect(MockTriggerRegistry).toHaveBeenCalledWith(config.triggers, expect.anything(), expect.anything());
  });

  it('calls getBuiltinTriggers to get triggers list', () => {
    createTriggerSubsystem(config, makeDeps());

    expect(mockGetBuiltinTriggers).toHaveBeenCalledOnce();
  });

  it('registers all built-in triggers', () => {
    createTriggerSubsystem(config, makeDeps());

    expect(mockTriggerRegistry.register).toHaveBeenCalledTimes(mockBuiltinTriggers.length);
    for (const trigger of mockBuiltinTriggers) {
      expect(mockTriggerRegistry.register).toHaveBeenCalledWith(trigger);
    }
  });

  it('is synchronous', () => {
    const result = createTriggerSubsystem(config, makeDeps());
    // Should return an object directly, not a Promise
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toHaveProperty('triggerRegistry');
  });

  it('handles zero built-in triggers gracefully', () => {
    mockGetBuiltinTriggers.mockReturnValue([]);
    createTriggerSubsystem(config, makeDeps());

    expect(mockTriggerRegistry.register).not.toHaveBeenCalled();
  });

  it('registers a single built-in trigger', () => {
    const singleTrigger = [{ id: 'only-one', name: 'Only One' }];
    mockGetBuiltinTriggers.mockReturnValue(singleTrigger);
    createTriggerSubsystem(config, makeDeps());

    expect(mockTriggerRegistry.register).toHaveBeenCalledTimes(1);
    expect(mockTriggerRegistry.register).toHaveBeenCalledWith(singleTrigger[0]);
  });

  it('does not expose a shutdown method', () => {
    const subsystem = createTriggerSubsystem(config, makeDeps());
    expect(subsystem).not.toHaveProperty('shutdown');
  });

  it('uses a different triggers config (max_triggers variation)', () => {
    const customConfig = {
      ...config,
      triggers: { ...config.triggers, max_triggers: 200 },
    };
    createTriggerSubsystem(customConfig, makeDeps());

    expect(MockTriggerRegistry).toHaveBeenCalledWith(customConfig.triggers, expect.anything(), expect.anything());
  });
});
