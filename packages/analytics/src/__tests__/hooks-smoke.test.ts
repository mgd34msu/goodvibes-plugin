/**
 * Hook smoke tests (§ lane 7 brief: "Hooks get smoke tests — node script piping
 * synthetic stdin"). Each goodvibes analytics hook is a plain, unbuilt `.mjs`
 * file (§7 R8) — these tests spawn it as a real `node` subprocess and pipe
 * synthetic hook input on stdin, then assert on the JSON it writes to stdout.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.resolve(__dirname, '../../../../plugins/goodvibes/hooks');
const FAKE_PLUGIN_ROOT = path.join(os.tmpdir(), 'gv-fake-plugin-root-analytics');

const tmpDirs: string[] = [];
function makeTmpCwd(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-hook-smoke-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

beforeAll(() => {
  fs.mkdirSync(FAKE_PLUGIN_ROOT, { recursive: true });
});

interface SpawnOpts {
  pluginRoot?: string;
}

function runHook(hookFile: string, input: unknown, opts: SpawnOpts = {}): { code: number; stdout: string } {
  const { VITEST: _v, NODE_ENV: _n, GOODVIBES_HOOK_TEST: _t, ...cleanEnv } = process.env as Record<string, string>;
  const env = {
    ...cleanEnv,
    CLAUDE_PLUGIN_ROOT: opts.pluginRoot ?? FAKE_PLUGIN_ROOT,
  };
  try {
    const stdout = execFileSync('node', [path.join(HOOKS_DIR, hookFile)], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      env,
      timeout: 20000,
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '' };
  }
}

describe('goodvibes analytics hooks: valid JSON (fail-open)', () => {
  const hooks = ['session-end.mjs', 'stop.mjs', 'subagent-stop.mjs', 'pre-compact.mjs'];

  for (const hook of hooks) {
    it(`${hook} always emits valid JSON with continue:true`, () => {
      const cwd = makeTmpCwd();
      const { code, stdout } = runHook(hook, {
        session_id: 'test-session',
        cwd,
        hook_event_name: hook.replace('.mjs', ''),
        agent_id: 'agent-1',
        agent_type: 'goodvibes:engineer',
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.continue).toBe(true);
    });
  }
});

describe('goodvibes analytics hooks: content and silence', () => {
  it('session-end.mjs writes a session-close marker under .goodvibes/cache/', () => {
    const cwd = makeTmpCwd();
    runHook('session-end.mjs', { session_id: 'sess-42', cwd, hook_event_name: 'SessionEnd' });
    const markerPath = path.join(cwd, '.goodvibes', 'cache', 'session-sess-42.json');
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.session_id).toBe('sess-42');
  });

  it('stop.mjs appends a silent telemetry line and returns no systemMessage', () => {
    const cwd = makeTmpCwd();
    const { stdout } = runHook('stop.mjs', { session_id: 'sess-1', cwd, hook_event_name: 'Stop' });
    const parsed = JSON.parse(stdout);
    expect(parsed.systemMessage).toBeUndefined();
    expect(parsed.hookSpecificOutput).toBeUndefined();

    const telemetryDir = path.join(cwd, '.goodvibes', 'telemetry');
    const files = fs.readdirSync(telemetryDir);
    expect(files.some((f) => f.endsWith('-stops.jsonl'))).toBe(true);
  });

  it('subagent-stop.mjs is telemetry-only (no injection) and consumes the SubagentStart tracking entry', () => {
    const cwd = makeTmpCwd();
    // Simulate the intel SubagentStart having already written a tracking entry.
    const trackingPath = path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json');
    fs.mkdirSync(path.dirname(trackingPath), { recursive: true });
    fs.writeFileSync(
      trackingPath,
      JSON.stringify({ 'agent-1': { agent_id: 'agent-1', agent_type: 'engineer', session_id: 's1', started_at: new Date(Date.now() - 5000).toISOString() } }),
    );

    const { stdout } = runHook('subagent-stop.mjs', {
      session_id: 's1',
      cwd,
      hook_event_name: 'SubagentStop',
      agent_id: 'agent-1',
      agent_type: 'goodvibes:engineer',
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.systemMessage).toBeUndefined();
    expect(parsed.hookSpecificOutput).toBeUndefined();

    const remaining = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
    expect(remaining['agent-1']).toBeUndefined();

    const now = new Date();
    const telemetryPath = path.join(cwd, '.goodvibes', 'telemetry', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`);
    const lines = fs.readFileSync(telemetryPath, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.event).toBe('subagent_complete');
    expect(entry.agent_id).toBe('agent-1');
    expect(entry.duration_ms).toBeGreaterThan(0);
  });

  it('pre-compact.mjs writes a session summary and never runs git commit', () => {
    const cwd = makeTmpCwd();
    runHook('pre-compact.mjs', { session_id: 's1', cwd, hook_event_name: 'PreCompact' });
    const summaryPath = path.join(cwd, '.goodvibes', 'state', 'last-session-summary.md');
    expect(fs.existsSync(summaryPath)).toBe(true);
    const content = fs.readFileSync(summaryPath, 'utf-8');
    expect(content).toMatch(/observe-only/i);
    // No .git directory should have been created/touched by this hook.
    expect(fs.existsSync(path.join(cwd, '.git'))).toBe(false);
  });
});
