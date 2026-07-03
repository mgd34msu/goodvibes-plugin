/**
 * F9 — process hygiene (release gate; field issue 9).
 *
 *  - real-process ppid watchdog: spawn a real child server, kill its parent,
 *    assert the orphaned child exits within 10s;
 *  - fake-clock idle self-exit (and its reset on activity);
 *  - budget-expiry returning a partial result with honest accounting.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { installProcessHygiene, withBudget } from '../proc/index.js';
import { successEnvelope, renderEnvelope, type Envelope } from '../envelope/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('installProcessHygiene — parent-liveness (real process)', () => {
  let tmpDir: string;
  let bundlePath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-proc-'));
    bundlePath = path.join(tmpDir, 'idle-server.cjs');
    await build({
      entryPoints: [path.join(HERE, 'fixtures', 'idle-server.ts')],
      outfile: bundlePath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
    });
  }, 30000);

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('an orphaned server exits within 10s after its parent dies (ppid poll)', async () => {
    // A launcher spawns the server DETACHED with stdin ignored, prints the
    // server pid, then stays alive. Killing the launcher orphans the server.
    const launcherCode = `
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [${JSON.stringify(bundlePath)}], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: { ...process.env, PPID_POLL_MS: '1000' },
      });
      child.unref();
      process.stdout.write(String(child.pid) + '\\n');
      setInterval(() => {}, 1 << 30);
    `;
    const launcher = spawn(process.execPath, ['-e', launcherCode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const serverPid = await new Promise<number>((resolve, reject) => {
      let buf = '';
      const to = setTimeout(() => reject(new Error('launcher did not report a pid')), 8000);
      launcher.stdout.on('data', (d) => {
        buf += String(d);
        const m = buf.match(/(\d+)/);
        if (m) {
          clearTimeout(to);
          resolve(Number(m[1]));
        }
      });
      launcher.on('error', reject);
    });

    // Let the server install its watchdog and capture its parent pid.
    await new Promise((r) => setTimeout(r, 600));
    expect(isAlive(serverPid)).toBe(true);

    // Kill the parent; the orphaned server must notice the reparent and exit.
    launcher.kill('SIGKILL');

    const start = Date.now();
    while (Date.now() - start < 10000) {
      if (!isAlive(serverPid)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const survived = isAlive(serverPid);
    if (survived) {
      try {
        process.kill(serverPid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
    expect(survived).toBe(false);
  }, 20000);
});

describe('installProcessHygiene — NO idle self-exit, ever (fake clock)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never exits from idleness — an installed server runs for the life of its session (Mike, 2026-07-02)', async () => {
    vi.useFakeTimers();
    let code = -1;
    const h = installProcessHygiene({
      watchStdin: false,
      watchSignals: false,
      exit: (c) => {
        code = c;
      },
    });
    // A week of dead silence: an agent running autonomously while Mike is
    // away must come back to a LIVE server no matter how long it went
    // between tool calls. Only session death (stdin close / reparent /
    // signal) may end the process. This test exists so idle-exit can never
    // be reintroduced by a refactor.
    await vi.advanceTimersByTimeAsync(7 * 24 * 60 * 60 * 1000);
    expect(code).toBe(-1);
    h.noteActivity(); // compatibility no-op for existing call sites
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(code).toBe(-1);
    h.stop();
  });
});

describe('withBudget — partial result on expiry', () => {
  it('returns a partial with budget_exceeded when the task overruns', async () => {
    const collected: number[] = [];
    const outcome = await withBudget(50, async (signal) => {
      for (let i = 0; i < 100000; i++) {
        if (signal.aborted) return collected.slice();
        collected.push(i);
        await new Promise((r) => setTimeout(r, 5));
      }
      return collected.slice();
    });
    expect(outcome.budget_exceeded).toBe(true);
    expect(outcome.value.length).toBeGreaterThan(0);
    expect(outcome.value.length).toBeLessThan(100000);
  });

  it('returns the full result with budget_exceeded false when the task finishes in time', async () => {
    const outcome = await withBudget(1000, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'done';
    });
    expect(outcome.budget_exceeded).toBe(false);
    expect(outcome.value).toBe('done');
  });

  it('composes into an honest envelope with budget_exceeded stamped', () => {
    const env = successEnvelope({ partial: [1, 2, 3] }, { budget_exceeded: true, truncated: true });
    const parsed = JSON.parse(renderEnvelope(env)) as Envelope<unknown>;
    expect(parsed.meta.budget_exceeded).toBe(true);
    expect(parsed.meta.truncated).toBe(true);
    expect(parsed.meta.token_estimate).toBeGreaterThan(0);
  });
});
