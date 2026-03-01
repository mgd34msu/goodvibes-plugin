import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Hoisted mock instances ───────────────────────────────────────────────────────

const {
  mockWorkflowEngine,
  MockWorkflowEngine,
  mockDefinitions,
  mockLoadCustomWorkflows,
  mockCheckReviewScoreGuard,
} = vi.hoisted(() => {
  const mockWorkflowEngine = {
    registerDefinition: vi.fn(),
    registerGuard: vi.fn(),
    getActiveInstances: vi.fn().mockReturnValue([]),
    cancel: vi.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockWorkflowEngine = vi.fn().mockImplementation(function(this: any) {
    return mockWorkflowEngine;
  });

  const mockDefinitions = [
    { id: 'wrfc_loop', name: 'WRFC Loop' },
    { id: 'fix_loop', name: 'Fix Loop' },
    { id: 'test_then_fix', name: 'Test Then Fix' },
    { id: 'review_only', name: 'Review Only' },
  ];

  const mockLoadCustomWorkflows = vi.fn().mockResolvedValue([]);
  const mockCheckReviewScoreGuard = vi.fn().mockReturnValue(true);

  return {
    mockWorkflowEngine,
    MockWorkflowEngine,
    mockDefinitions,
    mockLoadCustomWorkflows,
    mockCheckReviewScoreGuard,
  };
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

vi.mock('../workflow-engine.js', () => ({ WorkflowEngine: MockWorkflowEngine }));

vi.mock('../definitions/index.js', () => ({
  WRFC_LOOP_DEFINITION: mockDefinitions[0],
  FIX_LOOP_DEFINITION: mockDefinitions[1],
  TEST_THEN_FIX_DEFINITION: mockDefinitions[2],
  REVIEW_ONLY_DEFINITION: mockDefinitions[3],
  loadCustomWorkflows: mockLoadCustomWorkflows,
}));

vi.mock('../guards.js', () => ({
  checkReviewScoreGuard: mockCheckReviewScoreGuard,
}));

// ─── Subject ─────────────────────────────────────────────────────────────────

import { createWorkflowSubsystem } from '../subsystem.js';
import { DEFAULT_CONFIG } from '../../../shared/config.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createWorkflowSubsystem', () => {
  const projectRoot = join(tmpdir(), 'gv-test-workflow');
  const config = DEFAULT_CONFIG;

  beforeEach(() => {
    vi.clearAllMocks();
    MockWorkflowEngine.mockClear();
    MockWorkflowEngine.mockImplementation(function() { return mockWorkflowEngine; });
    mockWorkflowEngine.getActiveInstances.mockReturnValue([]);
    mockLoadCustomWorkflows.mockResolvedValue([]);
  });

  it('returns all expected fields', async () => {
    const subsystem = await createWorkflowSubsystem(config, projectRoot);

    expect(subsystem).toHaveProperty('workflowEngine');
    expect(subsystem).toHaveProperty('shutdown');
    expect(typeof subsystem.shutdown).toBe('function');
  });

  it('returns the WorkflowEngine instance', async () => {
    const subsystem = await createWorkflowSubsystem(config, projectRoot);

    expect(subsystem.workflowEngine).toBe(mockWorkflowEngine);
  });

  it('constructs WorkflowEngine with workflows config', async () => {
    await createWorkflowSubsystem(config, projectRoot);

    expect(MockWorkflowEngine).toHaveBeenCalledWith(config.workflows);
  });

  it('registers all four built-in workflow definitions', async () => {
    await createWorkflowSubsystem(config, projectRoot);

    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledTimes(4);
    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledWith(mockDefinitions[0]);
    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledWith(mockDefinitions[1]);
    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledWith(mockDefinitions[2]);
    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledWith(mockDefinitions[3]);
  });

  it('registers the checkReviewScore guard', async () => {
    await createWorkflowSubsystem(config, projectRoot);

    expect(mockWorkflowEngine.registerGuard).toHaveBeenCalledWith(
      'checkReviewScore',
      mockCheckReviewScoreGuard,
    );
  });

  it('loads custom workflows from projectRoot', async () => {
    await createWorkflowSubsystem(config, projectRoot);

    expect(mockLoadCustomWorkflows).toHaveBeenCalledWith(projectRoot);
  });

  it('registers custom workflow definitions when present', async () => {
    const customDef = { id: 'custom_flow', name: 'Custom Flow' };
    mockLoadCustomWorkflows.mockResolvedValue([customDef] as never);

    await createWorkflowSubsystem(config, projectRoot);

    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledWith(customDef);
    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledTimes(5);
  });

  it('continues without throwing when custom workflow loading fails', async () => {
    mockLoadCustomWorkflows.mockRejectedValue(new Error('file not found'));

    await expect(createWorkflowSubsystem(config, projectRoot)).resolves.not.toThrow();
  });

  it('still registers built-in definitions when custom loading fails', async () => {
    mockLoadCustomWorkflows.mockRejectedValue(new Error('failed'));

    await createWorkflowSubsystem(config, projectRoot);

    // 4 built-in definitions should still be registered
    expect(mockWorkflowEngine.registerDefinition).toHaveBeenCalledTimes(4);
  });

  describe('shutdown()', () => {
    it('cancels all active workflow instances', async () => {
      const activeInstances = [
        { id: 'wf-1' },
        { id: 'wf-2' },
      ];
      mockWorkflowEngine.getActiveInstances.mockReturnValue(activeInstances);

      const subsystem = await createWorkflowSubsystem(config, projectRoot);
      subsystem.shutdown();

      expect(mockWorkflowEngine.cancel).toHaveBeenCalledTimes(2);
      expect(mockWorkflowEngine.cancel).toHaveBeenCalledWith('wf-1', 'subsystem shutdown');
      expect(mockWorkflowEngine.cancel).toHaveBeenCalledWith('wf-2', 'subsystem shutdown');
    });

    it('does not throw when there are no active instances', async () => {
      mockWorkflowEngine.getActiveInstances.mockReturnValue([]);

      const subsystem = await createWorkflowSubsystem(config, projectRoot);
      expect(() => subsystem.shutdown()).not.toThrow();
    });

    it('shutdown is synchronous', async () => {
      const subsystem = await createWorkflowSubsystem(config, projectRoot);
      const result = subsystem.shutdown();
      // WorkflowSubsystem.shutdown() is void (not Promise)
      expect(result).toBeUndefined();
    });
  });
});
