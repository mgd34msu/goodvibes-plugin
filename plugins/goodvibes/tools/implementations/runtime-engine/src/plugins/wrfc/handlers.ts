/**
 * WRFC Event Handlers — WRFC Plugin (Layer 3)
 *
 * Repackages the WRFC orchestration logic from wrfc-handlers.ts as event
 * handlers that conform to the v3 event loop contract:
 *   - Accept (RuntimeEvent, store) and return HandlerResult
 *   - State changes via state_updates (no direct mutations)
 *   - Side-effects via actions (send_message, emit_event)
 *   - New events via events (causal chaining)
 *
 * The three key handlers:
 *   - handleWorkflowCreated   — initialises workflow state on agent:spawned
 *   - handleAgentCompleted    — routes on agent:completed (WRITING / REVIEWING / FIXING)
 *   - handleQualityGate       — evaluates score threshold on wrfc:review_completed
 */

import { createLogger } from '../../shared/logger.js';
import type { RuntimeEvent, HandlerResult, StateUpdate, Action, StateStoreInterface } from '../../core/types.js';
import { createEvent } from '../../core/types.js';
import type { Trigger } from '../../core/types.js';
import { extractFiles } from '../../directives/gv-tag-parser.js';
import { extractScore } from './score-evaluator.js';
import {
  buildSpawnAction,
  buildCompleteAction,
  buildEscalateAction,
} from './directive-builder.js';

const log = createLogger('wrfc-plugin:handlers');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default minimum review score to pass (configurable per workflow). */
export const DEFAULT_MIN_REVIEW_SCORE = 9.5;

/** Default maximum fix attempts before escalation. */
export const DEFAULT_MAX_FIX_ATTEMPTS = 3;

/** Agent type identifiers that are treated as reviewers. */
export const REVIEWER_AGENT_TYPES = new Set(['reviewer', 'goodvibes:reviewer']);

/** Agent type identifiers that are treated as engineers (fixers). */
export const ENGINEER_AGENT_TYPES = new Set(['engineer', 'goodvibes:engineer']);

/**
 * Agent types that auto-complete without entering the WRFC review cycle.
 * Non-work types produce no reviewable output; reviewer types drive the
 * PARENT workflow’s review but auto-complete their own WRFC.
 */
export const AUTO_COMPLETE_AGENT_TYPES = new Set([
  'Explore', 'Plan', 'Bash', 'general-purpose',
  ...REVIEWER_AGENT_TYPES,
]);

// ─── State key helpers ──────────────────────────────────────────────────────────

/** State store key prefix for WRFC workflow data. */
const WS = (wid: string, field: string) => `wrfc.workflows.${wid}.${field}`;

/** Read a typed value from the state store, returning a default if absent. */
function storeGet<T>(store: StateStoreInterface, key: string, defaultVal: T): T {
  const val = store.get<T>(key);
  return val !== null ? val : defaultVal;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Emits a chained internal event that advances the workflow state machine.
 * Returns a RuntimeEvent for inclusion in HandlerResult.events.
 */
function makeChainEvent(type: string, wid: string, parentEvent: RuntimeEvent): RuntimeEvent {
  return createEvent({
    source: 'internal',
    type,
    payload: { workflow_id: wid },
    priority: 70,
    context: {
      workflow_id: wid,
      parent_event_id: parentEvent.id,
      chain_depth: (parentEvent.context?.chain_depth ?? 0) + 1,
    },
  });
}

/**
 * Builds the state_update array for workflow phase transitions.
 */
function phaseUpdate(wid: string, phase: string): StateUpdate[] {
  return [{ key: WS(wid, 'phase'), value: phase, op: 'set' }];
}

// ─── Exported Handlers ─────────────────────────────────────────────────────────

/**
 * Handles agent:spawned events.
 *
 * Initialises WRFC workflow state in the store and advances the phase to
 * WRITING (the spawning agent IS the writer). Chain-originators get a new
 * workflow; agents with an incoming workflow_id bind to the existing one.
 *
 * @param event   - The agent:spawned event.
 * @param trigger - The trigger that matched.
 * @param store   - Core state store for reading existing workflow state.
 * @returns HandlerResult with state initialisation updates.
 */
export function handleWorkflowCreated(
  event: RuntimeEvent,
  _trigger: Trigger,
  store: StateStoreInterface,
): HandlerResult {

  const payload = event.payload as Record<string, unknown>;
  const agentId = typeof payload['agent_id'] === 'string' ? payload['agent_id'] : null;
  if (!agentId) {
    log.debug('handleWorkflowCreated: no agent_id in payload, skipping');
    return {};
  }

  const agentType = typeof payload['agent_type'] === 'string' ? payload['agent_type'] : '';
  const incomingWid = typeof payload['workflow_id'] === 'string' && payload['workflow_id'].length > 0
    ? payload['workflow_id']
    : null;
  const wid = incomingWid ?? `wrfc_${agentId}`;
  const task = typeof payload['task'] === 'string' ? payload['task'] : '';

  // Bind agent → workflow in state store
  const state_updates: StateUpdate[] = [
    { key: `wrfc.agent_map.${agentId}`, value: wid, op: 'set' },
  ];

  if (!incomingWid) {
    // Chain originator: initialise new workflow state
    const minScore = storeGet(store, 'wrfc.config.min_review_score', DEFAULT_MIN_REVIEW_SCORE);
    const maxFix = storeGet(store, 'wrfc.config.max_fix_attempts', DEFAULT_MAX_FIX_ATTEMPTS);

    state_updates.push(
      { key: WS(wid, 'phase'), value: 'WRITING', op: 'set' },
      { key: WS(wid, 'agent_id'), value: agentId, op: 'set' },
      { key: WS(wid, 'agent_type'), value: agentType, op: 'set' },
      { key: WS(wid, 'task'), value: task, op: 'set' },
      { key: WS(wid, 'min_review_score'), value: minScore, op: 'set' },
      { key: WS(wid, 'max_fix_attempts'), value: maxFix, op: 'set' },
      { key: WS(wid, 'fix_attempts'), value: 0, op: 'set' },
      { key: WS(wid, 'files_modified'), value: [], op: 'set' },
    );

    log.info('handleWorkflowCreated: initialised workflow', { wid, agent_id: agentId, agent_type: agentType });
  } else {
    // Chain agent: bind to existing workflow
    log.info('handleWorkflowCreated: bound chain agent to existing workflow', { wid, agent_id: agentId });
  }

  return { state_updates };
}

/**
 * Handles agent:completed events.
 *
 * Routes based on the current workflow phase:
 *   - WRITING + auto-complete agent: emit complete directive.
 *   - WRITING + work agent: spawn reviewer, advance to REVIEWING.
 *   - REVIEWING + reviewer: evaluate score, complete or spawn fixer.
 *   - FIXING + engineer: increment fix attempts, re-review or escalate.
 *
 * @param event   - The agent:completed event.
 * @param trigger - The trigger that matched.
 * @param store   - Core state store for reading workflow phase and config.
 * @returns HandlerResult with actions and state updates.
 */
export function handleAgentCompleted(
  event: RuntimeEvent,
  _trigger: Trigger,
  store: StateStoreInterface,
): HandlerResult {

  const payload = event.payload as Record<string, unknown>;

  // Extract agent metadata (compatible with both hook-event and agent-event shapes)
  const agentId: string | null =
    (typeof payload['agent_id'] === 'string' ? payload['agent_id'] : null) ??
    (typeof (payload['hook_input'] as Record<string, unknown> | null)?.['agent_id'] === 'string'
      ? (payload['hook_input'] as Record<string, unknown>)['agent_id'] as string
      : null);

  const hookInput = (typeof payload['hook_input'] === 'object' && payload['hook_input'] !== null)
    ? payload['hook_input'] as Record<string, unknown>
    : payload;

  const agentType: string =
    (hookInput['agent_type'] as string | undefined) ??
    (hookInput['subagent_type'] as string | undefined) ?? '';

  const agentOutput: string | undefined =
    (hookInput['last_assistant_message'] as string | undefined) ??
    (hookInput['task_output'] as string | undefined) ??
    (hookInput['result'] as string | undefined);

  // Resolve workflow ID from agent map in store
  let wid: string | null = agentId ? storeGet<string | null>(store, `wrfc.agent_map.${agentId}`, null) : null;
  if (!wid) {
    wid = typeof payload['workflow_id'] === 'string' ? payload['workflow_id'] : null;
  }
  if (!wid) {
    log.debug('handleAgentCompleted: no workflow binding found, skipping', { agent_id: agentId });
    return {};
  }

  const phase = storeGet(store, WS(wid, 'phase'), 'WRITING').toUpperCase();
  const minScore = storeGet(store, WS(wid, 'min_review_score'), DEFAULT_MIN_REVIEW_SCORE);
  const maxFix = storeGet(store, WS(wid, 'max_fix_attempts'), DEFAULT_MAX_FIX_ATTEMPTS);
  const fixAttempts = storeGet(store, WS(wid, 'fix_attempts'), 0);
  const filesModified = storeGet<string[]>(store, WS(wid, 'files_modified'), []);

  // Treat early-stuck states the same as WRITING
  const earlyStates = new Set(['IDLE', 'GATHERING', 'PLANNING']);
  const effectivePhase = earlyStates.has(phase) ? 'WRITING' : phase;

  if (earlyStates.has(phase)) {
    log.warn('handleAgentCompleted: workflow stuck in early state, treating as WRITING', {
      wid, actual_phase: phase,
    });
  }

  // ─── WRITING phase ────────────────────────────────────────────────────────────
  if (effectivePhase === 'WRITING') {
    // Auto-complete whitelist: no review needed
    if (agentType && AUTO_COMPLETE_AGENT_TYPES.has(agentType)) {
      const actions: Action[] = [buildCompleteAction(wid)];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(wid, 'COMPLETED'),
        { key: `wrfc.agent_map.${agentId}`, value: null, op: 'delete' },
      ];

      log.info('handleAgentCompleted: auto-complete (whitelisted agent type)', {
        wid, agent_type: agentType,
      });
      return { actions, state_updates };
    }

    // Normal work agent: spawn reviewer
    const task = `Review the work completed in workflow ${wid}. ` +
      (filesModified.length > 0
        ? `Files modified: ${filesModified.join(', ')}.`
        : 'No files recorded yet.');

    const actions: Action[] = [buildSpawnAction({ wid, type: 'reviewer', task, files: filesModified })];
    const state_updates: StateUpdate[] = phaseUpdate(wid, 'REVIEWING');
    const events: RuntimeEvent[] = [makeChainEvent('wrfc:review_started', wid, event)];

    log.info('handleAgentCompleted: spawning reviewer, advancing to REVIEWING', { wid });
    return { actions, state_updates, events };
  }

  // ─── REVIEWING phase ──────────────────────────────────────────────────────────
  if (effectivePhase === 'REVIEWING') {
    if (!REVIEWER_AGENT_TYPES.has(agentType)) {
      log.debug('handleAgentCompleted: REVIEWING phase but not a reviewer, skipping', {
        wid, agent_type: agentType,
      });
      return {};
    }

    const score = extractScore(agentOutput);
    if (score === null) {
      log.warn('handleAgentCompleted: could not parse review score', {
        wid, output_preview: agentOutput?.slice(0, 200),
      });
      // Emit error event and escalate — returning {} would stall the workflow permanently
      const fixAttempts = storeGet(store, WS(wid, 'fix_attempts'), 0);
      const errorEvent = createEvent({
        source: 'internal',
        type: 'wrfc:review_parse_failed',
        payload: {
          workflow_id: wid,
          agent_id: agentId,
          output_preview: agentOutput?.slice(0, 200) ?? null,
          attempt_count: fixAttempts,
        },
        priority: 80,
        context: { workflow_id: wid },
      });
      const state_updates: StateUpdate[] = phaseUpdate(wid, 'ESCALATED');
      const actions: Action[] = [buildEscalateAction(wid, `review score parse failed after ${fixAttempts} attempts`)];
      return { state_updates, actions, events: [errorEvent] };
    }

    if (score >= minScore) {
      // Pass: complete workflow
      const actions: Action[] = [buildCompleteAction(wid)];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(wid, 'COMPLETED'),
        { key: WS(wid, 'review_score'), value: score, op: 'set' },
        { key: `wrfc.agent_map.${agentId}`, value: null, op: 'delete' },
      ];
      const events: RuntimeEvent[] = [makeChainEvent('wrfc:review_completed', wid, event)];

      log.info('handleAgentCompleted: review passed, completing workflow', {
        wid, score, threshold: minScore,
      });
      return { actions, state_updates, events };
    } else {
      // Fail: spawn fixer
      const issuesSummary = 'See previous review output for details.';
      const task = `Fix the issues identified in the code review for workflow ${wid}. ` +
        `Review score: ${score}/10 (threshold: ${minScore}). Issues: ${issuesSummary}` +
        (filesModified.length > 0 ? ` Files: ${filesModified.join(', ')}.` : '');

      const actions: Action[] = [buildSpawnAction({ wid, type: 'engineer', task, files: filesModified })];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(wid, 'FIXING'),
        { key: WS(wid, 'review_score'), value: score, op: 'set' },
      ];

      log.info('handleAgentCompleted: review failed, spawning fixer', {
        wid, score, threshold: minScore,
      });
      return { actions, state_updates };
    }
  }

  // ─── FIXING phase ────────────────────────────────────────────────────────────
  if (effectivePhase === 'FIXING') {
    if (!ENGINEER_AGENT_TYPES.has(agentType)) {
      log.debug('handleAgentCompleted: FIXING phase but not an engineer, skipping', {
        wid, agent_type: agentType,
      });
      return {};
    }

    // Merge engineer-reported files from <gv> tag
    const engineerFiles = extractFiles(agentOutput);
    const mergedFiles = engineerFiles.length > 0
      ? [...new Set([...filesModified, ...engineerFiles])]
      : filesModified;

    const newFixAttempts = fixAttempts + 1;

    if (newFixAttempts >= maxFix) {
      // Budget exhausted: escalate
      const lastScore = storeGet(store, WS(wid, 'review_score'), 0);
      const reason = `${newFixAttempts} fix attempts failed, last score ${lastScore}/10`;
      const actions: Action[] = [buildEscalateAction(wid, reason)];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(wid, 'ESCALATED'),
        { key: WS(wid, 'fix_attempts'), value: newFixAttempts, op: 'set' },
        { key: WS(wid, 'files_modified'), value: mergedFiles, op: 'set' },
        { key: `wrfc.agent_map.${agentId}`, value: null, op: 'delete' },
      ];

      log.warn('handleAgentCompleted: fix budget exhausted, escalating', {
        wid, fix_attempts: newFixAttempts, max_fix: maxFix,
      });
      return { actions, state_updates };
    } else {
      // Still budget: re-review
      const task = `Re-review the code after fix attempt ${newFixAttempts} of ${maxFix} for workflow ${wid}. ` +
        (mergedFiles.length > 0 ? `Files modified: ${mergedFiles.join(', ')}.` : 'Check all recently modified files.');

      const actions: Action[] = [buildSpawnAction({ wid, type: 'reviewer', task, files: mergedFiles })];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(wid, 'REVIEWING'),
        { key: WS(wid, 'fix_attempts'), value: newFixAttempts, op: 'set' },
        { key: WS(wid, 'files_modified'), value: mergedFiles, op: 'set' },
      ];
      const events: RuntimeEvent[] = [makeChainEvent('wrfc:fix_completed', wid, event)];

      log.info('handleAgentCompleted: fix complete, re-reviewing', {
        wid, fix_attempts: newFixAttempts, max_fix: maxFix,
      });
      return { actions, state_updates, events };
    }
  }

  log.debug('handleAgentCompleted: unhandled phase', { wid, phase: effectivePhase });
  return {};
}

/**
 * Handles wrfc:review_completed events (event-driven path).
 *
 * This handler is the event-driven complement to the REVIEWING branch in
 * handleAgentCompleted. It is triggered when another component emits
 * wrfc:review_completed directly (rather than via agent:completed).
 *
 * @param event   - The wrfc:review_completed event.
 * @param trigger - The trigger that matched.
 * @param store   - Core state store for reading workflow state.
 * @returns HandlerResult with actions and state updates.
 */
export function handleQualityGate(
  event: RuntimeEvent,
  _trigger: Trigger,
  store: StateStoreInterface,
): HandlerResult {

  const payload = event.payload as Record<string, unknown>;
  const wid = typeof payload['workflow_id'] === 'string' ? payload['workflow_id'] : null;
  if (!wid) {
    log.debug('handleQualityGate: no workflow_id in payload, skipping');
    return {};
  }

  const rawScore = payload['review_score'];
  const score = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore ?? ''));
  if (isNaN(score)) {
    log.warn('handleQualityGate: invalid review_score', { wid, raw: rawScore });
    return {};
  }

  const minScore = storeGet(store, WS(wid, 'min_review_score'), DEFAULT_MIN_REVIEW_SCORE);
  const fixAttempts = storeGet(store, WS(wid, 'fix_attempts'), 0);
  const maxFix = storeGet(store, WS(wid, 'max_fix_attempts'), DEFAULT_MAX_FIX_ATTEMPTS);
  const filesModified = storeGet<string[]>(store, WS(wid, 'files_modified'), []);

  const state_updates: StateUpdate[] = [
    { key: WS(wid, 'review_score'), value: score, op: 'set' },
  ];

  if (score >= minScore) {
    // Quality gate passed
    const actions: Action[] = [buildCompleteAction(wid)];
    state_updates.push(...phaseUpdate(wid, 'COMPLETED'));
    log.info('handleQualityGate: quality gate passed', { wid, score, threshold: minScore });
    return { actions, state_updates };
  }

  // Quality gate failed: check fix budget
  const newFixAttempts = fixAttempts + 1;
  state_updates.push({ key: WS(wid, 'fix_attempts'), value: newFixAttempts, op: 'set' });

  if (newFixAttempts >= maxFix) {
    const reason = `${newFixAttempts} fix attempts failed, last score ${score}/10`;
    const actions: Action[] = [buildEscalateAction(wid, reason)];
    state_updates.push(...phaseUpdate(wid, 'ESCALATED'));
    log.warn('handleQualityGate: fix budget exhausted, escalating', { wid, fix_attempts: newFixAttempts });
    return { actions, state_updates };
  }

  // Spawn fixer
  const issuesSummary = 'See previous review output for details.';
  const task = `Fix the issues identified in the code review for workflow ${wid}. ` +
    `Review score: ${score}/10 (threshold: ${minScore}). Issues: ${issuesSummary}` +
    (filesModified.length > 0 ? ` Files: ${filesModified.join(', ')}.` : '');

  const actions: Action[] = [buildSpawnAction({ wid, type: 'engineer', task, files: filesModified })];
  state_updates.push(...phaseUpdate(wid, 'FIXING'));
  const events: RuntimeEvent[] = [makeChainEvent('wrfc:fix_started', wid, event)];

  log.info('handleQualityGate: quality gate failed, spawning fixer', {
    wid, score, threshold: minScore, fix_attempts: newFixAttempts,
  });
  return { actions, state_updates, events };
}

/**
 * Convenience: resolves the workflow ID for a given agent ID.
 * Returns null if no binding exists in the store.
 */
export function resolveWorkflowId(
  agentId: string | null,
  store: StateStoreInterface,
): string | null {
  if (!agentId) return null;
  return store.get<string>(`wrfc.agent_map.${agentId}`);
}

/** Returns the handler function IDs this module registers. */
export const HANDLER_IDS = {
  WORKFLOW_CREATED: 'wrfc_plugin:workflow_created',
  AGENT_COMPLETED: 'wrfc_plugin:agent_completed',
  QUALITY_GATE: 'wrfc_plugin:quality_gate',
} as const;

/** Type for handler ID values. */
export type HandlerIdKey = (typeof HANDLER_IDS)[keyof typeof HANDLER_IDS];

// Re-export the unique handler ID type for use in the plugin registration.
export const TRIGGER_IDS = {
  AGENT_SPAWNED: 'wrfc_plugin:trigger:agent_spawned',
  AGENT_COMPLETED: 'wrfc_plugin:trigger:agent_completed',
  REVIEW_COMPLETED: 'wrfc_plugin:trigger:review_completed',
} as const;
