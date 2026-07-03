#!/usr/bin/env node
/**
 * SubagentStart hook — plan §8 SubagentStart row, KEEP+FIX.
 *
 * v1 (`plugins/goodvibes/hooks/scripts/src/subagent-start/**`, read-only)
 * injected ~1.8KB of doctrine per subagent spawn (protocol-skill descriptions,
 * full skill catalog, validation-script instructions referencing retired
 * tools). Carve-out architecture §2.4 calls for "pointers at 500 tokens max":
 * a short reminder of which of the four v2 agents' skills exist and their
 * one-line purpose, not the skill content itself — the agent loads a skill by
 * name via the Skill tool when the task actually calls for it.
 *
 * Also writes a minimal entry to the project's `.goodvibes/state/
 * agent-tracking.json` (shared project state, R15) so the analytics
 * SubagentStop hook — reading the same project-scoped namespace — can correlate
 * a completion back to its start time and compute duration even though the two
 * hooks run as separate short-lived processes.
 */

import { runHook, createHookResponse, isTestEnvironment, statePath, readJsonSafe, writeJsonSafe } from './lib/common.mjs';

const HOOK_EVENT = 'SubagentStart';
const MAX_CONTEXT_CHARS = 500 * 3.5; // ~500 tokens at ~3.5 chars/token (core/shared/tokens convention)

/** The five intel skills (§2.4) + a pointer to connect's service-integration. */
const SKILL_CATALOG = {
  'intel-mastery': 'Token-efficient code_read/code_grep/code_glob usage, extract modes, batching.',
  'project-onboarding': 'Codebase mapping using intel analyzers (code_surface, api_routes, db_schema).',
  'goodvibes-memory': 'Cross-session memory: decisions, patterns, failures in .goodvibes/memory.',
  'task-orchestration': 'Parallel agent decomposition using native Workflow + the WRFC template.',
  'review-scoring': 'Refutation-based review rubric: defect list + severity, tries to disprove the work.',
  'service-integration': 'Registered-service API calls via the goodvibes connect server.',
};

/** Which skills each of the four v2 agents (plan §9.2) reaches for first. */
const AGENT_SKILLS = {
  engineer: ['intel-mastery', 'goodvibes-memory'],
  'refutation-reviewer': ['review-scoring', 'goodvibes-memory'],
  tester: ['intel-mastery', 'goodvibes-memory'],
  architect: ['project-onboarding', 'task-orchestration', 'goodvibes-memory'],
};

function normalizeAgentType(input) {
  const raw = input.agent_type ?? input.subagent_type ?? 'unknown';
  return raw.includes(':') ? raw.split(':').pop() : raw;
}

function buildPointers(agentType) {
  const names = AGENT_SKILLS[agentType] ?? [];
  if (names.length === 0) {
    return 'No pre-selected skills for this agent type — load any skill by name via the Skill tool as the task calls for it.';
  }
  return names.map((name) => `- ${name}: ${SKILL_CATALOG[name]}`).join('\n');
}

function recordTracking(input, agentType) {
  const cwd = input.cwd || process.cwd();
  const agentId = input.agent_id ?? input.subagent_id ?? `agent_${Date.now()}`;
  const trackingPath = statePath(cwd, 'state', 'agent-tracking.json');
  const trackings = readJsonSafe(trackingPath, {});
  trackings[agentId] = {
    agent_id: agentId,
    agent_type: agentType,
    session_id: input.session_id ?? '',
    started_at: new Date().toISOString(),
    task_description: (input.task_description ?? input.task ?? input.prompt ?? '').slice(0, 200) || undefined,
  };
  writeJsonSafe(trackingPath, trackings);
}

async function handleSubagentStart(input) {
  const agentType = normalizeAgentType(input);
  recordTracking(input, agentType);
  const lines = [
    `[goodvibes] Agent: ${agentType}`,
    'Suggested skills (load by name via the Skill tool when the task calls for it — do not preload):',
    buildPointers(agentType),
  ];

  let additionalContext = lines.join('\n');
  if (additionalContext.length > MAX_CONTEXT_CHARS) {
    additionalContext = additionalContext.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
  }

  return createHookResponse({ hookEventName: HOOK_EVENT, additionalContext });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSubagentStart);
}

export { normalizeAgentType, buildPointers, recordTracking, handleSubagentStart, MAX_CONTEXT_CHARS };
