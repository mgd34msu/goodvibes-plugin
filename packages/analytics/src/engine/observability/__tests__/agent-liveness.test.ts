/**
 * Agent-liveness scanner tests (lane 9) with synthetic transcript fixtures.
 *
 * Builds a session's `subagents/` directory with hand-written agent transcripts
 * that exercise each classification: wedged (stale outstanding tool call),
 * thinking (recent assistant/thinking output), executing (live child), and
 * idle. Also covers write-rate across two scans and graceful degradation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanAgentLiveness, renderAgentLiveness, type SizeSnapshot } from '../agent-liveness.js';

let tmp: string;
let sessionDir: string;
let subagentsDir: string;

const NOW = 1_800_000_000_000;
const MIN = 60_000;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-agents-'));
  sessionDir = path.join(tmp, 'sess-1');
  subagentsDir = path.join(sessionDir, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Write an agent transcript and set its mtime to `ageMin` minutes before NOW. */
function writeAgent(id: string, lines: unknown[], ageMin: number, meta?: object): void {
  const file = path.join(subagentsDir, `agent-${id}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  if (meta) fs.writeFileSync(file.replace(/\.jsonl$/, '.meta.json'), JSON.stringify(meta));
  const mtime = new Date(NOW - ageMin * MIN);
  fs.utimesSync(file, mtime, mtime);
}

function assistantToolUse(id: string, name: string, tsMin: number) {
  return {
    type: 'assistant',
    timestamp: new Date(NOW - tsMin * MIN).toISOString(),
    message: { model: 'claude-sonnet-5', content: [{ type: 'tool_use', id, name, input: {} }] },
  };
}
function assistantThinking(tsMin: number) {
  return {
    type: 'assistant',
    timestamp: new Date(NOW - tsMin * MIN).toISOString(),
    message: { model: 'claude-sonnet-5', content: [{ type: 'thinking', thinking: 'pondering' }] },
  };
}
function userToolResult(id: string) {
  return { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id }] } };
}

describe('scanAgentLiveness', () => {
  it('classifies wedged, thinking, executing, and idle agents', () => {
    // wedged: tool call issued 8m ago, no result, file stale 8m, no live child.
    writeAgent('wedged1', [assistantToolUse('t1', 'Bash', 8)], 8, { agentType: 'engineer', description: 'x' });
    // thinking: recent thinking output, no outstanding tool call.
    writeAgent('think1', [assistantThinking(0.5)], 0.5);
    // executing: stale + outstanding call, but a live OS child forces executing.
    writeAgent('exec1', [assistantToolUse('t2', 'Bash', 9)], 9);
    // idle: old thinking, nothing outstanding.
    writeAgent('idle1', [assistantThinking(30)], 30);

    const report = scanAgentLiveness({
      sessionDir,
      now: () => NOW,
      wedgedMinutes: 3,
      liveChildAgentIds: new Set(['exec1']),
    });

    const byId = Object.fromEntries(report.agents.map((a) => [a.agent_id, a]));
    expect(byId['wedged1'].state).toBe('wedged');
    expect(byId['wedged1'].agent_type).toBe('engineer');
    expect(byId['think1'].state).toBe('thinking');
    expect(byId['exec1'].state).toBe('executing');
    expect(byId['idle1'].state).toBe('idle');

    // Wedged agents sort to the top.
    expect(report.agents[0].state).toBe('wedged');

    const rendered = renderAgentLiveness(report);
    expect(rendered).toContain('WEDGED');
    expect(rendered).toContain('engineer');
  });

  it('resolves a matched tool call as no-longer-pending (not wedged)', () => {
    // Tool call issued 8m ago AND resolved → no outstanding call → idle (stale).
    writeAgent('done1', [assistantToolUse('t9', 'Bash', 8), userToolResult('t9')], 8);
    const report = scanAgentLiveness({ sessionDir, now: () => NOW, wedgedMinutes: 3 });
    expect(report.agents[0].state).toBe('idle');
  });

  it('computes write rate across two scans', () => {
    writeAgent('w', [assistantThinking(1)], 1);
    const prev: SizeSnapshot = new Map();

    // First scan: no prior snapshot → write_rate null, snapshot seeded.
    let now = NOW;
    let report = scanAgentLiveness({ sessionDir, now: () => now, prevSizes: prev });
    expect(report.agents[0].write_rate_bpm).toBeNull();

    // Append content, advance 1 minute, rescan → positive write rate.
    fs.appendFileSync(path.join(subagentsDir, 'agent-w.jsonl'), JSON.stringify(assistantThinking(0)) + '\n');
    now = NOW + MIN;
    report = scanAgentLiveness({ sessionDir, now: () => now, prevSizes: prev });
    expect(report.agents[0].write_rate_bpm).toBeGreaterThan(0);
  });

  it('degrades honestly when no session dir is resolvable', () => {
    const report = scanAgentLiveness({ sessionDir: null });
    expect(report.agents).toHaveLength(0);
    expect(report.degraded).toMatch(/no active session directory/);
    expect(renderAgentLiveness(report)).toMatch(/no active session directory/);
  });

  it('reports no agents (not an error) when the session has no subagent transcripts', () => {
    const empty = path.join(tmp, 'empty-session');
    fs.mkdirSync(empty, { recursive: true });
    const report = scanAgentLiveness({ sessionDir: empty });
    expect(report.degraded).toBeNull();
    expect(report.agents).toHaveLength(0);
    expect(renderAgentLiveness(report)).toMatch(/No background agent transcripts/);
  });
});
