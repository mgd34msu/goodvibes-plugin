import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DashboardState, BudgetState } from '../../../types.js';
import { MiniRenderer } from '../renderer.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip ANSI escape codes to measure visible character width. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Measure visible width of a string (excluding ANSI codes). */
function visibleWidth(str: string): number {
  return stripAnsi(str).length;
}

// ── Fixture Factory ───────────────────────────────────────────────────────────

type DashboardOverrides = Omit<Partial<DashboardState>, 'metrics'> & { metrics?: Partial<DashboardState['metrics']> };

function createMockState(overrides: DashboardOverrides = {}): DashboardState {
  const base: DashboardState = {
    session_id: 'test-session-abc',
    project_hash: 'test-project',
    max_agent_chains: 6,
    started_at: '2026-02-20T10:00:00.000Z',
    uptime_ms: 65_000,
    health_status: 'healthy',
    context_percent: 0,
    budget: null,
    anomalies: [],
    recent_activity: [],
    file_hotspots: [],
    agent_profiles: [],
    tools_breakdown: {},
    metrics: {
      tokens: {
        input: 5_000,
        output: 2_500,
        total: 7_500,
        saved: 3_000,
        efficiency: 0.4,
        api_input: 0,
        api_output: 0,
        cache_read: 0,
        cache_write: 0,
      },
      cache: {
        hit_rate: 0.68,
        hits: 34,
        misses: 16,
        memory_peak_mb: 128,
        evictions: 2,
      },
      cost: {
        input: 0.015,
        output: 0.0375,
        total: 0.0525,
        saved: 0.009,
      },
      commands: {
        total: 12,
        success_rate: 0.917,
        avg_duration_ms: 1_200,
        total_duration_ms: 14_400,
        failures: 1,
        slowest: null,
      },
      agents: {
        spawned: 3,
        max_concurrent: 2,
        total_tokens: 2_000,
        active: 1,
        completed: 2,
      },
      files: {
        unique_read: 42,
        modified: 5,
        created: 2,
        conflicts: 0,
      },
    },
  };

  // Deep-merge metrics overrides if provided
  if (overrides.metrics) {
    return {
      ...base,
      ...overrides,
      metrics: {
        ...base.metrics,
        ...overrides.metrics,
        tokens: { ...base.metrics.tokens, ...overrides.metrics.tokens },
        cache: { ...base.metrics.cache, ...overrides.metrics.cache },
        cost: { ...base.metrics.cost, ...overrides.metrics.cost },
        commands: { ...base.metrics.commands, ...overrides.metrics.commands },
        agents: { ...base.metrics.agents, ...overrides.metrics.agents },
        files: { ...base.metrics.files, ...overrides.metrics.files },
      },
    } as DashboardState;
  }

  return { ...base, ...overrides } as DashboardState;
}

// ── Column Width Mock Utilities ───────────────────────────────────────────────

let originalColumns: number | undefined;

function setColumns(value: number | undefined): void {
  Object.defineProperty(process.stdout, 'columns', {
    value,
    writable: true,
    configurable: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MiniRenderer', () => {
  let renderer: MiniRenderer;

  beforeEach(() => {
    renderer = new MiniRenderer();
    // Save original columns
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    // Restore original columns value
    setColumns(originalColumns);
  });

  // ── 1. Auto-width detection ─────────────────────────────────────────────────

  describe('auto-width detection', () => {
    it('uses terminal width of 60 when process.stdout.columns is 60', () => {
      setColumns(60);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(60);
    });

    it('uses terminal width of 80 when process.stdout.columns is 80', () => {
      setColumns(80);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(80);
    });

    it('uses terminal width of 120 when process.stdout.columns is 120', () => {
      setColumns(120);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(120);
    });

    it('uses terminal width of 200 when process.stdout.columns is 200', () => {
      setColumns(200);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(200);
    });

    it('falls back to DEFAULT_WIDTH (80) when process.stdout.columns is undefined', () => {
      setColumns(undefined);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(80);
    });

    it('falls back to DEFAULT_WIDTH (80) when process.stdout.columns is 0', () => {
      setColumns(0);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(80);
    });

    it('uses MIN_WIDTH (60) when process.stdout.columns is less than MIN_WIDTH', () => {
      setColumns(40);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(60);
    });

    it('uses MIN_WIDTH (60) when process.stdout.columns is 1', () => {
      setColumns(1);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(visibleWidth(lines[0]!)).toBe(60);
    });
  });

  // ── 2. Box structure ────────────────────────────────────────────────────────

  describe('box structure', () => {
    beforeEach(() => setColumns(80));

    it('renders exactly 4 lines', () => {
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      expect(lines).toHaveLength(4);
    });

    it('line 1 starts with ┌ and ends with ┐', () => {
      const output = renderer.render(createMockState());
      const line1 = stripAnsi(output.split('\n')[0]!);
      expect(line1[0]).toBe('\u250c');
      expect(line1[line1.length - 1]).toBe('\u2510');
    });

    it('line 4 starts with └ and ends with ┘', () => {
      const output = renderer.render(createMockState());
      const line4 = stripAnsi(output.split('\n')[3]!);
      expect(line4[0]).toBe('\u2514');
      expect(line4[line4.length - 1]).toBe('\u2518');
    });

    it('lines 2 and 3 start with │ and end with │', () => {
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      const line2 = stripAnsi(lines[1]!);
      const line3 = stripAnsi(lines[2]!);
      expect(line2[0]).toBe('\u2502');
      expect(line2[line2.length - 1]).toBe('\u2502');
      expect(line3[0]).toBe('\u2502');
      expect(line3[line3.length - 1]).toBe('\u2502');
    });

    it('all 4 lines have the same visible width', () => {
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      const widths = lines.map((l) => visibleWidth(l));
      expect(widths[0]).toBe(widths[1]);
      expect(widths[1]).toBe(widths[2]);
      expect(widths[2]).toBe(widths[3]);
    });

    it('all lines have visible width matching terminal width', () => {
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      lines.forEach((line) => {
        expect(visibleWidth(line)).toBe(80);
      });
    });
  });

  // ── 3. Data field presence ──────────────────────────────────────────────────

  describe('data field presence', () => {
    beforeEach(() => setColumns(80));

    it('line 1 contains the word "analytics"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[0]!)).toContain('analytics');
    });

    it('line 1 contains the session ID (truncated to 16 chars)', () => {
      const output = renderer.render(createMockState());
      // 'test-session-abc' is exactly 16 chars so not truncated
      expect(stripAnsi(output.split('\n')[0]!)).toContain('test-session-abc');
    });

    it('line 1 contains uptime value', () => {
      const output = renderer.render(createMockState());
      // uptime_ms: 65_000 -> "1m 5s"
      expect(stripAnsi(output.split('\n')[0]!)).toContain('1m 5s');
    });

    it('line 2 contains "Ctx:" (context window percentage)', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[1]!)).toContain('Ctx:');
    });

    it('line 2 contains "In:" (API input tokens)', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[1]!)).toContain('In:');
    });

    it('line 2 contains "saved"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[1]!)).toContain('saved');
    });

    it('line 2 contains "Cache:" (cache read tokens)', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[1]!)).toContain('Cache:');
    });

    it('line 2 contains "Hit:" (cache hit rate)', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[1]!)).toContain('Hit:');
    });

    it('line 3 contains "agents"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[2]!)).toContain('agents');
    });

    it('line 3 contains "files"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[2]!)).toContain('files');
    });

    it('line 3 contains "cmds"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[2]!)).toContain('cmds');
    });

    it('line 3 contains "cost"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[2]!)).toContain('cost');
    });

    it('line 2 does not contain "cost"', () => {
      const output = renderer.render(createMockState());
      expect(stripAnsi(output.split('\n')[1]!)).not.toContain('cost');
    });
  });

  // ── 4. Health coloring ──────────────────────────────────────────────────────

  describe('health coloring', () => {
    beforeEach(() => setColumns(80));

    it('healthy state uses green border codes (\\x1b[32m)', () => {
      const state = createMockState({ health_status: 'healthy' });
      const output = renderer.render(state);
      expect(output).toContain('\x1b[32m');
    });

    it('healthy state does not use red or yellow border codes for the first character', () => {
      const state = createMockState({ health_status: 'healthy' });
      const output = renderer.render(state);
      // First ANSI code in the output must be green
      const firstCode = output.match(/\x1b\[[0-9;]*m/)?.[0];
      expect(firstCode).toBe('\x1b[32m');
    });

    it('warning state uses yellow border codes (\\x1b[33m)', () => {
      const state = createMockState({ health_status: 'warning' });
      const output = renderer.render(state);
      expect(output).toContain('\x1b[33m');
    });

    it('warning state first ANSI code is yellow', () => {
      const state = createMockState({ health_status: 'warning' });
      const output = renderer.render(state);
      const firstCode = output.match(/\x1b\[[0-9;]*m/)?.[0];
      expect(firstCode).toBe('\x1b[33m');
    });

    it('alert state uses red border codes (\\x1b[31m)', () => {
      const state = createMockState({ health_status: 'alert' });
      const output = renderer.render(state);
      expect(output).toContain('\x1b[31m');
    });

    it('alert state first ANSI code is red', () => {
      const state = createMockState({ health_status: 'alert' });
      const output = renderer.render(state);
      const firstCode = output.match(/\x1b\[[0-9;]*m/)?.[0];
      expect(firstCode).toBe('\x1b[31m');
    });
  });

  // ── 5. Budget mode ─────────────────────────────────────────────────────────

  describe('budget mode', () => {
    beforeEach(() => setColumns(80));

    const budget: BudgetState = {
      amount: 5.0,
      unit: 'dollars',
      used: 2.5,
      remaining: 2.5,
      percentage: 50,
      warn_thresholds: [0.5, 0.8, 1.0],
      current_threshold: null,
    };

    it('when budget is set, header shows "budget:"', () => {
      const state = createMockState({ budget });
      const output = renderer.render(state);
      expect(stripAnsi(output.split('\n')[0]!)).toContain('budget:');
    });

    it('when budget is set, header shows used/total amounts', () => {
      const state = createMockState({ budget });
      const output = renderer.render(state);
      const line1 = stripAnsi(output.split('\n')[0]!);
      // $2.50 / $5.00
      expect(line1).toContain('$2.50');
      expect(line1).toContain('$5.00');
    });

    it('when budget is set, header shows percentage', () => {
      const state = createMockState({ budget });
      const output = renderer.render(state);
      expect(stripAnsi(output.split('\n')[0]!)).toContain('50%');
    });

    it('when budget is set, header does not show "calls"', () => {
      const state = createMockState({ budget });
      const output = renderer.render(state);
      expect(stripAnsi(output.split('\n')[0]!)).not.toContain('calls');
    });

    it('when budget is null, header shows agent count', () => {
      const state = createMockState({ budget: null });
      const output = renderer.render(state);
      // agents.active: 1 -> "1 agent"
      expect(stripAnsi(output.split('\n')[0]!)).toContain('agent');
    });

    it('when budget is null, header shows session cost', () => {
      const state = createMockState({ budget: null });
      const output = renderer.render(state);
      // cost.total: 0.0525 -> "$0.0525"
      expect(stripAnsi(output.split('\n')[0]!)).toContain('$0.05');
    });

    it('when budget is null, header does not show "budget:"', () => {
      const state = createMockState({ budget: null });
      const output = renderer.render(state);
      expect(stripAnsi(output.split('\n')[0]!)).not.toContain('budget:');
    });
  });

  // ── 6. Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    beforeEach(() => setColumns(80));

    it('renders without crashing when all metrics are zero', () => {
      const state = createMockState({
        metrics: {
          tokens: { input: 0, output: 0, total: 0, saved: 0, efficiency: 0, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
          cache: { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 },
          cost: { input: 0, output: 0, total: 0, saved: 0 },
          commands: { total: 0, success_rate: 0, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null },
          agents: { spawned: 0, max_concurrent: 0, total_tokens: 0, active: 0, completed: 0 },
          files: { unique_read: 0, modified: 0, created: 0, conflicts: 0 },
        },
      });
      expect(() => renderer.render(state)).not.toThrow();
      const lines = state && renderer.render(state).split('\n');
      expect(lines).toHaveLength(4);
    });

    it('formats large token counts with K suffix', () => {
      const state = createMockState({
        // saved tokens are shown in the Prec: section
        metrics: { tokens: { input: 50_000, output: 25_000, total: 75_000, saved: 75_000, efficiency: 0.4, api_input: 50_000, api_output: 25_000, cache_read: 0, cache_write: 0 } },
      });
      const output = renderer.render(state);
      expect(stripAnsi(output)).toContain('75.0K');
    });

    it('formats very large token counts with M suffix', () => {
      const state = createMockState({
        // api_input is shown in the In: section
        metrics: { tokens: { input: 0, output: 0, total: 2_500_000, saved: 2_500_000, efficiency: 0, api_input: 2_500_000, api_output: 0, cache_read: 0, cache_write: 0 } },
      });
      const output = renderer.render(state);
      expect(stripAnsi(output)).toContain('2.5M');
    });

    it('formats billion-scale numbers with B suffix', () => {
      const state = createMockState({
        // api_input is shown in the In: section
        metrics: { tokens: { input: 0, output: 0, total: 3_000_000_000, saved: 3_000_000_000, efficiency: 0, api_input: 3_000_000_000, api_output: 0, cache_read: 0, cache_write: 0 } },
      });
      const output = renderer.render(state);
      expect(stripAnsi(output)).toContain('3.0B');
    });

    it('renders without crashing when metrics contain negative values', () => {
      const state = createMockState({
        metrics: {
          tokens: { input: -100, output: -50, total: -150, saved: -30, efficiency: -0.2, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
          cost: { input: -0.005, output: -0.001, total: -0.006, saved: -0.002 },
        },
      });
      expect(() => renderer.render(state)).not.toThrow();
    });

    it('shows only first 8 characters of session ID', () => {
      const longId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const state = createMockState({ session_id: longId });
      const output = renderer.render(state);
      const line1 = stripAnsi(output.split('\n')[0]!);
      // Should not contain the full UUID
      expect(line1).not.toContain(longId);
      // Should contain only the first 8 characters
      expect(line1).toContain('abcdef12');
      expect(line1).not.toContain('abcdef12-');
    });

    it('uses "no-session" when session_id is empty string', () => {
      const state = createMockState({ session_id: '' });
      const output = renderer.render(state);
      const line1 = stripAnsi(output.split('\n')[0]!);
      expect(line1).toContain('no-session');
    });

    it('does not crash with zero avg_duration_ms and shows 0.0s avg', () => {
      const state = createMockState({
        metrics: { commands: { total: 5, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null } },
      });
      const output = renderer.render(state);
      expect(stripAnsi(output)).toContain('0.0s');
    });

    it('highlights conflicts in yellow when conflicts > 0', () => {
      const state = createMockState({
        metrics: { files: { unique_read: 10, modified: 2, created: 1, conflicts: 3 } },
      });
      const output = renderer.render(state);
      // yellow ANSI code should appear (\x1b[33m) for the conflict indicator
      expect(output).toContain('\x1b[33m');
    });

    it('renders consistent 4 lines across multiple render calls', () => {
      const state = createMockState();
      for (let i = 0; i < 5; i++) {
        const output = renderer.render(state);
        expect(output.split('\n')).toHaveLength(4);
      }
    });

    it('fitToWidth truncates content that exceeds terminal width', () => {
      // With MIN_WIDTH=60, even setColumns(1) produces width=60.
      // Row content is wider than innerWidth (58), so fitToWidth truncation path runs.
      setColumns(1);
      const output = renderer.render(createMockState());
      const lines = output.split('\n');
      // All lines must be exactly 60 visible chars (MIN_WIDTH)
      lines.forEach((line) => {
        expect(visibleWidth(line)).toBe(60);
      });
    });
  });

  // ── 7. Fallback rendering ────────────────────────────────────────────────────

  describe('fallback rendering', () => {
    beforeEach(() => setColumns(80));

    it('renders fallback box when state is null', () => {
      const output = renderer.render(null as any);
      expect(stripAnsi(output)).toContain('no data');
      expect(output.split('\n')).toHaveLength(4);
    });

    it('renders fallback box when state is undefined', () => {
      const output = renderer.render(undefined as any);
      expect(stripAnsi(output)).toContain('no data');
    });

    it('renders fallback box when state is empty object', () => {
      const output = renderer.render({} as any);
      expect(stripAnsi(output)).toContain('no data');
    });

    it('renders fallback box when metrics sub-objects are missing', () => {
      const output = renderer.render({ health_status: 'healthy', metrics: {} } as any);
      expect(stripAnsi(output)).toContain('no data');
    });

    it('renders fallback with warning color borders (yellow)', () => {
      const output = renderer.render(null as any);
      expect(output).toContain('\x1b[33m');
    });

    it('fallback box has correct width matching terminal columns', () => {
      setColumns(100);
      const output = renderer.render(null as any);
      const lines = output.split('\n');
      expect(lines).toHaveLength(4);
      lines.forEach((line) => {
        expect(visibleWidth(line)).toBe(100);
      });
    });
  });

  // ── 8. startLoop / stopLoop lifecycle ───────────────────────────────────────

  describe('startLoop / stopLoop', () => {
    beforeEach(() => setColumns(80));

    it('calls render immediately on startLoop', () => {
      vi.useFakeTimers();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      renderer.startLoop(() => createMockState(), 2000);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      renderer.stopLoop();
      writeSpy.mockRestore();
      vi.useRealTimers();
    });

    it('renders on interval ticks', () => {
      vi.useFakeTimers();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      renderer.startLoop(() => createMockState(), 1000);
      expect(writeSpy).toHaveBeenCalledTimes(1); // immediate
      vi.advanceTimersByTime(1000);
      expect(writeSpy).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1000);
      expect(writeSpy).toHaveBeenCalledTimes(3);
      renderer.stopLoop();
      writeSpy.mockRestore();
      vi.useRealTimers();
    });

    it('stopLoop prevents further renders', () => {
      vi.useFakeTimers();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      renderer.startLoop(() => createMockState(), 1000);
      renderer.stopLoop();
      const callCount = writeSpy.mock.calls.length;
      vi.advanceTimersByTime(5000);
      expect(writeSpy).toHaveBeenCalledTimes(callCount);
      writeSpy.mockRestore();
      vi.useRealTimers();
    });

    it('double startLoop stops previous loop and starts a new one', () => {
      vi.useFakeTimers();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      renderer.startLoop(() => createMockState(), 1000);
      renderer.startLoop(() => createMockState(), 1000); // replaces first
      expect(writeSpy).toHaveBeenCalledTimes(2); // 2 immediate draws
      vi.advanceTimersByTime(1000);
      expect(writeSpy).toHaveBeenCalledTimes(3); // only 1 interval tick, not 2
      renderer.stopLoop();
      writeSpy.mockRestore();
      vi.useRealTimers();
    });

    it('stopLoop is idempotent — safe to call with no loop running', () => {
      renderer.stopLoop(); // no error when no loop running
      renderer.stopLoop(); // still no error
    });

    it('re-renders immediately on stdout resize event', () => {
      vi.useFakeTimers();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      renderer.startLoop(() => createMockState(), 5000);
      expect(writeSpy).toHaveBeenCalledTimes(1); // immediate
      process.stdout.emit('resize');
      expect(writeSpy).toHaveBeenCalledTimes(2); // resize-triggered
      renderer.stopLoop();
      process.stdout.emit('resize');
      expect(writeSpy).toHaveBeenCalledTimes(2); // no more after stop
      writeSpy.mockRestore();
      vi.useRealTimers();
    });
  });
});
