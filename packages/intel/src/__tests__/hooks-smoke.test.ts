/**
 * Hook smoke tests (§ lane 7 brief: "Hooks get smoke tests — node script piping
 * synthetic stdin"). Each goodvibes intel hook is a plain, unbuilt `.mjs` file
 * (§7 R8) — these tests spawn it as a REAL `node` subprocess (not an in-process
 * import) and pipe synthetic hook input on stdin, exactly like Claude Code
 * would invoke it, then assert on the JSON it writes to stdout.
 *
 * Covers: valid-JSON-always and the corrected `hookSpecificOutput.additionalContext`
 * schema (the v1 bug plan §8 calls out).
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
  // Every server's representative native-dep probe exists in the fake root,
  // so the deps nudge stays silent in every test that doesn't remove them.
  for (const [server, probe] of [
    ['intel', '@vscode/ripgrep'],
    ['analytics', 'ink'],
    ['connect', 'sql.js'],
  ]) {
    fs.mkdirSync(
      path.join(FAKE_PLUGIN_ROOT, 'server', server, 'node_modules', ...probe.split('/')),
      { recursive: true },
    );
  }
});

describe('goodvibes intel hooks: valid JSON (fail-open)', () => {
  const hooks = ['session-start.mjs', 'setup.mjs', 'subagent-start.mjs', 'post-tool-use-failure.mjs'];

  for (const hook of hooks) {
    it(`${hook} always emits valid JSON with continue:true`, () => {
      const cwd = makeTmpCwd();
      const { code, stdout } = runHook(hook, {
        session_id: 'test-session',
        cwd,
        hook_event_name: hook.replace('.mjs', ''),
        tool_name: 'Bash',
        error: 'npm ERR! ERESOLVE could not resolve dependency',
        agent_type: 'goodvibes:engineer',
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.continue).toBe(true);
    });
  }
});

describe('goodvibes intel hooks: schema and content', () => {
  it('session-start.mjs emits EXACTLY the first-session value line for a fresh, healthy project (2.0.5 contract)', () => {
    const cwd = makeTmpCwd();
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    expect(parsed.continue).toBe(true);
    // No recap yet -> the first-session pointer, and NOTHING else appended.
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(parsed.hookSpecificOutput.additionalContext).toBe(
      '[goodvibes] First session here - 25 tools on intel/analytics/connect; /goodvibes:analytics shows live session cost.',
    );
    expect(parsed.systemMessage).toMatch(/first session/);
    // The retired filler must never come back.
    expect(parsed.hookSpecificOutput.additionalContext).not.toMatch(/Stack:|Git: on|TODO/);
  });

  it('session-start.mjs surfaces the recap value line with correct dollars from a planted summary', () => {
    const cwd = makeTmpCwd();
    const cacheDir = path.join(cwd, '.goodvibes', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'last-session-summary.json'),
      JSON.stringify({
        session_id: 'prev',
        cost_usd: 12.5,
        calls: 42,
        model_families: ['opus', 'sonnet'],
        project_total_usd: 99.99,
      }),
    );
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toBe(
      '[goodvibes] Last session: $12.50 over 42 calls (opus/sonnet) | project total: $99.99',
    );
    expect(parsed.systemMessage).toBe('goodvibes: last session $12.50 over 42 calls | project total $99.99');
    expect(parsed.hookSpecificOutput.additionalContext).not.toMatch(/Stack:|Git: on|TODO/);
  });

  it('session-start.mjs appends real problem notes AFTER the value line (value line always leads)', () => {
    const cwd = makeTmpCwd();
    // package.json without node_modules is a real, actionable problem note.
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"x","version":"0.0.0"}\n');
    const { stdout } = runHook('session-start.mjs', { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' });
    const parsed = JSON.parse(stdout);
    expect(parsed.additionalContext).toBeUndefined();
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    const ctx = parsed.hookSpecificOutput.additionalContext as string;
    // First line is the (first-session) value line; the note appends below it.
    expect(ctx.split('\n')[0]).toContain('[goodvibes] First session here');
    expect(ctx).toContain('dependencies not installed');
    expect(parsed.systemMessage).toMatch(/project note/);
    // The retired filler must never come back.
    expect(ctx).not.toMatch(/Stack:|Git: on|TODO/);
  });

  it('session-end.mjs writes a cost recap JSON with the expected cost from a synthetic transcript', () => {
    const cwd = makeTmpCwd();
    const transcript = path.join(cwd, 'transcript.jsonl');
    // Unknown model -> the module's DEFAULT rate ($3 in / $15 out per MTok),
    // deterministic regardless of any machine's ~/.claude/model-pricing.json.
    // Two priced records at 100k in + 100k out each: (0.3 + 1.5) * 2 = 3.60.
    // A truncated final line proves tail tolerance (it must be skipped).
    const rec = JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-costtest-1', usage: { input_tokens: 100_000, output_tokens: 100_000 } },
    });
    fs.writeFileSync(transcript, `${rec}\n${rec}\n{"type":"assistant","message":{"usa`);

    const { stdout } = runHook('session-end.mjs', {
      session_id: 'sess-xyz',
      cwd,
      hook_event_name: 'SessionEnd',
      transcript_path: transcript,
    });
    expect(JSON.parse(stdout).continue).toBe(true);

    const summaryPath = path.join(cwd, '.goodvibes', 'cache', 'last-session-summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    expect(summary.session_id).toBe('sess-xyz');
    expect(summary.calls).toBe(2);
    expect(summary.cost_usd).toBe(3.6);
    expect(summary.model_families).toEqual(['costtest']);
    expect(summary.project_total_usd).toBe(3.6);

    // A second run adds onto the running project total (previous + this session).
    runHook('session-end.mjs', {
      session_id: 'sess-2',
      cwd,
      hook_event_name: 'SessionEnd',
      transcript_path: transcript,
    });
    const summary2 = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    expect(summary2.cost_usd).toBe(3.6);
    expect(summary2.project_total_usd).toBe(7.2);
  });

  it('setup.mjs writes a marker once and stays silent on the second run', () => {
    const cwd = makeTmpCwd();
    const first = runHook('setup.mjs', { session_id: 's1', cwd, hook_event_name: 'Setup' });
    const firstParsed = JSON.parse(first.stdout);
    expect(firstParsed.systemMessage).toMatch(/first-time setup/);
    expect(fs.existsSync(path.join(cwd, '.goodvibes', '.setup-marker.json'))).toBe(true);

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
      agent_type: 'goodvibes:engineer',
    });
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext as string;
    expect(ctx.length).toBeLessThanOrEqual(500 * 3.5 + 1);
    expect(ctx).toContain('engineer');

    const tracking = JSON.parse(fs.readFileSync(path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json'), 'utf-8'));
    expect(tracking['agent-1'].agent_type).toBe('engineer');
  });

  it('post-tool-use-failure.mjs emits NOTHING to the conversation and documents a recurring failure once (2.1.0 contract)', () => {
    const cwd = makeTmpCwd();
    const input = {
      session_id: 's1',
      cwd,
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      error: "TS2322: Type 'string' is not assignable to type 'number'",
    };
    // Silent by contract: no systemMessage, no additionalContext, on ANY attempt.
    for (let i = 0; i < 7; i++) {
      const parsed = JSON.parse(runHook('post-tool-use-failure.mjs', input).stdout);
      expect(parsed.continue).toBe(true);
      expect(parsed.systemMessage).toBeUndefined();
      expect(parsed.hookSpecificOutput).toBeUndefined();
    }
    // ...but the recurring failure was documented to project memory exactly once.
    const failures = JSON.parse(
      fs.readFileSync(path.join(cwd, '.goodvibes', 'memory', 'failures.json'), 'utf-8'),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].tool).toBe('Bash');
    expect(failures[0].reason).toMatch(/recurred/);
  });

  it('session-start.mjs appends the deps nudge when the installed plugin copy has no native deps', () => {
    const cwd = makeTmpCwd();
    const bareRoot = makeTmpCwd(); // no server/<name>/node_modules probes inside
    const bareHome = makeTmpCwd(); // no durable deps either -> nothing to relink
    const { stdout } = runHook(
      'session-start.mjs',
      { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' },
      { pluginRoot: bareRoot, extraEnv: { HOME: bareHome } },
    );
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext as string;
    expect(ctx.split('\n')[0]).toContain('[goodvibes] First session here');
    expect(ctx).toContain('run /goodvibes:setup');
    expect(parsed.systemMessage).toMatch(/native deps/);
  });

  it('session-start.mjs silently relinks durable deps after a plugin update (no nudge)', () => {
    const cwd = makeTmpCwd();
    const home = makeTmpCwd();
    const freshRoot = makeTmpCwd(); // simulates the update-replaced plugin copy

    const pkg = JSON.stringify({ dependencies: { probe: '1.0.0' } });
    for (const [server, probe] of [
      ['intel', '@vscode/ripgrep'],
      ['analytics', 'ink'],
      ['connect', 'sql.js'],
    ] as const) {
      // Durable home: installed modules + the package.json setup recorded.
      const durable = path.join(home, '.claude', '.goodvibes', 'deps', server);
      fs.mkdirSync(path.join(durable, 'node_modules', ...probe.split('/')), { recursive: true });
      fs.writeFileSync(path.join(durable, 'package.json'), pkg);
      // Fresh plugin copy: same package.json, NO node_modules (the update wiped it).
      const serverDir = path.join(freshRoot, 'server', server);
      fs.mkdirSync(serverDir, { recursive: true });
      fs.writeFileSync(path.join(serverDir, 'package.json'), pkg);
    }

    const { stdout } = runHook(
      'session-start.mjs',
      { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' },
      { pluginRoot: freshRoot, extraEnv: { HOME: home } },
    );
    const parsed = JSON.parse(stdout);
    // Healed silently: value line only, no nudge, and the symlinks exist.
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('/goodvibes:setup');
    expect(parsed.systemMessage).not.toMatch(/native deps/);
    for (const server of ['intel', 'analytics', 'connect']) {
      const link = path.join(freshRoot, 'server', server, 'node_modules');
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    }
  });

  it('session-start.mjs nudges instead of relinking when an update changed a dependency list', () => {
    const cwd = makeTmpCwd();
    const home = makeTmpCwd();
    const freshRoot = makeTmpCwd();

    for (const [server, probe] of [
      ['intel', '@vscode/ripgrep'],
      ['analytics', 'ink'],
      ['connect', 'sql.js'],
    ] as const) {
      const durable = path.join(home, '.claude', '.goodvibes', 'deps', server);
      fs.mkdirSync(path.join(durable, 'node_modules', ...probe.split('/')), { recursive: true });
      fs.writeFileSync(path.join(durable, 'package.json'), JSON.stringify({ dependencies: { probe: '1.0.0' } }));
      const serverDir = path.join(freshRoot, 'server', server);
      fs.mkdirSync(serverDir, { recursive: true });
      // The update ships a DIFFERENT dependency list -> stale install must not relink.
      fs.writeFileSync(path.join(serverDir, 'package.json'), JSON.stringify({ dependencies: { probe: '2.0.0' } }));
    }

    const { stdout } = runHook(
      'session-start.mjs',
      { session_id: 'abc12345', cwd, hook_event_name: 'SessionStart' },
      { pluginRoot: freshRoot, extraEnv: { HOME: home } },
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('run /goodvibes:setup');
    expect(fs.existsSync(path.join(freshRoot, 'server', 'intel', 'node_modules'))).toBe(false);
  });
});

describe('goodvibes intel hooks: host-health nudge (lane 9 loose coupling)', () => {
  function writeHealthState(cwd: string, state: object): void {
    const dir = path.join(cwd, '.goodvibes', 'health');
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
    expect(parsed.hookSpecificOutput?.additionalContext ?? '').not.toMatch(/Host health/);
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
    expect(parsed.hookSpecificOutput?.additionalContext ?? '').not.toMatch(/Host health/);
  });
});
