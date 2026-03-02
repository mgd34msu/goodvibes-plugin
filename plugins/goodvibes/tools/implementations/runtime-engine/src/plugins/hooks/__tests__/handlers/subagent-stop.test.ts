/**
 * SubagentStop Handler Tests
 *
 * Tests for reviewer quality gates, agent:completed event emission,
 * error handling, and workflow map lookup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSubagentStopHandler } from '../../handlers/subagent-stop.js';
import { DEFAULT_MIN_REVIEW_SCORE } from '../../../../plugins/wrfc/constants.js';
import type { HookEvent } from '../../../../extensions/events/factories.js';
import type { EventBus } from '../../../../extensions/events/event-bus.js';
import type { AgentWorkflowMap } from '../../../../extensions/directives/agent-workflow-map.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockEvent(session_id = 'session-1'): HookEvent {
  return {
    id: 'evt-1',
    timestamp: Date.now(),
    type: 'hook',
    source: { kind: 'hook', hook_name: 'subagent_stop' },
    hook_type: 'SubagentStop',
    hook_input: {},
    session_id,
    payload: { type: 'hook', data: {} },
    priority: 0,
    context: {},
  } as unknown as HookEvent;
}

function makeMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as EventBus;
}

function makeMockAgentWorkflowMap(workflowId: string | null = null): AgentWorkflowMap {
  return {
    lookup: vi.fn(() => workflowId),
    bind: vi.fn(),
    resolvePendingBind: vi.fn(() => null),
  } as unknown as AgentWorkflowMap;
}

function makeGvOutput(score: number): string {
  return `Some output text\n<gv>${JSON.stringify({ score, files: [], count: 5 })}</gv>`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createSubagentStopHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Non-reviewer agents ────────────────────────────────────────────────────

  describe('non-reviewer agents', () => {
    it('returns null for a non-reviewer agent type', async () => {
      const eventBus = makeMockEventBus();
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'a1',
        agent_type: 'engineer',
        output: 'some output',
      });

      expect(result).toBeNull();
    });

    it('emits agent:completed event for non-reviewer agent', async () => {
      const eventBus = makeMockEventBus();
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });

      await handler(makeMockEvent(), {
        agent_id: 'a1',
        agent_type: 'engineer',
        output: 'output text',
      });

      expect(eventBus.emit).toHaveBeenCalledOnce();
      const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(emittedEvent.type).toBe('agent:completed');
    });

    it('includes agent_id and agent_type in emitted event payload', async () => {
      const eventBus = makeMockEventBus();
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });

      await handler(makeMockEvent(), {
        agent_id: 'agent-42',
        agent_type: 'engineer',
        output: 'done',
      });

      const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown>;
      expect(data.agent_id).toBe('agent-42');
      expect(data.agent_type).toBe('engineer');
      expect(data.output).toBe('done');
    });

    it('includes workflow_id from agentWorkflowMap.lookup in emitted event', async () => {
      const eventBus = makeMockEventBus();
      const map = makeMockAgentWorkflowMap('wf-xyz');
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: map });

      await handler(makeMockEvent(), {
        agent_id: 'a1',
        agent_type: 'engineer',
        output: '',
      });

      const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown>;
      expect(data.workflow_id).toBe('wf-xyz');
    });

    it('uses "unknown" as fallback when agent_id is missing', async () => {
      const eventBus = makeMockEventBus();
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });

      await handler(makeMockEvent(), { agent_type: 'engineer', output: '' });

      const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      const payload = emittedEvent.payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown>;
      expect(data.agent_id).toBe('unknown');
    });

    it('does not emit when eventBus is null', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'a1',
        agent_type: 'engineer',
        output: '',
      });

      expect(result).toBeNull();
    });

    it('returns null even when eventBus.emit throws', async () => {
      const eventBus = makeMockEventBus();
      (eventBus.emit as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('emit failed');
      });
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'a1',
        agent_type: 'engineer',
        output: '',
      });

      // Should not propagate error — just log and return null
      expect(result).toBeNull();
    });
  });

  // ── Reviewer agents — quality gate ────────────────────────────────────────

  describe('reviewer quality gate', () => {
    it('blocks when review score is below the default minimum', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });
      const lowScore = DEFAULT_MIN_REVIEW_SCORE - 1;

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: makeGvOutput(lowScore),
      });

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('block');
      expect(result?.reason).toContain(String(lowScore));
      expect(result?.reason).toContain(String(DEFAULT_MIN_REVIEW_SCORE));
    });

    it('does not block when review score meets the default minimum', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: makeGvOutput(DEFAULT_MIN_REVIEW_SCORE),
      });

      expect(result).toBeNull();
    });

    it('does not block when review score exceeds the default minimum', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: makeGvOutput(10),
      });

      expect(result).toBeNull();
    });

    it('uses custom minReviewScore when provided', async () => {
      const handler = createSubagentStopHandler({
        eventBus: null,
        agentWorkflowMap: null,
        minReviewScore: 7,
      });

      // Score 6 is below custom threshold of 7 — should block
      const blockedResult = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: makeGvOutput(6),
      });
      expect(blockedResult?.decision).toBe('block');

      // Score 7 meets custom threshold — should not block
      const passedResult = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: makeGvOutput(7),
      });
      expect(passedResult).toBeNull();
    });

    it('does not block when reviewer output has no <gv> tag', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: 'review complete but no gv tag',
      });

      expect(result).toBeNull();
    });

    it('does not block when <gv> tag has no score field', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: '<gv>{"files": [], "count": 3}</gv>',
      });

      expect(result).toBeNull();
    });

    it('does not block when <gv> tag has malformed JSON', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: '<gv>{ not valid json }</gv>',
      });

      expect(result).toBeNull();
    });

    it('handles goodvibes:reviewer agent type as a reviewer', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r2',
        agent_type: 'goodvibes:reviewer',
        output: makeGvOutput(1),
      });

      expect(result?.decision).toBe('block');
    });

    it('does not apply quality gate to non-reviewer types (engineer)', async () => {
      const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });

      // Engineer with very low score should not block
      const result = await handler(makeMockEvent(), {
        agent_id: 'e1',
        agent_type: 'engineer',
        output: makeGvOutput(1),
      });

      expect(result).toBeNull();
    });

    it('blocks reviewer but still emits agent:completed when eventBus available', async () => {
      const eventBus = makeMockEventBus();
      const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });

      const result = await handler(makeMockEvent(), {
        agent_id: 'r1',
        agent_type: 'reviewer',
        output: makeGvOutput(1),
      });

      // Quality gate fires first: block is returned, emit still happens
      expect(result?.decision).toBe('block');
      // emit is NOT called because block returns early before the emit block
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
