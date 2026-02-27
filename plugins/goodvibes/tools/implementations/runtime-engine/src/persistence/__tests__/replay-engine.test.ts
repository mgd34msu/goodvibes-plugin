/**
 * Unit tests for persistence/replay-engine.ts — replayEvents()
 *
 * Tests: happy path event restoration, per event-type processing
 * (workflow:created, workflow:state_changed, workflow:completed/failed/cancelled,
 * agent:spawned, trigger:fired), filtering (afterSequence, eventTypes prefix),
 * sorting by sequence, error handling (event log read failure, processEvent throws,
 * restoreInstance failure, bind failure, restoreTriggerState failure),
 * null dep handling, and result summary correctness.
 *
 * All dependencies are mocked (EventLog, WorkflowEngine, TriggerRegistry,
 * AgentCoordinator, AgentWorkflowMap, logger, utils).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const toErrorMessage = vi.fn((err: unknown) => String(err instanceof Error ? err.message : err));
  const loggerInfo = vi.fn();
  const loggerDebug = vi.fn();
  const loggerWarn = vi.fn();
  const loggerError = vi.fn();
  const createLogger = vi.fn().mockReturnValue({
    info: loggerInfo,
    debug: loggerDebug,
    warn: loggerWarn,
    error: loggerError,
  });
  return { toErrorMessage, loggerInfo, loggerDebug, loggerWarn, loggerError, createLogger };
});

vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../../shared/utils.js', () => ({ toErrorMessage: mocks.toErrorMessage }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { replayEvents } from '../replay-engine.js';
import type { ReplayDeps, ReplayOptions } from '../replay-engine.js';

// ─── Helpers / factories ────────────────────────────────────────────────────────

type RuntimeEventInput = {
  id?: string;
  type: string;
  timestamp?: string;
  source?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  metadata?: { sequence?: number };
};

function makeEvent(input: RuntimeEventInput) {
  return {
    id: input.id ?? 'evt-' + Math.random().toString(36).slice(2),
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: input.source ?? { kind: 'runtime' },
    payload: input.payload ?? {},
    metadata: { sequence: 1, ...input.metadata },
  };
}

function makeEventLog(events: ReturnType<typeof makeEvent>[] = []) {
  return {
    query: vi.fn().mockResolvedValue(events),
    since: vi.fn().mockResolvedValue(events),
    append: vi.fn(),
    getStats: vi.fn(),
  };
}

function makeDeps(overrides: Partial<ReplayDeps> = {}): ReplayDeps {
  return {
    workflowEngine: null,
    triggerRegistry: null,
    agentCoordinator: null,
    agentWorkflowMap: null,
    ...overrides,
  };
}

function makeWorkflowEngine() {
  return { restoreInstance: vi.fn() };
}

function makeTriggerRegistry() {
  return { restoreTriggerState: vi.fn() };
}

function makeAgentWorkflowMap() {
  return { bind: vi.fn() };
}

// ─── Event log reading ─────────────────────────────────────────────────────────

describe('replayEvents — event log reading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls eventLog.query when no afterSequence is provided', async () => {
    const eventLog = makeEventLog();
    await replayEvents(eventLog as never, makeDeps());
    expect(eventLog.query).toHaveBeenCalledWith({});
    expect(eventLog.since).not.toHaveBeenCalled();
  });

  it('calls eventLog.since when afterSequence is provided', async () => {
    const eventLog = makeEventLog();
    await replayEvents(eventLog as never, makeDeps(), { afterSequence: 42 });
    expect(eventLog.since).toHaveBeenCalledWith(42);
    expect(eventLog.query).not.toHaveBeenCalled();
  });

  it('returns zeroed result when eventLog.query throws', async () => {
    const eventLog = makeEventLog();
    eventLog.query.mockRejectedValueOnce(new Error('log read error'));
    mocks.toErrorMessage.mockReturnValueOnce('log read error');
    const result = await replayEvents(eventLog as never, makeDeps());
    expect(result.eventsReplayed).toBe(0);
    expect(result.workflowsRestored).toBe(0);
    expect(result.agentBindingsRestored).toBe(0);
    expect(result.triggerCountsRestored).toBe(0);
    expect(result.skippedEvents).toBe(0);
    expect(result.lastSequence).toBe(0);
  });

  it('returns zeroed result when eventLog.since throws', async () => {
    const eventLog = makeEventLog();
    eventLog.since.mockRejectedValueOnce(new Error('log read error'));
    mocks.toErrorMessage.mockReturnValueOnce('log read error');
    const result = await replayEvents(eventLog as never, makeDeps(), { afterSequence: 5 });
    expect(result.eventsReplayed).toBe(0);
    expect(result.lastSequence).toBe(5); // preserved from afterSequence option
  });

  it('logs error when eventLog read fails', async () => {
    const eventLog = makeEventLog();
    eventLog.query.mockRejectedValueOnce(new Error('IO error'));
    mocks.toErrorMessage.mockReturnValueOnce('IO error');
    await replayEvents(eventLog as never, makeDeps());
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to read events from event log',
      expect.objectContaining({ error: 'IO error' }),
    );
  });

  it('returns zero eventsReplayed for empty event list', async () => {
    const result = await replayEvents(makeEventLog([]) as never, makeDeps());
    expect(result.eventsReplayed).toBe(0);
    expect(result.lastSequence).toBe(0);
  });

  it('result includes replayDurationMs as a non-negative number', async () => {
    const result = await replayEvents(makeEventLog([]) as never, makeDeps());
    expect(result.replayDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Sequence tracking and sorting ─────────────────────────────────────────────

describe('replayEvents — sequence tracking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tracks the highest sequence number seen', async () => {
    const events = [
      makeEvent({ type: 'unknown:event', metadata: { sequence: 3 } }),
      makeEvent({ type: 'unknown:event', metadata: { sequence: 7 } }),
      makeEvent({ type: 'unknown:event', metadata: { sequence: 5 } }),
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    expect(result.lastSequence).toBe(7);
  });

  it('initialises lastSequence from afterSequence when provided', async () => {
    const result = await replayEvents(
      makeEventLog([]) as never,
      makeDeps(),
      { afterSequence: 20 },
    );
    expect(result.lastSequence).toBe(20);
  });

  it('sorts events by sequence number before processing', async () => {
    const processedOrder: number[] = [];
    // Use workflow:created events to track processing order via side effects
    const workflowEngine = makeWorkflowEngine();
    workflowEngine.restoreInstance.mockImplementation((inst: { id: string }) => {
      processedOrder.push(parseInt(inst.id.replace('wf-', ''), 10));
    });

    const events = [
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 3 },
        payload: { data: { workflow_id: 'wf-3', workflow_type: 'type-a', current_state: 'idle', context: {} } },
      }),
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 1 },
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'type-a', current_state: 'idle', context: {} } },
      }),
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 2 },
        payload: { data: { workflow_id: 'wf-2', workflow_type: 'type-a', current_state: 'idle', context: {} } },
      }),
    ];

    await replayEvents(makeEventLog(events) as never, makeDeps({ workflowEngine: workflowEngine as never }));
    expect(processedOrder).toEqual([1, 2, 3]);
  });

  it('events without sequence metadata get sequence 0', async () => {
    const events = [
      { ...makeEvent({ type: 'unknown:event' }), metadata: undefined },
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    // Should not crash, lastSequence stays 0
    expect(result.lastSequence).toBe(0);
  });
});

// ─── Event type filtering ────────────────────────────────────────────────────────

describe('replayEvents — event type filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes all relevant events when no eventTypes filter is provided', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'type-a', current_state: 'idle', context: {} } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(result.workflowsRestored).toBe(1);
  });

  it('filters events to only those matching eventTypes prefixes', async () => {
    const workflowEngine = makeWorkflowEngine();
    const triggerRegistry = makeTriggerRegistry();
    const events = [
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'type-a', current_state: 'idle', context: {} } },
      }),
      makeEvent({
        type: 'trigger:fired',
        payload: { data: { trigger_id: 'trig-1' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never, triggerRegistry: triggerRegistry as never }),
      { eventTypes: ['workflow:'] },
    );
    // Only workflow events processed
    expect(result.workflowsRestored).toBe(1);
    expect(result.triggerCountsRestored).toBe(0);
  });

  it('skips events whose type does not match any eventTypes prefix', async () => {
    const events = [
      makeEvent({ type: 'agent:spawned', payload: { data: { agent_id: 'a1', workflow_id: 'wf-1' } } }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps(),
      { eventTypes: ['workflow:'] },
    );
    expect(result.eventsReplayed).toBe(0);
    expect(result.agentBindingsRestored).toBe(0);
  });

  it('empty eventTypes array skips the filter (length guard) and processes events normally', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'type-a', current_state: 'idle', context: {} } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
      { eventTypes: [] },
    );
    // Source guard: `if (eventTypes && eventTypes.length > 0)` — empty array skips the filter
    // so all events are still processed as if no filter was set
    expect(result.workflowsRestored).toBe(1);
  });
});

// ─── workflow:created ────────────────────────────────────────────────────────────────

describe('replayEvents — workflow:created', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores a workflow instance from workflow:created', async () => {
    const workflowEngine = makeWorkflowEngine();
    const ts = '2024-01-01T00:00:00.000Z';
    const events = [
      makeEvent({
        type: 'workflow:created',
        timestamp: ts,
        payload: {
          data: {
            workflow_id: 'wf-abc',
            workflow_type: 'wrfc',
            current_state: 'idle',
            context: { foo: 'bar' },
          },
        },
      }),
    ];

    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );

    expect(result.workflowsRestored).toBe(1);
    expect(workflowEngine.restoreInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wf-abc',
        definition_id: 'wrfc',
        current_state: 'idle',
        context: { foo: 'bar' },
        status: 'active',
        history: [],
        created_at: ts,
        updated_at: ts,
      }),
    );
  });

  it('does not duplicate-restore the same workflow if created event appears twice', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 1 },
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } },
      }),
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 2 },
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(workflowEngine.restoreInstance).toHaveBeenCalledTimes(1);
    expect(result.workflowsRestored).toBe(1);
  });

  it('skips workflow:created event missing required fields (no instance created)', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      // Missing current_state
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(workflowEngine.restoreInstance).not.toHaveBeenCalled();
    expect(result.workflowsRestored).toBe(0);
  });

  it('handles missing context field gracefully (defaults to empty object)', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } },
        // no context
      }),
    ];
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(workflowEngine.restoreInstance).toHaveBeenCalledWith(
      expect.objectContaining({ context: {} }),
    );
  });

  it('is a no-op when workflowEngine dep is null', async () => {
    const events = [
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } },
      }),
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    expect(result.workflowsRestored).toBe(0);
  });
});

// ─── workflow:state_changed ───────────────────────────────────────────────────────

describe('replayEvents — workflow:state_changed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates current_state and adds to history for an existing workflow', async () => {
    const workflowEngine = makeWorkflowEngine();
    const created = makeEvent({
      type: 'workflow:created',
      metadata: { sequence: 1 },
      timestamp: '2024-01-01T00:00:00.000Z',
      payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle', context: {} } },
    });
    const changed = makeEvent({
      type: 'workflow:state_changed',
      metadata: { sequence: 2 },
      timestamp: '2024-01-01T00:01:00.000Z',
      payload: { data: { workflow_id: 'wf-1', current_state: 'working', context: { task: 'done' } } },
    });

    await replayEvents(
      makeEventLog([created, changed]) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );

    const restoredInstance = workflowEngine.restoreInstance.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(restoredInstance?.current_state).toBe('working');
    expect(restoredInstance?.history).toHaveLength(1);
    expect((restoredInstance?.history as Record<string, unknown>[])[0]).toMatchObject({
      from_state: 'idle',
      to_state: 'working',
    });
    expect(restoredInstance?.context).toMatchObject({ task: 'done' });
  });

  it('merges context changes into existing context', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 1 },
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle', context: { existing: 'value' } } },
      }),
      makeEvent({
        type: 'workflow:state_changed',
        metadata: { sequence: 2 },
        payload: { data: { workflow_id: 'wf-1', current_state: 'done', context: { newField: 'added' } } },
      }),
    ];

    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );

    const instance = workflowEngine.restoreInstance.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(instance?.context).toMatchObject({ existing: 'value', newField: 'added' });
  });

  it('ignores state_changed for unknown workflow id', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:state_changed',
        payload: { data: { workflow_id: 'unknown-id', current_state: 'working' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    // No instance to update, but returns true (processed); no restore calls
    expect(workflowEngine.restoreInstance).not.toHaveBeenCalled();
  });

  it('skips state_changed missing required fields', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      // Missing current_state
      makeEvent({
        type: 'workflow:state_changed',
        payload: { data: { workflow_id: 'wf-1' } },
      }),
    ];
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(workflowEngine.restoreInstance).not.toHaveBeenCalled();
  });
});

// ─── workflow:completed / failed / cancelled ────────────────────────────────────

describe('replayEvents — workflow terminal states', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeWorkflowLifecycle(terminalType: string, terminalPayload: Record<string, unknown> = {}) {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 1 },
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle', context: {} } },
      }),
      makeEvent({
        type: terminalType,
        metadata: { sequence: 2 },
        timestamp: '2024-01-01T00:02:00.000Z',
        payload: { data: { workflow_id: 'wf-1', ...terminalPayload } },
      }),
    ];
    return { workflowEngine, events };
  }

  it('marks workflow as completed on workflow:completed event', async () => {
    const { workflowEngine, events } = makeWorkflowLifecycle('workflow:completed');
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    const instance = workflowEngine.restoreInstance.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(instance?.status).toBe('completed');
    expect(instance?.completed_at).toBe('2024-01-01T00:02:00.000Z');
  });

  it('marks workflow as failed on workflow:failed event', async () => {
    const { workflowEngine, events } = makeWorkflowLifecycle('workflow:failed', { error: 'something went wrong' });
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    const instance = workflowEngine.restoreInstance.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(instance?.status).toBe('failed');
    expect(instance?.error).toBe('something went wrong');
  });

  it('marks workflow as cancelled on workflow:cancelled event', async () => {
    const { workflowEngine, events } = makeWorkflowLifecycle('workflow:cancelled');
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    const instance = workflowEngine.restoreInstance.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(instance?.status).toBe('cancelled');
  });

  it('terminal events with unknown workflow_id are silently ignored', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:completed',
        payload: { data: { workflow_id: 'unknown-id' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(result.workflowsRestored).toBe(0);
  });

  it('terminal events missing workflow_id are skipped (return false)', async () => {
    const workflowEngine = makeWorkflowEngine();
    const events = [
      makeEvent({
        type: 'workflow:completed',
        payload: { data: {} },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(result.eventsReplayed).toBe(0);
  });
});

// ─── agent:spawned ───────────────────────────────────────────────────────────────

describe('replayEvents — agent:spawned', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores agent-workflow binding from payload data', async () => {
    const agentWorkflowMap = makeAgentWorkflowMap();
    const events = [
      makeEvent({
        type: 'agent:spawned',
        source: { kind: 'runtime' },
        payload: { data: { agent_id: 'agent-1', workflow_id: 'wf-1' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ agentWorkflowMap: agentWorkflowMap as never }),
    );
    expect(result.agentBindingsRestored).toBe(1);
    expect(agentWorkflowMap.bind).toHaveBeenCalledWith('agent-1', 'wf-1');
  });

  it('extracts agent_id from source when source.kind is agent', async () => {
    const agentWorkflowMap = makeAgentWorkflowMap();
    const events = [
      makeEvent({
        type: 'agent:spawned',
        source: { kind: 'agent', agent_id: 'agent-from-source' },
        payload: { data: { workflow_id: 'wf-2' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ agentWorkflowMap: agentWorkflowMap as never }),
    );
    expect(result.agentBindingsRestored).toBe(1);
    expect(agentWorkflowMap.bind).toHaveBeenCalledWith('agent-from-source', 'wf-2');
  });

  it('does not duplicate bindings when same agent:spawned seen twice', async () => {
    const agentWorkflowMap = makeAgentWorkflowMap();
    const events = [
      makeEvent({
        type: 'agent:spawned',
        metadata: { sequence: 1 },
        payload: { data: { agent_id: 'a1', workflow_id: 'wf-1' } },
      }),
      makeEvent({
        type: 'agent:spawned',
        metadata: { sequence: 2 },
        payload: { data: { agent_id: 'a1', workflow_id: 'wf-1' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ agentWorkflowMap: agentWorkflowMap as never }),
    );
    expect(agentWorkflowMap.bind).toHaveBeenCalledTimes(1);
    expect(result.agentBindingsRestored).toBe(1);
  });

  it('skips agent:spawned missing both agent_id and source agent_id', async () => {
    const agentWorkflowMap = makeAgentWorkflowMap();
    const events = [
      makeEvent({
        type: 'agent:spawned',
        source: { kind: 'runtime' },
        payload: { data: { workflow_id: 'wf-1' } }, // no agent_id
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ agentWorkflowMap: agentWorkflowMap as never }),
    );
    expect(result.agentBindingsRestored).toBe(0);
    expect(agentWorkflowMap.bind).not.toHaveBeenCalled();
  });

  it('is a no-op when agentWorkflowMap dep is null', async () => {
    const events = [
      makeEvent({
        type: 'agent:spawned',
        payload: { data: { agent_id: 'a1', workflow_id: 'wf-1' } },
      }),
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    expect(result.agentBindingsRestored).toBe(0);
  });
});

// ─── trigger:fired ──────────────────────────────────────────────────────────────

describe('replayEvents — trigger:fired', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores trigger fire count from a single trigger:fired event', async () => {
    const triggerRegistry = makeTriggerRegistry();
    const events = [
      makeEvent({
        type: 'trigger:fired',
        timestamp: '2024-01-01T12:00:00.000Z',
        payload: { data: { trigger_id: 'trig-1' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ triggerRegistry: triggerRegistry as never }),
    );
    expect(result.triggerCountsRestored).toBe(1);
    expect(triggerRegistry.restoreTriggerState).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ triggerId: 'trig-1', firesCount: 1 }),
      ]),
    );
  });

  it('accumulates fire count across multiple trigger:fired events for same trigger', async () => {
    const triggerRegistry = makeTriggerRegistry();
    const events = [
      makeEvent({ type: 'trigger:fired', metadata: { sequence: 1 }, payload: { data: { trigger_id: 'trig-1' } } }),
      makeEvent({ type: 'trigger:fired', metadata: { sequence: 2 }, payload: { data: { trigger_id: 'trig-1' } } }),
      makeEvent({ type: 'trigger:fired', metadata: { sequence: 3 }, payload: { data: { trigger_id: 'trig-1' } } }),
    ];
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ triggerRegistry: triggerRegistry as never }),
    );
    expect(triggerRegistry.restoreTriggerState).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ triggerId: 'trig-1', firesCount: 3 }),
      ]),
    );
  });

  it('tracks multiple distinct triggers independently', async () => {
    const triggerRegistry = makeTriggerRegistry();
    const events = [
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-1' } } }),
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-2' } } }),
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-2' } } }),
    ];
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ triggerRegistry: triggerRegistry as never }),
    );
    const call = triggerRegistry.restoreTriggerState.mock.calls[0]?.[0] as unknown[];
    const trig1 = (call as Record<string, unknown>[]).find((x) => x['triggerId'] === 'trig-1');
    const trig2 = (call as Record<string, unknown>[]).find((x) => x['triggerId'] === 'trig-2');
    expect(trig1?.['firesCount']).toBe(1);
    expect(trig2?.['firesCount']).toBe(2);
    expect(result_triggerCountsRestored(triggerRegistry)).toBe(2);
  });

  it('extracts trigger_id from source when source.kind is trigger', async () => {
    const triggerRegistry = makeTriggerRegistry();
    const events = [
      makeEvent({
        type: 'trigger:fired',
        source: { kind: 'trigger', trigger_id: 'trig-from-source' },
        payload: { data: {} },
      }),
    ];
    await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ triggerRegistry: triggerRegistry as never }),
    );
    expect(triggerRegistry.restoreTriggerState).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ triggerId: 'trig-from-source' }),
      ]),
    );
  });

  it('skips trigger:fired events missing trigger_id from both payload and source', async () => {
    const triggerRegistry = makeTriggerRegistry();
    const events = [
      makeEvent({
        type: 'trigger:fired',
        source: { kind: 'runtime' },
        payload: { data: {} },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ triggerRegistry: triggerRegistry as never }),
    );
    expect(result.triggerCountsRestored).toBe(0);
    expect(triggerRegistry.restoreTriggerState).not.toHaveBeenCalled();
  });

  it('is a no-op when triggerRegistry dep is null', async () => {
    const events = [
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-1' } } }),
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    expect(result.triggerCountsRestored).toBe(0);
  });
});

// Helper to avoid inline async in the trigger test
function result_triggerCountsRestored(triggerRegistry: ReturnType<typeof makeTriggerRegistry>): number {
  // The restoreTriggerState was called with an array; count distinct entries
  const states = triggerRegistry.restoreTriggerState.mock.calls[0]?.[0] as unknown[];
  return states?.length ?? 0;
}

// ─── Unknown / unrecognised event types ────────────────────────────────────────────

describe('replayEvents — unknown event types', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not count unknown event types in eventsReplayed', async () => {
    const events = [
      makeEvent({ type: 'custom:unrecognised' }),
      makeEvent({ type: 'another:unknown:event' }),
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    expect(result.eventsReplayed).toBe(0);
    expect(result.skippedEvents).toBe(0); // unknown != error, they just return false
  });

  it('does not throw on unknown event types', async () => {
    const events = [makeEvent({ type: 'totally:unknown' })];
    await expect(replayEvents(makeEventLog(events) as never, makeDeps())).resolves.not.toThrow();
  });
});

// ─── Error handling and skippedEvents ───────────────────────────────────────────

describe('replayEvents — error handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments skippedEvents when processEvent throws', async () => {
    // Use an event whose payload.data getter throws to force a processEvent error
    const badPayload = Object.defineProperty({}, 'data', {
      get() { throw new Error('processEvent forced error via payload.data getter'); },
    });
    const badEvent = {
      id: 'bad-evt',
      type: 'workflow:created',
      timestamp: new Date().toISOString(),
      source: { kind: 'runtime' },
      payload: badPayload,
      metadata: { sequence: 1 },
    };
    const result = await replayEvents(makeEventLog([badEvent] as never) as never, makeDeps());
    expect(result.skippedEvents).toBeGreaterThan(0);
  });

  it('logs warning when processEvent throws', async () => {
    const badPayload = Object.defineProperty({}, 'data', {
      get() { throw new Error('processEvent forced error'); },
    });
    const badEvent = {
      id: 'bad-warn-evt',
      type: 'workflow:created',
      timestamp: new Date().toISOString(),
      source: { kind: 'runtime' },
      payload: badPayload,
      metadata: { sequence: 1 },
    };
    await replayEvents(makeEventLog([badEvent] as never) as never, makeDeps());
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Skipping event during replay due to error',
      expect.objectContaining({ event_id: 'bad-warn-evt', event_type: 'workflow:created' }),
    );
  });

  it('continues processing remaining events after a skipped event', async () => {
    const workflowEngine = makeWorkflowEngine();
    const badPayload = Object.defineProperty({}, 'data', {
      get() { throw new Error('processEvent forced error'); },
    });
    const events = [
      // Bad event that will throw in processEvent
      {
        id: 'bad-skip',
        type: 'workflow:created',
        timestamp: new Date().toISOString(),
        source: { kind: 'runtime' },
        payload: badPayload,
        metadata: { sequence: 1 },
      },
      // Good event that should still be processed
      makeEvent({
        type: 'workflow:created',
        metadata: { sequence: 2 },
        payload: { data: { workflow_id: 'wf-good', workflow_type: 'wrfc', current_state: 'idle' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events as never) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(result.workflowsRestored).toBe(1);
    expect(result.skippedEvents).toBeGreaterThan(0);
  });

  it('catches restoreInstance errors and increments skippedEvents', async () => {
    const workflowEngine = makeWorkflowEngine();
    workflowEngine.restoreInstance.mockImplementationOnce(() => { throw new Error('restore failed'); });
    mocks.toErrorMessage.mockReturnValueOnce('restore failed');
    const events = [
      makeEvent({
        type: 'workflow:created',
        payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } },
      }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ workflowEngine: workflowEngine as never }),
    );
    expect(result.workflowsRestored).toBe(0);
    expect(result.skippedEvents).toBeGreaterThan(0);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to restore workflow instance',
      expect.objectContaining({ id: 'wf-1' }),
    );
  });

  it('catches agentWorkflowMap.bind errors and logs warning', async () => {
    const agentWorkflowMap = makeAgentWorkflowMap();
    agentWorkflowMap.bind.mockImplementationOnce(() => { throw new Error('bind failed'); });
    mocks.toErrorMessage.mockReturnValueOnce('bind failed');
    const events = [
      makeEvent({ type: 'agent:spawned', payload: { data: { agent_id: 'a1', workflow_id: 'wf-1' } } }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ agentWorkflowMap: agentWorkflowMap as never }),
    );
    expect(result.agentBindingsRestored).toBe(0);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to restore agent binding',
      expect.objectContaining({ agentId: 'a1', workflowId: 'wf-1' }),
    );
  });

  it('catches triggerRegistry.restoreTriggerState errors and logs warning', async () => {
    // Reset mocks fully to avoid mockReturnValueOnce contamination from prior tests
    vi.resetAllMocks();
    // Re-establish logger mock after reset
    mocks.createLogger.mockReturnValue({
      info: mocks.loggerInfo,
      debug: mocks.loggerDebug,
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
    });
    const triggerRegistry = makeTriggerRegistry();
    triggerRegistry.restoreTriggerState.mockImplementationOnce(() => { throw new Error('restore trigger failed'); });
    const events = [
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-1' } } }),
    ];
    const result = await replayEvents(
      makeEventLog(events) as never,
      makeDeps({ triggerRegistry: triggerRegistry as never }),
    );
    expect(result.triggerCountsRestored).toBe(0);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to restore trigger states',
      expect.objectContaining({ error: 'restore trigger failed' }),
    );
  });
});

// ─── Null deps ────────────────────────────────────────────────────────────────────────

describe('replayEvents — null deps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs without error when all deps are null', async () => {
    const events = [
      makeEvent({ type: 'workflow:created', payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } } }),
      makeEvent({ type: 'agent:spawned', payload: { data: { agent_id: 'a1', workflow_id: 'wf-1' } } }),
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-1' } } }),
    ];
    await expect(
      replayEvents(makeEventLog(events) as never, makeDeps()),
    ).resolves.not.toThrow();
  });

  it('returns zero counts when all deps are null', async () => {
    const events = [
      makeEvent({ type: 'workflow:created', payload: { data: { workflow_id: 'wf-1', workflow_type: 'wrfc', current_state: 'idle' } } }),
      makeEvent({ type: 'trigger:fired', payload: { data: { trigger_id: 'trig-1' } } }),
    ];
    const result = await replayEvents(makeEventLog(events) as never, makeDeps());
    expect(result.workflowsRestored).toBe(0);
    expect(result.triggerCountsRestored).toBe(0);
    expect(result.agentBindingsRestored).toBe(0);
  });
});

// ─── Logging ──────────────────────────────────────────────────────────────────────

describe('replayEvents — logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs info at start of replay', async () => {
    await replayEvents(makeEventLog([]) as never, makeDeps());
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Starting event replay',
      expect.objectContaining({ afterSequence: 0, skipActions: true }),
    );
  });

  it('logs info on replay completion with summary', async () => {
    await replayEvents(makeEventLog([]) as never, makeDeps());
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Event replay complete',
      expect.objectContaining({
        eventsReplayed: 0,
        workflowsRestored: 0,
        agentBindingsRestored: 0,
        triggerCountsRestored: 0,
        skippedEvents: 0,
      }),
    );
  });

  it('skipActions defaults to true in log output', async () => {
    await replayEvents(makeEventLog([]) as never, makeDeps());
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Starting event replay',
      expect.objectContaining({ skipActions: true }),
    );
  });

  it('logs skipActions: false when explicitly set', async () => {
    await replayEvents(makeEventLog([]) as never, makeDeps(), { skipActions: false });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Starting event replay',
      expect.objectContaining({ skipActions: false }),
    );
  });
});

// ─── Error threshold (maxReplayErrors) ────────────────────────────────────────

describe('replayEvents — maxReplayErrors threshold', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeBadEvent(sequence: number) {
    const badPayload = Object.defineProperty({}, 'data', {
      get() { throw new Error(`forced error seq ${sequence}`); },
    });
    return {
      id: `bad-${sequence}`,
      type: 'workflow:created',
      timestamp: new Date().toISOString(),
      source: { kind: 'runtime' },
      payload: badPayload,
      metadata: { sequence },
    };
  }

  it('result.aborted is false when errors stay under threshold', async () => {
    // 2 bad events with maxReplayErrors=10 (default) — should NOT abort
    const events = [makeBadEvent(1), makeBadEvent(2)];
    const result = await replayEvents(makeEventLog(events as never) as never, makeDeps());
    expect(result.aborted).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('aborts replay when error count reaches maxReplayErrors', async () => {
    // 5 bad events with maxReplayErrors=3 — should abort after 3
    const events = [1, 2, 3, 4, 5].map(makeBadEvent);
    const result = await replayEvents(
      makeEventLog(events as never) as never,
      makeDeps(),
      { maxReplayErrors: 3 },
    );
    expect(result.aborted).toBe(true);
    expect(result.errors).toHaveLength(3);
    expect(result.skippedEvents).toBe(3);
  });

  it('errors array is populated on abort', async () => {
    const events = [1, 2, 3, 4].map(makeBadEvent);
    const result = await replayEvents(
      makeEventLog(events as never) as never,
      makeDeps(),
      { maxReplayErrors: 2 },
    );
    expect(result.aborted).toBe(true);
    expect(result.errors.every((e) => typeof e === 'string')).toBe(true);
  });

  it('logs warning when error count reaches 80% of threshold', async () => {
    // maxReplayErrors=5, warnThreshold=4; need exactly 4 errors to trigger warn
    const events = [1, 2, 3, 4].map(makeBadEvent);
    await replayEvents(
      makeEventLog(events as never) as never,
      makeDeps(),
      { maxReplayErrors: 5 },
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Replay error count approaching threshold — replay may be aborted',
      expect.objectContaining({ errorCount: 4, maxReplayErrors: 5 }),
    );
  });

  it('logs warning when replay is aborted due to threshold exceeded', async () => {
    const events = [1, 2, 3].map(makeBadEvent);
    await replayEvents(
      makeEventLog(events as never) as never,
      makeDeps(),
      { maxReplayErrors: 2 },
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Replay aborted: error threshold exceeded',
      expect.objectContaining({ errorCount: 2, maxReplayErrors: 2 }),
    );
  });

  it('errors array is empty when replay is not aborted', async () => {
    // No errors at all
    const result = await replayEvents(makeEventLog([]) as never, makeDeps());
    expect(result.errors).toHaveLength(0);
    expect(result.aborted).toBe(false);
  });

  it('early-exit result (event log read failure) has aborted=false and errors=[]', async () => {
    const failingLog = {
      query: vi.fn().mockRejectedValue(new Error('read failure')),
      since: vi.fn().mockRejectedValue(new Error('read failure')),
      append: vi.fn(),
      getStats: vi.fn(),
    };
    const result = await replayEvents(failingLog as never, makeDeps());
    expect(result.aborted).toBe(false);
    expect(result.errors).toHaveLength(0);
  });
});
