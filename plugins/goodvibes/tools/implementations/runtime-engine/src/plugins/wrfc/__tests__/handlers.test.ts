import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RuntimeEvent } from '../../../shared/events.js';
import type { StateStoreInterface, Trigger } from '../../../core/types.js';

// ─── Mocks ─────────────────────────────────────────────────────────────────

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock score evaluator (extractScore)
const mockExtractScore = vi.fn();
vi.mock('../score-evaluator.js', () => ({
  extractScore: (...args: unknown[]) => mockExtractScore(...args),
}));

// Mock directive builder
const mockBuildSpawnAction = vi.fn();
const mockBuildCompleteAction = vi.fn();
const mockBuildEscalateAction = vi.fn();
vi.mock('../directive-builder.js', () => ({
  buildSpawnAction: (...args: unknown[]) => mockBuildSpawnAction(...args),
  buildCompleteAction: (...args: unknown[]) => mockBuildCompleteAction(...args),
  buildEscalateAction: (...args: unknown[]) => mockBuildEscalateAction(...args),
}));

// Mock gv-tag-parser (extractFiles)
const mockExtractFiles = vi.fn();
vi.mock('../../../extensions/directives/gv-tag-parser.js', () => ({
  extractFiles: (...args: unknown[]) => mockExtractFiles(...args),
  parseGvTag: vi.fn().mockReturnValue({ found: false }),
}));

// Mock shared/events createEvent — return a minimal RuntimeEvent shape
const mockCreateEvent = vi.fn();
vi.mock('../../../shared/events.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/events.js')>();
  return {
    ...original,
    createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  };
});

// Import handlers AFTER all mocks are set up
import {
  handleWorkflowCreated,
  handleAgentCompleted,
  handleQualityGate,
  resolveWorkflowId,
  resetRequireReviewCache,
  DEFAULT_MAX_FIX_ATTEMPTS,
  HANDLER_IDS,
  TRIGGER_IDS,
} from '../handlers.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal RuntimeEvent for testing. */
function makeEvent(payload: Record<string, unknown> = {}, contextOverrides: Record<string, unknown> = {}): RuntimeEvent {
  return {
    id: 'evt-1',
    timestamp: Date.now(),
    type: 'agent:completed' as RuntimeEvent['type'],
    source: { kind: 'agent' },
    payload: payload as RuntimeEvent['payload'],
    metadata: { session_id: 'test-session' },
    context: { chain_depth: 0, ...contextOverrides },
  } as unknown as RuntimeEvent;
}

/** Build a minimal Trigger stub. */
const STUB_TRIGGER = {} as unknown as Trigger;

/**
 * Build a mock StateStoreInterface backed by a plain Map.
 * Supports get/set/delete operations.
 */
function makeStore(initial: Record<string, unknown> = {}): StateStoreInterface {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get: <T>(key: string): T | null => {
      const val = data.get(key);
      return val !== undefined ? (val as T) : null;
    },
    set: (key: string, value: unknown) => { data.set(key, value); },
    delete: (key: string) => { data.delete(key); },
    has: (key: string) => data.has(key),
    keys: () => Array.from(data.keys()),
  } as unknown as StateStoreInterface;
}

/** Helper: session-scoped workflow state key (uses 'test-session' to match makeEvent). */
const WS = (wid: string, field: string) => `wrfc.sessions.test-session.workflows.${wid}.${field}`;

/** Helper: session-scoped agent-map key. */
const AM = (agentId: string) => `wrfc.sessions.test-session.agent_map.${agentId}`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WRFC Handlers', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    resetRequireReviewCache();
    // Default mock return values
    mockExtractScore.mockReturnValue(null);
    mockExtractFiles.mockReturnValue([]);
    mockBuildSpawnAction.mockReturnValue({ type: 'send_message', params: { content: 'spawn', priority: 20, target: 'subagent_stop' } });
    mockBuildCompleteAction.mockReturnValue({ type: 'send_message', params: { content: 'complete', priority: 20, target: 'subagent_stop' } });
    mockBuildEscalateAction.mockReturnValue({ type: 'send_message', params: { content: 'escalate', priority: 30, target: 'subagent_stop' } });
    mockCreateEvent.mockImplementation((opts: Record<string, unknown>) => ({
      id: 'chain-evt',
      type: opts['type'],
      payload: opts['payload'],
      context: opts['context'],
    }));
  });

  // ─── Module-level exports ────────────────────────────────────────────────────

  describe('module exports', () => {
    it('exports DEFAULT_MAX_FIX_ATTEMPTS as a positive number', () => {
      expect(DEFAULT_MAX_FIX_ATTEMPTS).toBeGreaterThan(0);
      expect(typeof DEFAULT_MAX_FIX_ATTEMPTS).toBe('number');
    });

    it('exports HANDLER_IDS with expected keys', () => {
      expect(HANDLER_IDS.WORKFLOW_CREATED).toBeDefined();
      expect(HANDLER_IDS.AGENT_COMPLETED).toBeDefined();
      expect(HANDLER_IDS.QUALITY_GATE).toBeDefined();
    });

    it('exports TRIGGER_IDS with expected keys', () => {
      expect(TRIGGER_IDS.AGENT_SPAWNED).toBeDefined();
      expect(TRIGGER_IDS.AGENT_COMPLETED).toBeDefined();
      expect(TRIGGER_IDS.REVIEW_COMPLETED).toBeDefined();
    });
  });

  // ─── handleWorkflowCreated ──────────────────────────────────────────────────

  describe('handleWorkflowCreated', () => {
    it('returns empty result when no agent_id in payload', () => {
      const event = makeEvent({});
      const result = handleWorkflowCreated(event, STUB_TRIGGER, makeStore());
      expect(result).toEqual({});
    });

    it('initialises new workflow state for chain originator (no incoming workflow_id)', () => {
      const event = makeEvent({ agent_id: 'agent-1', agent_type: 'engineer', task: 'build feature' });
      const result = handleWorkflowCreated(event, STUB_TRIGGER, makeStore());
      expect(result.state_updates).toBeDefined();
      const updates = result.state_updates!;
      const phaseUpdate = updates.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate?.value).toBe('WRITING');
      const agentIdUpdate = updates.find((u) => u.key.endsWith('.agent_id'));
      expect(agentIdUpdate?.value).toBe('agent-1');
      const taskUpdate = updates.find((u) => u.key.endsWith('.task'));
      expect(taskUpdate?.value).toBe('build feature');
      const fixAttemptsUpdate = updates.find((u) => u.key.endsWith('.fix_attempts'));
      expect(fixAttemptsUpdate?.value).toBe(0);
    });

    it('binds chain agent to existing workflow when workflow_id provided', () => {
      const event = makeEvent({ agent_id: 'agent-2', agent_type: 'reviewer', workflow_id: 'wf-existing' });
      const result = handleWorkflowCreated(event, STUB_TRIGGER, makeStore());
      expect(result.state_updates).toBeDefined();
      const updates = result.state_updates!;
      // Only agent_map binding, no workflow init
      const agentMapUpdate = updates.find((u) => u.key === AM('agent-2'));
      expect(agentMapUpdate?.value).toBe('wf-existing');
      // Should NOT have phase or fix_attempts init updates
      const phaseUpdate = updates.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate).toBeUndefined();
    });

    it('uses config values for score_threshold and max_fix_attempts from store', () => {
      const store = makeStore({
        'wrfc.config.score_threshold': 8.0,
        'wrfc.config.max_fix_attempts': 5,
      });
      const event = makeEvent({ agent_id: 'agent-3', agent_type: 'engineer' });
      const result = handleWorkflowCreated(event, STUB_TRIGGER, store);
      const updates = result.state_updates!;
      const minScoreUpdate = updates.find((u) => u.key.endsWith('.score_threshold'));
      expect(minScoreUpdate?.value).toBe(8.0);
      const maxFixUpdate = updates.find((u) => u.key.endsWith('.max_fix_attempts'));
      expect(maxFixUpdate?.value).toBe(5);
    });

    it('derives workflow ID as wrfc_<agentId> for chain originator', () => {
      const event = makeEvent({ agent_id: 'agent-xyz' });
      const result = handleWorkflowCreated(event, STUB_TRIGGER, makeStore());
      const agentMapUpdate = result.state_updates!.find((u) => u.key === AM('agent-xyz'));
      expect(agentMapUpdate?.value).toBe('wrfc_agent-xyz');
    });
  });

  // ─── handleAgentCompleted ───────────────────────────────────────────────────

  describe('handleAgentCompleted', () => {
    // ─── No workflow binding ──────────────────────────────────────────────
    it('returns empty when no workflow binding found for agent', () => {
      const event = makeEvent({ agent_id: 'agent-99', agent_type: 'engineer' });
      const result = handleAgentCompleted(event, STUB_TRIGGER, makeStore());
      expect(result).toEqual({});
    });

    it('resolves workflow_id from payload when agent_map binding is missing', () => {
      // workflow_id provided directly in payload
      const store = makeStore({
        [WS('wf-direct', 'phase')]: 'WRITING',
        [WS('wf-direct', 'score_threshold')]: 9.5,
        [WS('wf-direct', 'max_fix_attempts')]: 3,
        [WS('wf-direct', 'fix_attempts')]: 0,
        [WS('wf-direct', 'files_modified')]: [],
      });
      // Normal agent type (no auto-complete, no require-review) spawns reviewer
      const event = makeEvent({ agent_id: 'agent-1', agent_type: 'some-agent', workflow_id: 'wf-direct' });
      const result = handleAgentCompleted(event, STUB_TRIGGER, store);
      // Should spawn reviewer
      expect(mockBuildSpawnAction).toHaveBeenCalled();
      expect(result.actions).toHaveLength(1);
    });

    // ─── WRITING phase: auto-complete ────────────────────────────────────
    describe('WRITING phase — auto-complete agent types', () => {
      const AUTO_TYPES = ['Explore', 'Plan', 'Bash', 'general-purpose', 'reviewer', 'goodvibes:reviewer'];

      for (const agentType of AUTO_TYPES) {
        it(`auto-completes workflow for agent type "${agentType}"`, () => {
          const store = makeStore({
            [AM('agent-auto')]: 'wf-1',
            [WS('wf-1', 'phase')]: 'WRITING',
            [WS('wf-1', 'score_threshold')]: 9.5,
            [WS('wf-1', 'max_fix_attempts')]: 3,
            [WS('wf-1', 'fix_attempts')]: 0,
            [WS('wf-1', 'files_modified')]: [],
          });
          const event = makeEvent({ agent_id: 'agent-auto', agent_type: agentType });
          const result = handleAgentCompleted(event, STUB_TRIGGER, store);
          expect(mockBuildCompleteAction).toHaveBeenCalledWith('wf-1');
          expect(result.actions).toHaveLength(1);
          const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
          expect(phaseUpdate?.value).toBe('COMPLETED');
          // No spawn should be called
          expect(mockBuildSpawnAction).not.toHaveBeenCalled();
        });
      }
    });

    // ─── WRITING phase: require-review (engineer types) ─────────────────────
    describe('WRITING phase — require-review agent types', () => {
      const REQUIRE_REVIEW_TYPES = ['engineer', 'goodvibes:engineer'];

      for (const agentType of REQUIRE_REVIEW_TYPES) {
        it(`force-reviews for agent type "${agentType}"`, () => {
          const store = makeStore({
            [AM('agent-eng')]: 'wf-1',
            [WS('wf-1', 'phase')]: 'WRITING',
            [WS('wf-1', 'score_threshold')]: 9.5,
            [WS('wf-1', 'max_fix_attempts')]: 3,
            [WS('wf-1', 'fix_attempts')]: 0,
            [WS('wf-1', 'files_modified')]: ['src/foo.ts'],
          });
          const event = makeEvent({ agent_id: 'agent-eng', agent_type: agentType });
          const result = handleAgentCompleted(event, STUB_TRIGGER, store);
          expect(mockBuildSpawnAction).toHaveBeenCalledWith(
            expect.objectContaining({ wid: 'wf-1', type: 'reviewer' })
          );
          expect(result.actions).toHaveLength(1);
          const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
          expect(phaseUpdate?.value).toBe('REVIEWING');
          // Should emit wrfc:review_started event
          expect(mockCreateEvent).toHaveBeenCalled();
          expect(result.events).toHaveLength(1);
        });
      }
    });

    // ─── WRITING phase: normal work agent (no special type) ────────────────
    describe('WRITING phase — normal work agent', () => {
      it('spawns reviewer and advances to REVIEWING', () => {
        const store = makeStore({
          [AM('agent-work')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'WRITING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-work', agent_type: 'custom-worker' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildSpawnAction).toHaveBeenCalledWith(
          expect.objectContaining({ wid: 'wf-1', type: 'reviewer' })
        );
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('REVIEWING');
        expect(result.events).toHaveLength(1);
      });

      it('includes files_modified in reviewer task when present', () => {
        const store = makeStore({
          [AM('agent-work')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'WRITING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: ['src/a.ts', 'src/b.ts'],
        });
        const event = makeEvent({ agent_id: 'agent-work', agent_type: 'custom-worker' });
        handleAgentCompleted(event, STUB_TRIGGER, store);
        const spawnCall = mockBuildSpawnAction.mock.calls[0][0];
        expect(spawnCall.files).toEqual(['src/a.ts', 'src/b.ts']);
      });
    });

    // ─── WRITING phase: early stuck states ─────────────────────────────
    describe('WRITING phase — early stuck states treated as WRITING', () => {
      for (const phase of ['IDLE', 'GATHERING', 'PLANNING']) {
        it(`treats ${phase} phase as WRITING for normal agent type`, () => {
          const store = makeStore({
            [AM('agent-1')]: 'wf-1',
            [WS('wf-1', 'phase')]: phase,
            [WS('wf-1', 'score_threshold')]: 9.5,
            [WS('wf-1', 'max_fix_attempts')]: 3,
            [WS('wf-1', 'fix_attempts')]: 0,
            [WS('wf-1', 'files_modified')]: [],
          });
          const event = makeEvent({ agent_id: 'agent-1', agent_type: 'custom-worker' });
          const result = handleAgentCompleted(event, STUB_TRIGGER, store);
          // Treated as WRITING: spawns reviewer
          expect(mockBuildSpawnAction).toHaveBeenCalled();
          const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
          expect(phaseUpdate?.value).toBe('REVIEWING');
        });
      }
    });

    // ─── REVIEWING phase: reviewer passes ──────────────────────────────
    describe('REVIEWING phase — reviewer passes', () => {
      it('completes workflow when score meets threshold', () => {
        mockExtractScore.mockReturnValue(9.5);
        const store = makeStore({
          [AM('agent-rev')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'REVIEWING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-rev', agent_type: 'reviewer', last_assistant_message: 'SCORE: 9.5/10' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildCompleteAction).toHaveBeenCalledWith('wf-1');
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('COMPLETED');
        const scoreUpdate = result.state_updates!.find((u) => u.key.endsWith('.review_score'));
        expect(scoreUpdate?.value).toBe(9.5);
        expect(result.events).toHaveLength(1);
      });

      it('completes workflow when score exceeds threshold', () => {
        mockExtractScore.mockReturnValue(10);
        const store = makeStore({
          [AM('agent-rev')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'REVIEWING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-rev', agent_type: 'reviewer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildCompleteAction).toHaveBeenCalledWith('wf-1');
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('COMPLETED');
      });
    });

    // ─── REVIEWING phase: reviewer fails ──────────────────────────────
    describe('REVIEWING phase — reviewer fails', () => {
      it('spawns fixer when score is below threshold', () => {
        mockExtractScore.mockReturnValue(7.0);
        const store = makeStore({
          [AM('agent-rev')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'REVIEWING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-rev', agent_type: 'reviewer', last_assistant_message: 'SCORE: 7/10' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildSpawnAction).toHaveBeenCalledWith(
          expect.objectContaining({ wid: 'wf-1', type: 'engineer' })
        );
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('FIXING');
        const scoreUpdate = result.state_updates!.find((u) => u.key.endsWith('.review_score'));
        expect(scoreUpdate?.value).toBe(7.0);
      });
    });

    // ─── REVIEWING phase: null score (parse failure) ───────────────────
    describe('REVIEWING phase — null score', () => {
      it('escalates when review score cannot be parsed', () => {
        mockExtractScore.mockReturnValue(null);
        const store = makeStore({
          [AM('agent-rev')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'REVIEWING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-rev', agent_type: 'reviewer', last_assistant_message: 'no score here' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildEscalateAction).toHaveBeenCalledWith('wf-1', expect.stringContaining('parse failed'));
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('ESCALATED');
        // Emits wrfc:review_parse_failed event
        expect(mockCreateEvent).toHaveBeenCalled();
        expect(result.events).toHaveLength(1);
      });
    });

    // ─── REVIEWING phase: non-reviewer agent ignored ────────────────────
    describe('REVIEWING phase — non-reviewer agent', () => {
      it('returns empty result for non-reviewer agent in REVIEWING phase', () => {
        const store = makeStore({
          [AM('agent-eng')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'REVIEWING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-eng', agent_type: 'engineer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(result).toEqual({});
      });
    });

    // ─── FIXING phase: budget exhausted ───────────────────────────────
    describe('FIXING phase — budget exhausted', () => {
      it('escalates when fix attempts reach max', () => {
        mockExtractFiles.mockReturnValue([]);
        const store = makeStore({
          [AM('agent-fix')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'FIXING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 2, // next will be 3 = max
          [WS('wf-1', 'files_modified')]: [],
          [WS('wf-1', 'review_score')]: 5.0,
        });
        const event = makeEvent({ agent_id: 'agent-fix', agent_type: 'engineer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildEscalateAction).toHaveBeenCalledWith('wf-1', expect.any(String));
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('ESCALATED');
        const fixAttemptsUpdate = result.state_updates!.find((u) => u.key.endsWith('.fix_attempts'));
        expect(fixAttemptsUpdate?.value).toBe(3);
      });
    });

    // ─── FIXING phase: still budget, re-review ─────────────────────────
    describe('FIXING phase — re-review', () => {
      it('spawns reviewer for re-review when fix budget not exhausted', () => {
        mockExtractFiles.mockReturnValue([]);
        const store = makeStore({
          [AM('agent-fix')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'FIXING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 1,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-fix', agent_type: 'engineer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(mockBuildSpawnAction).toHaveBeenCalledWith(
          expect.objectContaining({ wid: 'wf-1', type: 'reviewer' })
        );
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('REVIEWING');
        const fixAttemptsUpdate = result.state_updates!.find((u) => u.key.endsWith('.fix_attempts'));
        expect(fixAttemptsUpdate?.value).toBe(2);
        expect(result.events).toHaveLength(1);
      });

      it('merges engineer-reported files from <gv> tag with existing files', () => {
        mockExtractFiles.mockReturnValue(['src/new.ts']);
        const store = makeStore({
          [AM('agent-fix')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'FIXING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: ['src/existing.ts'],
        });
        const event = makeEvent({ agent_id: 'agent-fix', agent_type: 'engineer', last_assistant_message: '<gv>{...}</gv>' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        const filesUpdate = result.state_updates!.find((u) => u.key.endsWith('.files_modified'));
        expect(filesUpdate?.value).toEqual(expect.arrayContaining(['src/existing.ts', 'src/new.ts']));
      });
    });

    // ─── FIXING phase: non-engineer agent ignored ─────────────────────
    describe('FIXING phase — non-engineer agent', () => {
      it('returns empty result for non-engineer agent in FIXING phase', () => {
        const store = makeStore({
          [AM('agent-rev')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'FIXING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-rev', agent_type: 'reviewer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(result).toEqual({});
      });
    });

    // ─── Unhandled phase ──────────────────────────────────────────────────
    describe('unhandled phase', () => {
      it('returns empty result for unknown/unhandled phase', () => {
        const store = makeStore({
          [AM('agent-1')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'COMPLETED',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-1', agent_type: 'engineer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        expect(result).toEqual({});
      });
    });

    // ─── hook_input shape compatibility ───────────────────────────────
    describe('hook_input payload shape', () => {
      it('resolves agent_id and type from hook_input nested payload', () => {
        const store = makeStore({
          [AM('agent-hook')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'WRITING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        // hook_input shape: agent_id at top level, agent_type inside hook_input
        const event = makeEvent({
          agent_id: 'agent-hook',
          hook_input: { agent_type: 'custom-worker', last_assistant_message: 'done' },
        });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        // custom-worker is normal: spawns reviewer
        expect(mockBuildSpawnAction).toHaveBeenCalled();
        expect(result.actions).toHaveLength(1);
      });
    });

    // ─── config override: require_review_types ────────────────────────
    describe('config override: require_review_types', () => {
      it('adds custom types to require-review set from store config', () => {
        const store = makeStore({
          'wrfc.config.require_review_types': ['custom-writer'],
          [AM('agent-cw')]: 'wf-1',
          [WS('wf-1', 'phase')]: 'WRITING',
          [WS('wf-1', 'score_threshold')]: 9.5,
          [WS('wf-1', 'max_fix_attempts')]: 3,
          [WS('wf-1', 'fix_attempts')]: 0,
          [WS('wf-1', 'files_modified')]: [],
        });
        const event = makeEvent({ agent_id: 'agent-cw', agent_type: 'custom-writer' });
        const result = handleAgentCompleted(event, STUB_TRIGGER, store);
        // Should force-review because custom-writer is in require_review_types config
        expect(mockBuildSpawnAction).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'reviewer' })
        );
        const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
        expect(phaseUpdate?.value).toBe('REVIEWING');
      });
    });
  });

  // ─── handleQualityGate ────────────────────────────────────────────────────

  describe('handleQualityGate', () => {
    it('returns empty when no workflow_id in payload', () => {
      const event = makeEvent({});
      const result = handleQualityGate(event, STUB_TRIGGER, makeStore());
      expect(result).toEqual({});
    });

    it('returns empty when review_score is not a valid number', () => {
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 'not-a-number' });
      const result = handleQualityGate(event, STUB_TRIGGER, makeStore());
      expect(result).toEqual({});
    });

    it('returns empty when workflow phase is already COMPLETED', () => {
      const store = makeStore({
        [WS('wf-1', 'phase')]: 'COMPLETED',
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 9.5 });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(result).toEqual({});
    });

    it('returns empty when workflow phase is already ESCALATED', () => {
      const store = makeStore({
        [WS('wf-1', 'phase')]: 'ESCALATED',
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 3,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 5.0 });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(result).toEqual({});
    });

    it('completes workflow when score meets score_threshold', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 9.5 });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(mockBuildCompleteAction).toHaveBeenCalledWith('wf-1');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate?.value).toBe('COMPLETED');
    });

    it('completes workflow when score exceeds score_threshold', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 8.0,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 10 });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(mockBuildCompleteAction).toHaveBeenCalledWith('wf-1');
    });

    it('spawns fixer when score fails and fix budget not exhausted', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: ['src/foo.ts'],
      });
      const event = makeEvent({
        workflow_id: 'wf-1',
        review_score: 7.0,
        issues: 'Missing error handling in foo.ts',
      });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(mockBuildSpawnAction).toHaveBeenCalledWith(
        expect.objectContaining({ wid: 'wf-1', type: 'engineer' })
      );
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate?.value).toBe('FIXING');
      const fixAttemptsUpdate = result.state_updates!.find((u) => u.key.endsWith('.fix_attempts'));
      expect(fixAttemptsUpdate?.value).toBe(1);
      expect(result.events).toHaveLength(1);
    });

    it('escalates when score fails and fix budget is exhausted', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 2,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 5.0 });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(mockBuildEscalateAction).toHaveBeenCalledWith('wf-1', expect.any(String));
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate?.value).toBe('ESCALATED');
    });

    it('uses fallback issues message when issues field is empty', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 6.0 });
      // No issues field: uses fallback
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(result.actions).toHaveLength(1);
      const spawnCall = mockBuildSpawnAction.mock.calls[0][0];
      expect(spawnCall.task).toContain('Fix the issues identified');
    });

    it('records the review_score in state updates', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: 8.0 });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      const scoreUpdate = result.state_updates!.find((u) => u.key.endsWith('.review_score'));
      expect(scoreUpdate?.value).toBe(8.0);
    });

    it('accepts numeric string review_score via parseFloat', () => {
      const store = makeStore({
        [WS('wf-1', 'score_threshold')]: 9.5,
        [WS('wf-1', 'fix_attempts')]: 0,
        [WS('wf-1', 'max_fix_attempts')]: 3,
        [WS('wf-1', 'files_modified')]: [],
      });
      const event = makeEvent({ workflow_id: 'wf-1', review_score: '9.5' });
      const result = handleQualityGate(event, STUB_TRIGGER, store);
      expect(mockBuildCompleteAction).toHaveBeenCalledWith('wf-1');
      const phaseUpdate = result.state_updates!.find((u) => u.key.endsWith('.phase'));
      expect(phaseUpdate?.value).toBe('COMPLETED');
    });
  });

  // ─── resolveWorkflowId ────────────────────────────────────────────────────

  describe('resolveWorkflowId', () => {
    it('returns null for null agentId', () => {
      const store = makeStore();
      expect(resolveWorkflowId(null, store)).toBeNull();
    });

    it('returns null when agent has no workflow binding', () => {
      const store = makeStore();
      expect(resolveWorkflowId('agent-unknown', store)).toBeNull();
    });

    it('returns workflow ID when agent is bound to one', () => {
      const store = makeStore({ [AM('agent-1')]: 'wf-bound' });
      expect(resolveWorkflowId('agent-1', store, 'test-session')).toBe('wf-bound');
    });
  });
});
