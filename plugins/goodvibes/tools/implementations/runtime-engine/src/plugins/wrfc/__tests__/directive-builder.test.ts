import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockBuildSpawnDirectiveMessage = vi.fn();
const mockBuildWorkflowCompleteMessage = vi.fn();
const mockBuildEscalationMessage = vi.fn();

vi.mock('../../../extensions/directives/legacy-directive-builder.js', () => ({
  buildSpawnDirectiveMessage: (...args: unknown[]) => mockBuildSpawnDirectiveMessage(...args),
  buildWorkflowCompleteMessage: (...args: unknown[]) => mockBuildWorkflowCompleteMessage(...args),
  buildEscalationMessage: (...args: unknown[]) => mockBuildEscalationMessage(...args),
}));

// Import AFTER mocks
import {
  buildSpawnAction,
  buildCompleteAction,
  buildEscalateAction,
} from '../directive-builder.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SPAWN_MESSAGE = '<gv>{"action":"spawn","wid":"wf-1","type":"reviewer","task":"Review the code"}</gv>';
const COMPLETE_MESSAGE = '<gv>{"action":"complete","wid":"wf-1"}</gv>';
const ESCALATE_MESSAGE = '<gv>{"action":"escalate","wid":"wf-1","reason":"3 fix attempts failed, last score 5/10"}</gv>';

// ─── buildSpawnAction ─────────────────────────────────────────────────────────

describe('buildSpawnAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSpawnDirectiveMessage.mockReturnValue(SPAWN_MESSAGE);
  });

  it('returns an Action with type send_message', () => {
    const action = buildSpawnAction({ wid: 'wf-1', type: 'reviewer', task: 'Review the code' });
    expect(action.type).toBe('send_message');
  });

  it('sets priority to 20', () => {
    const action = buildSpawnAction({ wid: 'wf-1', type: 'reviewer', task: 'Review the code' });
    expect(action.params.priority).toBe(20);
  });

  it('sets target to subagent_stop', () => {
    const action = buildSpawnAction({ wid: 'wf-1', type: 'reviewer', task: 'Review the code' });
    expect(action.params.target).toBe('subagent_stop');
  });

  it('sets content from buildSpawnDirectiveMessage return value', () => {
    const action = buildSpawnAction({ wid: 'wf-1', type: 'reviewer', task: 'Review the code' });
    expect(action.params.content).toBe(SPAWN_MESSAGE);
  });

  it('calls buildSpawnDirectiveMessage with correct agent type and task', () => {
    buildSpawnAction({ wid: 'wf-1', type: 'engineer', task: 'Fix the bug' });
    expect(mockBuildSpawnDirectiveMessage).toHaveBeenCalledWith(
      'engineer',
      'Fix the bug',
      expect.objectContaining({ workflow_id: 'wf-1' })
    );
  });

  it('includes files_modified in context when files is provided and non-empty', () => {
    buildSpawnAction({ wid: 'wf-1', type: 'reviewer', task: 'Review', files: ['src/a.ts'] });
    expect(mockBuildSpawnDirectiveMessage).toHaveBeenCalledWith(
      'reviewer',
      'Review',
      expect.objectContaining({ workflow_id: 'wf-1', files_modified: ['src/a.ts'] })
    );
  });

  it('omits files_modified from context when files is empty array', () => {
    buildSpawnAction({ wid: 'wf-1', type: 'reviewer', task: 'Review', files: [] });
    const context = mockBuildSpawnDirectiveMessage.mock.calls[0][2];
    expect(context.files_modified).toBeUndefined();
  });

  it('omits files_modified from context when files is not provided', () => {
    buildSpawnAction({ wid: 'wf-1', type: 'tester', task: 'Test' });
    const context = mockBuildSpawnDirectiveMessage.mock.calls[0][2];
    expect(context.files_modified).toBeUndefined();
  });

  it('works for all valid agent types', () => {
    const types = ['engineer', 'reviewer', 'tester', 'fixer'] as const;
    for (const type of types) {
      vi.clearAllMocks();
      mockBuildSpawnDirectiveMessage.mockReturnValue(SPAWN_MESSAGE);
      const action = buildSpawnAction({ wid: 'wf-1', type, task: 'Task' });
      expect(action.type).toBe('send_message');
      expect(mockBuildSpawnDirectiveMessage).toHaveBeenCalledWith(type, 'Task', expect.any(Object));
    }
  });
});

// ─── buildCompleteAction ──────────────────────────────────────────────────────

describe('buildCompleteAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildWorkflowCompleteMessage.mockReturnValue(COMPLETE_MESSAGE);
  });

  it('returns an Action with type send_message', () => {
    const action = buildCompleteAction('wf-1');
    expect(action.type).toBe('send_message');
  });

  it('sets priority to 20', () => {
    const action = buildCompleteAction('wf-1');
    expect(action.params.priority).toBe(20);
  });

  it('sets target to subagent_stop', () => {
    const action = buildCompleteAction('wf-1');
    expect(action.params.target).toBe('subagent_stop');
  });

  it('sets content from buildWorkflowCompleteMessage return value', () => {
    const action = buildCompleteAction('wf-1');
    expect(action.params.content).toBe(COMPLETE_MESSAGE);
  });

  it('passes workflow ID to buildWorkflowCompleteMessage', () => {
    buildCompleteAction('wf-abc');
    expect(mockBuildWorkflowCompleteMessage).toHaveBeenCalledWith('wf-abc');
  });
});

// ─── buildEscalateAction ──────────────────────────────────────────────────────

describe('buildEscalateAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildEscalationMessage.mockReturnValue(ESCALATE_MESSAGE);
  });

  it('returns an Action with type send_message', () => {
    const action = buildEscalateAction('wf-1', 'budget exhausted');
    expect(action.type).toBe('send_message');
  });

  it('sets priority to 30 (higher than spawn/complete)', () => {
    const action = buildEscalateAction('wf-1', 'budget exhausted');
    expect(action.params.priority).toBe(30);
  });

  it('sets target to subagent_stop', () => {
    const action = buildEscalateAction('wf-1', 'budget exhausted');
    expect(action.params.target).toBe('subagent_stop');
  });

  it('sets content from buildEscalationMessage return value', () => {
    const action = buildEscalateAction('wf-1', 'reason');
    expect(action.params.content).toBe(ESCALATE_MESSAGE);
  });

  it('uses structured params.fix_attempts when provided', () => {
    buildEscalateAction('wf-1', 'budget exhausted', { fix_attempts: 3, last_score: 5 });
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 3, 5);
  });

  it('defaults fix_attempts to 0 when params provided but fix_attempts missing', () => {
    buildEscalateAction('wf-1', 'reason', { last_score: 4 });
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 0, 4);
  });

  it('defaults last_score to 0 when params provided but last_score missing', () => {
    buildEscalateAction('wf-1', 'reason', { fix_attempts: 2 });
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 2, 0);
  });

  it('defaults both to 0 when params is provided but empty', () => {
    buildEscalateAction('wf-1', 'reason', {});
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 0, 0);
  });

  it('parses fix_attempts from reason string when no structured params', () => {
    buildEscalateAction('wf-1', '3 fix attempts failed, score: 5/10');
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 3, 5);
  });

  it('parses last_score from reason string when no structured params', () => {
    buildEscalateAction('wf-1', '2 fix attempts failed, score: 7.5/10');
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 2, 7.5);
  });

  it('defaults to 0 fix_attempts and 0 last_score when regex does not match', () => {
    buildEscalateAction('wf-1', 'no parseable info');
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-1', 0, 0);
  });

  it('passes workflow ID to buildEscalationMessage', () => {
    buildEscalateAction('wf-xyz', 'reason', { fix_attempts: 1, last_score: 6 });
    expect(mockBuildEscalationMessage).toHaveBeenCalledWith('wf-xyz', 1, 6);
  });
});


