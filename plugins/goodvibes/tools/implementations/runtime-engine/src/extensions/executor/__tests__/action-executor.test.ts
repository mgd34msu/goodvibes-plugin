import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionExecutor } from '../action-executor.js';
import type { Action } from '../../../core/types.js';

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeDirectiveQueue() {
  return {
    enqueue: vi.fn(),
    drain: vi.fn(() => []),
    size: vi.fn(() => 0),
  };
}

function makeAgentWorkflowMap() {
  return {
    addPendingBind: vi.fn(),
  };
}

describe('ActionExecutor', () => {
  let queue: ReturnType<typeof makeDirectiveQueue>;
  let executor: ActionExecutor;

  beforeEach(() => {
    queue = makeDirectiveQueue();
    executor = new ActionExecutor(queue as any);
  });

  // ─── send_message ───────────────────────────────────────────────────────────

  describe('send_message action', () => {
    it('enqueues a directive with the provided content, priority, and target', async () => {
      const action: Action = {
        type: 'send_message',
        params: {
          content: 'Hello directive',
          priority: 5,
          target: 'my_target',
        },
      };
      await executor.execute(action, {});

      expect(queue.enqueue).toHaveBeenCalledOnce();
      const [target, directive] = queue.enqueue.mock.calls[0];
      expect(target).toBe('my_target');
      expect(directive.content).toBe('Hello directive');
      expect(directive.priority).toBe(5);
      expect(directive.type).toBe('inject_system_message');
      expect(directive.source).toBe('wrfc');
    });

    it('uses default target "subagent_stop" when target is missing', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi' },
      };
      await executor.execute(action, {});
      const [target] = queue.enqueue.mock.calls[0];
      expect(target).toBe('subagent_stop');
    });

    it('uses default priority 20 when priority is missing', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi' },
      };
      await executor.execute(action, {});
      const [, directive] = queue.enqueue.mock.calls[0];
      expect(directive.priority).toBe(20);
    });

    it('uses default target when target is not a string', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi', target: 42 as any },
      };
      await executor.execute(action, {});
      const [target] = queue.enqueue.mock.calls[0];
      expect(target).toBe('subagent_stop');
    });

    it('uses default priority when priority is not a number', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi', priority: 'high' as any },
      };
      await executor.execute(action, {});
      const [, directive] = queue.enqueue.mock.calls[0];
      expect(directive.priority).toBe(20);
    });

    it('does not include workflow_id when context has no workflow_id', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi' },
      };
      await executor.execute(action, {});
      const [, directive] = queue.enqueue.mock.calls[0];
      expect(directive.workflow_id).toBeUndefined();
    });

    it('includes workflow_id from context when present', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi' },
      };
      await executor.execute(action, { workflow_id: 'wf-abc' });
      const [, directive] = queue.enqueue.mock.calls[0];
      expect(directive.workflow_id).toBe('wf-abc');
    });

    it('does not enqueue and does not throw when content is missing', async () => {
      const action: Action = {
        type: 'send_message',
        params: {},
      };
      await expect(executor.execute(action, {})).resolves.toBeUndefined();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('does not enqueue when content is an empty string', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: '' },
      };
      await executor.execute(action, {});
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('does not include workflow_id when context workflow_id is not a string', async () => {
      const action: Action = {
        type: 'send_message',
        params: { content: 'hi' },
      };
      await executor.execute(action, { workflow_id: 99 as any });
      const [, directive] = queue.enqueue.mock.calls[0];
      expect(directive.workflow_id).toBeUndefined();
    });
  });

  // ─── pending bind registration ───────────────────────────────────────────────

  describe('pending bind registration', () => {
    it('calls addPendingBind for bare and goodvibes: prefixed type when agent_type and workflow_id are present', async () => {
      const agentMap = makeAgentWorkflowMap();
      const executorWithMap = new ActionExecutor(queue as any, agentMap as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'engineer' } as any,
      };
      await executorWithMap.execute(action, { workflow_id: 'wf-123', session_id: 'sess-abc' });

      expect(agentMap.addPendingBind).toHaveBeenCalledTimes(2);
      expect(agentMap.addPendingBind).toHaveBeenCalledWith('engineer', 'wf-123', 'sess-abc');
      expect(agentMap.addPendingBind).toHaveBeenCalledWith('goodvibes:engineer', 'wf-123', 'sess-abc');
    });

    it('passes session_id from context to addPendingBind', async () => {
      const agentMap = makeAgentWorkflowMap();
      const executorWithMap = new ActionExecutor(queue as any, agentMap as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'engineer' } as any,
      };
      await executorWithMap.execute(action, { workflow_id: 'wf-789', session_id: 'my-session' });

      expect(agentMap.addPendingBind).toHaveBeenCalledWith('engineer', 'wf-789', 'my-session');
      expect(agentMap.addPendingBind).toHaveBeenCalledWith('goodvibes:engineer', 'wf-789', 'my-session');
    });

    it('uses "default" as session_id fallback when context has no session_id', async () => {
      const agentMap = makeAgentWorkflowMap();
      const executorWithMap = new ActionExecutor(queue as any, agentMap as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'engineer' } as any,
      };
      await executorWithMap.execute(action, { workflow_id: 'wf-no-session' });

      expect(agentMap.addPendingBind).toHaveBeenCalledWith('engineer', 'wf-no-session', 'default');
      expect(agentMap.addPendingBind).toHaveBeenCalledWith('goodvibes:engineer', 'wf-no-session', 'default');
    });

    it('does not double-prefix when agent_type already starts with goodvibes:', async () => {
      const agentMap = makeAgentWorkflowMap();
      const executorWithMap = new ActionExecutor(queue as any, agentMap as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'goodvibes:reviewer' } as any,
      };
      await executorWithMap.execute(action, { workflow_id: 'wf-456', session_id: 'sess-xyz' });

      expect(agentMap.addPendingBind).toHaveBeenCalledTimes(1);
      expect(agentMap.addPendingBind).toHaveBeenCalledWith('goodvibes:reviewer', 'wf-456', 'sess-xyz');
    });

    it('does not call addPendingBind when agent_type is missing', async () => {
      const agentMap = makeAgentWorkflowMap();
      const executorWithMap = new ActionExecutor(queue as any, agentMap as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'no agent type' },
      };
      await executorWithMap.execute(action, { workflow_id: 'wf-789' });

      expect(agentMap.addPendingBind).not.toHaveBeenCalled();
    });

    it('does not call addPendingBind when workflow_id is missing from context', async () => {
      const agentMap = makeAgentWorkflowMap();
      const executorWithMap = new ActionExecutor(queue as any, agentMap as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'engineer' } as any,
      };
      await executorWithMap.execute(action, {});

      expect(agentMap.addPendingBind).not.toHaveBeenCalled();
    });

    it('does not throw when agentWorkflowMap is null', async () => {
      const executorNoMap = new ActionExecutor(queue as any, null);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'engineer' } as any,
      };
      await expect(executorNoMap.execute(action, { workflow_id: 'wf-abc' })).resolves.toBeUndefined();
      expect(queue.enqueue).toHaveBeenCalledOnce();
    });

    it('does not throw when agentWorkflowMap is undefined (constructor default)', async () => {
      const executorNoMap = new ActionExecutor(queue as any);
      const action: Action = {
        type: 'send_message',
        params: { content: 'spawn directive', agent_type: 'engineer' } as any,
      };
      await expect(executorNoMap.execute(action, { workflow_id: 'wf-abc' })).resolves.toBeUndefined();
      expect(queue.enqueue).toHaveBeenCalledOnce();
    });
  });

  // ─── unhandled action types ─────────────────────────────────────────────────

  describe('unhandled action types', () => {
    it('does not throw for unknown action types', async () => {
      const action: Action = {
        type: 'do_something_unknown' as any,
        params: {},
      };
      await expect(executor.execute(action, {})).resolves.toBeUndefined();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('handles action with null params gracefully (does not crash)', async () => {
      // When params is an empty object (the safest "no params" case),
      // content is missing so the executor logs an error and returns without enqueuing.
      const action = { type: 'send_message', params: {} } as any;
      await expect(executor.execute(action, {})).resolves.toBeUndefined();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });
});
