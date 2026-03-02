/**
 * Tests for WatchdogCoordinator
 *
 * Covers: construction, checkStaleWorkflows(), drain-stuck escalation,
 * recovery logic (REVIEWING/FIXING), writeUrgentDirectives, cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatchdogCoordinator } from '../watchdog.js';
import type { WatchdogCoordinatorDeps } from '../watchdog.js';
import type { WorkflowInstance } from '../types.js';
import type { Directive } from '../../../shared/ipc/protocol.js';

// ─── Hoisted mocks (must be declared before vi.mock factories) ────────────────────

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  ensureDirSync: vi.fn(),
  writeJsonSync: vi.fn(),
  buildSpawnDirectiveMessage: vi.fn((role: string, task: string) => `SPAWN:${role}:${task}`),
  buildEscalationMessage: vi.fn((wfId: string, attempts: number, score: number) => `ESCALATE:${wfId}:${attempts}:${score}`),
}));

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils.js', () => ({
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  safeJsonParse: (str: string, fallback: unknown) => {
    try { return JSON.parse(str); } catch { return fallback; }
  },
}));

vi.mock('../../../core/utils/fs-utils.js', () => ({
  ensureDirSync: mocks.ensureDirSync,
}));

vi.mock('../../../core/state/file-io.js', () => ({
  writeJsonSync: mocks.writeJsonSync,
}));

vi.mock('../../directives/legacy-directive-builder.js', () => ({
  buildSpawnDirectiveMessage: mocks.buildSpawnDirectiveMessage,
  buildEscalationMessage: mocks.buildEscalationMessage,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STALE_MS = 120_000;

function makeWorkflow(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    id: 'wf_test',
    definition_id: 'wrfc_loop',
    current_state: 'REVIEWING',
    context: {},
    history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date(Date.now() - STALE_MS - 1000).toISOString(), // stale by default
    status: 'active',
    ...overrides,
  };
}

function makeDirective(workflowId: string): Directive {
  return {
    type: 'inject_system_message',
    content: `directive for ${workflowId}`,
    priority: 25,
    source: 'watchdog',
    workflow_id: workflowId,
  };
}

function makeDeps(overrides: Partial<WatchdogCoordinatorDeps> = {}): WatchdogCoordinatorDeps {
  return {
    workflowEngine: {
      listActive: vi.fn().mockReturnValue([]),
    } as any,
    directiveQueue: {
      sweepStaleHolds: vi.fn(),
      peek: vi.fn().mockReturnValue([]),
      drain: vi.fn().mockReturnValue([]),
      enqueue: vi.fn(),
    } as any,
    agentWorkflowMap: {
      addPendingBind: vi.fn(),
    } as any,
    stateDir: '/tmp/test-state',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WatchdogCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply mock implementations after clearAllMocks
    mocks.buildSpawnDirectiveMessage.mockImplementation(
      (role: string, task: string) => `SPAWN:${role}:${task}`,
    );
    mocks.buildEscalationMessage.mockImplementation(
      (wfId: string, attempts: number, score: number) => `ESCALATE:${wfId}:${attempts}:${score}`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Construction ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('constructs without error with valid deps', () => {
      const deps = makeDeps();
      expect(() => new WatchdogCoordinator(deps)).not.toThrow();
    });

    it('constructs with null agentWorkflowMap', () => {
      const deps = makeDeps({ agentWorkflowMap: null });
      expect(() => new WatchdogCoordinator(deps)).not.toThrow();
    });
  });

  // ─── Guard: missing workflowEngine/directiveQueue ───────────────────────────

  describe('checkStaleWorkflows() — guard conditions', () => {
    it('returns immediately when workflowEngine is falsy', () => {
      const deps = makeDeps({ workflowEngine: null as any });
      const watchdog = new WatchdogCoordinator(deps);
      expect(() => watchdog.checkStaleWorkflows()).not.toThrow();
      expect(deps.directiveQueue.sweepStaleHolds).not.toHaveBeenCalled();
    });

    it('returns immediately when directiveQueue is falsy', () => {
      const deps = makeDeps({ directiveQueue: null as any });
      const watchdog = new WatchdogCoordinator(deps);
      expect(() => watchdog.checkStaleWorkflows()).not.toThrow();
    });

    it('calls sweepStaleHolds when deps are present', () => {
      const deps = makeDeps();
      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.sweepStaleHolds).toHaveBeenCalledTimes(1);
    });
  });

  // ─── No active workflows ────────────────────────────────────────────────────

  describe('checkStaleWorkflows() — no active workflows', () => {
    it('does nothing when there are no active workflows', () => {
      const deps = makeDeps();
      (deps.workflowEngine.listActive as any).mockReturnValue([]);
      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  // ─── Healthy workflows (not in transitional state) ──────────────────────────

  describe('checkStaleWorkflows() — non-transitional states', () => {
    it('ignores workflows in WORKING state', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ current_state: 'WORKING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();
    });

    it('ignores workflows in COMPLETED state', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ current_state: 'COMPLETED' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();
    });

    it('handles lowercase reviewing state — toUpperCase normalizes it', () => {
      // The code does .toUpperCase() so lowercase 'reviewing' is also caught
      const deps = makeDeps();
      const wf = makeWorkflow({ current_state: 'reviewing' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      // Stale (updated_at is old), no pending directive → should recover
      expect(deps.directiveQueue.enqueue).toHaveBeenCalled();
    });
  });

  // ─── Not yet stale ──────────────────────────────────────────────────────────

  describe('checkStaleWorkflows() — not yet stale', () => {
    it('does not act on workflows updated recently', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        current_state: 'REVIEWING',
        updated_at: new Date(Date.now() - 1000).toISOString(), // 1 second old — not stale
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  // ─── Cooldown ───────────────────────────────────────────────────────────────

  describe('checkStaleWorkflows() — cooldown', () => {
    it('respects cooldown — does not re-enqueue during cooldown period', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ current_state: 'REVIEWING', id: 'wf_cooldown' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);

      // First call — triggers recovery
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).toHaveBeenCalledTimes(1);

      // Second call immediately — should be blocked by cooldown
      (deps.directiveQueue.enqueue as any).mockClear();
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  // ─── Pending directive (drain-stuck) ────────────────────────────────────────

  describe('checkStaleWorkflows() — drain-stuck detection', () => {
    it('does not enqueue when directive is already pending (tick 1)', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_stuck' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_stuck')]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();
      expect(deps.directiveQueue.drain).not.toHaveBeenCalled();
    });

    it('does not escalate before 3 stuck ticks', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_stuck2' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_stuck2')]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows(); // tick 1
      watchdog.checkStaleWorkflows(); // tick 2

      expect(deps.directiveQueue.drain).not.toHaveBeenCalled();
    });

    it('escalates to file-based delivery after 3+ stuck ticks', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_escalate' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_escalate')]);
      (deps.directiveQueue.drain as any).mockReturnValue([makeDirective('wf_escalate')]);

      mocks.readFileSync.mockImplementation(() => { throw new Error('no file'); });

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows(); // tick 1
      watchdog.checkStaleWorkflows(); // tick 2
      watchdog.checkStaleWorkflows(); // tick 3 — escalation fires

      expect(deps.directiveQueue.drain).toHaveBeenCalledWith('subagent_stop', 'wf_escalate');
      expect(mocks.writeJsonSync).toHaveBeenCalled();
    });

    it('resets stuck count after escalation (tick 4 should not drain again)', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_reset' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_reset')]);
      (deps.directiveQueue.drain as any).mockReturnValue([makeDirective('wf_reset')]);

      mocks.readFileSync.mockImplementation(() => { throw new Error('no file'); });

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows(); // 1
      watchdog.checkStaleWorkflows(); // 2
      watchdog.checkStaleWorkflows(); // 3 — escalation + reset

      (deps.directiveQueue.drain as any).mockClear();
      watchdog.checkStaleWorkflows(); // 4 — stuck count = 1, no drain
      expect(deps.directiveQueue.drain).not.toHaveBeenCalled();
    });
  });

  // ─── Recovery: REVIEWING state ───────────────────────────────────────────────

  describe('checkStaleWorkflows() — REVIEWING recovery', () => {
    it('enqueues reviewer spawn directive for stale REVIEWING workflow', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_rev', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).toHaveBeenCalledWith(
        'subagent_stop',
        expect.objectContaining({
          type: 'inject_system_message',
          source: 'watchdog',
          workflow_id: 'wf_rev',
          priority: 25,
        }),
      );
    });

    it('calls buildSpawnDirectiveMessage with reviewer role', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_rev_msg', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.any(String),
        undefined,
        expect.objectContaining({ workflow_id: 'wf_rev_msg' }),
      );
    });

    it('calls addPendingBind for reviewer when agentWorkflowMap is present', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_rev2', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.agentWorkflowMap!.addPendingBind).toHaveBeenCalledWith('reviewer', 'wf_rev2');
      expect(deps.agentWorkflowMap!.addPendingBind).toHaveBeenCalledWith('goodvibes:reviewer', 'wf_rev2');
    });

    it('skips addPendingBind when agentWorkflowMap is null', () => {
      const deps = makeDeps({ agentWorkflowMap: null });
      const wf = makeWorkflow({ id: 'wf_rev3', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      expect(() => watchdog.checkStaleWorkflows()).not.toThrow();
    });

    it('includes files_modified from workflow context in task message', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_files',
        current_state: 'REVIEWING',
        context: { files_modified: ['src/a.ts', 'src/b.ts'] },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.stringContaining('src/a.ts'),
        undefined,
        expect.objectContaining({ workflow_id: 'wf_files' }),
      );
    });

    it('uses fallback message when files_modified is missing', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_nofiles',
        current_state: 'REVIEWING',
        context: {},
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.stringContaining('Check all recently modified files'),
        undefined,
        expect.any(Object),
      );
    });

    it('uses non-array files_modified as empty array', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_nonarray',
        current_state: 'REVIEWING',
        context: { files_modified: 'single-file.ts' }, // not an array
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.stringContaining('Check all recently modified files'),
        undefined,
        expect.any(Object),
      );
    });
  });

  // ─── Recovery: FIXING state — fix budget remaining ──────────────────────────

  describe('checkStaleWorkflows() — FIXING recovery (budget remaining)', () => {
    it('enqueues engineer fix directive when fix_attempts < max_fix_attempts', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_fix',
        current_state: 'FIXING',
        context: { fix_attempts: 1, max_fix_attempts: 3 },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).toHaveBeenCalledWith(
        'subagent_stop',
        expect.objectContaining({
          type: 'inject_system_message',
          source: 'watchdog',
          workflow_id: 'wf_fix',
          priority: 25,
        }),
      );
    });

    it('calls addPendingBind for engineer when FIXING', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_fix2',
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3 },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.agentWorkflowMap!.addPendingBind).toHaveBeenCalledWith('engineer', 'wf_fix2');
      expect(deps.agentWorkflowMap!.addPendingBind).toHaveBeenCalledWith('goodvibes:engineer', 'wf_fix2');
    });

    it('uses defaults when fix_attempts/max_fix_attempts are not numbers', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_defaults',
        current_state: 'FIXING',
        context: {}, // no fix_attempts, no max_fix_attempts
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows(); // fix_attempts=0 < max=3 → engineer

      expect(deps.directiveQueue.enqueue).toHaveBeenCalledWith(
        'subagent_stop',
        expect.objectContaining({ priority: 25 }),
      );
    });

    it('includes review_issues summary in fix task when issues exist', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_issues',
        current_state: 'FIXING',
        context: {
          fix_attempts: 0,
          max_fix_attempts: 3,
          review_score: 5,
          review_issues: [
            { dimension: 'correctness', severity: 'critical', description: 'Bug A' },
          ],
        },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'engineer',
        expect.stringContaining('Bug A'),
        undefined,
        expect.objectContaining({ review_score: 5 }),
      );
    });

    it('uses fallback issues text when review_issues is empty', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_noissues',
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3, review_issues: [] },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'engineer',
        expect.stringContaining('See previous review output'),
        undefined,
        expect.any(Object),
      );
    });

    it('uses fallback issues text when review_issues is missing', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_noissues2',
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3 },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'engineer',
        expect.stringContaining('See previous review output'),
        undefined,
        expect.any(Object),
      );
    });
  });

  // ─── Recovery: FIXING state — budget exhausted ──────────────────────────────

  describe('checkStaleWorkflows() — FIXING recovery (budget exhausted)', () => {
    it('enqueues escalation directive when fix_attempts >= max_fix_attempts', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_exhaust',
        current_state: 'FIXING',
        context: { fix_attempts: 3, max_fix_attempts: 3, review_score: 4 },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).toHaveBeenCalledWith(
        'subagent_stop',
        expect.objectContaining({
          type: 'inject_system_message',
          source: 'watchdog',
          workflow_id: 'wf_exhaust',
          priority: 30, // escalation priority
        }),
      );
    });

    it('calls buildEscalationMessage with correct args', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_esc2',
        current_state: 'FIXING',
        context: { fix_attempts: 5, max_fix_attempts: 3, review_score: 3 },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildEscalationMessage).toHaveBeenCalledWith('wf_esc2', 5, 3);
    });

    it('uses default score of 0 when review_score is not a number', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({
        id: 'wf_noscore',
        current_state: 'FIXING',
        context: { fix_attempts: 3, max_fix_attempts: 3 },
      });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(mocks.buildEscalationMessage).toHaveBeenCalledWith('wf_noscore', 3, 0);
    });
  });

  // ─── Cleanup: inactive workflow map entries ──────────────────────────────────

  describe('checkStaleWorkflows() — inactive workflow cleanup', () => {
    it('cleans up watchdogRecovery entries for completed workflows', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_cleanup', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      // First call — records recovery for wf_cleanup
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).toHaveBeenCalledTimes(1);

      // Workflow completes (not in active list anymore)
      (deps.workflowEngine.listActive as any).mockReturnValue([]);
      (deps.directiveQueue.enqueue as any).mockClear();

      watchdog.checkStaleWorkflows(); // cleanup tick
      expect(deps.directiveQueue.enqueue).not.toHaveBeenCalled();

      // Workflow re-appears — cooldown should be cleared, so new recovery can happen
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      watchdog.checkStaleWorkflows();
      expect(deps.directiveQueue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('cleans up drainStuckCounts entries for completed workflows', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_stuck_clean', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_stuck_clean')]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows(); // stuck count = 1
      watchdog.checkStaleWorkflows(); // stuck count = 2

      // Workflow disappears
      (deps.workflowEngine.listActive as any).mockReturnValue([]);
      watchdog.checkStaleWorkflows(); // cleanup

      // Re-appears — stuck count should be reset to 0
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.drain as any).mockReturnValue([makeDirective('wf_stuck_clean')]);
      mocks.readFileSync.mockImplementation(() => { throw new Error('no file'); });

      watchdog.checkStaleWorkflows(); // 1
      watchdog.checkStaleWorkflows(); // 2
      // Still no escalation after 2 ticks from reset
      expect(deps.directiveQueue.drain).not.toHaveBeenCalled();
    });
  });

  // ─── writeUrgentDirectives ───────────────────────────────────────────────────

  describe('writeUrgentDirectives (via drain-stuck escalation)', () => {
    it('merges with existing urgent directives file if it exists', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_merge' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_merge')]);
      (deps.directiveQueue.drain as any).mockReturnValue([makeDirective('wf_merge')]);

      const existing: Directive = {
        type: 'inject_system_message',
        content: 'existing directive',
        priority: 10,
        source: 'prior',
      };
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({ directives: [existing] }),
      );

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows(); // escalation

      expect(mocks.writeJsonSync).toHaveBeenCalledWith(
        expect.stringContaining('urgent-directives.json'),
        expect.objectContaining({
          directives: expect.arrayContaining([
            expect.objectContaining({ content: 'existing directive' }),
            expect.objectContaining({ content: expect.stringContaining('wf_merge') }),
          ]),
        }),
      );
    });

    it('handles malformed existing urgent-directives.json gracefully', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_malformed' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_malformed')]);
      (deps.directiveQueue.drain as any).mockReturnValue([makeDirective('wf_malformed')]);

      mocks.readFileSync.mockReturnValue('not-valid-json{{{');

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows(); // escalation

      expect(mocks.writeJsonSync).toHaveBeenCalled();
    });

    it('handles existing file with non-array directives field gracefully', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_nonarray_file' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_nonarray_file')]);
      (deps.directiveQueue.drain as any).mockReturnValue([makeDirective('wf_nonarray_file')]);

      mocks.readFileSync.mockReturnValue(JSON.stringify({ directives: 'not-an-array' }));

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows(); // escalation

      expect(mocks.writeJsonSync).toHaveBeenCalled();
    });

    it('does nothing when drain returns empty array', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_empty_drain' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_empty_drain')]);
      (deps.directiveQueue.drain as any).mockReturnValue([]); // nothing drained

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows(); // escalation — drain returns empty

      expect(mocks.writeJsonSync).not.toHaveBeenCalled();
    });

    it('re-enqueues directives when writeJsonSync throws', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_writefail' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_writefail')]);
      const drainedDir = makeDirective('wf_writefail');
      (deps.directiveQueue.drain as any).mockReturnValue([drainedDir]);

      mocks.readFileSync.mockImplementation(() => { throw new Error('no file'); });
      mocks.writeJsonSync.mockImplementation(() => { throw new Error('disk full'); });

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows();
      watchdog.checkStaleWorkflows(); // escalation — write fails

      expect(deps.directiveQueue.enqueue).toHaveBeenCalledWith('subagent_stop', drainedDir);
    });
  });

  // ─── Multiple workflows in same tick ────────────────────────────────────────

  describe('checkStaleWorkflows() — multiple workflows', () => {
    it('processes multiple stale workflows in one tick', () => {
      const deps = makeDeps();
      const wf1 = makeWorkflow({ id: 'wf_multi1', current_state: 'REVIEWING' });
      const wf2 = makeWorkflow({ id: 'wf_multi2', current_state: 'FIXING', context: { fix_attempts: 1, max_fix_attempts: 3 } });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf1, wf2]);
      (deps.directiveQueue.peek as any).mockReturnValue([]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Pending directive matching ───────────────────────────────────────────────

  describe('pending directive matching', () => {
    it('does not treat pending directive for different workflow as match', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_real', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([makeDirective('wf_other')]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).toHaveBeenCalled();
    });

    it('does not treat directive with non-string content as match', () => {
      const deps = makeDeps();
      const wf = makeWorkflow({ id: 'wf_nocontent', current_state: 'REVIEWING' });
      (deps.workflowEngine.listActive as any).mockReturnValue([wf]);
      (deps.directiveQueue.peek as any).mockReturnValue([{
        type: 'inject_system_message',
        content: 42, // not a string
        priority: 25,
        source: 'test',
      }]);

      const watchdog = new WatchdogCoordinator(deps);
      watchdog.checkStaleWorkflows();

      expect(deps.directiveQueue.enqueue).toHaveBeenCalled();
    });
  });
});
