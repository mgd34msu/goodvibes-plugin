/**
 * Hook smoke tests (§ lane 7 brief: "Hooks get smoke tests — node script piping
 * synthetic stdin"). Each goodvibes-intel hook is a plain, unbuilt `.mjs` file
 * (§7 R8) — these tests spawn it as a REAL `node` subprocess (not an in-process
 * import) and pipe synthetic hook input on stdin, exactly like Claude Code
 * would invoke it, then assert on the JSON it writes to stdout.
 *
 * Covers: valid-JSON-always, the corrected `hookSpecificOutput.additionalContext`
 * schema (the v1 bug plan §8 calls out), and the R16 v1-yield guard.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.resolve(__dirname, '../../../../plugins/goodvibes/hooks');
const FAKE_PLUGIN_ROOT = path.join(os.tmpdir(), 'gv-fake-plugin-root-intel');
// R16 "v1 present" fixture: a plugin root whose sibling `goodvibes/.cache`
// directory exists (shouldYieldToV1 checks `<pluginRoot>/../goodvibes/.cache`).
// Built under a unique temp base in beforeAll so the test is self-contained and
// independent of the repo layout — FAKE_PLUGIN_ROOT, whose own sibling has no
// such dir, stays the "v1 absent" fixture.
const V1_PRESENT_BASE = path.join(os.tmpdir(), 'gv-v1-present-intel');
const V1_PRESENT_ROOT = path.join(V1_PRESENT_BASE, 'plugin');

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

interface SpawnOpts {
  pluginRoot?: string;
  extraEnv?: Record<string, string>;
}

function runHook(hookFile: string, input: unknown, opts: SpawnOpts = {}): { code: number; stdout: string } {
  const { VITEST: _v, NODE_ENV: _n, GOODVIBES_HOOK_TEST: _t, ...cleanEnv } = process.env as Record<string, string>;
  const env = {
    ...cleanEnv,
    CLAUDE_PLUGIN_ROOT: opts.pluginRoot ?? FAKE_PLUGIN_ROOT,
    GOODVIBES_HOOK_NO_BACKGROUND: '1',
    ...opts.extraEnv,
  };
  try {
    const stdout = execFileSync('node', [path.join(HOOKS_DIR, hookFile)], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      env,
      timeout: 15000,
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '' };
  }
}

beforeAll(() => {
  fs.mkdirSync(FAKE_PLUGIN_ROOT, { recursive: true });
  fs.mkdirSync(path.join(V1_PRESENT_BASE, 'goodvibes', '.cache'), { recursive: true });
});

describe('goodvibes-intel hooks: valid JSON + R16 yield guard', () => {
  const hooks = ['session-start.mjs', 'setup.mjs', 'subagent-start.mjs', 'post-tool-use-failure.mjs'];

  for (const hook of hooks) {
    it(`${hook} always emits valid JSON with continue:true (no v1 present)`, () => {
      const cwd = makeTmpCwd();
      const { code, stdout } = runHook(hook, {
        session_id: 'test-session',
        cwd,
        hook_event_name: hook.replace('.mjs', ''),
        tool_name: 'Bash',
        error: 'npm ERR! ERESOLVE could not resolve dependency',
        agent_type: 'goodvibes-intel:engineer',
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.continue).toBe(true);
    });

    it(`${hook} yields to v1 when v1's cache directory is present (R16)`, () => {
      // V1_PRESENT_ROOT's sibling goodvibes/.cache is created in beforeAll —
      // the self-contained R16 fixture.
      const cwd = makeTmpCwd();
      const { code, stdout } = runHook(hook, { session_id: 'test-session', cwd, hook_event_name: hook.replace('.mjs', '') }, { pluginRoot: V1_PRESENT_ROOT });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.continue).toBe(true);
      expect(parsed.systemMessage).toMatch(/yielding to v1/);
    });
  }
});

describe('goodvibes-intel hooks: schema and content', () => {
  it('session-start.mjs uses hookSpecificOutput.additionalContext, not top-level additionalContext', () => {
    const cwd = makeTmpCwd();
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    expect(parsed.additionalContext).toBeUndefined();
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(typeof parsed.hookSpecificOutput?.additionalContext).toBe('string');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('[goodvibes-intel] Session context');
  });

  it('setup.mjs writes a marker once and stays silent on the second run', () => {
    const cwd = makeTmpCwd();
    const first = runHook('setup.mjs', { session_id: 's1', cwd, hook_event_name: 'Setup' });
    const firstParsed = JSON.parse(first.stdout);
    expect(firstParsed.systemMessage).toMatch(/first-time setup/);
    expect(fs.existsSync(path.join(cwd, '.goodvibes', 'v2', '.setup-marker.json'))).toBe(true);

    const second = runHook('setup.mjs', { session_id: 's2', cwd, hook_event_name: 'Setup' });
    const secondParsed = JSON.parse(second.stdout);
    expect(secondParsed.systemMessage).toBeUndefined();
  });

  it('subagent-start.mjs stays within the ~500-token pointer budget and records tracking', () => {
    const cwd = makeTmpCwd();
    const { stdout } = runHook('subagent-start.mjs', {
      session_id: 's1',
      cwd,
      hook_event_name: 'SubagentStart',
      agent_id: 'agent-1',
      agent_type: 'goodvibes-intel:engineer',
    });
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext as string;
    expect(ctx.length).toBeLessThanOrEqual(500 * 3.5 + 1);
    expect(ctx).toContain('engineer');

    const tracking = JSON.parse(fs.readFileSync(path.join(cwd, '.goodvibes', 'v2', 'state', 'agent-tracking.json'), 'utf-8'));
    expect(tracking['agent-1'].agent_type).toBe('engineer');
  });

  it('post-tool-use-failure.mjs runs the 3-phase fix loop and escalates on repeated failures', () => {
    const cwd = makeTmpCwd();
    const input = {
      session_id: 's1',
      cwd,
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      error: "TS2322: Type 'string' is not assignable to type 'number'",
    };
    const first = JSON.parse(runHook('post-tool-use-failure.mjs', input).stdout);
    expect(first.systemMessage).toContain('Phase 1/3');
    expect(first.systemMessage).toContain('Suggested fix');

    // typescript_error has a phase-1 retry limit of 3: escalation is checked at
    // the START of each call using the PREVIOUS call's attempt count, so the
    // 4th call is the first one to see attemptsThisPhase (3) >= limit (3) and
    // escalate. Calls 2 and 3 stay in phase 1.
    runHook('post-tool-use-failure.mjs', input);
    runHook('post-tool-use-failure.mjs', input);
    const escalated = JSON.parse(runHook('post-tool-use-failure.mjs', input).stdout);
    expect(escalated.systemMessage).toContain('Phase 2/3');
    expect(escalated.systemMessage).toMatch(/official documentation/i);
  });
});

describe('goodvibes-intel hooks: host-health nudge (lane 9 loose coupling)', () => {
  function writeHealthState(cwd: string, state: object): void {
    const dir = path.join(cwd, '.goodvibes', 'v2', 'health');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'health-state.json'), JSON.stringify(state));
  }

  it('session-start surfaces a nudge when the analytics sampler flags a threshold', () => {
    const cwd = makeTmpCwd();
    writeHealthState(cwd, {
      schema: 1,
      sampled_at: Date.now(),
      proc_available: true,
      loadavg: [4, 3, 2],
      cpu_count: 1,
      load_per_core: 4.0,
      session_root_pid: 1,
      session_child_count: 2,
      orphans: [
        {
          pid: 4242,
          ppid: 1,
          reparented_to: 'init',
          cpu_percent: 88,
          sustained_windows: 3,
          cmdline: 'node /home/u/.claude/plugins/goodvibes/server/analytics/index.cjs',
          kill_command: 'kill -TERM 4242',
        },
      ],
      degraded: null,
    });
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext as string;
    expect(ctx).toMatch(/Host health/);
    expect(ctx).toMatch(/orphaned plugin process/);
    expect(ctx).toMatch(/mode=doctor/);
    expect(parsed.systemMessage).toMatch(/host health alert/);
  });

  it('session-start stays silent about health when no state file exists (graceful)', () => {
    const cwd = makeTmpCwd();
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    expect(parsed.continue).toBe(true);
    expect(parsed.hookSpecificOutput.additionalContext).not.toMatch(/Host health/);
  });

  it('session-start does not nudge when thresholds are not tripped', () => {
    const cwd = makeTmpCwd();
    writeHealthState(cwd, {
      schema: 1,
      sampled_at: Date.now(),
      proc_available: true,
      loadavg: [0.2, 0.1, 0.1],
      cpu_count: 8,
      load_per_core: 0.025,
      session_root_pid: 1,
      session_child_count: 1,
      orphans: [],
      degraded: null,
    });
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.additionalContext).not.toMatch(/Host health/);
  });
});
