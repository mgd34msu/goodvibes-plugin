/**
 * SubagentStart Handler Tests
 *
 * Tests for WRFC workflow binding injection on agent spawn.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSubagentStartHandler } from '../../handlers/subagent-start.js';
import type { HookEvent } from '../../../../extensions/events/factories.js';
import type { AgentWorkflowMap } from '../../../../extensions/directives/agent-workflow-map.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockEvent(session_id = 'session-1'): HookEvent {
  return {
    id: 'evt-1',
    timestamp: Date.now(),
    type: 'hook',
    source: { kind: 'hook', hook_name: 'subagent_start' },
    hook_type: 'SubagentStart',
    hook_input: {},
    session_id,
    payload: { type: 'hook', data: {} },
    priority: 0,
    context: {},
  } as unknown as HookEvent;
}

function makeMockAgentWorkflowMap(overrides: Partial<{
  resolvePendingBind: (agentType: string) => string | null;
  bind: (agentId: string, workflowId: string) => void;
  lookup: (agentId: string) => string | null;
}> = {}): AgentWorkflowMap {
  return {
    resolvePendingBind: vi.fn(() => null),
    bind: vi.fn(),
    lookup: vi.fn(() => null),
    ...overrides,
  } as unknown as AgentWorkflowMap;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createSubagentStartHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── null agentWorkflowMap ─────────────────────────────────────────────────

  it('returns null when agentWorkflowMap is null', async () => {
    const handler = createSubagentStartHandler({ agentWorkflowMap: null });
    const result = await handler(makeMockEvent(), { agent_id: 'a1', agent_type: 'engineer' });
    expect(result).toBeNull();
  });

  // ── incoming workflow_id in input ──────────────────────────────────────────

  it('uses workflow_id from input when provided, skips resolvePendingBind', async () => {
    const map = makeMockAgentWorkflowMap();
    const handler = createSubagentStartHandler({ agentWorkflowMap: map });

    const result = await handler(makeMockEvent(), {
      agent_id: 'a1',
      agent_type: 'engineer',
      workflow_id: 'wf-from-input',
    });

    expect(map.resolvePendingBind).not.toHaveBeenCalled();
    expect(map.bind).toHaveBeenCalledWith('a1', 'wf-from-input');
    expect(result).not.toBeNull();
    expect(result?.additionalContext).toContain('workflow_bind');
    expect(result?.additionalContext).toContain('wf-from-input');
  });

  it('wraps workflow binding in <gv> tag', async () => {
    const handler = createSubagentStartHandler({
      agentWorkflowMap: makeMockAgentWorkflowMap(),
    });

    const result = await handler(makeMockEvent(), {
      agent_id: 'a1',
      agent_type: 'engineer',
      workflow_id: 'wf-123',
    });

    expect(result?.additionalContext).toMatch(/^<gv>.*<\/gv>$/);
    const inner = result?.additionalContext?.replace(/<\/?gv>/g, '') ?? '';
    const parsed = JSON.parse(inner) as Record<string, unknown>;
    expect(parsed).toEqual({ action: 'workflow_bind', workflow_id: 'wf-123' });
  });

  // ── fallback to resolvePendingBind ─────────────────────────────────────────

  it('falls back to resolvePendingBind when no workflow_id in input', async () => {
    const map = makeMockAgentWorkflowMap({
      resolvePendingBind: vi.fn(() => 'wf-pending'),
    });
    const handler = createSubagentStartHandler({ agentWorkflowMap: map });

    const result = await handler(makeMockEvent(), {
      agent_id: 'a2',
      agent_type: 'engineer',
    });

    expect(map.resolvePendingBind).toHaveBeenCalledWith('engineer');
    expect(map.bind).toHaveBeenCalledWith('a2', 'wf-pending');
    expect(result?.additionalContext).toContain('wf-pending');
  });

  it('returns null when resolvePendingBind finds no match', async () => {
    const handler = createSubagentStartHandler({
      agentWorkflowMap: makeMockAgentWorkflowMap({ resolvePendingBind: vi.fn(() => null) }),
    });

    const result = await handler(makeMockEvent(), {
      agent_id: 'a3',
      agent_type: 'engineer',
    });

    expect(result).toBeNull();
  });

  // ── missing agentType ──────────────────────────────────────────────────────

  it('returns null when no workflow_id and no agent_type', async () => {
    const map = makeMockAgentWorkflowMap();
    const handler = createSubagentStartHandler({ agentWorkflowMap: map });

    const result = await handler(makeMockEvent(), { agent_id: 'a4' });

    expect(map.resolvePendingBind).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  // ── missing agentId ────────────────────────────────────────────────────────

  it('skips bind() when agent_id is missing but still returns context', async () => {
    const map = makeMockAgentWorkflowMap();
    const handler = createSubagentStartHandler({ agentWorkflowMap: map });

    const result = await handler(makeMockEvent(), {
      agent_type: 'engineer',
      workflow_id: 'wf-456',
    });

    expect(map.bind).not.toHaveBeenCalled();
    expect(result?.additionalContext).toContain('wf-456');
  });

  // ── empty string workflow_id ───────────────────────────────────────────────

  it('treats empty string workflow_id as absent and falls back to resolvePendingBind', async () => {
    const map = makeMockAgentWorkflowMap({
      resolvePendingBind: vi.fn(() => 'wf-fallback'),
    });
    const handler = createSubagentStartHandler({ agentWorkflowMap: map });

    const result = await handler(makeMockEvent(), {
      agent_id: 'a5',
      agent_type: 'engineer',
      workflow_id: '',
    });

    expect(map.resolvePendingBind).toHaveBeenCalledWith('engineer');
    expect(result?.additionalContext).toContain('wf-fallback');
  });

  // ── non-string workflow_id ──────────────────────────────────────────────────

  it('treats non-string workflow_id as absent', async () => {
    const map = makeMockAgentWorkflowMap({
      resolvePendingBind: vi.fn(() => null),
    });
    const handler = createSubagentStartHandler({ agentWorkflowMap: map });

    const result = await handler(makeMockEvent(), {
      agent_id: 'a6',
      agent_type: 'engineer',
      workflow_id: 42,
    });

    expect(map.resolvePendingBind).toHaveBeenCalledWith('engineer');
    expect(result).toBeNull();
  });
});
