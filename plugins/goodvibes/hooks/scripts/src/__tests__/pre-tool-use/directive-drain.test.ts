/**
 * Tests for pre-tool-use-directive-drain.mjs
 *
 * Covers the is_subagent guard: when hookInput.is_subagent is true the hook
 * must return an allow response with NO additionalContext (no directive drain)
 * and emit a debug trace to stderr. When is_subagent is false or absent the
 * hook must proceed to drain directives (fast-path: no socket → allow with no
 * context).
 *
 * Strategy: spawn the standalone .mjs as a child process with piped stdin so
 * we exercise the real entry-point logic without mocking internal module
 * state. This mirrors the production execution model (Claude Code runs the
 * script directly).
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** Absolute path to the standalone hook script */
const HOOK_SCRIPT = path.resolve(
  __dirname,
  '../../pre-tool-use-directive-drain.mjs'
);

/**
 * Spawns the hook script with the given hookInput as stdin.
 * Returns { stdout, stderr, status }.
 */
function runHook(hookInput: object | null): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const input = hookInput !== null ? JSON.stringify(hookInput) : '';
  const result = spawnSync('node', [HOOK_SCRIPT], {
    input,
    encoding: 'utf-8',
    timeout: 5000,
    env: {
      ...process.env,
      // Unset any real socket path so we always hit the fast-path
      GOODVIBES_RUNTIME_SOCKET: '',
    },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

/**
 * Parses the JSON line written by the hook to stdout.
 */
function parseResponse(stdout: string): Record<string, unknown> {
  const line = stdout.trim();
  return JSON.parse(line) as Record<string, unknown>;
}

describe('pre-tool-use-directive-drain: is_subagent guard', () => {
  describe('when is_subagent is true', () => {
    it('returns an allow response (empty object — no additionalContext)', () => {
      const { stdout, status } = runHook({
        hook_event_name: 'PreToolUse',
        is_subagent: true,
        session_id: 'test-session',
        cwd: '/tmp/test',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      });

      expect(status).toBe(0);
      const response = parseResponse(stdout);
      // allowResponse() with no argument returns {} — no hookSpecificOutput,
      // which means no additionalContext is injected.
      expect(response).toEqual({});
    });

    it('does NOT include additionalContext in the response', () => {
      const { stdout } = runHook({
        is_subagent: true,
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
      });

      const response = parseResponse(stdout);
      expect(response).not.toHaveProperty('hookSpecificOutput');
    });

    it('writes the stderr debug trace', () => {
      const { stderr } = runHook({
        is_subagent: true,
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
      });

      expect(stderr).toContain('[directive-drain] skipped: is_subagent=true');
    });

    it('exits with code 0 (never blocks the tool call)', () => {
      const { status } = runHook({
        is_subagent: true,
        hook_event_name: 'PreToolUse',
      });

      expect(status).toBe(0);
    });
  });

  describe('when is_subagent is false', () => {
    it('proceeds past the guard (fast-path: no socket → allow with no context)', () => {
      const { stdout, status } = runHook({
        hook_event_name: 'PreToolUse',
        is_subagent: false,
        session_id: 'test-session',
        cwd: '/tmp/no-such-goodvibes-dir',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      });

      expect(status).toBe(0);
      // No socket reachable → fast-path returns allowResponse() = {}
      const response = parseResponse(stdout);
      expect(response).toEqual({});
    });

    it('does NOT write the is_subagent stderr trace', () => {
      const { stderr } = runHook({
        is_subagent: false,
        hook_event_name: 'PreToolUse',
        cwd: '/tmp/no-such-goodvibes-dir',
      });

      expect(stderr).not.toContain('[directive-drain] skipped: is_subagent=true');
    });
  });

  describe('when is_subagent is absent (main orchestrator)', () => {
    it('proceeds past the guard (fast-path: no socket → allow with no context)', () => {
      const { stdout, status } = runHook({
        hook_event_name: 'PreToolUse',
        session_id: 'test-session',
        cwd: '/tmp/no-such-goodvibes-dir',
        tool_name: 'Bash',
      });

      expect(status).toBe(0);
      const response = parseResponse(stdout);
      expect(response).toEqual({});
    });

    it('does NOT write the is_subagent stderr trace', () => {
      const { stderr } = runHook({
        hook_event_name: 'PreToolUse',
        cwd: '/tmp/no-such-goodvibes-dir',
      });

      expect(stderr).not.toContain('[directive-drain] skipped: is_subagent=true');
    });
  });

  describe('when stdin is empty (no hook input)', () => {
    it('proceeds past the guard (hookInput is null — is_subagent falsy)', () => {
      const { stdout, status } = runHook(null);

      expect(status).toBe(0);
      // No input → hookInput null → guard does not fire → fast-path
      const response = parseResponse(stdout);
      expect(response).toEqual({});
    });

    it('does NOT write the is_subagent stderr trace', () => {
      const { stderr } = runHook(null);

      expect(stderr).not.toContain('[directive-drain] skipped: is_subagent=true');
    });
  });
});
