/**
 * Tests for the shipped warn-first commit guard
 * (plugins/goodvibes/hooks/commit-guard.mjs). Real detection + the
 * warn→block escalation are exercised with injected I/O so no repo is needed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookUrl = pathToFileURL(
  path.resolve(here, '../../../../../plugins/goodvibes/hooks/commit-guard.mjs'),
).href;

interface CommitGuardHook {
  PROTECTED_FILES: string[];
  analyzeCommitCommand: (command: string) => {
    isGit: boolean;
    isBroad: boolean;
    explicitHits: string[];
  };
  scanStatusForProtected: (porcelain: string, basenames: string[]) => string[];
  decideCommitGuard: (input: { risky: boolean; hits: string[]; alreadyWarned: boolean }) => {
    action: 'allow' | 'warn' | 'block';
    message?: string;
  };
  evaluateCommit: (opts: {
    toolName?: string;
    command?: string;
    cwd?: string;
    gitStatus?: () => string;
    exists?: (p: string) => boolean;
    writeMarker?: (cwd: string) => void;
  }) => { action: 'allow' | 'warn' | 'block'; message?: string };
}

let hook: CommitGuardHook;

describe('commit-guard hook', () => {
  beforeAll(async () => {
    hook = (await import(/* @vite-ignore */ hookUrl)) as CommitGuardHook;
  });

  describe('analyzeCommitCommand', () => {
    it('ignores non-git commands', () => {
      expect(hook.analyzeCommitCommand('ls -la').isGit).toBe(false);
      expect(hook.analyzeCommitCommand('echo git add').isGit).toBe(true); // conservative: contains git add
    });

    it('flags an explicit protected-file reference', () => {
      const a = hook.analyzeCommitCommand('git add goodvibes.secrets.json');
      expect(a.isGit).toBe(true);
      expect(a.explicitHits).toContain('goodvibes.secrets.json');
    });

    it('flags broad stages and commits', () => {
      expect(hook.analyzeCommitCommand('git add -A').isBroad).toBe(true);
      expect(hook.analyzeCommitCommand('git add .').isBroad).toBe(true);
      expect(hook.analyzeCommitCommand('git add -u').isBroad).toBe(true);
      expect(hook.analyzeCommitCommand('git commit --all -m "x"').isBroad).toBe(true);
      expect(hook.analyzeCommitCommand('git commit -am "x"').isBroad).toBe(true);
      expect(hook.analyzeCommitCommand('git commit -m "x"').isBroad).toBe(false);
      expect(hook.analyzeCommitCommand('git add src/index.ts').isBroad).toBe(false);
    });
  });

  describe('scanStatusForProtected', () => {
    it('finds protected files in porcelain output (incl. nested paths and renames)', () => {
      const porcelain = [
        ' M src/index.ts',
        '?? .goodvibes/v2/goodvibes.secrets.json',
        'A  notes.txt',
        'R  old.json -> goodvibes.cookies.json',
      ].join('\n');
      const hits = hook.scanStatusForProtected(porcelain, hook.PROTECTED_FILES);
      expect(hits).toContain('goodvibes.secrets.json');
      expect(hits).toContain('goodvibes.cookies.json');
    });

    it('returns nothing for a clean-ish status', () => {
      expect(hook.scanStatusForProtected(' M src/a.ts\n?? b.txt', hook.PROTECTED_FILES)).toEqual([]);
    });
  });

  describe('decideCommitGuard (warn-first escalation)', () => {
    it('allows when not risky', () => {
      expect(hook.decideCommitGuard({ risky: false, hits: [], alreadyWarned: false }).action).toBe('allow');
    });
    it('warns on the first risky attempt', () => {
      const d = hook.decideCommitGuard({ risky: true, hits: ['goodvibes.secrets.json'], alreadyWarned: false });
      expect(d.action).toBe('warn');
      expect(d.message).toContain('goodvibes.secrets.json');
    });
    it('blocks on a repeat risky attempt', () => {
      const d = hook.decideCommitGuard({ risky: true, hits: ['goodvibes.secrets.json'], alreadyWarned: true });
      expect(d.action).toBe('block');
      expect(d.message).toContain('BLOCKED');
    });
  });

  describe('evaluateCommit (end to end, injected I/O)', () => {
    const base = {
      cwd: '/proj',
      gitStatus: () => '',
      exists: () => false,
      writeMarker: () => {},
    };

    it('allows non-Bash tools and non-git commands', () => {
      expect(hook.evaluateCommit({ ...base, toolName: 'Read', command: 'anything' }).action).toBe('allow');
      expect(hook.evaluateCommit({ ...base, toolName: 'Bash', command: 'ls -la' }).action).toBe('allow');
    });

    it('warns then blocks on repeated explicit protected-file adds', () => {
      let marker = false;
      const opts = {
        ...base,
        toolName: 'Bash' as const,
        command: 'git add goodvibes.secrets.json',
        // Path-aware stub: only the warn-marker exists; the v1 marker never does.
        exists: (p: string) => marker && p.includes('.commit-guard-warned'),
        writeMarker: () => {
          marker = true;
        },
      };
      const first = hook.evaluateCommit(opts);
      expect(first.action).toBe('warn');
      expect(marker).toBe(true);
      const second = hook.evaluateCommit(opts);
      expect(second.action).toBe('block');
    });

    it('scans git status for broad stages and warns when a secret would be swept in', () => {
      const decision = hook.evaluateCommit({
        ...base,
        toolName: 'Bash',
        command: 'git add -A',
        gitStatus: () => '?? goodvibes.secrets.json\n M src/index.ts',
      });
      expect(decision.action).toBe('warn');
    });

    it('allows a broad stage when git status is clean of secrets', () => {
      const decision = hook.evaluateCommit({
        ...base,
        toolName: 'Bash',
        command: 'git add -A',
        gitStatus: () => ' M src/index.ts\n?? README.md',
      });
      expect(decision.action).toBe('allow');
    });
  });
});
