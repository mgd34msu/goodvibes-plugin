#!/usr/bin/env node
/**
 * SubagentStop hook, plan §8 SubagentStop row, REBUILD
 * (tribunal 2026-07-02): "the telemetry/validation/test-verification pipeline
 * is legitimate and feeds analytics, keep it; delete the ~1.5KB orchestrator
 * injection entirely. Telemetry-only, silent."
 *
 * Ported from `plugins/goodvibes/hooks/scripts/src/subagent-stop/**` (v1,
 * read-only) with the injection half removed and the pipeline simplified to
 * what a fail-open, must-stay-fast hook can safely do:
 *  - KEPT: correlate with the tracking entry goodvibes-intel's SubagentStart
 *    wrote to the shared `.goodvibes/state/agent-tracking.json` (R15),
 *    compute duration, extract files the agent modified from its transcript,
 *    run a bounded `tsc --noEmit` when TypeScript files were touched, and
 *    write one JSONL telemetry record per completion.
 *  - DELETED: `buildOrchestratorContext` and everything it returned, v1's
 *    ~1.5KB of "next steps" doctrine injected into the parent session. This
 *    hook returns NO systemMessage/additionalContext at all (silent).
 *  - SCOPED DOWN: v1's `findTestsForFile`/`runTests` pipeline (automation/
 *    test-runner.ts) matched and ran project test suites per completed
 *    subagent, too slow and too failure-prone to run unconditionally inside
 *    a hook that must answer quickly and fail open (the exact shape of field
 *    issue 9's busy-loop lesson). v2 keeps the bounded type-check signal and
 *    honestly reports `tests.ran: false` rather than silently claiming a test
 *    run that didn't happen.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  runHook,
  createHookResponse,
  statePath,
  readJsonSafe,
  writeJsonSafe,
  appendJsonlSafe,
  isTestEnvironment,
} from './lib/common.mjs';

const HOOK_EVENT = 'SubagentStop';
const TYPECHECK_TIMEOUT_MS = 15000;

function extractInputFields(input) {
  return {
    agentId: input.agent_id ?? input.subagent_id ?? '',
    agentType: input.agent_type ?? input.subagent_type ?? 'unknown',
    transcriptPath: input.agent_transcript_path ?? input.subagent_transcript_path ?? '',
  };
}

/** Bounded, best-effort JSONL transcript scan: files the agent wrote/edited. */
function extractFilesModified(transcriptPath, maxLines = 5000) {
  const files = new Set();
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  let content;
  try {
    content = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return [];
  }
  const lines = content.split('\n').slice(-maxLines);
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const blocks = entry?.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type === 'tool_use' && (block.name === 'Write' || block.name === 'Edit')) {
        const filePath = block.input?.file_path;
        if (typeof filePath === 'string') files.add(filePath);
      }
    }
  }
  return [...files];
}

/** Bounded `tsc --noEmit` run. Never throws, reports pass/fail/skip honestly. */
function typeCheck(cwd, filesModified) {
  const tsFiles = filesModified.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  if (tsFiles.length === 0) return { ran: false, valid: true, errors: [] };
  try {
    execFileSync('npx', ['tsc', '--noEmit'], {
      cwd,
      timeout: TYPECHECK_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return { ran: true, valid: true, errors: [] };
  } catch (err) {
    const output = (err?.stdout || err?.message || '').toString();
    const errorLines = output.split('\n').filter((l) => /error TS\d+:/.test(l)).slice(0, 10);
    return { ran: true, valid: false, errors: errorLines.length > 0 ? errorLines : [output.slice(0, 300)] };
  }
}

function trackingPath(cwd) {
  return statePath(cwd, 'state', 'agent-tracking.json');
}

function telemetryFile(cwd) {
  const now = new Date();
  return statePath(cwd, 'telemetry', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`);
}

async function handleSubagentStop(input) {
  const cwd = input.cwd || process.cwd();
  const { agentId, agentType, transcriptPath } = extractInputFields(input);

  const trackings = readJsonSafe(trackingPath(cwd), {});
  const tracking = agentId ? trackings[agentId] : undefined;

  const filesModified = extractFilesModified(transcriptPath);
  const validation = typeCheck(cwd, filesModified);
  const status = validation.valid ? 'completed' : 'failed';
  const durationMs = tracking ? Date.now() - new Date(tracking.started_at).getTime() : null;

  appendJsonlSafe(telemetryFile(cwd), {
    event: 'subagent_complete',
    agent_id: agentId || undefined,
    agent_type: tracking?.agent_type ?? agentType,
    session_id: tracking?.session_id ?? input.session_id ?? undefined,
    started_at: tracking?.started_at ?? undefined,
    ended_at: new Date().toISOString(),
    duration_ms: durationMs,
    status,
    files_modified: filesModified,
    validation,
    tests: { ran: false, reason: 'not run by this hook — see the tester agent / CI for authoritative results' },
  });

  if (agentId && tracking) {
    delete trackings[agentId];
    writeJsonSafe(trackingPath(cwd), trackings);
  }

  // Telemetry-only, silent: no systemMessage, no additionalContext (the
  // orchestrator-injection deletion this hook's disposition calls for).
  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSubagentStop);
}

export { extractInputFields, extractFilesModified, typeCheck, handleSubagentStop };
