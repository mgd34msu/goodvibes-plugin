import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replayEvents } from '../replay-engine.js';
import type { ReplayDeps, ReplayOptions } from '../replay-engine.js';
import type { RuntimeEvent } from '../../../shared/events.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<ReplayDeps> = {}): ReplayDeps {
  return {
    workflowEngine: {
      restoreInstance: vi.fn(),
      getAllInstances: vi.fn().mockReturnValue([]),
    } as unknown as ReplayDeps['workflowEngine'],
    triggerRegistry: {
      getTriggerStates: vi.fn().mockReturnValue([]),
      restoreTriggerState: vi.fn(),
    } as unknown as ReplayDeps['triggerRegistry'],
    agentCoordinator: null,
    agentWorkflowMap: {
      bind: vi.fn(),
      snapshot: vi.fn().mockReturnValue({}),
    } as unknown as ReplayDeps['agentWorkflowMap'],
    ...overrides,
  };
}

function makeEventLog(events: RuntimeEvent[], overrides: Record<string, unknown> = {}) {
  return {
    since: vi.fn().mockResolvedValue(events),
    query: vi.fn().mockResolvedValue(events),
    ...overrides,
  } as unknown as Parameters<typeof replayEvents>[0];
}

function makeEvent(type: string, seq: number, payload?: Record<string, unknown>): RuntimeEvent {
  return {
    id: `evt_${seq}`,
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    timestamp: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    payload: payload ?? {},
    metadata: { sequence: seq },
  } as unknown as RuntimeEvent;
}

function makeWorkflowCreatedEvent(seq: number, workflowId: string, definitionId = 'def1', state = 'initial') {
  return makeEvent('workflow:created', seq, {
    data: {
      workflow_id: workflowId,
      workflow_type: definitionId,
      current_state: state,
      context: { foo: 'bar' },
    },
  });
}

function makeWorkflowStateChangedEvent(seq: number, workflowId: string, newState: string) {
  return makeEvent('workflow:state_changed', seq, {
    data: {
      workflow_id: workflowId,
      current_state: newState,
      context: { updated: true },
    },
  });
}

function makeWorkflowTerminalEvent(type: 'workflow:completed' | 'workflow:failed' | 'workflow:cancelled', seq: number, workflowId: string, error?: string) {
  return makeEvent(type, seq, {
    data: { workflow_id: workflowId, ...(error ? { error } : {}) },
  });
}

function makeAgentSpawnedEvent(seq: number, agentId: string, workflowId: string) {
  return {
    ...makeEvent('agent:spawned', seq, { data: { agent_id: agentId, workflow_id: workflowId } }),
    source: { kind: 'agent', agent_id: agentId },
  } as unknown as RuntimeEvent;
}

function makeTriggerFiredEvent(seq: number, triggerId: string) {
  return {
    ...makeEvent('trigger:fired', seq, { data: { trigger_id: triggerId } }),
    source: { kind: 'trigger', trigger_id: triggerId },
  } as unknown as RuntimeEvent;
}

// ---------------------------------------------------------------------------
// Basic result structure
// ---------------------------------------------------------------------------

describe('replayEvents — basic structure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zero counts for an empty event log', async () => {
    const result = await replayEvents(makeEventLog([]), makeDeps());
    expect(result.eventsReplayed).toBe(0);
    expect(result.workflowsRestored).toBe(0);
    expect(result.agentBindingsRestored).toBe(0);
    expect(result.triggerCountsRestored).toBe(0);
    expect(result.skippedEvents).toBe(0);
    expect(result.aborted).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('returns replayDurationMs as a non-negative number', async () => {
    const result = await replayEvents(makeEventLog([]), makeDeps());
    expect(result.replayDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns empty errors array when not aborted', async () => {
    const result = await replayEvents(makeEventLog([]), makeDeps());
    expect(result.errors).toEqual([]);
  });

  it('returns zero result when eventLog.query() throws', async () => {
    const eventLog = makeEventLog([], {
      query: vi.fn().mockRejectedValue(new Error('log corrupted')),
    });
    const result = await replayEvents(eventLog, makeDeps());
    expect(result.eventsReplayed).toBe(0);
    expect(result.aborted).toBe(false);
  });

  it('returns zero result when eventLog.since() throws', async () => {
    const eventLog = makeEventLog([], {
      since: vi.fn().mockRejectedValue(new Error('log error')),
    });
    const result = await replayEvents(eventLog, makeDeps(), { afterSequence: 5 });
    expect(result.eventsReplayed).toBe(0);
    expect(result.lastSequence).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Workflow events
// ---------------------------------------------------------------------------

describe('replayEvents — workflow:created', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores a workflow instance', async () => {
    const events = [makeWorkflowCreatedEvent(1, 'wf1')];
    const deps = makeDeps();
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.eventsReplayed).toBe(1);
    expect(result.workflowsRestored).toBe(1);
    expect(vi.mocked(deps.workflowEngine!.restoreInstance)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf1', definition_id: 'def1', current_state: 'initial' }),
    );
  });

  it('does not create duplicate instances for the same workflow_id', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeWorkflowCreatedEvent(2, 'wf1'), // duplicate
    ];
    const deps = makeDeps();
    const result = await replayEvents(makeEventLog(events), deps);
    // Only one instance should be restored
    expect(result.workflowsRestored).toBe(1);
  });

  it('skips workflow:created events with missing required fields', async () => {
    const events = [makeEvent('workflow:created', 1, { data: { workflow_id: 'wf1' } })];
    const result = await replayEvents(makeEventLog(events), makeDeps());
    // Event was processed but instance not created (missing definitionId/state)
    expect(result.workflowsRestored).toBe(0);
  });
});

describe('replayEvents — workflow:state_changed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the workflow current_state', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1', 'def1', 'pending'),
      makeWorkflowStateChangedEvent(2, 'wf1', 'running'),
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    const call = vi.mocked(deps.workflowEngine!.restoreInstance).mock.calls[0][0];
    expect(call.current_state).toBe('running');
  });

  it('adds a history entry for the transition', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1', 'def1', 'pending'),
      makeWorkflowStateChangedEvent(2, 'wf1', 'running'),
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    const call = vi.mocked(deps.workflowEngine!.restoreInstance).mock.calls[0][0];
    expect(call.history).toHaveLength(1);
    expect(call.history[0].from_state).toBe('pending');
    expect(call.history[0].to_state).toBe('running');
  });

  it('ignores state_changed for unknown workflow IDs', async () => {
    const events = [makeWorkflowStateChangedEvent(1, 'unknown-wf', 'running')];
    const result = await replayEvents(makeEventLog(events), makeDeps());
    // The event is processed (returns true) even for unknown workflows
    expect(result.workflowsRestored).toBe(0);
  });
});

describe('replayEvents — workflow:completed / failed / cancelled', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks workflow as completed', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeWorkflowTerminalEvent('workflow:completed', 2, 'wf1'),
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    const call = vi.mocked(deps.workflowEngine!.restoreInstance).mock.calls[0][0];
    expect(call.status).toBe('completed');
    expect(call.completed_at).toBeDefined();
  });

  it('marks workflow as failed with error message', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeWorkflowTerminalEvent('workflow:failed', 2, 'wf1', 'timeout'),
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    const call = vi.mocked(deps.workflowEngine!.restoreInstance).mock.calls[0][0];
    expect(call.status).toBe('failed');
    expect(call.error).toBe('timeout');
  });

  it('marks workflow as cancelled', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeWorkflowTerminalEvent('workflow:cancelled', 2, 'wf1'),
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    const call = vi.mocked(deps.workflowEngine!.restoreInstance).mock.calls[0][0];
    expect(call.status).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Agent events
// ---------------------------------------------------------------------------

describe('replayEvents — agent:spawned', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores an agent-workflow binding', async () => {
    const events = [makeAgentSpawnedEvent(1, 'agent1', 'wf1')];
    const deps = makeDeps();
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.agentBindingsRestored).toBe(1);
    expect(vi.mocked(deps.agentWorkflowMap!.bind)).toHaveBeenCalledWith('agent1', 'wf1');
  });

  it('does not add binding when agentId or workflowId is missing', async () => {
    const events = [makeEvent('agent:spawned', 1, { data: { agent_id: 'agent1' } })];
    const result = await replayEvents(makeEventLog(events), makeDeps());
    expect(result.agentBindingsRestored).toBe(0);
  });

  it('skips binding when agentWorkflowMap is null', async () => {
    const events = [makeAgentSpawnedEvent(1, 'agent1', 'wf1')];
    const deps = makeDeps({ agentWorkflowMap: null });
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.agentBindingsRestored).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Trigger events
// ---------------------------------------------------------------------------

describe('replayEvents — trigger:fired', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores a trigger fire count', async () => {
    const events = [makeTriggerFiredEvent(1, 'trig1')];
    const deps = makeDeps();
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.triggerCountsRestored).toBe(1);
    expect(vi.mocked(deps.triggerRegistry!.restoreTriggerState)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ triggerId: 'trig1', firesCount: 1 }),
      ]),
    );
  });

  it('increments fire count for repeated trigger:fired events', async () => {
    const events = [
      makeTriggerFiredEvent(1, 'trig1'),
      makeTriggerFiredEvent(2, 'trig1'),
      makeTriggerFiredEvent(3, 'trig1'),
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    expect(vi.mocked(deps.triggerRegistry!.restoreTriggerState)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ triggerId: 'trig1', firesCount: 3 }),
      ]),
    );
  });

  it('skips trigger when triggerRegistry is null', async () => {
    const events = [makeTriggerFiredEvent(1, 'trig1')];
    const deps = makeDeps({ triggerRegistry: null });
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.triggerCountsRestored).toBe(0);
  });

  it('does not set triggerCountsRestored when restoreTriggerState throws', async () => {
    const events = [makeTriggerFiredEvent(1, 'trig1')];
    const deps = makeDeps({
      triggerRegistry: {
        getTriggerStates: vi.fn(),
        restoreTriggerState: vi.fn().mockImplementation(() => { throw new Error('restore failed'); }),
      } as unknown as ReplayDeps['triggerRegistry'],
    });
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.triggerCountsRestored).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event filtering
// ---------------------------------------------------------------------------

describe('replayEvents — afterSequence filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls eventLog.since() with the afterSequence value', async () => {
    const eventLog = makeEventLog([]);
    await replayEvents(eventLog, makeDeps(), { afterSequence: 5 });
    expect(eventLog.since).toHaveBeenCalledWith(5);
    expect(eventLog.query).not.toHaveBeenCalled();
  });

  it('calls eventLog.query() when afterSequence is not provided', async () => {
    const eventLog = makeEventLog([]);
    await replayEvents(eventLog, makeDeps());
    expect(eventLog.query).toHaveBeenCalled();
    expect(eventLog.since).not.toHaveBeenCalled();
  });

  it('sets lastSequence to afterSequence when no events returned', async () => {
    const eventLog = makeEventLog([]);
    const result = await replayEvents(eventLog, makeDeps(), { afterSequence: 42 });
    expect(result.lastSequence).toBe(42);
  });
});

describe('replayEvents — eventTypes filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only processes events matching the eventTypes prefix', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeTriggerFiredEvent(2, 'trig1'),
    ];
    const deps = makeDeps();
    const result = await replayEvents(makeEventLog(events), deps, { eventTypes: ['workflow:'] });
    expect(result.workflowsRestored).toBe(1);
    expect(result.triggerCountsRestored).toBe(0);
  });

  it('processes all event types when eventTypes is empty array', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeTriggerFiredEvent(2, 'trig1'),
    ];
    const deps = makeDeps();
    const result = await replayEvents(makeEventLog(events), deps, { eventTypes: [] });
    expect(result.workflowsRestored).toBe(1);
    expect(result.triggerCountsRestored).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Event sorting
// ---------------------------------------------------------------------------

describe('replayEvents — sequence ordering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes events in sequence order even when delivered out-of-order', async () => {
    // state_changed arrives before created in the log (out of order)
    const events = [
      makeWorkflowStateChangedEvent(2, 'wf1', 'running'), // seq 2 first
      makeWorkflowCreatedEvent(1, 'wf1', 'def1', 'pending'), // seq 1 second
    ];
    const deps = makeDeps();
    await replayEvents(makeEventLog(events), deps);
    // After sorting: created(1) then state_changed(2)
    // The workflow should end up in 'running' state with 1 history entry
    const call = vi.mocked(deps.workflowEngine!.restoreInstance).mock.calls[0][0];
    expect(call.current_state).toBe('running');
    expect(call.history).toHaveLength(1);
  });

  it('tracks the highest sequence number as lastSequence', async () => {
    const events = [
      makeWorkflowCreatedEvent(3, 'wf1'),
      makeWorkflowCreatedEvent(1, 'wf2'),
      makeWorkflowCreatedEvent(7, 'wf3'),
    ];
    const result = await replayEvents(makeEventLog(events), makeDeps());
    expect(result.lastSequence).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Error handling and abort
// ---------------------------------------------------------------------------

describe('replayEvents — error handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips events that cause errors and increments skippedEvents', async () => {
    const deps = makeDeps({
      workflowEngine: {
        restoreInstance: vi.fn().mockImplementationOnce(() => { throw new Error('restore error'); }),
        getAllInstances: vi.fn().mockReturnValue([]),
      } as unknown as ReplayDeps['workflowEngine'],
    });
    const events = [makeWorkflowCreatedEvent(1, 'wf1')];
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.skippedEvents).toBeGreaterThan(0);
  });

  it('aborts when maxReplayErrors threshold is exceeded', async () => {
    // Events with source: undefined cause a TypeError inside processEvent (the agent:spawned
    // handler accesses event.source.kind, which throws when source is undefined), triggering
    // the in-loop error counter that drives the abort mechanism.
    const events = Array.from({ length: 5 }, (_, i) => ({
      ...makeEvent('agent:spawned', i + 1, { data: { agent_id: `a${i}`, workflow_id: `wf${i}` } }),
      source: undefined,
    } as unknown as RuntimeEvent));
    const result = await replayEvents(makeEventLog(events), makeDeps(), { maxReplayErrors: 3 });
    expect(result.aborted).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns errors array when aborted', async () => {
    // Same technique: source: undefined causes TypeError inside processEvent loop
    const events = Array.from({ length: 15 }, (_, i) => ({
      ...makeEvent('agent:spawned', i + 1, { data: { agent_id: `a${i}`, workflow_id: `wf${i}` } }),
      source: undefined,
    } as unknown as RuntimeEvent));
    const result = await replayEvents(makeEventLog(events), makeDeps(), { maxReplayErrors: 10 });
    expect(result.aborted).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('errors array is empty when not aborted', async () => {
    const events = [makeWorkflowCreatedEvent(1, 'wf1')];
    const result = await replayEvents(makeEventLog(events), makeDeps());
    expect(result.aborted).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('ignores unknown event types (returns false from processEvent)', async () => {
    const events = [makeEvent('unknown:type', 1)];
    const result = await replayEvents(makeEventLog(events), makeDeps());
    expect(result.eventsReplayed).toBe(0);
    expect(result.skippedEvents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Null deps
// ---------------------------------------------------------------------------

describe('replayEvents — null deps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('completes without throwing when all deps are null', async () => {
    const events = [
      makeWorkflowCreatedEvent(1, 'wf1'),
      makeAgentSpawnedEvent(2, 'agent1', 'wf1'),
      makeTriggerFiredEvent(3, 'trig1'),
    ];
    const deps = makeDeps({
      workflowEngine: null,
      triggerRegistry: null,
      agentWorkflowMap: null,
    });
    const result = await replayEvents(makeEventLog(events), deps);
    expect(result.workflowsRestored).toBe(0);
    expect(result.agentBindingsRestored).toBe(0);
    expect(result.triggerCountsRestored).toBe(0);
  });
});
