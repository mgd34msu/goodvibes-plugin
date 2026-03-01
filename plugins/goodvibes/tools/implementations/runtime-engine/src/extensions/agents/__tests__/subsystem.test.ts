import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock instances ───────────────────────────────────────────────────────

const {
  mockBudgetTracker,
  mockAgentCoordinator,
  MockBudgetTracker,
  MockAgentCoordinator,
} = vi.hoisted(() => {
  const mockBudgetTracker = {
    hasBudget: vi.fn().mockReturnValue(true),
    registerAgent: vi.fn(),
    updateAgentStatus: vi.fn(),
    updateAgentBudget: vi.fn(),
    removeAgent: vi.fn(),
    getBudgetSummary: vi.fn().mockReturnValue({}),
    updateConfig: vi.fn(),
  };

  const mockAgentCoordinator = {
    spawn: vi.fn(),
    getAgent: vi.fn(),
    listActive: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({}),
    cancel: vi.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockBudgetTracker = vi.fn().mockImplementation(function(this: any) {
    return mockBudgetTracker;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockAgentCoordinator = vi.fn().mockImplementation(function(this: any) {
    return mockAgentCoordinator;
  });

  return { mockBudgetTracker, mockAgentCoordinator, MockBudgetTracker, MockAgentCoordinator };
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../budget-tracker.js', () => ({ BudgetTracker: MockBudgetTracker }));
vi.mock('../agent-coordinator.js', () => ({ AgentCoordinator: MockAgentCoordinator }));

// ─── Subject ─────────────────────────────────────────────────────────────────

import { createAgentSubsystem } from '../subsystem.js';
import { DEFAULT_CONFIG } from '../../../shared/config.js';
import type { EventBus } from '../../events/event-bus.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

function makeMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    setEventLog: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    listenerCount: vi.fn().mockReturnValue(0),
  } as unknown as EventBus;
}

describe('createAgentSubsystem', () => {
  const config = DEFAULT_CONFIG;
  let mockEventBus: EventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    MockBudgetTracker.mockClear();
    MockAgentCoordinator.mockClear();
    MockBudgetTracker.mockImplementation(function() { return mockBudgetTracker; });
    MockAgentCoordinator.mockImplementation(function() { return mockAgentCoordinator; });
    mockEventBus = makeMockEventBus();
  });

  it('returns all expected fields', () => {
    const subsystem = createAgentSubsystem(config, mockEventBus);

    expect(subsystem).toHaveProperty('agentCoordinator');
    expect(subsystem).toHaveProperty('budgetTracker');
  });

  it('returns the BudgetTracker instance', () => {
    const subsystem = createAgentSubsystem(config, mockEventBus);

    expect(subsystem.budgetTracker).toBe(mockBudgetTracker);
  });

  it('returns the AgentCoordinator instance', () => {
    const subsystem = createAgentSubsystem(config, mockEventBus);

    expect(subsystem.agentCoordinator).toBe(mockAgentCoordinator);
  });

  it('constructs BudgetTracker with eventBus and agents config', () => {
    createAgentSubsystem(config, mockEventBus);

    expect(MockBudgetTracker).toHaveBeenCalledWith(mockEventBus, config.agents);
  });

  it('constructs AgentCoordinator with eventBus, budgetTracker, and agents config', () => {
    createAgentSubsystem(config, mockEventBus);

    expect(MockAgentCoordinator).toHaveBeenCalledWith(
      mockEventBus,
      mockBudgetTracker,
      config.agents,
    );
  });

  it('creates BudgetTracker before AgentCoordinator', () => {
    const callOrder: string[] = [];
    MockBudgetTracker.mockImplementationOnce(function() {
      callOrder.push('BudgetTracker');
      return mockBudgetTracker;
    });
    MockAgentCoordinator.mockImplementationOnce(function() {
      callOrder.push('AgentCoordinator');
      return mockAgentCoordinator;
    });

    createAgentSubsystem(config, mockEventBus);

    expect(callOrder).toEqual(['BudgetTracker', 'AgentCoordinator']);
  });

  it('is synchronous', () => {
    const result = createAgentSubsystem(config, mockEventBus);
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toHaveProperty('agentCoordinator');
    expect(result).toHaveProperty('budgetTracker');
  });

  it('does not expose a shutdown method', () => {
    const subsystem = createAgentSubsystem(config, mockEventBus);
    expect(subsystem).not.toHaveProperty('shutdown');
  });

  it('passes the same eventBus to both BudgetTracker and AgentCoordinator', () => {
    createAgentSubsystem(config, mockEventBus);

    const budgetTrackerArgs = MockBudgetTracker.mock.calls[0];
    const agentCoordinatorArgs = MockAgentCoordinator.mock.calls[0];

    expect(budgetTrackerArgs[0]).toBe(mockEventBus);
    expect(agentCoordinatorArgs[0]).toBe(mockEventBus);
  });

  it('uses agents config section for both instances', () => {
    const customConfig = {
      ...config,
      agents: { ...config.agents, max_concurrent: 10 },
    };
    createAgentSubsystem(customConfig, mockEventBus);

    expect(MockBudgetTracker).toHaveBeenCalledWith(mockEventBus, customConfig.agents);
    expect(MockAgentCoordinator).toHaveBeenCalledWith(
      mockEventBus,
      mockBudgetTracker,
      customConfig.agents,
    );
  });
});
