import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock instances ───────────────────────────────────────────────────────

const {
  mockDirectiveQueue,
  mockAgentWorkflowMap,
  MockDirectiveQueue,
  MockAgentWorkflowMap,
} = vi.hoisted(() => {
  const mockDirectiveQueue = {
    enqueue: vi.fn(),
    drain: vi.fn().mockReturnValue([]),
    size: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    peek: vi.fn().mockReturnValue([]),
  };

  const mockAgentWorkflowMap = {
    bind: vi.fn(),
    lookup: vi.fn(),
    unbind: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    size: vi.fn().mockReturnValue(0),
    snapshot: vi.fn().mockReturnValue({}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockDirectiveQueue = vi.fn().mockImplementation(function(this: any) {
    return mockDirectiveQueue;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockAgentWorkflowMap = vi.fn().mockImplementation(function(this: any) {
    return mockAgentWorkflowMap;
  });

  return { mockDirectiveQueue, mockAgentWorkflowMap, MockDirectiveQueue, MockAgentWorkflowMap };
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../directive-queue.js', () => ({ DirectiveQueue: MockDirectiveQueue }));
vi.mock('../agent-workflow-map.js', () => ({ AgentWorkflowMap: MockAgentWorkflowMap }));

// ─── Subject ─────────────────────────────────────────────────────────────────

import { createDirectiveSubsystem } from '../subsystem.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createDirectiveSubsystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockDirectiveQueue.mockClear();
    MockAgentWorkflowMap.mockClear();
    MockDirectiveQueue.mockImplementation(function() { return mockDirectiveQueue; });
    MockAgentWorkflowMap.mockImplementation(function() { return mockAgentWorkflowMap; });
  });

  it('returns all expected fields', () => {
    const subsystem = createDirectiveSubsystem();

    expect(subsystem).toHaveProperty('directiveQueue');
    expect(subsystem).toHaveProperty('agentWorkflowMap');
  });

  it('returns the DirectiveQueue instance', () => {
    const subsystem = createDirectiveSubsystem();

    expect(subsystem.directiveQueue).toBe(mockDirectiveQueue);
  });

  it('returns the AgentWorkflowMap instance', () => {
    const subsystem = createDirectiveSubsystem();

    expect(subsystem.agentWorkflowMap).toBe(mockAgentWorkflowMap);
  });

  it('instantiates DirectiveQueue with no arguments', () => {
    createDirectiveSubsystem();

    expect(MockDirectiveQueue).toHaveBeenCalledOnce();
    expect(MockDirectiveQueue).toHaveBeenCalledWith();
  });

  it('instantiates AgentWorkflowMap with no arguments', () => {
    createDirectiveSubsystem();

    expect(MockAgentWorkflowMap).toHaveBeenCalledOnce();
    expect(MockAgentWorkflowMap).toHaveBeenCalledWith();
  });

  it('is synchronous', () => {
    const result = createDirectiveSubsystem();
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toHaveProperty('directiveQueue');
    expect(result).toHaveProperty('agentWorkflowMap');
  });

  it('does not expose a shutdown method', () => {
    const subsystem = createDirectiveSubsystem();
    expect(subsystem).not.toHaveProperty('shutdown');
  });

  it('creates fresh instances on each call', () => {
    createDirectiveSubsystem();
    createDirectiveSubsystem();

    expect(MockDirectiveQueue).toHaveBeenCalledTimes(2);
    expect(MockAgentWorkflowMap).toHaveBeenCalledTimes(2);
  });

  it('takes no arguments', () => {
    // Verify the factory signature accepts no parameters
    expect(() => createDirectiveSubsystem()).not.toThrow();
  });
});
