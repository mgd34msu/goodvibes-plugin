/**
 * Hook Processing Plugin Tests — Layer 3
 *
 * Comprehensive unit tests for the Hook Processing plugin:
 *   - hook-processor.ts: HookProcessor.process(), normalizeHookName(), mergeResponses()
 *   - hook-registry.ts: HookRegistry.register(), getHandlers(), enable(), disable()
 *   - handlers/pre-tool-use.ts: blocks deprecated native tools
 *   - handlers/subagent-start.ts: resolves pending WRFC bindings
 *   - handlers/subagent-stop.ts: quality gate, score extraction, agent:completed event
 *   - handlers/session-start.ts: emits session:started
 *   - handlers/session-end.ts: emits session:ended
 *   - handlers/pre-compact.ts: emits session:compact, snapshot state
 *   - handlers/post-tool-use.ts: tracks file modifications
 *   - handlers/user-prompt-submit.ts: drains directive queue on task-notification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HookProcessor } from '../hooks/hook-processor.js';
import { HookRegistry } from '../hooks/hook-registry.js';
import type { RegisteredHandler } from '../hooks/hook-registry.js';
import type { ClaudeHookResponse } from '../hooks/hook-processor.js';
import { handlePreToolUse } from '../hooks/handlers/pre-tool-use.js';
import { createSubagentStartHandler } from '../hooks/handlers/subagent-start.js';
import { createSubagentStopHandler } from '../hooks/handlers/subagent-stop.js';
import { createSessionStartHandler } from '../hooks/handlers/session-start.js';
import { createSessionEndHandler } from '../hooks/handlers/session-end.js';
import { createPreCompactHandler } from '../hooks/handlers/pre-compact.js';
import { createPostToolUseHandler } from '../hooks/handlers/post-tool-use.js';
import { createUserPromptSubmitHandler } from '../hooks/handlers/user-prompt-submit.js';

import { createHookEvent } from '../../extensions/events/hook-event.js';
import type { HookEvent, HookType } from '../../extensions/events/hook-event.js';

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a minimal HookEvent for testing handlers directly.
 */
function makeHookEvent(
  hookType: HookType = 'PreToolUse',
  input: Record<string, unknown> = {},
  sessionId: string = 'session-test',
): HookEvent {
  return createHookEvent({
    hook_type: hookType,
    hook_input: input,
    session_id: sessionId,
  });
}

/**
 * Creates a minimal RegisteredHandler entry.
 */
function makeHandler(
  id: string,
  hookType: HookType,
  handler: RegisteredHandler['handler'],
  priority = 50,
  enabled = true,
): RegisteredHandler {
  return { id, hook_type: hookType, handler, priority, enabled };
}

// ─── HookRegistry ─────────────────────────────────────────────────────────────

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('registers a handler and returns it via getHandlers', () => {
    const handler = makeHandler('h1', 'PreToolUse', async () => null);
    registry.register(handler);
    const handlers = registry.getHandlers('PreToolUse');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!.id).toBe('h1');
  });

  it('maintains priority-descending order on insert', () => {
    registry.register(makeHandler('low', 'PreToolUse', async () => null, 10));
    registry.register(makeHandler('high', 'PreToolUse', async () => null, 90));
    registry.register(makeHandler('mid', 'PreToolUse', async () => null, 50));

    const handlers = registry.getHandlers('PreToolUse');
    expect(handlers.map((h) => h.id)).toEqual(['high', 'mid', 'low']);
  });

  it('deduplicates handlers by ID (replaces on re-register)', () => {
    const handler1 = makeHandler('h1', 'PreToolUse', async () => null, 50);
    const handler2 = makeHandler('h1', 'PreToolUse', async () => ({ decision: 'allow' as const }), 80);
    registry.register(handler1);
    registry.register(handler2);
    const handlers = registry.getHandlers('PreToolUse');
    expect(handlers).toHaveLength(1);
    // The new handler (priority 80) should be registered
    expect(handlers[0]!.priority).toBe(80);
  });

  it('getHandlers returns only enabled handlers', () => {
    registry.register(makeHandler('enabled', 'PostToolUse', async () => null, 50, true));
    registry.register(makeHandler('disabled', 'PostToolUse', async () => null, 50, false));
    const handlers = registry.getHandlers('PostToolUse');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!.id).toBe('enabled');
  });

  it('getHandlers returns empty array for unknown hook type', () => {
    expect(registry.getHandlers('SessionStart')).toEqual([]);
  });

  it('enable restores a disabled handler', () => {
    registry.register(makeHandler('h1', 'SessionEnd', async () => null, 50, false));
    expect(registry.getHandlers('SessionEnd')).toHaveLength(0);
    registry.enable('h1');
    expect(registry.getHandlers('SessionEnd')).toHaveLength(1);
  });

  it('disable removes handler from getHandlers without unregistering', () => {
    registry.register(makeHandler('h1', 'SubagentStop', async () => null));
    registry.disable('h1');
    expect(registry.getHandlers('SubagentStop')).toHaveLength(0);
    // Should still be in registry (just disabled)
    expect(registry.count('SubagentStop')).toBe(1);
  });

  it('enable is a no-op for unknown handler id', () => {
    expect(() => registry.enable('nonexistent')).not.toThrow();
  });

  it('disable is a no-op for unknown handler id', () => {
    expect(() => registry.disable('nonexistent')).not.toThrow();
  });

  it('unregister removes handler and returns true', () => {
    registry.register(makeHandler('h1', 'PreToolUse', async () => null));
    expect(registry.unregister('h1')).toBe(true);
    expect(registry.getHandlers('PreToolUse')).toHaveLength(0);
    expect(registry.count('PreToolUse')).toBe(0);
  });

  it('unregister returns false for unknown id', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('count returns total handlers when no hookType provided', () => {
    registry.register(makeHandler('h1', 'PreToolUse', async () => null));
    registry.register(makeHandler('h2', 'PostToolUse', async () => null));
    expect(registry.count()).toBe(2);
  });

  it('count returns per-hook-type count', () => {
    registry.register(makeHandler('h1', 'PreToolUse', async () => null));
    registry.register(makeHandler('h2', 'PreToolUse', async () => null));
    registry.register(makeHandler('h3', 'PostToolUse', async () => null));
    expect(registry.count('PreToolUse')).toBe(2);
    expect(registry.count('PostToolUse')).toBe(1);
  });
});

// ─── HookProcessor: normalizeHookName ──────────────────────────────────────────────

describe('HookProcessor: hook name normalisation', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('accepts PascalCase hook names directly', async () => {
    let called = false;
    registry.register(makeHandler('h1', 'PreToolUse', async () => { called = true; return null; }));
    const processor = new HookProcessor({ registry, sessionId: 'sid' });
    await processor.process('PreToolUse', {});
    expect(called).toBe(true);
  });

  it('converts snake_case hook names to PascalCase', async () => {
    let called = false;
    registry.register(makeHandler('h1', 'PreToolUse', async () => { called = true; return null; }));
    const processor = new HookProcessor({ registry, sessionId: 'sid' });
    await processor.process('pre_tool_use', {});
    expect(called).toBe(true);
  });

  it('handles SubagentStop snake_case conversion', async () => {
    let called = false;
    registry.register(makeHandler('h1', 'SubagentStop', async () => { called = true; return null; }));
    const processor = new HookProcessor({ registry, sessionId: 'sid' });
    await processor.process('subagent_stop', {});
    expect(called).toBe(true);
  });

  it('returns empty response for unknown hook name', async () => {
    const processor = new HookProcessor({ registry, sessionId: 'sid' });
    const result = await processor.process('UnknownHookType', {});
    expect(result).toEqual({});
  });

  it('returns empty response when no handlers registered for the hook', async () => {
    const processor = new HookProcessor({ registry, sessionId: 'sid' });
    const result = await processor.process('PreToolUse', {});
    expect(result).toEqual({});
  });
});

// ─── HookProcessor: mergeResponses ────────────────────────────────────────────────

describe('HookProcessor: response merging', () => {
  let registry: HookRegistry;
  let processor: HookProcessor;

  beforeEach(() => {
    registry = new HookRegistry();
    processor = new HookProcessor({ registry, sessionId: 'sid' });
  });

  async function processWithHandlers(
    responses: Array<ClaudeHookResponse | null>,
  ): Promise<ClaudeHookResponse> {
    responses.forEach((resp, i) => {
      registry.register(
        makeHandler(`h${i}`, 'PreToolUse', async () => resp, 50 - i),
      );
    });
    return processor.process('PreToolUse', {});
  }

  it('returns empty when all handlers return null', async () => {
    const result = await processWithHandlers([null, null]);
    expect(result).toEqual({});
  });

  it('returns the single non-null response directly', async () => {
    const result = await processWithHandlers([null, { decision: 'allow' }, null]);
    expect(result.decision).toBe('allow');
  });

  it('block wins over allow', async () => {
    const result = await processWithHandlers([
      { decision: 'allow', reason: 'ok' },
      { decision: 'block', reason: 'not ok' },
    ]);
    expect(result.decision).toBe('block');
    expect(result.reason).toContain('not ok');
  });

  it('concatenates block reasons with semicolon', async () => {
    const result = await processWithHandlers([
      { decision: 'block', reason: 'reason A' },
      { decision: 'block', reason: 'reason B' },
    ]);
    expect(result.decision).toBe('block');
    expect(result.reason).toContain('reason A');
    expect(result.reason).toContain('reason B');
    expect(result.reason).toContain('; ');
  });

  it('concatenates additionalContext with double newline', async () => {
    const result = await processWithHandlers([
      { additionalContext: 'context A' },
      { additionalContext: 'context B' },
    ]);
    expect(result.additionalContext).toContain('context A');
    expect(result.additionalContext).toContain('context B');
    expect(result.additionalContext).toContain('\n\n');
  });

  it('hookSpecificOutput last non-null value wins', async () => {
    const result = await processWithHandlers([
      { hookSpecificOutput: { source: 'first' } },
      { hookSpecificOutput: { source: 'second' } },
    ]);
    // Last one registered has lower priority (50-1=49), runs second
    // mergeResponses iterates in order so the last value written wins
    expect(result.hookSpecificOutput).toEqual({ source: 'second' });
  });

  it('suppressOutput true wins over false', async () => {
    const result = await processWithHandlers([
      { suppressOutput: false },
      { suppressOutput: true },
    ]);
    expect(result.suppressOutput).toBe(true);
  });

  it('allow decision from first responder is carried when no block', async () => {
    const result = await processWithHandlers([
      { decision: 'allow', reason: 'green light' },
      { additionalContext: 'extra' },
    ]);
    expect(result.decision).toBe('allow');
  });

  it('handler error is caught and does not prevent other handlers from running', async () => {
    registry.register(
      makeHandler('throw-handler', 'PreToolUse', async () => { throw new Error('boom'); }, 60),
    );
    registry.register(
      makeHandler('good-handler', 'PreToolUse', async () => ({ decision: 'allow' as const }), 50),
    );
    const result = await processor.process('PreToolUse', {});
    expect(result.decision).toBe('allow');
  });
});

// ─── handlePreToolUse ─────────────────────────────────────────────────────────────

describe('handlePreToolUse', () => {
  const event = makeHookEvent('PreToolUse');

  it('blocks the Read tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Read' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_read');
  });

  it('blocks the Write tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Write' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_write');
  });

  it('blocks the Edit tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Edit' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_edit');
  });

  it('blocks the Grep tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Grep' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_grep');
  });

  it('blocks the Glob tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Glob' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_glob');
  });

  it('blocks the WebFetch tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'WebFetch' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_fetch');
  });

  it('blocks the Update tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Update' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_edit');
  });

  it('blocks the NotebookEdit tool', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'NotebookEdit' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('precision_notebook');
  });

  it('returns null for allowed tools', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'precision_read' });
    expect(result).toBeNull();
  });

  it('returns null when tool_name is absent', async () => {
    const result = await handlePreToolUse(event, {});
    expect(result).toBeNull();
  });

  it('returns null when tool_name is not a string', async () => {
    const result = await handlePreToolUse(event, { tool_name: 42 });
    expect(result).toBeNull();
  });

  it('block reason references the tool name', async () => {
    const result = await handlePreToolUse(event, { tool_name: 'Read' });
    expect(result?.reason).toContain('Read');
  });
});

// ─── createSubagentStartHandler ─────────────────────────────────────────────────────

describe('createSubagentStartHandler', () => {
  it('returns null when agentType is missing', async () => {
    const handler = createSubagentStartHandler({ agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStart');
    const result = await handler(event, { agent_id: 'a1' });
    expect(result).toBeNull();
  });

  it('returns null when agentWorkflowMap is null', async () => {
    const handler = createSubagentStartHandler({ agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStart');
    const result = await handler(event, { agent_id: 'a1', agent_type: 'engineer' });
    expect(result).toBeNull();
  });

  it('returns null when no pending bind for agent type', async () => {
    const agentWorkflowMap = {
      resolvePendingBind: vi.fn(() => null),
      bind: vi.fn(),
    };
    const handler = createSubagentStartHandler({ agentWorkflowMap } as Parameters<typeof createSubagentStartHandler>[0]);
    const event = makeHookEvent('SubagentStart');
    const result = await handler(event, { agent_id: 'a1', agent_type: 'engineer' });
    expect(result).toBeNull();
    expect(agentWorkflowMap.resolvePendingBind).toHaveBeenCalledWith('engineer');
  });

  it('returns additionalContext with workflow_id when pending bind resolves', async () => {
    const workflowId = 'wrfc_test';
    const agentWorkflowMap = {
      resolvePendingBind: vi.fn(() => workflowId),
      bind: vi.fn(),
    };
    const handler = createSubagentStartHandler({ agentWorkflowMap } as Parameters<typeof createSubagentStartHandler>[0]);
    const event = makeHookEvent('SubagentStart');
    const result = await handler(event, { agent_id: 'agent-123', agent_type: 'reviewer' });

    expect(result).not.toBeNull();
    expect(result!.additionalContext).toContain(workflowId);
    expect(result!.additionalContext).toContain('workflow_bind');
    expect(agentWorkflowMap.bind).toHaveBeenCalledWith('agent-123', workflowId);
  });

  it('does not call bind when agent_id is missing', async () => {
    const workflowId = 'wrfc_test';
    const agentWorkflowMap = {
      resolvePendingBind: vi.fn(() => workflowId),
      bind: vi.fn(),
    };
    const handler = createSubagentStartHandler({ agentWorkflowMap } as Parameters<typeof createSubagentStartHandler>[0]);
    const event = makeHookEvent('SubagentStart');
    await handler(event, { agent_type: 'reviewer' });
    expect(agentWorkflowMap.bind).not.toHaveBeenCalled();
  });

  it('additionalContext is a valid <gv> JSON tag', async () => {
    const workflowId = 'wf-abc';
    const agentWorkflowMap = {
      resolvePendingBind: vi.fn(() => workflowId),
      bind: vi.fn(),
    };
    const handler = createSubagentStartHandler({ agentWorkflowMap } as Parameters<typeof createSubagentStartHandler>[0]);
    const event = makeHookEvent('SubagentStart');
    const result = await handler(event, { agent_id: 'x', agent_type: 'engineer' });
    expect(result!.additionalContext).toMatch(/^<gv>.*<\/gv>$/);
    const json = result!.additionalContext!.replace(/<\/?gv>/g, '');
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

// ─── createSubagentStopHandler ─────────────────────────────────────────────────────

describe('createSubagentStopHandler', () => {
  it('blocks when reviewer score is below threshold', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null, minReviewScore: 9.5 });
    const event = makeHookEvent('SubagentStop');
    const result = await handler(event, {
      agent_id: 'rev-01',
      agent_type: 'reviewer',
      output: '<gv>{"score": 7.0}</gv>',
    });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('7');
    expect(result?.reason).toContain('9.5');
  });

  it('blocks when goodvibes:reviewer score is below threshold', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null, minReviewScore: 9.5 });
    const event = makeHookEvent('SubagentStop');
    const result = await handler(event, {
      agent_id: 'rev-01',
      agent_type: 'goodvibes:reviewer',
      output: '<gv>{"score": 8.0}</gv>',
    });
    expect(result?.decision).toBe('block');
  });

  it('does not block when reviewer score meets threshold', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null, minReviewScore: 9.5 });
    const event = makeHookEvent('SubagentStop');
    const result = await handler(event, {
      agent_id: 'rev-01',
      agent_type: 'reviewer',
      output: '<gv>{"score": 9.5}</gv>',
    });
    expect(result).toBeNull();
  });

  it('does not block when reviewer has no parseable score', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStop');
    const result = await handler(event, {
      agent_id: 'rev-01',
      agent_type: 'reviewer',
      output: 'No score found here',
    });
    expect(result).toBeNull();
  });

  it('returns null for non-reviewer agents (quality gate skipped)', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStop');
    const result = await handler(event, {
      agent_id: 'eng-01',
      agent_type: 'engineer',
      output: '<gv>{"score": 3.0}</gv>',
    });
    // Engineers are not quality-gated — the quality gate only applies to reviewers
    expect(result).toBeNull();
  });

  it('emits agent:completed event via eventBus', async () => {
    const mockEmit = vi.fn();
    const eventBus = { emit: mockEmit } as Parameters<typeof createSubagentStopHandler>[0]['eventBus'];
    const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStop');
    await handler(event, { agent_id: 'a1', agent_type: 'engineer', output: '' });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const emittedEvent = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(emittedEvent['type']).toBe('agent:completed');
  });

  it('does not throw when eventBus is null', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStop');
    await expect(
      handler(event, { agent_id: 'a1', agent_type: 'engineer', output: '' }),
    ).resolves.toBeNull();
  });

  it('includes workflow_id from agentWorkflowMap.lookup in emitted event', async () => {
    const mockEmit = vi.fn();
    const eventBus = { emit: mockEmit } as Parameters<typeof createSubagentStopHandler>[0]['eventBus'];
    const agentWorkflowMap = { lookup: vi.fn(() => 'wrfc_test') } as Parameters<typeof createSubagentStopHandler>[0]['agentWorkflowMap'];
    const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap });
    const event = makeHookEvent('SubagentStop');
    await handler(event, { agent_id: 'a1', agent_type: 'engineer', output: '' });

    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    const payload = emitted['payload'] as Record<string, unknown>;
    const data = (payload['data'] as Record<string, unknown>);
    expect(data['workflow_id']).toBe('wrfc_test');
  });

  it('catches and logs errors from eventBus.emit without throwing', async () => {
    const eventBus = { emit: vi.fn(() => { throw new Error('emit failed'); }) } as Parameters<typeof createSubagentStopHandler>[0]['eventBus'];
    const handler = createSubagentStopHandler({ eventBus, agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStop');
    await expect(
      handler(event, { agent_id: 'a1', agent_type: 'engineer', output: '' }),
    ).resolves.toBeNull();
  });

  it('uses DEFAULT_MIN_REVIEW_SCORE (9.5) when minReviewScore not provided', async () => {
    const handler = createSubagentStopHandler({ eventBus: null, agentWorkflowMap: null });
    const event = makeHookEvent('SubagentStop');
    const result = await handler(event, {
      agent_id: 'rev-01',
      agent_type: 'reviewer',
      output: '<gv>{"score": 9.0}</gv>',
    });
    // 9.0 < 9.5 default — should block
    expect(result?.decision).toBe('block');
  });
});

// ─── createSessionStartHandler ─────────────────────────────────────────────────────

describe('createSessionStartHandler', () => {
  it('emits session:started event with correct type', async () => {
    const mockEmit = vi.fn();
    const handler = createSessionStartHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createSessionStartHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionStart', { cwd: '/project' }, 'session-1');
    await handler(event, { cwd: '/project' });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(emitted['type']).toBe('session:started');
  });

  it('uses cwd from hook input', async () => {
    const mockEmit = vi.fn();
    const handler = createSessionStartHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createSessionStartHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionStart', {}, 'session-1');
    await handler(event, { cwd: '/my/project' });

    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    const payload = (emitted['payload'] as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(payload['cwd']).toBe('/my/project');
  });

  it('detects justvibes mode from input', async () => {
    const mockEmit = vi.fn();
    const handler = createSessionStartHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createSessionStartHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionStart', {}, 'session-1');
    await handler(event, { mode: 'justvibes' });

    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    const payload = (emitted['payload'] as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(payload['mode']).toBe('justvibes');
  });

  it('returns null regardless', async () => {
    const handler = createSessionStartHandler({ eventBus: { emit: vi.fn() } as Parameters<typeof createSessionStartHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionStart');
    const result = await handler(event, {});
    expect(result).toBeNull();
  });

  it('does not throw when eventBus is null', async () => {
    const handler = createSessionStartHandler({ eventBus: null });
    const event = makeHookEvent('SessionStart');
    await expect(handler(event, {})).resolves.toBeNull();
  });

  it('catches errors from eventBus.emit without throwing', async () => {
    const eventBus = { emit: vi.fn(() => { throw new Error('bus error'); }) } as Parameters<typeof createSessionStartHandler>[0]['eventBus'];
    const handler = createSessionStartHandler({ eventBus });
    const event = makeHookEvent('SessionStart');
    await expect(handler(event, {})).resolves.toBeNull();
  });
});

// ─── createSessionEndHandler ───────────────────────────────────────────────────────

describe('createSessionEndHandler', () => {
  it('emits session:ended event', async () => {
    const mockEmit = vi.fn();
    const handler = createSessionEndHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createSessionEndHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionEnd', {}, 'session-2');
    await handler(event, {});

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(emitted['type']).toBe('session:ended');
  });

  it('includes session_id in emitted event payload', async () => {
    const mockEmit = vi.fn();
    const handler = createSessionEndHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createSessionEndHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionEnd', {}, 'session-XYZ');
    await handler(event, {});

    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    const data = ((emitted['payload'] as Record<string, unknown>)['data'] as Record<string, unknown>);
    expect(data['session_id']).toBe('session-XYZ');
  });

  it('returns null', async () => {
    const handler = createSessionEndHandler({ eventBus: { emit: vi.fn() } as Parameters<typeof createSessionEndHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionEnd');
    const result = await handler(event, {});
    expect(result).toBeNull();
  });

  it('does not throw when eventBus is null', async () => {
    const handler = createSessionEndHandler({ eventBus: null });
    const event = makeHookEvent('SessionEnd');
    await expect(handler(event, {})).resolves.toBeNull();
  });

  it('catches errors from eventBus.emit', async () => {
    const handler = createSessionEndHandler({ eventBus: { emit: vi.fn(() => { throw new Error('x'); }) } as Parameters<typeof createSessionEndHandler>[0]['eventBus'] });
    const event = makeHookEvent('SessionEnd');
    await expect(handler(event, {})).resolves.toBeNull();
  });
});

// ─── createPreCompactHandler ───────────────────────────────────────────────────────

describe('createPreCompactHandler', () => {
  it('emits session:compact event', async () => {
    const mockEmit = vi.fn();
    const handler = createPreCompactHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createPreCompactHandler>[0]['eventBus'] });
    const event = makeHookEvent('PreCompact', {}, 'session-3');
    await handler(event, {});

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(emitted['type']).toBe('session:compact');
  });

  it('returns null when no snapshot callback provided', async () => {
    const handler = createPreCompactHandler({ eventBus: { emit: vi.fn() } as Parameters<typeof createPreCompactHandler>[0]['eventBus'] });
    const event = makeHookEvent('PreCompact');
    const result = await handler(event, {});
    expect(result).toBeNull();
  });

  it('returns null when snapshot returns empty object', async () => {
    const handler = createPreCompactHandler({
      eventBus: { emit: vi.fn() } as Parameters<typeof createPreCompactHandler>[0]['eventBus'],
      snapshotState: () => ({}),
    });
    const event = makeHookEvent('PreCompact');
    const result = await handler(event, {});
    expect(result).toBeNull();
  });

  it('returns additionalContext with state snapshot when snapshot is non-empty', async () => {
    const handler = createPreCompactHandler({
      eventBus: { emit: vi.fn() } as Parameters<typeof createPreCompactHandler>[0]['eventBus'],
      snapshotState: () => ({ wrfc: { phase: 'REVIEWING' } }),
    });
    const event = makeHookEvent('PreCompact');
    const result = await handler(event, {});
    expect(result?.additionalContext).toContain('state_snapshot');
    expect(result?.additionalContext).toContain('REVIEWING');
  });

  it('does not throw when eventBus is null', async () => {
    const handler = createPreCompactHandler({ eventBus: null });
    const event = makeHookEvent('PreCompact');
    await expect(handler(event, {})).resolves.toBeNull();
  });

  it('catches errors from eventBus.emit', async () => {
    const handler = createPreCompactHandler({ eventBus: { emit: vi.fn(() => { throw new Error('x'); }) } as Parameters<typeof createPreCompactHandler>[0]['eventBus'] });
    const event = makeHookEvent('PreCompact');
    await expect(handler(event, {})).resolves.toBeNull();
  });
});

// ─── createPostToolUseHandler ───────────────────────────────────────────────────────

describe('createPostToolUseHandler', () => {
  it('returns null when no tool_name in input', async () => {
    const handler = createPostToolUseHandler({ eventBus: { emit: vi.fn() } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    const result = await handler(event, {});
    expect(result).toBeNull();
  });

  it('returns null when eventBus is null', async () => {
    const handler = createPostToolUseHandler({ eventBus: null });
    const event = makeHookEvent('PostToolUse');
    const result = await handler(event, { tool_name: 'precision_write' });
    expect(result).toBeNull();
  });

  it('emits file:modified for precision_write with files array in result', async () => {
    const mockEmit = vi.fn();
    const handler = createPostToolUseHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    await handler(event, {
      tool_name: 'precision_write',
      tool_result: { files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] },
    });
    expect(mockEmit).toHaveBeenCalledTimes(2);
    const types = mockEmit.mock.calls.map((c) => (c[0] as Record<string, unknown>)['type']);
    expect(types).toEqual(['file:modified', 'file:modified']);
  });

  it('emits file:modified for precision_edit', async () => {
    const mockEmit = vi.fn();
    const handler = createPostToolUseHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    await handler(event, {
      tool_name: 'precision_edit',
      tool_result: { files: [{ path: 'src/c.ts' }] },
    });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    const data = ((emitted['payload'] as Record<string, unknown>)['data'] as Record<string, unknown>);
    expect(data['path']).toBe('src/c.ts');
  });

  it('does not emit for non-file-write tools', async () => {
    const mockEmit = vi.fn();
    const handler = createPostToolUseHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    await handler(event, { tool_name: 'precision_read', tool_result: { files: [{ path: 'x.ts' }] } });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('falls back to tool_input path when tool_result has no files array', async () => {
    const mockEmit = vi.fn();
    const handler = createPostToolUseHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    await handler(event, {
      tool_name: 'precision_write',
      tool_result: {},
      tool_input: { path: 'src/fallback.ts' },
    });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const emitted = mockEmit.mock.calls[0]![0] as Record<string, unknown>;
    const data = ((emitted['payload'] as Record<string, unknown>)['data'] as Record<string, unknown>);
    expect(data['path']).toBe('src/fallback.ts');
  });

  it('falls back to tool_input file_path when path is absent', async () => {
    const mockEmit = vi.fn();
    const handler = createPostToolUseHandler({ eventBus: { emit: mockEmit } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    await handler(event, {
      tool_name: 'precision_write',
      tool_result: {},
      tool_input: { file_path: 'src/alt.ts' },
    });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const data = (((mockEmit.mock.calls[0]![0] as Record<string, unknown>)['payload'] as Record<string, unknown>)['data'] as Record<string, unknown>);
    expect(data['path']).toBe('src/alt.ts');
  });

  it('catches errors from eventBus.emit', async () => {
    const eventBus = { emit: vi.fn(() => { throw new Error('boom'); }) } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'];
    const handler = createPostToolUseHandler({ eventBus });
    const event = makeHookEvent('PostToolUse');
    await expect(
      handler(event, { tool_name: 'precision_write', tool_result: { files: [{ path: 'x.ts' }] } }),
    ).resolves.toBeNull();
  });

  it('returns null (never blocks or modifies response)', async () => {
    const handler = createPostToolUseHandler({ eventBus: { emit: vi.fn() } as Parameters<typeof createPostToolUseHandler>[0]['eventBus'] });
    const event = makeHookEvent('PostToolUse');
    const result = await handler(event, { tool_name: 'precision_write', tool_result: {} });
    expect(result).toBeNull();
  });
});

// ─── createUserPromptSubmitHandler ────────────────────────────────────────────────────

describe('createUserPromptSubmitHandler', () => {
  it('returns null for non-task-notification prompts', async () => {
    const handler = createUserPromptSubmitHandler({ directiveQueue: null });
    const event = makeHookEvent('UserPromptSubmit');
    const result = await handler(event, { prompt: 'Hello, how are you?' });
    expect(result).toBeNull();
  });

  it('returns null when directiveQueue is null', async () => {
    const handler = createUserPromptSubmitHandler({ directiveQueue: null });
    const event = makeHookEvent('UserPromptSubmit');
    const result = await handler(event, { prompt: 'some <task-notification> here' });
    expect(result).toBeNull();
  });

  it('returns null when directive queue is empty', async () => {
    const directiveQueue = { drain: vi.fn(() => []) } as Parameters<typeof createUserPromptSubmitHandler>[0]['directiveQueue'];
    const handler = createUserPromptSubmitHandler({ directiveQueue });
    const event = makeHookEvent('UserPromptSubmit');
    const result = await handler(event, { prompt: '<task-notification>' });
    expect(result).toBeNull();
    expect(directiveQueue!.drain).toHaveBeenCalledWith('subagent_stop');
  });

  it('returns hookSpecificOutput with directives when queue has items', async () => {
    const directives = [{ action: 'spawn', wid: 'w1', type: 'reviewer', task: 'Review it' }];
    const directiveQueue = { drain: vi.fn(() => directives) } as Parameters<typeof createUserPromptSubmitHandler>[0]['directiveQueue'];
    const handler = createUserPromptSubmitHandler({ directiveQueue });
    const event = makeHookEvent('UserPromptSubmit');
    const result = await handler(event, { prompt: 'Agent completed <task-notification>' });

    expect(result).not.toBeNull();
    expect(result!.hookSpecificOutput).toBeDefined();
    expect(result!.hookSpecificOutput!['hookEventName']).toBe('UserPromptSubmit');
    const additionalContext = result!.hookSpecificOutput!['additionalContext'] as string;
    expect(additionalContext).toContain('directives');
    expect(additionalContext).toContain('spawn');
  });

  it('drains from subagent_stop target', async () => {
    const drain = vi.fn(() => ['directive-1']);
    const directiveQueue = { drain } as Parameters<typeof createUserPromptSubmitHandler>[0]['directiveQueue'];
    const handler = createUserPromptSubmitHandler({ directiveQueue });
    const event = makeHookEvent('UserPromptSubmit');
    await handler(event, { prompt: '<task-notification>' });
    expect(drain).toHaveBeenCalledWith('subagent_stop');
  });

  it('additionalContext in hookSpecificOutput is a valid <gv> JSON string', async () => {
    const directives = [{ action: 'complete', wid: 'w1' }];
    const directiveQueue = { drain: vi.fn(() => directives) } as Parameters<typeof createUserPromptSubmitHandler>[0]['directiveQueue'];
    const handler = createUserPromptSubmitHandler({ directiveQueue });
    const event = makeHookEvent('UserPromptSubmit');
    const result = await handler(event, { prompt: '<task-notification>' });
    const ctx = result!.hookSpecificOutput!['additionalContext'] as string;
    expect(ctx).toMatch(/^<gv>.*<\/gv>$/);
    const json = ctx.replace(/<\/?gv>/g, '');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['action']).toBe('directives');
  });

  it('returns null when prompt is an empty string', async () => {
    const directiveQueue = { drain: vi.fn(() => ['d1']) } as Parameters<typeof createUserPromptSubmitHandler>[0]['directiveQueue'];
    const handler = createUserPromptSubmitHandler({ directiveQueue });
    const event = makeHookEvent('UserPromptSubmit');
    const result = await handler(event, { prompt: '' });
    expect(result).toBeNull();
    // drain should not be called for non-task-notifications
    expect(directiveQueue!.drain).not.toHaveBeenCalled();
  });
});
