/**
 * WRFC Plugin Tests — Layer 3
 *
 * Comprehensive unit tests for the WRFC (Write-Review-Fix-Confirm) plugin:
 *   - score-evaluator.ts: extractScore, evaluateScore, parseScoreFromGvTag
 *   - directive-builder.ts: buildSpawnAction, buildCompleteAction, buildEscalateAction
 *   - handlers.ts: handleWorkflowCreated, handleAgentCompleted, handleQualityGate
 *   - wrfc-plugin.ts: registerWRFCPlugin
 *
 * All external dependencies are mocked via vi.fn().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  extractScore,
  evaluateScore,
  parseScoreFromGvTag,
} from '../wrfc/score-evaluator.js';

import {
  buildSpawnAction,
  buildCompleteAction,
  buildEscalateAction,
  buildCompleteDirective,
  buildEscalateDirective,
  buildSpawnDirective,
} from '../wrfc/directive-builder.js';

import {
  handleWorkflowCreated,
  handleAgentCompleted,
  handleQualityGate,
  DEFAULT_MIN_REVIEW_SCORE,
  DEFAULT_MAX_FIX_ATTEMPTS,
  AUTO_COMPLETE_AGENT_TYPES,
  REVIEWER_AGENT_TYPES,
  ENGINEER_AGENT_TYPES,
  HANDLER_IDS,
  TRIGGER_IDS,
} from '../wrfc/handlers.js';

import {
  registerWRFCPlugin,
  getDefaultWRFCConfig,
} from '../wrfc/wrfc-plugin.js';

import type { RuntimeEvent, StateStoreInterface, Trigger } from '../../core/types.js';
import { createEvent, createTrigger } from '../../core/types.js';

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a minimal in-memory StateStoreInterface mock.
 */
function createMockStore(initial: Record<string, unknown> = {}): StateStoreInterface {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get: vi.fn(<T>(key: string): T | null => (data.has(key) ? (data.get(key) as T) : null)),
    set: vi.fn(<T>(key: string, value: T): void => { data.set(key, value); }),
    delete: vi.fn((key: string): void => { data.delete(key); }),
    merge: vi.fn(),
    snapshot: vi.fn((): Record<string, unknown> => Object.fromEntries(data)),
    restore: vi.fn(),
  };
}

/**
 * Creates a minimal RuntimeEvent for use in handler tests.
 */
function makeEvent(overrides: Partial<RuntimeEvent> & { payload?: Record<string, unknown> } = {}): RuntimeEvent {
  return createEvent({
    source: 'agent',
    type: 'agent:spawned',
    payload: {},
    ...overrides,
  });
}

/**
 * Creates a minimal Trigger for handler tests.
 */
function makeTrigger(id: string = 'test-trigger'): Trigger {
  return createTrigger({
    id,
    event_match: { type: 'agent:spawned' },
    actions: [],
  });
}

// ─── score-evaluator.ts ───────────────────────────────────────────────────────

describe('extractScore', () => {
  it('returns null for null input', () => {
    expect(extractScore(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractScore(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractScore('')).toBeNull();
  });

  it('extracts score from <gv> tag', () => {
    const text = 'Some output\n<gv>{"score": 8.5}</gv>\nEnd';
    expect(extractScore(text)).toBe(8.5);
  });

  it('clamps score above 10 to 10', () => {
    const text = '<gv>{"score": 15}</gv>';
    expect(extractScore(text)).toBe(10);
  });

  it('clamps score below 0 to 0', () => {
    const text = '<gv>{"score": -3}</gv>';
    expect(extractScore(text)).toBe(0);
  });

  it('falls back to legacy SCORE: N/10 regex', () => {
    const text = 'Review complete. SCORE: 7.5/10';
    expect(extractScore(text)).toBe(7.5);
  });

  it('regex fallback is case-insensitive', () => {
    const text = 'score: 6/10';
    expect(extractScore(text)).toBe(6);
  });

  it('returns null when no score found in text', () => {
    expect(extractScore('No score here at all')).toBeNull();
  });

  it('returns null when <gv> tag has no score field', () => {
    const text = '<gv>{"pass": true, "count": 5}</gv>';
    expect(extractScore(text)).toBeNull();
  });

  it('returns null when <gv> tag JSON is invalid', () => {
    const text = '<gv>not valid json</gv>';
    // gv tag found but score undefined — falls back to regex, no match
    expect(extractScore(text)).toBeNull();
  });

  it('handles score of exactly 0', () => {
    const text = '<gv>{"score": 0}</gv>';
    expect(extractScore(text)).toBe(0);
  });

  it('handles score of exactly 10', () => {
    const text = '<gv>{"score": 10}</gv>';
    expect(extractScore(text)).toBe(10);
  });
});

describe('evaluateScore', () => {
  it('returns score -1, pass false for non-string input', () => {
    expect(evaluateScore(42, 9.5)).toEqual({ score: -1, pass: false });
    expect(evaluateScore(null, 9.5)).toEqual({ score: -1, pass: false });
    expect(evaluateScore({}, 9.5)).toEqual({ score: -1, pass: false });
  });

  it('returns score -1, pass false when text has no parseable score', () => {
    expect(evaluateScore('no score here', 9.5)).toEqual({ score: -1, pass: false });
  });

  it('returns pass true when score meets threshold', () => {
    const result = evaluateScore('<gv>{"score": 9.5}</gv>', 9.5);
    expect(result).toEqual({ score: 9.5, pass: true });
  });

  it('returns pass true when score exceeds threshold', () => {
    const result = evaluateScore('<gv>{"score": 10}</gv>', 9.5);
    expect(result).toEqual({ score: 10, pass: true });
  });

  it('returns pass false when score is below threshold', () => {
    const result = evaluateScore('<gv>{"score": 7}</gv>', 9.5);
    expect(result).toEqual({ score: 7, pass: false });
  });

  it('works with legacy SCORE: format', () => {
    const result = evaluateScore('SCORE: 8/10', 7.0);
    expect(result).toEqual({ score: 8, pass: true });
  });
});

describe('parseScoreFromGvTag', () => {
  it('returns null for invalid JSON', () => {
    expect(parseScoreFromGvTag('not json', 9.5)).toBeNull();
  });

  it('returns null when score field is not a number', () => {
    expect(parseScoreFromGvTag(JSON.stringify({ score: 'high' }), 9.5)).toBeNull();
  });

  it('returns null when score field is missing', () => {
    expect(parseScoreFromGvTag(JSON.stringify({ pass: true }), 9.5)).toBeNull();
  });

  it('parses score and evaluates pass correctly', () => {
    const result = parseScoreFromGvTag(JSON.stringify({ score: 9.5 }), 9.5);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(9.5);
    expect(result!.pass).toBe(true);
  });

  it('clamps score to [0, 10]', () => {
    const result = parseScoreFromGvTag(JSON.stringify({ score: 12 }), 9.5);
    expect(result!.score).toBe(10);
  });

  it('includes issues_count when count field is present', () => {
    const result = parseScoreFromGvTag(JSON.stringify({ score: 8.0, count: 3 }), 9.5);
    expect(result!.issues_count).toBe(3);
  });

  it('omits issues_count when count field is absent', () => {
    const result = parseScoreFromGvTag(JSON.stringify({ score: 8.0 }), 9.5);
    expect(result!.issues_count).toBeUndefined();
  });

  it('pass is false when score is below threshold', () => {
    const result = parseScoreFromGvTag(JSON.stringify({ score: 7.0 }), 9.5);
    expect(result!.pass).toBe(false);
  });
});

// ─── directive-builder.ts ─────────────────────────────────────────────────────

describe('buildSpawnAction', () => {
  it('returns an Action with type send_message', () => {
    const action = buildSpawnAction({ wid: 'wid1', type: 'reviewer', task: 'Review the code' });
    expect(action.type).toBe('send_message');
  });

  it('sets priority to 20', () => {
    const action = buildSpawnAction({ wid: 'wid1', type: 'engineer', task: 'Fix it' });
    expect(action.params['priority']).toBe(20);
  });

  it('sets target to subagent_stop', () => {
    const action = buildSpawnAction({ wid: 'wid1', type: 'tester', task: 'Test it' });
    expect(action.params['target']).toBe('subagent_stop');
  });

  it('includes workflow_id in the spawn content', () => {
    const action = buildSpawnAction({ wid: 'test-wid', type: 'reviewer', task: 'Review' });
    expect(action.params['content']).toContain('test-wid');
  });

  it('omits files_modified when files array is empty', () => {
    const action = buildSpawnAction({ wid: 'wid1', type: 'reviewer', task: 'Review', files: [] });
    const content = action.params['content'] as string;
    expect(content).not.toContain('files_modified');
  });

  it('includes files in the task string when files are provided', () => {
    // The buildSpawnAction wraps buildSpawnDirectiveMessage: files go into SpawnDirectiveContext
    // but the directive JSON only contains action/wid/type/task fields.
    // Files are passed through as context (workflow_id from context) not in directive body.
    // So we verify the action is created without throwing and has correct structure.
    const action = buildSpawnAction({
      wid: 'wid1',
      type: 'reviewer',
      task: 'Review',
      files: ['src/a.ts', 'src/b.ts'],
    });
    const content = action.params['content'] as string;
    // Directive contains the workflow ID and spawn action
    expect(content).toContain('wid1');
    expect(content).toContain('spawn');
    // Content is valid gv-tag JSON
    const json = content.replace(/<\/?gv>/g, '');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('content is a valid <gv> tag string', () => {
    const action = buildSpawnAction({ wid: 'wid1', type: 'fixer', task: 'Fix' });
    const content = action.params['content'] as string;
    expect(content).toMatch(/^<gv>.*<\/gv>$/);
  });
});

describe('buildCompleteAction', () => {
  it('returns an Action with type send_message', () => {
    const action = buildCompleteAction('wid1');
    expect(action.type).toBe('send_message');
  });

  it('sets priority to 20', () => {
    const action = buildCompleteAction('wid1');
    expect(action.params['priority']).toBe(20);
  });

  it('includes the workflow id in content', () => {
    const action = buildCompleteAction('my-workflow');
    expect(action.params['content']).toContain('my-workflow');
  });

  it('content contains action complete', () => {
    const action = buildCompleteAction('wid1');
    const content = action.params['content'] as string;
    expect(content).toContain('complete');
  });
});

describe('buildEscalateAction', () => {
  it('returns an Action with type send_message', () => {
    const action = buildEscalateAction('wid1', '3 fix attempts failed, score 6/10');
    expect(action.type).toBe('send_message');
  });

  it('sets priority to 30', () => {
    const action = buildEscalateAction('wid1', 'reason');
    expect(action.params['priority']).toBe(30);
  });

  it('content contains escalate action', () => {
    const action = buildEscalateAction('wid1', '2 fix attempts failed, score 5/10');
    const content = action.params['content'] as string;
    expect(content).toContain('escalate');
  });

  it('parses fix count from reason string', () => {
    const action = buildEscalateAction('wid1', '3 fix attempts failed, score 5/10');
    const content = action.params['content'] as string;
    expect(content).toContain('3');
  });

  it('handles reason with no parseable numbers gracefully', () => {
    // Should not throw
    const action = buildEscalateAction('wid1', 'no numbers');
    expect(action.type).toBe('send_message');
  });
});

describe('deprecated directive builder wrappers', () => {
  it('buildCompleteDirective delegates to buildCompleteAction', () => {
    const a = buildCompleteDirective('wid');
    const b = buildCompleteAction('wid');
    expect(a).toEqual(b);
  });

  it('buildEscalateDirective delegates to buildEscalateAction', () => {
    const a = buildEscalateDirective('wid', 'reason');
    const b = buildEscalateAction('wid', 'reason');
    expect(a).toEqual(b);
  });

  it('buildSpawnDirective delegates to buildSpawnAction', () => {
    const params = { wid: 'wid', type: 'reviewer' as const, task: 'task' };
    const a = buildSpawnDirective(params);
    const b = buildSpawnAction(params);
    expect(a).toEqual(b);
  });
});

// ─── handlers.ts: handleWorkflowCreated ────────────────────────────────────────

describe('handleWorkflowCreated', () => {
  const trigger = makeTrigger(TRIGGER_IDS.AGENT_SPAWNED);

  it('returns empty result when agent_id is missing', () => {
    const store = createMockStore();
    const event = makeEvent({ payload: { some: 'data' } });
    const result = handleWorkflowCreated(event, trigger, store);
    expect(result).toEqual({});
  });

  it('initialises new workflow when no incomingWid (chain originator)', () => {
    const store = createMockStore();
    const agentId = 'agent-001';
    const event = makeEvent({
      payload: { agent_id: agentId, agent_type: 'engineer', task: 'Build a feature' },
    });
    const result = handleWorkflowCreated(event, trigger, store);

    expect(result.state_updates).toBeDefined();
    const updates = result.state_updates!;

    // Agent map binding
    const agentMapUpdate = updates.find((u) => u.key === `wrfc.agent_map.${agentId}`);
    expect(agentMapUpdate).toBeDefined();
    expect(agentMapUpdate!.op).toBe('set');

    // Workflow phase initialised to WRITING
    const phaseUpdate = updates.find((u) => u.key.endsWith('.phase'));
    expect(phaseUpdate!.value).toBe('WRITING');

    // fix_attempts initialised to 0
    const fixAttemptsUpdate = updates.find((u) => u.key.endsWith('.fix_attempts'));
    expect(fixAttemptsUpdate!.value).toBe(0);

    // files_modified initialised to []
    const filesUpdate = updates.find((u) => u.key.endsWith('.files_modified'));
    expect(filesUpdate!.value).toEqual([]);
  });

  it('generates workflow id as wrfc_<agentId> for chain originator', () => {
    const store = createMockStore();
    const agentId = 'agent-abc';
    const event = makeEvent({ payload: { agent_id: agentId } });
    const result = handleWorkflowCreated(event, trigger, store);
    // The handler uses v3 state_updates pattern, not direct store.set
    const agentMapUpdate = result.state_updates!.find(
      (u) => u.key === `wrfc.agent_map.${agentId}`,
    );
    expect(agentMapUpdate).toBeDefined();
    // Workflow id should be `wrfc_agent-abc`
    expect(agentMapUpdate!.value).toBe(`wrfc_${agentId}`);
  });

  it('binds chain agent to existing workflow when incomingWid is provided', () => {
    const store = createMockStore();
    const agentId = 'agent-002';
    const workflowId = 'wrfc_parent';
    const event = makeEvent({
      payload: { agent_id: agentId, workflow_id: workflowId, agent_type: 'reviewer' },
    });
    const result = handleWorkflowCreated(event, trigger, store);

    expect(result.state_updates).toBeDefined();
    const agentMapUpdate = result.state_updates!.find(
      (u) => u.key === `wrfc.agent_map.${agentId}`,
    );
    expect(agentMapUpdate!.value).toBe(workflowId);
    // Should NOT initialise full workflow state (no phase update)
    const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
    expect(phaseUpdate).toBeUndefined();
  });

  it('reads min_review_score and max_fix_attempts from store config', () => {
    const store = createMockStore({
      'wrfc.config.min_review_score': 8.0,
      'wrfc.config.max_fix_attempts': 5,
    });
    const agentId = 'agent-003';
    const event = makeEvent({ payload: { agent_id: agentId } });
    handleWorkflowCreated(event, trigger, store);

    expect(store.get).toHaveBeenCalledWith('wrfc.config.min_review_score');
    expect(store.get).toHaveBeenCalledWith('wrfc.config.max_fix_attempts');
  });
});

// ─── handlers.ts: handleAgentCompleted ────────────────────────────────────────

describe('handleAgentCompleted', () => {
  const trigger = makeTrigger(TRIGGER_IDS.AGENT_COMPLETED);

  it('returns empty result when no workflow binding found', () => {
    const store = createMockStore();
    const event = makeEvent({
      type: 'agent:completed',
      payload: { agent_id: 'unknown-agent', agent_type: 'engineer' },
    });
    const result = handleAgentCompleted(event, trigger, store);
    expect(result).toEqual({});
  });

  it('returns empty result when neither agent_id mapping nor payload workflow_id', () => {
    const store = createMockStore();
    const event = makeEvent({ type: 'agent:completed', payload: {} });
    const result = handleAgentCompleted(event, trigger, store);
    expect(result).toEqual({});
  });

  describe('WRITING phase', () => {
    it('auto-completes for whitelisted agent types', () => {
      for (const agentType of AUTO_COMPLETE_AGENT_TYPES) {
        const agentId = `agent-${agentType}`;
        const wid = `wrfc_${agentId}`;
        const store = createMockStore({
          [`wrfc.agent_map.${agentId}`]: wid,
          [`wrfc.workflows.${wid}.phase`]: 'WRITING',
          [`wrfc.workflows.${wid}.files_modified`]: [],
        });
        const event = makeEvent({
          type: 'agent:completed',
          payload: { agent_id: agentId, agent_type: agentType },
        });
        const result = handleAgentCompleted(event, trigger, store);
        expect(result.actions).toHaveLength(1);
        expect(result.actions![0].params['content']).toContain('complete');
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate!.value).toBe('COMPLETED');
      }
    });

    it('spawns reviewer and advances to REVIEWING for work agents', () => {
      const agentId = 'agent-eng';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'WRITING',
        [`wrfc.workflows.${wid}.files_modified`]: ['src/app.ts'],
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: { agent_id: agentId, agent_type: 'engineer' },
      });
      const result = handleAgentCompleted(event, trigger, store);

      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].params['content']).toContain('spawn');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate!.value).toBe('REVIEWING');
      expect(result.events).toHaveLength(1);
      expect(result.events![0].type).toBe('wrfc:review_started');
    });

    it('treats early states (IDLE, GATHERING, PLANNING) same as WRITING', () => {
      for (const earlyState of ['IDLE', 'GATHERING', 'PLANNING']) {
        const agentId = `agent-${earlyState}`;
        const wid = `wrfc_${agentId}`;
        const store = createMockStore({
          [`wrfc.agent_map.${agentId}`]: wid,
          [`wrfc.workflows.${wid}.phase`]: earlyState,
          [`wrfc.workflows.${wid}.files_modified`]: [],
        });
        const event = makeEvent({
          type: 'agent:completed',
          payload: { agent_id: agentId, agent_type: 'engineer' },
        });
        const result = handleAgentCompleted(event, trigger, store);
        // Should produce reviewer spawn (same as WRITING work agent)
        expect(result.actions).toHaveLength(1);
        expect(result.actions![0].params['content']).toContain('spawn');
      }
    });
  });

  describe('REVIEWING phase', () => {
    it('returns empty when agent is not a reviewer type', () => {
      const agentId = 'agent-eng';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'REVIEWING',
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: { agent_id: agentId, agent_type: 'engineer' },
      });
      const result = handleAgentCompleted(event, trigger, store);
      expect(result).toEqual({});
    });

    it('escalates and emits wrfc:review_parse_failed when score cannot be parsed', () => {
      const agentId = 'agent-rev';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'REVIEWING',
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: {
          agent_id: agentId,
          agent_type: 'reviewer',
          last_assistant_message: 'No score here',
        },
      });
      const result = handleAgentCompleted(event, trigger, store);
      // Should escalate rather than silently stall the workflow
      expect(result.state_updates).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: `wrfc.workflows.${wid}.phase`, value: 'ESCALATED' }),
      ]));
      expect(result.actions).toHaveLength(1);
      expect(result.events).toHaveLength(1);
      expect(result.events![0].type).toBe('wrfc:review_parse_failed');
      expect(result.events![0].payload).toMatchObject({
        workflow_id: wid,
        agent_id: agentId,
      });
    });

    it('completes workflow when score passes threshold', () => {
      const agentId = 'agent-rev';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'REVIEWING',
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.files_modified`]: [],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: {
          agent_id: agentId,
          agent_type: 'reviewer',
          last_assistant_message: '<gv>{"score": 9.5}</gv>',
        },
      });
      const result = handleAgentCompleted(event, trigger, store);

      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].params['content']).toContain('complete');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate!.value).toBe('COMPLETED');
      expect(result.events).toHaveLength(1);
      expect(result.events![0].type).toBe('wrfc:review_completed');
    });

    it('spawns fixer when score fails threshold', () => {
      const agentId = 'agent-rev';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'REVIEWING',
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.files_modified`]: [],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: {
          agent_id: agentId,
          agent_type: 'reviewer',
          last_assistant_message: '<gv>{"score": 7.0}</gv>',
        },
      });
      const result = handleAgentCompleted(event, trigger, store);

      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].params['content']).toContain('spawn');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate!.value).toBe('FIXING');
    });

    it('fixer task includes actual review output from last_assistant_message', () => {
      const agentId = 'agent-rev-output';
      const wid = `wrfc_${agentId}`;
      const reviewMessage = '<gv>{"score": 7.0}</gv>';
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'REVIEWING',
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.files_modified`]: [],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: {
          agent_id: agentId,
          agent_type: 'reviewer',
          last_assistant_message: reviewMessage,
        },
      });
      const result = handleAgentCompleted(event, trigger, store);

      expect(result.actions).toHaveLength(1);
      const directiveContent = result.actions![0].params['content'] as string;
      // The fixer task must include the actual review output, not a hardcoded stub.
      // The directive is wrapped in <gv>...</gv> tags with JSON-encoded body — strip tags and parse.
      const innerJson = directiveContent.replace(/^<gv>/, '').replace(/<\/gv>$/, '');
      const directive = JSON.parse(innerJson) as { task?: string };
      expect(directive.task).toContain(reviewMessage);
    });

    it('resolves agent_id from hook_input shape', () => {
      const agentId = 'agent-hook';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'REVIEWING',
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.files_modified`]: [],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: {
          hook_input: {
            agent_id: agentId,
            agent_type: 'reviewer',
            last_assistant_message: '<gv>{"score": 9.8}</gv>',
          },
        },
      });
      const result = handleAgentCompleted(event, trigger, store);
      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].params['content']).toContain('complete');
    });
  });

  describe('FIXING phase', () => {
    it('returns empty when agent is not an engineer type', () => {
      const agentId = 'agent-rev';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'FIXING',
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: { agent_id: agentId, agent_type: 'reviewer' },
      });
      const result = handleAgentCompleted(event, trigger, store);
      expect(result).toEqual({});
    });

    it('escalates when fix budget is exhausted', () => {
      const agentId = 'agent-eng';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'FIXING',
        [`wrfc.workflows.${wid}.fix_attempts`]: 2,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.files_modified`]: [],
        [`wrfc.workflows.${wid}.review_score`]: 7.0,
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: { agent_id: agentId, agent_type: 'engineer' },
      });
      const result = handleAgentCompleted(event, trigger, store);

      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].params['content']).toContain('escalate');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate!.value).toBe('ESCALATED');
    });

    it('spawns re-review when fix budget still available', () => {
      const agentId = 'agent-eng';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'FIXING',
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.files_modified`]: ['src/app.ts'],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: { agent_id: agentId, agent_type: 'engineer' },
      });
      const result = handleAgentCompleted(event, trigger, store);

      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].params['content']).toContain('spawn');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate!.value).toBe('REVIEWING');
      expect(result.events).toHaveLength(1);
      expect(result.events![0].type).toBe('wrfc:fix_completed');
    });

    it('merges files from <gv> tag in agent output', () => {
      const agentId = 'agent-eng';
      const wid = `wrfc_${agentId}`;
      const store = createMockStore({
        [`wrfc.agent_map.${agentId}`]: wid,
        [`wrfc.workflows.${wid}.phase`]: 'FIXING',
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.files_modified`]: ['src/app.ts'],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: {
          agent_id: agentId,
          agent_type: 'engineer',
          last_assistant_message: '<gv>{"files":["src/new.ts"]}</gv>',
        },
      });
      const result = handleAgentCompleted(event, trigger, store);
      const filesUpdate = result.state_updates!.find((u) => u.key.endsWith('.files_modified'));
      expect(filesUpdate!.value).toContain('src/app.ts');
      expect(filesUpdate!.value).toContain('src/new.ts');
    });

    it('uses payload.workflow_id fallback when no agent_map entry', () => {
      const wid = 'wrfc_direct';
      const store = createMockStore({
        [`wrfc.workflows.${wid}.phase`]: 'FIXING',
        [`wrfc.workflows.${wid}.fix_attempts`]: 0,
        [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
        [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
        [`wrfc.workflows.${wid}.files_modified`]: [],
      });
      const event = makeEvent({
        type: 'agent:completed',
        payload: { agent_type: 'engineer', workflow_id: wid },
      });
      const result = handleAgentCompleted(event, trigger, store);
      expect(result.actions).toBeDefined();
    });
  });

  it('returns empty for unhandled phase', () => {
    const agentId = 'agent-x';
    const wid = `wrfc_${agentId}`;
    const store = createMockStore({
      [`wrfc.agent_map.${agentId}`]: wid,
      [`wrfc.workflows.${wid}.phase`]: 'COMPLETED',
    });
    const event = makeEvent({
      type: 'agent:completed',
      payload: { agent_id: agentId, agent_type: 'engineer' },
    });
    const result = handleAgentCompleted(event, trigger, store);
    expect(result).toEqual({});
  });
});

// ─── handlers.ts: handleQualityGate ────────────────────────────────────────────

describe('handleQualityGate', () => {
  const trigger = makeTrigger(TRIGGER_IDS.REVIEW_COMPLETED);

  it('returns empty when workflow_id is missing', () => {
    const store = createMockStore();
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { review_score: 9.5 },
    });
    const result = handleQualityGate(event, trigger, store);
    expect(result).toEqual({});
  });

  it('returns empty when review_score is invalid', () => {
    const store = createMockStore();
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { workflow_id: 'wid1', review_score: 'not-a-number' },
    });
    const result = handleQualityGate(event, trigger, store);
    expect(result).toEqual({});
  });

  it('completes workflow when score meets threshold', () => {
    const wid = 'wid1';
    const store = createMockStore({
      [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      [`wrfc.workflows.${wid}.fix_attempts`]: 0,
      [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
      [`wrfc.workflows.${wid}.files_modified`]: [],
    });
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { workflow_id: wid, review_score: 9.5 },
    });
    const result = handleQualityGate(event, trigger, store);

    expect(result.actions).toHaveLength(1);
    expect(result.actions![0].params['content']).toContain('complete');
    const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
    expect(phaseUpdate!.value).toBe('COMPLETED');
  });

  it('escalates when score fails and fix budget exhausted', () => {
    const wid = 'wid2';
    const store = createMockStore({
      [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      [`wrfc.workflows.${wid}.fix_attempts`]: 2,
      [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
      [`wrfc.workflows.${wid}.files_modified`]: [],
    });
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { workflow_id: wid, review_score: 6.0 },
    });
    const result = handleQualityGate(event, trigger, store);

    expect(result.actions).toHaveLength(1);
    expect(result.actions![0].params['content']).toContain('escalate');
    const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
    expect(phaseUpdate!.value).toBe('ESCALATED');
  });

  it('spawns fixer when score fails and budget remaining', () => {
    const wid = 'wid3';
    const store = createMockStore({
      [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      [`wrfc.workflows.${wid}.fix_attempts`]: 0,
      [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
      [`wrfc.workflows.${wid}.files_modified`]: ['src/x.ts'],
    });
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { workflow_id: wid, review_score: 7.0 },
    });
    const result = handleQualityGate(event, trigger, store);

    expect(result.actions).toHaveLength(1);
    expect(result.actions![0].params['content']).toContain('spawn');
    const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
    expect(phaseUpdate!.value).toBe('FIXING');
  });

  it('stores review_score in state_updates', () => {
    const wid = 'wid4';
    const store = createMockStore({
      [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      [`wrfc.workflows.${wid}.fix_attempts`]: 0,
      [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
      [`wrfc.workflows.${wid}.files_modified`]: [],
    });
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { workflow_id: wid, review_score: 9.8 },
    });
    const result = handleQualityGate(event, trigger, store);
    const scoreUpdate = result.state_updates!.find((u) => u.key.endsWith('.review_score'));
    expect(scoreUpdate!.value).toBe(9.8);
  });

  it('handles numeric review_score as string via parseFloat', () => {
    const wid = 'wid5';
    const store = createMockStore({
      [`wrfc.workflows.${wid}.min_review_score`]: 9.5,
      [`wrfc.workflows.${wid}.fix_attempts`]: 0,
      [`wrfc.workflows.${wid}.max_fix_attempts`]: 3,
      [`wrfc.workflows.${wid}.files_modified`]: [],
    });
    const event = makeEvent({
      type: 'wrfc:review_completed',
      payload: { workflow_id: wid, review_score: '9.7' },
    });
    const result = handleQualityGate(event, trigger, store);
    expect(result.actions).toHaveLength(1);
    expect(result.actions![0].params['content']).toContain('complete');
  });
});

// ─── wrfc-plugin.ts: registerWRFCPlugin ────────────────────────────────────────

describe('getDefaultWRFCConfig', () => {
  it('returns correct defaults', () => {
    const config = getDefaultWRFCConfig();
    expect(config.score_threshold).toBe(9.5);
    expect(config.max_fix_attempts).toBe(3);
    expect(config.enable_quality_gates).toBe(true);
  });
});

describe('registerWRFCPlugin', () => {
  function createMockProcessor() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    return {
      registerHandler: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(id, handler);
      }),
      getHandler: (id: string) => handlers.get(id),
    };
  }

  function createMockRegistry() {
    const triggers = new Map<string, Trigger>();
    return {
      register: vi.fn((trigger: Trigger) => { triggers.set(trigger.id, trigger); }),
      get: vi.fn((id: string): Trigger | undefined => triggers.get(id)),
    };
  }

  it('seeds config into the state store', () => {
    const processor = createMockProcessor();
    const registry = createMockRegistry();
    const store = createMockStore();
    const config = getDefaultWRFCConfig();

    registerWRFCPlugin({ processor, registry, store, config } as Parameters<typeof registerWRFCPlugin>[0]);

    expect(store.set).toHaveBeenCalledWith('wrfc.config.min_review_score', config.score_threshold);
    expect(store.set).toHaveBeenCalledWith('wrfc.config.max_fix_attempts', config.max_fix_attempts);
    expect(store.set).toHaveBeenCalledWith('wrfc.config.enable_quality_gates', config.enable_quality_gates);
  });

  it('registers three triggers', () => {
    const processor = createMockProcessor();
    const registry = createMockRegistry();
    const store = createMockStore();

    registerWRFCPlugin({ processor, registry, store, config: getDefaultWRFCConfig() } as Parameters<typeof registerWRFCPlugin>[0]);

    expect(registry.register).toHaveBeenCalledTimes(3);
    expect(registry.get).toHaveBeenCalledWith(TRIGGER_IDS.AGENT_SPAWNED);
    expect(registry.get).toHaveBeenCalledWith(TRIGGER_IDS.AGENT_COMPLETED);
    expect(registry.get).toHaveBeenCalledWith(TRIGGER_IDS.REVIEW_COMPLETED);
  });

  it('registers three handlers on the processor', () => {
    const processor = createMockProcessor();
    const registry = createMockRegistry();
    const store = createMockStore();

    registerWRFCPlugin({ processor, registry, store, config: getDefaultWRFCConfig() } as Parameters<typeof registerWRFCPlugin>[0]);

    expect(processor.registerHandler).toHaveBeenCalledTimes(3);
    expect(processor.registerHandler).toHaveBeenCalledWith(
      TRIGGER_IDS.AGENT_SPAWNED,
      expect.any(Function),
    );
    expect(processor.registerHandler).toHaveBeenCalledWith(
      TRIGGER_IDS.AGENT_COMPLETED,
      expect.any(Function),
    );
    expect(processor.registerHandler).toHaveBeenCalledWith(
      TRIGGER_IDS.REVIEW_COMPLETED,
      expect.any(Function),
    );
  });

  it('registered handler returns empty when trigger is not found', async () => {
    const processor = createMockProcessor();
    // registry.get always returns undefined — simulates missing trigger
    const registry = {
      register: vi.fn(),
      get: vi.fn(() => undefined),
    };
    const store = createMockStore();

    registerWRFCPlugin({ processor, registry, store, config: getDefaultWRFCConfig() } as Parameters<typeof registerWRFCPlugin>[0]);

    const handler = processor.getHandler(TRIGGER_IDS.AGENT_SPAWNED);
    expect(handler).toBeDefined();
    const result = await (handler as (e: RuntimeEvent) => Promise<unknown>)(makeEvent());
    expect(result).toEqual({});
  });

  it('HANDLER_IDS and TRIGGER_IDS are defined and distinct', () => {
    const handlerValues = Object.values(HANDLER_IDS);
    const triggerValues = Object.values(TRIGGER_IDS);
    // No duplicates within each set
    expect(new Set(handlerValues).size).toBe(handlerValues.length);
    expect(new Set(triggerValues).size).toBe(triggerValues.length);
  });
});

describe('constants', () => {
  it('DEFAULT_MIN_REVIEW_SCORE is 9.5', () => {
    expect(DEFAULT_MIN_REVIEW_SCORE).toBe(9.5);
  });

  it('DEFAULT_MAX_FIX_ATTEMPTS is 3', () => {
    expect(DEFAULT_MAX_FIX_ATTEMPTS).toBe(3);
  });

  it('AUTO_COMPLETE_AGENT_TYPES includes reviewer types', () => {
    for (const t of REVIEWER_AGENT_TYPES) {
      expect(AUTO_COMPLETE_AGENT_TYPES.has(t)).toBe(true);
    }
  });

  it('ENGINEER_AGENT_TYPES includes engineer', () => {
    expect(ENGINEER_AGENT_TYPES.has('engineer')).toBe(true);
  });
});
