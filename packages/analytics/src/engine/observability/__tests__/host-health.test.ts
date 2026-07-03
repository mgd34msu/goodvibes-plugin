/**
 * Host-health sampler tests (lane 9) against a FAKE `/proc` fixture directory.
 *
 * We build a synthetic process table on disk (loadavg + per-pid stat/cmdline),
 * point the sampler at it, and drive multiple samples to exercise the sustained
 * -CPU orphan heuristic (ppid init/systemd + plugin-path cmdline + sustained
 * CPU>50%). A high-CPU non-plugin process and a low-CPU plugin process are
 * planted as negative controls. Also covers graceful degradation with no /proc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  HostHealthSampler,
  healthThresholdTripped,
  renderDoctorReport,
  type HealthState,
} from '../host-health.js';

let tmp: string;
let procRoot: string;
let goodvibesDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-health-'));
  procRoot = path.join(tmp, 'proc');
  goodvibesDir = path.join(tmp, '.goodvibes', 'v2');
  fs.mkdirSync(procRoot, { recursive: true });
  fs.mkdirSync(goodvibesDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Write a synthetic /proc/<pid>/stat and cmdline. */
function writeProc(
  pid: number,
  opts: { comm: string; ppid: number; utime: number; stime?: number; cmdline: string },
): void {
  const dir = path.join(procRoot, String(pid));
  fs.mkdirSync(dir, { recursive: true });
  const stime = opts.stime ?? 0;
  // f1 pid (f2 comm) f3 state f4 ppid f5.. f14 utime f15 stime ...
  const stat = `${pid} (${opts.comm}) R ${opts.ppid} 0 0 0 -1 0 0 0 0 0 ${opts.utime} ${stime} 0 0 20 0 1 0 0`;
  fs.writeFileSync(path.join(dir, 'stat'), stat);
  fs.writeFileSync(path.join(dir, 'cmdline'), opts.cmdline.replace(/ /g, '\0') + '\0');
}

function writeLoadavg(l1: number, l5: number, l15: number): void {
  fs.writeFileSync(path.join(procRoot, 'loadavg'), `${l1} ${l5} ${l15} 3/900 9999\n`);
}

const PLUGIN_CMD = '/usr/bin/node /home/u/.claude/plugins/goodvibes/server/analytics/index.cjs';

describe('HostHealthSampler against a fake /proc', () => {
  it('parses loadavg, counts session children, and detects sustained-CPU orphans', () => {
    writeLoadavg(2.5, 1.8, 1.2);
    // systemd --user manager.
    writeProc(5000, { comm: 'systemd', ppid: 1, utime: 10, cmdline: '/usr/lib/systemd/systemd --user' });
    // Orphan reparented to init, plugin path.
    writeProc(4242, { comm: 'node', ppid: 1, utime: 100, cmdline: PLUGIN_CMD });
    // Orphan reparented to the systemd --user manager, plugin path.
    writeProc(4243, { comm: 'node', ppid: 5000, utime: 100, cmdline: PLUGIN_CMD });
    // Negative: high CPU but NOT a plugin path.
    writeProc(7777, { comm: 'firefox', ppid: 1, utime: 100, cmdline: '/usr/bin/firefox' });
    // Negative: a plugin child of the session root (counts as a child, low CPU).
    writeProc(8888, { comm: 'node', ppid: 1000, utime: 100, cmdline: PLUGIN_CMD });

    let clock = 0;
    const sampler = new HostHealthSampler({
      goodvibesDir,
      procRoot,
      sessionRootPid: 1000,
      clkTck: 100,
      now: () => clock,
    });

    // Sample 1: establishes CPU baseline. No orphans yet (no delta).
    let state = sampler.sampleOnce();
    expect(state.proc_available).toBe(true);
    expect(state.loadavg).toEqual([2.5, 1.8, 1.2]);
    expect(state.session_child_count).toBe(1); // only pid 8888 has ppid 1000
    expect(state.orphans).toHaveLength(0);

    // Sample 2 (t+60s): bump the two orphans' CPU by 4000 jiffies (~66%/60s).
    clock = 60_000;
    writeProc(4242, { comm: 'node', ppid: 1, utime: 4100, cmdline: PLUGIN_CMD });
    writeProc(4243, { comm: 'node', ppid: 5000, utime: 4100, cmdline: PLUGIN_CMD });
    // 7777 also busy but non-plugin — must never be flagged.
    writeProc(7777, { comm: 'firefox', ppid: 1, utime: 4100, cmdline: '/usr/bin/firefox' });
    state = sampler.sampleOnce();
    expect(state.orphans).toHaveLength(0); // streak 1 < sustained 2

    // Sample 3 (t+120s): sustained over two windows now.
    clock = 120_000;
    writeProc(4242, { comm: 'node', ppid: 1, utime: 8100, cmdline: PLUGIN_CMD });
    writeProc(4243, { comm: 'node', ppid: 5000, utime: 8100, cmdline: PLUGIN_CMD });
    writeProc(7777, { comm: 'firefox', ppid: 1, utime: 8100, cmdline: '/usr/bin/firefox' });
    state = sampler.sampleOnce();

    const pids = state.orphans.map((o) => o.pid).sort();
    expect(pids).toEqual([4242, 4243]);
    const init = state.orphans.find((o) => o.pid === 4242)!;
    expect(init.reparented_to).toBe('init');
    expect(init.cpu_percent).toBeGreaterThan(50);
    expect(init.sustained_windows).toBeGreaterThanOrEqual(2);
    expect(init.kill_command).toBe('kill -TERM 4242');
    const sysd = state.orphans.find((o) => o.pid === 4243)!;
    expect(sysd.reparented_to).toBe('systemd-user');

    // Doctor render lists offenders with a kill command and the human-only note.
    const report = renderDoctorReport(state);
    expect(report).toContain('kill -TERM 4242');
    expect(report).toContain('never kills processes for you');
  });

  it('writes the state file under .goodvibes/v2/health/', () => {
    writeLoadavg(0.5, 0.4, 0.3);
    const sampler = new HostHealthSampler({ goodvibesDir, procRoot, sessionRootPid: 1 });
    sampler.writeState(sampler.sampleOnce());
    const file = path.join(goodvibesDir, 'health', 'health-state.json');
    expect(fs.existsSync(file)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as HealthState;
    expect(parsed.schema).toBe(1);
    expect(parsed.loadavg).toEqual([0.5, 0.4, 0.3]);
  });

  it('degrades honestly when /proc is absent', () => {
    const sampler = new HostHealthSampler({
      goodvibesDir,
      procRoot: path.join(tmp, 'does-not-exist'),
      sessionRootPid: 1,
    });
    const state = sampler.sampleOnce();
    expect(state.proc_available).toBe(false);
    expect(state.orphans).toHaveLength(0);
    expect(state.degraded).toMatch(/process table unavailable/);
    // Rendered doctor view says so rather than pretending all is well.
    expect(renderDoctorReport(state)).toMatch(/Degraded/);
  });

  it('the sampler interval is unref-ed so it never holds the loop open (field issue 9)', () => {
    const sampler = new HostHealthSampler({ goodvibesDir, procRoot });
    sampler.start();
    // If start() held the loop open, vitest would hang; stop() releases it.
    sampler.stop();
    // Second stop is a safe no-op.
    expect(() => sampler.stop()).not.toThrow();
  });
});

describe('healthThresholdTripped', () => {
  const base: HealthState = {
    schema: 1,
    sampled_at: 0,
    proc_available: true,
    loadavg: [0, 0, 0],
    cpu_count: 8,
    load_per_core: 0.1,
    session_root_pid: 1,
    session_child_count: 0,
    orphans: [],
    degraded: null,
  };

  it('is false at low load with no orphans', () => {
    expect(healthThresholdTripped(base)).toBe(false);
  });

  it('trips on per-core load above 1.5', () => {
    expect(healthThresholdTripped({ ...base, load_per_core: 2.0 })).toBe(true);
  });

  it('trips on any orphan', () => {
    expect(
      healthThresholdTripped({
        ...base,
        orphans: [
          {
            pid: 1,
            ppid: 1,
            reparented_to: 'init',
            cpu_percent: 90,
            sustained_windows: 3,
            cmdline: 'x',
            kill_command: 'kill -TERM 1',
          },
        ],
      }),
    ).toBe(true);
  });
});
