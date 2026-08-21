/**
 * Host-health sampler (lane 9, field-issue-9 follow-on).
 *
 * A slow, unref'd, zero-dependency sampler that reads `/proc` to report host
 * pressure and, critically, to catch the exact failure mode field issue 9
 * described: a plugin server that got orphaned (reparented to init / the user's
 * systemd manager) and is now spinning at 100% CPU with nobody watching it.
 *
 * It NEVER kills anything. The doctor view lists offenders with ready-to-run
 * kill commands the human can paste; execution is always the human's call.
 *
 * Everything degrades honestly: no `/proc` (macOS, restricted container, a
 * fixture dir that doesn't exist) yields a `degraded` state that says so rather
 * than throwing. The 60s interval is `unref()`ed so it can never, itself, be
 * the thing that holds a dead server's event loop open (the very sin it hunts).
 */

import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { cpus } from 'node:os';
import { atomicWriteJson } from '../runtime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Sampler cadence (ms). Deliberately slow, this is a watchdog, not a profiler. */
export const SAMPLE_INTERVAL_MS = 60_000;

/** Kernel USER_HZ. 100 on effectively every mainstream Linux; overridable for tests. */
const DEFAULT_CLK_TCK = 100;

/** A process must exceed this CPU%% to count as a busy-loop suspect. */
const CPU_THRESHOLD_PCT = 50;

/** How many consecutive over-threshold samples make CPU "sustained" (not a blip). */
const DEFAULT_SUSTAINED_SAMPLES = 2;

/** Per-core load above this trips the intel SessionStart nudge. */
export const LOAD_PER_CORE_NUDGE = 1.5;

/** State-file location under the namespaced `.goodvibes/` root. */
export const HEALTH_STATE_SEGMENTS = ['health', 'health-state.json'] as const;

/**
 * Default matcher for "a plugin cache or plugin server path" in a process
 * cmdline. Matches the v2 plugin server bundles, the marketplace plugin-cache
 * layout, and the v1 engine dist paths, anything that is one of our (or a
 * sibling plugin's) long-running node processes. Overridable via options.
 */
const DEFAULT_PLUGIN_PATH_RE =
  /(?:\.claude\/plugins|\/plugins\/[^/]+\/server|goodvibes-(?:intel|analytics|connect)\/server|plugin[-_]?cache|tools\/implementations\/[^/]+\/dist)/i;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One orphaned, busy-looping process the doctor view will surface. */
export interface OrphanProcess {
  pid: number;
  ppid: number;
  /** Whichever reparenting was seen: 'init' (ppid 1) or 'systemd-user'. */
  reparented_to: 'init' | 'systemd-user';
  /** CPU%% measured over the most recent sampling window. */
  cpu_percent: number;
  /** For how many consecutive windows CPU stayed above threshold. */
  sustained_windows: number;
  /** Short, space-joined cmdline (truncated). */
  cmdline: string;
  /** A ready-to-run, human-only kill command. Never executed by the sampler. */
  kill_command: string;
}

/** The compact health snapshot written to `.goodvibes/health/health-state.json`. */
export interface HealthState {
  /** State-file schema version. */
  schema: number;
  /** When this snapshot was taken (epoch ms). */
  sampled_at: number;
  /** False when `/proc` could not be read at all. */
  proc_available: boolean;
  /** 1/5/15-minute load averages, or null when unavailable. */
  loadavg: [number, number, number] | null;
  /** Logical CPU count (from `os.cpus()`, always available). */
  cpu_count: number;
  /** loadavg[0] / cpu_count, or null when loadavg is unavailable. */
  load_per_core: number | null;
  /** The session root pid whose direct children we count. */
  session_root_pid: number;
  /** Number of live processes that are direct children of the session root. */
  session_child_count: number;
  /** Sustained-CPU orphans matching the plugin-path heuristic. */
  orphans: OrphanProcess[];
  /** Non-fatal explanation when a section could not be computed. */
  degraded: string | null;
}

/** Options for {@link HostHealthSampler}. */
export interface HostHealthOptions {
  /** Project state root (`.goodvibes`). The state file lands under it. */
  goodvibesDir: string;
  /** Root of the proc filesystem (default `/proc`). Point at a fixture in tests. */
  procRoot?: string;
  /** Pid whose direct children are "this session's children" (default `process.ppid`). */
  sessionRootPid?: number;
  /** Kernel USER_HZ (default 100). */
  clkTck?: number;
  /** Consecutive over-threshold windows required for "sustained" (default 2). */
  sustainedSamples?: number;
  /** Regex a cmdline must match to be an orphan candidate. */
  pluginPathRe?: RegExp;
  /** Injectable clock (default `Date.now`). */
  now?: () => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// /proc parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed fields we care about from `/proc/<pid>/stat`. */
interface ProcStat {
  pid: number;
  comm: string;
  ppid: number;
  /** utime + stime in clock ticks (jiffies). */
  cpuJiffies: number;
}

/**
 * Parse `/proc/<pid>/stat`. The comm field (2) is parenthesised and may itself
 * contain spaces and parens, so we split on the LAST ')' before tokenising the
 * remainder, the standard robust approach.
 */
function parseStat(content: string): ProcStat | null {
  const open = content.indexOf('(');
  const close = content.lastIndexOf(')');
  if (open < 0 || close < 0 || close < open) {return null;}

  const pid = Number(content.slice(0, open).trim());
  const comm = content.slice(open + 1, close);
  // Fields from #3 (state) onward, space-separated.
  const rest = content.slice(close + 1).trim().split(/\s+/);
  // rest[0]=state(f3) rest[1]=ppid(f4) ... utime(f14)=rest[11] stime(f15)=rest[12]
  const ppid = Number(rest[1]);
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  if (!Number.isFinite(pid) || !Number.isFinite(ppid)) {return null;}
  const cpuJiffies =
    (Number.isFinite(utime) ? utime : 0) + (Number.isFinite(stime) ? stime : 0);
  return { pid, comm, ppid, cpuJiffies };
}

/** Read and NUL-decode `/proc/<pid>/cmdline`; empty string when unreadable. */
function readCmdline(procRoot: string, pid: number): string {
  try {
    const raw = readFileSync(join(procRoot, String(pid), 'cmdline'), 'utf8');
    return raw.replace(/\0+/g, ' ').trim();
  } catch {
    return '';
  }
}

/** Parse `/proc/loadavg` → the three averages, or null. */
function readLoadavg(procRoot: string): [number, number, number] | null {
  try {
    const raw = readFileSync(join(procRoot, 'loadavg'), 'utf8').trim();
    const parts = raw.split(/\s+/);
    const l1 = Number(parts[0]);
    const l5 = Number(parts[1]);
    const l15 = Number(parts[2]);
    if (![l1, l5, l15].every(Number.isFinite)) {return null;}
    return [l1, l5, l15];
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sampler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads `/proc` on a slow, unref'd interval and maintains a compact
 * {@link HealthState} on disk. CPU%% is a delta measurement, so orphan
 * detection needs at least two samples, that is what "sustained" means and
 * why the persisted, long-running snapshot is the authoritative source for the
 * doctor view (a one-shot read cannot know a process is *stuck* busy).
 */
export class HostHealthSampler {
  private readonly goodvibesDir: string;
  private readonly procRoot: string;
  private readonly sessionRootPid: number;
  private readonly clkTck: number;
  private readonly sustainedSamples: number;
  private readonly pluginPathRe: RegExp;
  private readonly now: () => number;

  /** Previous CPU reading per pid, for delta computation. */
  private prevCpu = new Map<number, { jiffies: number; atMs: number }>();
  /** Consecutive over-threshold window count per pid. */
  private sustained = new Map<number, number>();

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastState: HealthState | null = null;

  constructor(options: HostHealthOptions) {
    this.goodvibesDir = options.goodvibesDir;
    this.procRoot = options.procRoot ?? '/proc';
    this.sessionRootPid = options.sessionRootPid ?? process.ppid;
    this.clkTck = options.clkTck ?? DEFAULT_CLK_TCK;
    this.sustainedSamples = options.sustainedSamples ?? DEFAULT_SUSTAINED_SAMPLES;
    this.pluginPathRe = options.pluginPathRe ?? DEFAULT_PLUGIN_PATH_RE;
    this.now = options.now ?? (() => Date.now());
  }

  /** Absolute path to the state file this sampler owns. */
  stateFilePath(): string {
    return join(this.goodvibesDir, ...HEALTH_STATE_SEGMENTS);
  }

  /**
   * Start the slow sampler. The interval is `unref()`ed so it never keeps the
   * process alive on its own (field issue 9, this feature must not become the
   * bug it hunts). Takes one sample immediately so a state file exists promptly.
   */
  start(): void {
    if (this.timer) {return;}
    this.tick();
    this.timer = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
  }

  /** Stop the sampler and release its timer. Safe to call repeatedly. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Sample once and best-effort persist. Never throws. */
  private tick(): void {
    try {
      const state = this.sampleOnce();
      this.writeState(state);
    } catch {
      /* a sampling failure must never crash the host process */
    }
  }

  /** The most recently computed state (for in-process readers like the doctor view). */
  getLastState(): HealthState | null {
    return this.lastState;
  }

  /**
   * Take one health sample. Pure aside from advancing the internal CPU-delta
   * history; safe to call directly in tests.
   */
  sampleOnce(): HealthState {
    const sampledAt = this.now();
    const cpuCount = Math.max(1, cpus().length || 1);
    const loadavg = readLoadavg(this.procRoot);
    const loadPerCore = loadavg ? loadavg[0] / cpuCount : null;

    let entries: string[];
    try {
      entries = readdirSync(this.procRoot);
    } catch {
      // No /proc at all, honest degradation, keep whatever load we could read.
      const degraded: HealthState = {
        schema: 1,
        sampled_at: sampledAt,
        proc_available: false,
        loadavg,
        cpu_count: cpuCount,
        load_per_core: loadPerCore,
        session_root_pid: this.sessionRootPid,
        session_child_count: 0,
        orphans: [],
        degraded: `process table unavailable at ${this.procRoot}; orphan detection offline`,
      };
      this.lastState = degraded;
      return degraded;
    }

    const pids = entries.filter((e) => /^\d+$/.test(e)).map(Number);

    const stats = new Map<number, ProcStat>();
    const systemdUserPids = new Set<number>();
    for (const pid of pids) {
      let statRaw: string;
      try {
        statRaw = readFileSync(join(this.procRoot, String(pid), 'stat'), 'utf8');
      } catch {
        continue; // process vanished between readdir and read — normal, skip.
      }
      const stat = parseStat(statRaw);
      if (!stat) {continue;}
      stats.set(pid, stat);
      if (stat.comm === 'systemd') {
        const cmd = readCmdline(this.procRoot, pid);
        if (/systemd\s+--user|--user/.test(cmd) || stat.ppid === 1) {
          systemdUserPids.add(pid);
        }
      }
    }

    // Second pass: count session children and score orphan candidates.
    let sessionChildCount = 0;
    const seenPids = new Set<number>();
    const orphans: OrphanProcess[] = [];

    for (const stat of stats.values()) {
      seenPids.add(stat.pid);
      if (stat.ppid === this.sessionRootPid) {sessionChildCount++;}

      // CPU%% delta vs the previous sample.
      const prev = this.prevCpu.get(stat.pid);
      this.prevCpu.set(stat.pid, { jiffies: stat.cpuJiffies, atMs: sampledAt });
      let cpuPercent = 0;
      if (prev) {
        const dJiffies = stat.cpuJiffies - prev.jiffies;
        const dSeconds = (sampledAt - prev.atMs) / 1000;
        if (dSeconds > 0 && dJiffies >= 0) {
          cpuPercent = (dJiffies / this.clkTck / dSeconds) * 100;
        }
      }

      // Orphan heuristic (all three must hold):
      //   (1) reparented to init (ppid 1) OR to a systemd --user manager, AND
      //   (2) cmdline matches a plugin cache / plugin server path, AND
      //   (3) CPU sustained above threshold across consecutive windows.
      const reparentedInit = stat.ppid === 1;
      const reparentedSystemd = systemdUserPids.has(stat.ppid);
      const reparented = reparentedInit || reparentedSystemd;

      const over = prev != null && cpuPercent > CPU_THRESHOLD_PCT;
      const streak = over ? (this.sustained.get(stat.pid) ?? 0) + 1 : 0;
      this.sustained.set(stat.pid, streak);

      if (!reparented) {continue;}
      const cmdline = readCmdline(this.procRoot, stat.pid);
      if (!this.pluginPathRe.test(cmdline)) {continue;}
      if (streak < this.sustainedSamples) {continue;}

      orphans.push({
        pid: stat.pid,
        ppid: stat.ppid,
        reparented_to: reparentedInit ? 'init' : 'systemd-user',
        cpu_percent: Math.round(cpuPercent * 10) / 10,
        sustained_windows: streak,
        cmdline: cmdline.length > 160 ? cmdline.slice(0, 157) + '...' : cmdline,
        kill_command: `kill -TERM ${stat.pid}`,
      });
    }

    // Forget history for pids that have gone away, so the maps can't grow without bound.
    for (const pid of this.prevCpu.keys()) {if (!seenPids.has(pid)) {this.prevCpu.delete(pid);}}
    for (const pid of this.sustained.keys()) {if (!seenPids.has(pid)) {this.sustained.delete(pid);}}

    const state: HealthState = {
      schema: 1,
      sampled_at: sampledAt,
      proc_available: true,
      loadavg,
      cpu_count: cpuCount,
      load_per_core: loadPerCore,
      session_root_pid: this.sessionRootPid,
      session_child_count: sessionChildCount,
      orphans,
      degraded: loadavg ? null : `loadavg unavailable at ${this.procRoot}/loadavg`,
    };
    this.lastState = state;
    return state;
  }

  /** Persist a snapshot atomically. Best-effort; never throws. */
  writeState(state: HealthState): void {
    try {
      mkdirSync(dirname(this.stateFilePath()), { recursive: true });
      atomicWriteJson(this.stateFilePath(), state);
    } catch {
      /* best-effort, a state write must never take the host down */
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Threshold + rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single loose-coupled threshold the intel SessionStart nudge also checks:
 * per-core load above 1.5, or any orphan detected.
 */
export function healthThresholdTripped(state: HealthState): boolean {
  if (state.orphans.length > 0) {return true;}
  if (state.load_per_core != null && state.load_per_core > LOAD_PER_CORE_NUDGE) {return true;}
  return false;
}

/**
 * Render the doctor view: load, session children, and any orphaned busy-loops
 * with ready-to-run kill commands. Read-only, this function never kills.
 */
export function renderDoctorReport(state: HealthState, opts: { stale_ms?: number } = {}): string {
  const lines: string[] = ['=== Host Health (doctor) ==='];

  if (state.loadavg) {
    const perCore = state.load_per_core ?? 0;
    const flag = perCore > LOAD_PER_CORE_NUDGE ? '  [HIGH]' : '';
    lines.push(
      `Load:     ${state.loadavg[0].toFixed(2)} ${state.loadavg[1].toFixed(2)} ${state.loadavg[2].toFixed(2)} ` +
        `over ${state.cpu_count} cores = ${perCore.toFixed(2)}/core${flag}`,
    );
  } else {
    lines.push('Load:     unavailable');
  }

  lines.push(`Children: ${state.session_child_count} live (session root pid ${state.session_root_pid})`);

  if (opts.stale_ms != null && opts.stale_ms >= 0) {
    const ageS = Math.round(opts.stale_ms / 1000);
    lines.push(`Sampled:  ${ageS}s ago`);
  }

  if (state.degraded) {
    lines.push(`Degraded: ${state.degraded}`);
  }

  if (state.orphans.length === 0) {
    lines.push('Orphans:  none detected');
  } else {
    lines.push(`Orphans:  ${state.orphans.length} sustained-CPU plugin process(es) reparented away from this session:`);
    for (const o of state.orphans) {
      lines.push(
        `  pid ${o.pid} (ppid ${o.ppid}, ${o.reparented_to}) ` +
          `${o.cpu_percent}% CPU x${o.sustained_windows} windows`,
      );
      lines.push(`    cmd: ${o.cmdline}`);
      lines.push(`    run: ${o.kill_command}   # review first; goodvibes never kills processes for you`);
    }
  }

  return lines.join('\n');
}
