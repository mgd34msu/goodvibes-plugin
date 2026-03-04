/**
 * WRFC Event Handlers — WRFC Plugin (Layer 3)
 *
 * Repackages the WRFC orchestration logic from wrfc-handlers.ts as event
 * handlers that conform to the event loop contract:
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
import { MAX_OUTPUT_PREVIEW_LENGTH } from '../../shared/constants.js';
import {
  ENGINEER_AGENT_TYPES,
  AUTO_COMPLETE_AGENT_TYPES,
  REQUIRE_REVIEW_AGENT_TYPES,
  REVIEWER_AGENT_TYPES,
  DEFAULT_MIN_REVIEW_SCORE,
  EARLY_WORKFLOW_STATES,
  matchesAgentType,
} from './constants.js';
import type { RuntimeEvent } from '../../shared/events.js';
import { createEvent } from '../../shared/events.js';
import type { HandlerResult, StateUpdate, Action, StateStoreInterface, Trigger } from '../../core/types.js';
import { extractFiles } from '../../extensions/directives/gv-tag-parser.js';
import { extractScore } from './score-evaluator.js';
import {
  buildSpawnAction,
  buildCompleteAction,
  buildEscalateAction,
} from './directive-builder.js';

const log = createLogger('wrfc-plugin:handlers');

// Fallback messages used when review output is unavailable
const FALLBACK_NO_REVIEW_OUTPUT = 'No review output captured.';
const FALLBACK_SEE_PAYLOAD = 'See the wrfc:review_completed event payload for review details.';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default maximum fix attempts before escalation. */
export const DEFAULT_MAX_FIX_ATTEMPTS = 3;

// ─── Cached require-review set ────────────────────────────────────────────────────

let _cachedRequireReviewTypes: Set<string> | null = null;
let _cachedConfigSnapshot = '';

/**
 * Resets the cached require-review type set to its initial state.
 *
 * Intended for use in test suites to prevent cross-test cache pollution.
 */
export function resetRequireReviewCache(): void {
  _cachedRequireReviewTypes = null;
  _cachedConfigSnapshot = '';
}

/**
 * Returns the effective require-review set, caching the merged result.
 * Invalidates when the underlying config changes.
 */
function getEffectiveRequireReviewTypes(store: StateStoreInterface): Set<string> {
  const configTypes = storeGet<string[]>(store, 'wrfc.config.require_review_types', []);
  if (configTypes.length === 0) {
    return REQUIRE_REVIEW_AGENT_TYPES;
  }
  const snapshot = configTypes.join(',');
  if (_cachedRequireReviewTypes && snapshot === _cachedConfigSnapshot) {
    return _cachedRequireReviewTypes;
  }
  _cachedRequireReviewTypes = new Set([...REQUIRE_REVIEW_AGENT_TYPES, ...configTypes]);
  _cachedConfigSnapshot = snapshot;
  return _cachedRequireReviewTypes;
}

// ─── State key helpers ──────────────────────────────────────────────────────────

/** Session-scoped workflow state key. */
const WS = (sid: string, wid: string, field: string) => `wrfc.sessions.${sid}.workflows.${wid}.${field}`;

/** Session-scoped agent-to-workflow map key. */
const AM = (sid: string, agentId: string) => `wrfc.sessions.${sid}.agent_map.${agentId}`;

/** Extract session ID from event metadata, falling back to 'default'. */
function eventSessionId(event: RuntimeEvent): string {
  const sid = (event.metadata as Record<string, unknown> | undefined)?.['session_id'] as string;
  if (!sid || sid.length === 0) {
    log.warn('eventSessionId: missing session_id in event metadata, using default', {
      event_type: event.type,
      event_id: event.id,
    });
    return 'default';
  }
  return sid;
}

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
    source: { kind: 'internal' },
    type: type as import('../../shared/events.js').EventType,
    payload: { type: type as import('../../shared/events.js').EventType, data: { workflow_id: wid } } as import('../../shared/events.js').EventPayload,
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
function phaseUpdate(sid: string, wid: string, phase: string): StateUpdate[] {
  return [{ key: WS(sid, wid, 'phase'), value: phase, op: 'set' }];
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
  // Support both direct payload shape (agent-originated) and nested data shape (hook-originated)
  const data = (typeof payload['data'] === 'object' && payload['data'] !== null)
    ? payload['data'] as Record<string, unknown>
    : payload;
  const agentId = typeof data['agent_id'] === 'string' ? data['agent_id'] : null;
  if (!agentId) {
    log.debug('handleWorkflowCreated: no agent_id in payload, skipping');
    return {};
  }

  const sid = eventSessionId(event);
  const agentType = typeof data['agent_type'] === 'string' ? data['agent_type'] : '';
  const incomingWid = typeof data['workflow_id'] === 'string' && data['workflow_id'].length > 0
    ? data['workflow_id']
    : null;
  const task = typeof data['task'] === 'string' ? data['task'] : '';

  // Skip workflow creation for utility/auto-complete agents (no incomingWid)
  if (!incomingWid && agentType && matchesAgentType(agentType, AUTO_COMPLETE_AGENT_TYPES)) {
    log.debug('handleWorkflowCreated: skipping auto-complete agent type', { agent_type: agentType });
    return {};
  }

  // Determine workflow ID:
  // - Chain agents (with incomingWid): bind to existing workflow.
  // - REQUIRE_REVIEW agents (no incomingWid): auto-create with timestamped ID for easy tracing.
  // - All other agents (no incomingWid): bind with simple agent-based ID.
  let wid: string;
  if (incomingWid) {
    wid = incomingWid;
  } else {
    const effectiveRequireReview = getEffectiveRequireReviewTypes(store);
    if (!agentType) {
      log.warn('handleWorkflowCreated: agent_type is empty/missing, cannot determine if review is required', { agent_id: agentId });
    }
    if (agentType && matchesAgentType(agentType, effectiveRequireReview)) {
      // Auto-create a timestamped workflow ID so each require-review spawn is uniquely traceable
      wid = `wrfc_auto_${Date.now()}_${agentId.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`;
      log.info('handleWorkflowCreated: auto-creating workflow for require-review agent type', {
        wid,
        agent_id: agentId,
        agent_type: agentType,
      });
    } else {
      wid = `wrfc_${agentId}`;
    }
  }

  // Bind agent → workflow in state store
  const state_updates: StateUpdate[] = [
    { key: AM(sid, agentId), value: wid, op: 'set' },
  ];

  if (!incomingWid) {
    // Chain originator: initialise new workflow state
    const minScore = storeGet(store, 'wrfc.config.min_review_score', DEFAULT_MIN_REVIEW_SCORE);
    const maxFix = storeGet(store, 'wrfc.config.max_fix_attempts', DEFAULT_MAX_FIX_ATTEMPTS);

    state_updates.push(
      { key: WS(sid, wid, 'phase'), value: 'WRITING', op: 'set' },
      { key: WS(sid, wid, 'agent_id'), value: agentId, op: 'set' },
      { key: WS(sid, wid, 'agent_type'), value: agentType, op: 'set' },
      { key: WS(sid, wid, 'task'), value: task, op: 'set' },
      { key: WS(sid, wid, 'min_review_score'), value: minScore, op: 'set' },
      { key: WS(sid, wid, 'max_fix_attempts'), value: maxFix, op: 'set' },
      { key: WS(sid, wid, 'fix_attempts'), value: 0, op: 'set' },
      { key: WS(sid, wid, 'files_modified'), value: [], op: 'set' },
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

  // Extract agent metadata (compatible with hook-event, agent-event, and nested data shapes)
  const dataPayload = (typeof payload['data'] === 'object' && payload['data'] !== null)
    ? payload['data'] as Record<string, unknown>
    : null;
  const hookInputForId = payload['hook_input'] as Record<string, unknown> | null;
  const agentId: string | null =
    (typeof payload['agent_id'] === 'string' ? payload['agent_id'] : null) ??
    (typeof dataPayload?.['agent_id'] === 'string' ? dataPayload['agent_id'] : null) ??
    (typeof hookInputForId?.['agent_id'] === 'string' ? hookInputForId['agent_id'] : null);

  const hookInput = (typeof payload['hook_input'] === 'object' && payload['hook_input'] !== null)
    ? payload['hook_input'] as Record<string, unknown>
    : payload;

  const agentType: string =
    (hookInput['agent_type'] as string | undefined) ??
    (hookInput['subagent_type'] as string | undefined) ??
    (typeof dataPayload?.['agent_type'] === 'string' ? dataPayload['agent_type'] : null) ??
    (typeof dataPayload?.['subagent_type'] === 'string' ? dataPayload['subagent_type'] : null) ?? '';

  const agentOutput: string | undefined =
    (hookInput['last_assistant_message'] as string | undefined) ??
    (hookInput['task_output'] as string | undefined) ??
    (hookInput['result'] as string | undefined) ??
    (typeof dataPayload?.['last_assistant_message'] === 'string' ? dataPayload['last_assistant_message'] : null) ??
    (typeof dataPayload?.['task_output'] === 'string' ? dataPayload['task_output'] : null) ??
    (typeof dataPayload?.['result'] === 'string' ? dataPayload['result'] : null) ??
    (typeof dataPayload?.['output'] === 'string' ? dataPayload['output'] : null) ??
    undefined;

  const sid = eventSessionId(event);

  // Resolve workflow ID from agent map in store
  let wid: string | null = agentId ? storeGet<string | null>(store, AM(sid, agentId), null) : null;
  if (!wid) {
    wid = typeof payload['workflow_id'] === 'string' ? payload['workflow_id'] : null;
  }
  if (!wid) {
    wid = typeof dataPayload?.['workflow_id'] === 'string' ? dataPayload['workflow_id'] : null;
  }
  if (!wid) {
    // Elevate to warn for agent types that should normally have workflow bindings
    const isExpectedInWorkflow = agentType && (
      matchesAgentType(agentType, REQUIRE_REVIEW_AGENT_TYPES) ||
      matchesAgentType(agentType, ENGINEER_AGENT_TYPES) ||
      matchesAgentType(agentType, REVIEWER_AGENT_TYPES)
    );
    if (isExpectedInWorkflow) {
      log.warn('handleAgentCompleted: no workflow binding found for expected agent type', {
        agent_id: agentId,
        agent_type: agentType,
      });
    } else {
      log.debug('handleAgentCompleted: no workflow binding found, skipping', { agent_id: agentId });
    }
    return {};
  }

  const phase = storeGet(store, WS(sid, wid, 'phase'), 'WRITING').toUpperCase();
  const minScore = storeGet(store, WS(sid, wid, 'min_review_score'), DEFAULT_MIN_REVIEW_SCORE);
  const maxFix = storeGet(store, WS(sid, wid, 'max_fix_attempts'), DEFAULT_MAX_FIX_ATTEMPTS);
  const fixAttempts = storeGet(store, WS(sid, wid, 'fix_attempts'), 0);
  const filesModified = storeGet<string[]>(store, WS(sid, wid, 'files_modified'), []);

  // Treat early-stuck states the same as WRITING
  const effectivePhase = EARLY_WORKFLOW_STATES.has(phase) ? 'WRITING' : phase;

  if (EARLY_WORKFLOW_STATES.has(phase)) {
    log.warn('handleAgentCompleted: workflow stuck in early state, treating as WRITING', {
      wid, actual_phase: phase,
    });
  }

  // ─── WRITING phase ────────────────────────────────────────────────────────────
  if (effectivePhase === 'WRITING') {
    // Layer 0: Force review for agent types in the require-review set.
    // Takes precedence over all auto-complete logic below.
    const effectiveRequireReview = getEffectiveRequireReviewTypes(store);

    if (!agentType) {
      log.warn('handleAgentCompleted: agent_type is empty/missing, cannot determine if review is required', { wid, agent_id: agentId });
    }
    if (agentType && matchesAgentType(agentType, effectiveRequireReview)) {
      const task = `[WRFC:${wid}] Review the work completed in workflow ${wid}. ` +
        `Minimum score: ${minScore}. ` +
        (filesModified.length > 0
          ? `Files modified: ${filesModified.join(', ')}.`
          : 'No files recorded yet.');

      const actions: Action[] = [buildSpawnAction({ wid, type: 'reviewer', task, files: filesModified })];
      const state_updates: StateUpdate[] = phaseUpdate(sid, wid, 'REVIEWING');
      const events: RuntimeEvent[] = [makeChainEvent('wrfc:review_started', wid, event)];

      log.info('handleAgentCompleted: force-review for require-review agent type', {
        wid, agent_type: agentType,
      });
      return { actions, state_updates, events };
    }

    // Auto-complete whitelist: no review needed
    if (agentType && matchesAgentType(agentType, AUTO_COMPLETE_AGENT_TYPES)) {
      const actions: Action[] = [buildCompleteAction(wid)];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(sid, wid, 'COMPLETED'),
        { key: AM(sid, agentId), value: null, op: 'delete' },
      ];

      log.info('handleAgentCompleted: auto-complete (whitelisted agent type)', {
        wid, agent_type: agentType,
      });
      return { actions, state_updates };
    }

    // Normal work agent: spawn reviewer
    const task = `[WRFC:${wid}] Review the work completed in workflow ${wid}. ` +
      `Minimum score: ${minScore}. ` +
      (filesModified.length > 0
        ? `Files modified: ${filesModified.join(', ')}.`
        : 'No files recorded yet.');

    const actions: Action[] = [buildSpawnAction({ wid, type: 'reviewer', task, files: filesModified })];
    const state_updates: StateUpdate[] = phaseUpdate(sid, wid, 'REVIEWING');
    const events: RuntimeEvent[] = [makeChainEvent('wrfc:review_started', wid, event)];

    log.info('handleAgentCompleted: spawning reviewer, advancing to REVIEWING', { wid });
    return { actions, state_updates, events };
  }

  // ─── REVIEWING phase ──────────────────────────────────────────────────────────
  if (effectivePhase === 'REVIEWING') {
    if (!matchesAgentType(agentType, REVIEWER_AGENT_TYPES)) {
      log.debug('handleAgentCompleted: REVIEWING phase but not a reviewer, skipping', {
        wid, agent_type: agentType,
      });
      return {};
    }

    const score = extractScore(agentOutput);
    if (score === null) {
      log.warn('handleAgentCompleted: could not parse review score', {
        wid, output_preview: agentOutput?.slice(0, MAX_OUTPUT_PREVIEW_LENGTH),
      });
      // Emit error event and escalate — returning {} would stall the workflow permanently
      const errorEvent = createEvent({
        source: { kind: 'internal' },
        type: 'wrfc:review_parse_failed',
        payload: { type: 'wrfc:review_parse_failed', data: {
          workflow_id: wid,
          agent_id: agentId,
          output_preview: agentOutput?.slice(0, MAX_OUTPUT_PREVIEW_LENGTH) ?? null,
          attempt_count: fixAttempts,
        } },
        priority: 80,
        context: { workflow_id: wid },
      });
      const state_updates: StateUpdate[] = phaseUpdate(sid, wid, 'ESCALATED');
      const actions: Action[] = [buildEscalateAction(wid, `review score parse failed after ${fixAttempts} attempts`)];
      return { state_updates, actions, events: [errorEvent] };
    }

    if (score >= minScore) {
      // Pass: complete workflow
      const actions: Action[] = [buildCompleteAction(wid)];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(sid, wid, 'COMPLETED'),
        { key: WS(sid, wid, 'review_score'), value: score, op: 'set' },
        { key: AM(sid, agentId), value: null, op: 'delete' },
      ];
      const events: RuntimeEvent[] = [makeChainEvent('wrfc:review_completed', wid, event)];

      log.info('handleAgentCompleted: review passed, completing workflow', {
        wid, score, threshold: minScore,
      });
      return { actions, state_updates, events };
    } else {
      // Fail: spawn fixer
      const issuesSummary = agentOutput?.trim() || FALLBACK_NO_REVIEW_OUTPUT;
      const task = `[WRFC:${wid}] Fix the issues identified in the code review for workflow ${wid}. ` +
        `Review score: ${score}/10 (threshold: ${minScore}). Issues:\n${issuesSummary}` +
        (filesModified.length > 0 ? `\nFiles: ${filesModified.join(', ')}.` : '');

      const actions: Action[] = [buildSpawnAction({ wid, type: 'engineer', task, files: filesModified })];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(sid, wid, 'FIXING'),
        { key: WS(sid, wid, 'review_score'), value: score, op: 'set' },
      ];

      log.info('handleAgentCompleted: review failed, spawning fixer', {
        wid, score, threshold: minScore,
      });
      return { actions, state_updates };
    }
  }

  // ─── FIXING phase ────────────────────────────────────────────────────────────
  if (effectivePhase === 'FIXING') {
    if (!matchesAgentType(agentType, ENGINEER_AGENT_TYPES)) {
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
      const lastScore = storeGet(store, WS(sid, wid, 'review_score'), 0);
      const reason = `${newFixAttempts} fix attempts failed, last score ${lastScore}/10`;
      const actions: Action[] = [buildEscalateAction(wid, reason)];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(sid, wid, 'ESCALATED'),
        { key: WS(sid, wid, 'fix_attempts'), value: newFixAttempts, op: 'set' },
        { key: WS(sid, wid, 'files_modified'), value: mergedFiles, op: 'set' },
        { key: AM(sid, agentId), value: null, op: 'delete' },
      ];

      log.warn('handleAgentCompleted: fix budget exhausted, escalating', {
        wid, fix_attempts: newFixAttempts, max_fix: maxFix,
      });
      return { actions, state_updates };
    } else {
      // Still budget: re-review
      const task = `[WRFC:${wid}] Re-review the code after fix attempt ${newFixAttempts} of ${maxFix} for workflow ${wid}. ` +
        `Minimum score: ${minScore}. ` +
        (mergedFiles.length > 0 ? `Files modified: ${mergedFiles.join(', ')}.` : 'Check all recently modified files.');

      const actions: Action[] = [buildSpawnAction({ wid, type: 'reviewer', task, files: mergedFiles })];
      const state_updates: StateUpdate[] = [
        ...phaseUpdate(sid, wid, 'REVIEWING'),
        { key: WS(sid, wid, 'fix_attempts'), value: newFixAttempts, op: 'set' },
        { key: WS(sid, wid, 'files_modified'), value: mergedFiles, op: 'set' },
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

  const sid = eventSessionId(event);
  const rawScore = payload['review_score'];
  const score = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore ?? ''));
  if (isNaN(score)) {
    log.warn('handleQualityGate: invalid review_score', { wid, raw: rawScore });
    return {};
  }

  const phase = storeGet(store, WS(sid, wid, 'phase'), '');
  if (phase === 'COMPLETED' || phase === 'ESCALATED') {
    log.debug('handleQualityGate: workflow already terminal, skipping', { wid, phase });
    return {};
  }

  const minScore = storeGet(store, WS(sid, wid, 'min_review_score'), DEFAULT_MIN_REVIEW_SCORE);
  const fixAttempts = storeGet(store, WS(sid, wid, 'fix_attempts'), 0);
  const maxFix = storeGet(store, WS(sid, wid, 'max_fix_attempts'), DEFAULT_MAX_FIX_ATTEMPTS);
  const filesModified = storeGet<string[]>(store, WS(sid, wid, 'files_modified'), []);

  const state_updates: StateUpdate[] = [
    { key: WS(sid, wid, 'review_score'), value: score, op: 'set' },
  ];

  if (score >= minScore) {
    // Quality gate passed
    const actions: Action[] = [buildCompleteAction(wid)];
    state_updates.push(...phaseUpdate(sid, wid, 'COMPLETED'));
    log.info('handleQualityGate: quality gate passed', { wid, score, threshold: minScore });
    return { actions, state_updates };
  }

  // Quality gate failed: check fix budget
  const newFixAttempts = fixAttempts + 1;
  state_updates.push({ key: WS(sid, wid, 'fix_attempts'), value: newFixAttempts, op: 'set' });

  if (newFixAttempts >= maxFix) {
    const reason = `${newFixAttempts} fix attempts failed, last score ${score}/10`;
    const actions: Action[] = [buildEscalateAction(wid, reason)];
    state_updates.push(...phaseUpdate(sid, wid, 'ESCALATED'));
    log.warn('handleQualityGate: fix budget exhausted, escalating', { wid, fix_attempts: newFixAttempts });
    return { actions, state_updates };
  }

  // Spawn fixer
  const rawIssues = payload['issues'];
  const issuesSummary = typeof rawIssues === 'string' && rawIssues.trim().length > 0
    ? rawIssues.trim()
    : FALLBACK_SEE_PAYLOAD;
  const task = `[WRFC:${wid}] Fix the issues identified in the code review for workflow ${wid}. ` +
    `Review score: ${score}/10 (threshold: ${minScore}). Issues:\n${issuesSummary}` +
    (filesModified.length > 0 ? `\nFiles: ${filesModified.join(', ')}.` : '');

  const actions: Action[] = [buildSpawnAction({ wid, type: 'engineer', task, files: filesModified })];
  state_updates.push(...phaseUpdate(sid, wid, 'FIXING'));
  const events: RuntimeEvent[] = [makeChainEvent('wrfc:fix_started', wid, event)];

  log.info('handleQualityGate: quality gate failed, spawning fixer', {
    wid, score, threshold: minScore, fix_attempts: newFixAttempts,
  });
  return { actions, state_updates, events };
}

/**
 * Convenience: resolves the workflow ID for a given agent ID.
 * Returns null if no binding exists in the store.
 *
 * @param agentId - The agent ID to look up, or null.
 * @param store   - Core state store that holds the agent → workflow map.
 * @param sid     - Session ID to scope the lookup. Defaults to 'default'.
 * @returns The workflow ID bound to this agent, or null if no binding exists.
 */
export function resolveWorkflowId(
  agentId: string | null,
  store: StateStoreInterface,
  sid = 'default',
): string | null {
  if (!agentId) return null;
  return store.get<string>(AM(sid, agentId));
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
