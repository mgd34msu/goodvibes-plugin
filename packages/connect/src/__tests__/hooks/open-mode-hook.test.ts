/**
 * Tests for the shipped SessionStart open-mode hook
 * (plugins/goodvibes/hooks/session-start-open-mode.mjs).
 *
 * The real `.mjs` is imported by a runtime-computed file URL so tsc does not try
 * to pull a plain-JS file outside this package into the program — the tests
 * exercise exactly the code that ships.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookUrl = pathToFileURL(
  path.resolve(here, '../../../../../plugins/goodvibes/hooks/session-start-open-mode.mjs'),
).href;

interface OpenModeHook {
  computeOpenModeAction: (cfg: { mode: string; persist: boolean }) => {
    announce: string | null;
    revert: boolean;
  };
  applyOpenMode: (opts?: { cwd?: string }) => {
    announce: string | null;
    reverted: boolean;
  };
}

let hook: OpenModeHook;

const V2 = ['.goodvibes', 'v2'];

describe('session-start open-mode hook', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeAll(async () => {
    hook = (await import(/* @vite-ignore */ hookUrl)) as OpenModeHook;
  });

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'open-mode-hook-'));
    await fs.promises.mkdir(path.join(tmpDir, ...V2), { recursive: true });
    // Isolate the user config path (homedir) so a real ~/.claude config can't leak in.
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('computeOpenModeAction', () => {
    it('says nothing in restricted mode', () => {
      expect(hook.computeOpenModeAction({ mode: 'restricted', persist: false })).toEqual({
        announce: null,
        revert: false,
      });
    });

    it('loudly re-announces persisted open mode without reverting', () => {
      const a = hook.computeOpenModeAction({ mode: 'open', persist: true });
      expect(a.revert).toBe(false);
      expect(a.announce).toContain('PERSISTED');
    });

    it('marks ephemeral open mode for revert', () => {
      const a = hook.computeOpenModeAction({ mode: 'open', persist: false });
      expect(a.revert).toBe(true);
      expect(a.announce).toContain('ephemeral');
    });
  });

  describe('applyOpenMode', () => {
    async function writeProjectConfig(obj: Record<string, unknown>): Promise<void> {
      await fs.promises.writeFile(
        path.join(tmpDir, ...V2, 'config.json'),
        JSON.stringify(obj),
        'utf-8',
      );
    }

    it('is silent when restricted', () => {
      const r = hook.applyOpenMode({ cwd: tmpDir });
      expect(r).toEqual({ announce: null, reverted: false });
    });

    it('re-announces persisted open mode and leaves the file open', async () => {
      await writeProjectConfig({ mode: 'open', dangerously_persist_across_sessions: true });
      const r = hook.applyOpenMode({ cwd: tmpDir });
      expect(r.reverted).toBe(false);
      expect(r.announce).toContain('PERSISTED');
      const cfg = JSON.parse(await fs.promises.readFile(path.join(tmpDir, ...V2, 'config.json'), 'utf-8'));
      expect(cfg.mode).toBe('open');
    });

    it('reverts ephemeral open mode to restricted', async () => {
      await writeProjectConfig({ mode: 'open' });
      const r = hook.applyOpenMode({ cwd: tmpDir });
      expect(r.reverted).toBe(true);
      expect(r.announce).toContain('ephemeral');
      const cfg = JSON.parse(await fs.promises.readFile(path.join(tmpDir, ...V2, 'config.json'), 'utf-8'));
      expect(cfg.mode).toBe('restricted');
    });
  });
});
