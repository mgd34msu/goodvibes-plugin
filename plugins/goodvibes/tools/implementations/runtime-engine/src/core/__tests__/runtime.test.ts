import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock instances ───────────────────────────────────────────────────────

const {
  mockEventQueue,
  mockTriggerRegistry,
  mockStateStore,
  mockLifecycle,
  mockMetrics,
  mockDeadLetter,
  mockErrorHandler,
  mockEventProcessor,
  MockEventQueue,
  MockTriggerRegistry,
  MockCoreStateStore,
  MockLoopLifecycleManager,
  MockEventMetrics,
  MockDeadLetterQueue,
  MockErrorHandler,
  MockEventProcessor,
} = vi.hoisted(() => {
  const mockEventQueue = {
    enqueue: vi.fn(),
    drain: vi.fn().mockReturnValue([]),
    depth: vi.fn().mockReturnValue(0),
    peek: vi.fn().mockReturnValue(null),
  };

  const mockTriggerRegistry = {
    register: vi.fn(),
    match: vi.fn().mockReturnValue([]),
    size: vi.fn().mockReturnValue(0),
  };

  const mockStateStore = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
    snapshot: vi.fn().mockReturnValue({}),
  };

  const mockLifecycle = {
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
  };

  const mockMetrics = {
    record: vi.fn(),
    getStats: vi.fn().mockReturnValue({}),
  };

  const mockDeadLetter = {
    push: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    size: vi.fn().mockReturnValue(0),
  };

  const mockErrorHandler = {
    handle: vi.fn(),
  };

  const mockEventProcessor = {
    processBatch: vi.fn().mockResolvedValue(0),
    registerHandler: vi.fn(),
    activeWorkflowCount: vi.fn().mockReturnValue(0),
  };

  // Use regular functions so they can be used as constructors with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockEventQueue = vi.fn().mockImplementation(function(this: any) { return mockEventQueue; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockTriggerRegistry = vi.fn().mockImplementation(function(this: any) { return mockTriggerRegistry; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockCoreStateStore = vi.fn().mockImplementation(function(this: any) { return mockStateStore; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockLoopLifecycleManager = vi.fn().mockImplementation(function(this: any) { return mockLifecycle; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockEventMetrics = vi.fn().mockImplementation(function(this: any) { return mockMetrics; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockDeadLetterQueue = vi.fn().mockImplementation(function(this: any) { return mockDeadLetter; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockErrorHandler = vi.fn().mockImplementation(function(this: any) { return mockErrorHandler; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockEventProcessor = vi.fn().mockImplementation(function(this: any) { return mockEventProcessor; });

  return {
    mockEventQueue,
    mockTriggerRegistry,
    mockStateStore,
    mockLifecycle,
    mockMetrics,
    mockDeadLetter,
    mockErrorHandler,
    mockEventProcessor,
    MockEventQueue,
    MockTriggerRegistry,
    MockCoreStateStore,
    MockLoopLifecycleManager,
    MockEventMetrics,
    MockDeadLetterQueue,
    MockErrorHandler,
    MockEventProcessor,
  };
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../queues/event-queue.js', () => ({ EventQueue: MockEventQueue }));
vi.mock('../queues/dead-letter.js', () => ({ DeadLetterQueue: MockDeadLetterQueue }));
vi.mock('../matching/error-handler.js', () => ({ ErrorHandler: MockErrorHandler }));
vi.mock('../processing/event-processor.js', () => ({ EventProcessor: MockEventProcessor }));
vi.mock('../processing/lifecycle.js', () => ({ LoopLifecycleManager: MockLoopLifecycleManager }));
vi.mock('../state/state-store.js', () => ({ CoreStateStore: MockCoreStateStore }));
vi.mock('../observability/metrics.js', () => ({ EventMetrics: MockEventMetrics }));

// ─── Subject ─────────────────────────────────────────────────────────────────

import { createCoreRuntime } from '../runtime.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createCoreRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventQueue.mockClear();
    MockTriggerRegistry.mockClear();
    MockCoreStateStore.mockClear();
    MockLoopLifecycleManager.mockClear();
    MockEventMetrics.mockClear();
    MockDeadLetterQueue.mockClear();
    MockErrorHandler.mockClear();
    MockEventProcessor.mockClear();
    // Re-apply implementations after clearAllMocks
    MockEventQueue.mockImplementation(function() { return mockEventQueue; });
    MockTriggerRegistry.mockImplementation(function() { return mockTriggerRegistry; });
    MockCoreStateStore.mockImplementation(function() { return mockStateStore; });
    MockLoopLifecycleManager.mockImplementation(function() { return mockLifecycle; });
    MockEventMetrics.mockImplementation(function() { return mockMetrics; });
    MockDeadLetterQueue.mockImplementation(function() { return mockDeadLetter; });
    MockErrorHandler.mockImplementation(function() { return mockErrorHandler; });
    MockEventProcessor.mockImplementation(function() { return mockEventProcessor; });
  });

  it('returns all expected fields', () => {
    const runtime = createCoreRuntime();

    expect(runtime).toHaveProperty('eventQueue');
    expect(runtime).toHaveProperty('triggerRegistry');
    expect(runtime).toHaveProperty('stateStore');
    expect(runtime).toHaveProperty('eventProcessor');
  });

  it('returns correct instances', () => {
    const runtime = createCoreRuntime();

    expect(runtime.eventQueue).toBe(mockEventQueue);
    expect(runtime.triggerRegistry).toBe(mockTriggerRegistry);
    expect(runtime.stateStore).toBe(mockStateStore);
    expect(runtime.eventProcessor).toBe(mockEventProcessor);
  });

  it('instantiates EventQueue with no arguments', () => {
    createCoreRuntime();

    expect(MockEventQueue).toHaveBeenCalledOnce();
    expect(MockEventQueue).toHaveBeenCalledWith();
  });

  it('instantiates TriggerRegistry with no arguments', () => {
    createCoreRuntime();

    expect(MockTriggerRegistry).toHaveBeenCalledOnce();
    expect(MockTriggerRegistry).toHaveBeenCalledWith();
  });

  it('instantiates CoreStateStore with no arguments', () => {
    createCoreRuntime();

    expect(MockCoreStateStore).toHaveBeenCalledOnce();
    expect(MockCoreStateStore).toHaveBeenCalledWith();
  });

  it('instantiates LoopLifecycleManager', () => {
    createCoreRuntime();
    expect(MockLoopLifecycleManager).toHaveBeenCalledOnce();
  });

  it('instantiates EventMetrics', () => {
    createCoreRuntime();
    expect(MockEventMetrics).toHaveBeenCalledOnce();
  });

  it('instantiates DeadLetterQueue', () => {
    createCoreRuntime();
    expect(MockDeadLetterQueue).toHaveBeenCalledOnce();
  });

  it('instantiates ErrorHandler with deadLetter dependency', () => {
    createCoreRuntime();

    expect(MockErrorHandler).toHaveBeenCalledWith({ deadLetter: mockDeadLetter });
  });

  it('constructs EventProcessor with all required dependencies', () => {
    createCoreRuntime();

    expect(MockEventProcessor).toHaveBeenCalledOnce();
    const [q, reg, store, lc, metrics, errHandler, dl, opts] = MockEventProcessor.mock.calls[0];
    expect(q).toBe(mockEventQueue);
    expect(reg).toBe(mockTriggerRegistry);
    expect(store).toBe(mockStateStore);
    expect(lc).toBe(mockLifecycle);
    expect(metrics).toBe(mockMetrics);
    expect(errHandler).toBe(mockErrorHandler);
    expect(dl).toBe(mockDeadLetter);
    expect(opts).toEqual({ action_executor: undefined });
  });

  it('passes action_executor to EventProcessor when provided', () => {
    const mockActionExecutor = { execute: vi.fn() };
    createCoreRuntime(mockActionExecutor as never);

    const [, , , , , , , opts] = MockEventProcessor.mock.calls[0];
    expect(opts).toEqual({ action_executor: mockActionExecutor });
  });

  it('passes undefined action_executor when not provided', () => {
    createCoreRuntime();

    const [, , , , , , , opts] = MockEventProcessor.mock.calls[0];
    expect(opts).toEqual({ action_executor: undefined });
  });

  it('is synchronous', () => {
    const result = createCoreRuntime();
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toHaveProperty('eventQueue');
    expect(result).toHaveProperty('triggerRegistry');
    expect(result).toHaveProperty('stateStore');
    expect(result).toHaveProperty('eventProcessor');
  });

  it('creates independent instances per call', () => {
    createCoreRuntime();
    createCoreRuntime();

    expect(MockEventQueue).toHaveBeenCalledTimes(2);
    expect(MockTriggerRegistry).toHaveBeenCalledTimes(2);
    expect(MockCoreStateStore).toHaveBeenCalledTimes(2);
    expect(MockEventProcessor).toHaveBeenCalledTimes(2);
  });
});
