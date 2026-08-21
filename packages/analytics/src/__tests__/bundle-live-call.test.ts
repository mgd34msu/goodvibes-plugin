/**
 * Bundle-level regression gate (the 2.0.1 live-cost incident).
 *
 * The in-memory smoke test proves the handshake but exercises no SQLite/WASM;
 * the first real `query` call in production found sql-wasm.wasm missing from
 * the resolver's candidate list and the failure cascaded into process death.
 * This test drives the COMMITTED bundle over stdio exactly like Claude Code
 * does and asserts the two invariants that incident broke:
 *
 *   1. a real tools/call returns an envelope (never the wasm ENOENT), and
 *   2. the server process is still alive afterwards.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const BUNDLE = path.join(REPO, 'plugins', 'goodvibes', 'server', 'analytics', 'index.cjs');

describe('analytics bundle: real tool call over stdio', () => {
  it.skipIf(!existsSync(BUNDLE))(
    'answers a live_cost query without dying (wasm resolvable from the shipped layout)',
    async () => {
      const stateDir = mkdtempSync(path.join(tmpdir(), 'gv-bundle-test-'));
      // The child must NOT inherit VITEST: the bundle's entry guard skips
      // main() under it, and the server would silently never start.
      const childEnv: NodeJS.ProcessEnv = { ...process.env, GOODVIBES_DIR: stateDir };
      delete childEnv.VITEST;
      const child = spawn('node', [BUNDLE], {
        cwd: stateDir,
        env: childEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      try {
        const responses = new Map<number, unknown>();
        let buffer = '';
        child.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          let idx: number;
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) {continue;}
            try {
              const msg = JSON.parse(line) as { id?: number };
              if (typeof msg.id === 'number') {responses.set(msg.id, msg);}
            } catch {
              /* non-JSON noise is not this test's concern */
            }
          }
        });

        const send = (obj: unknown) => child.stdin.write(JSON.stringify(obj) + '\n');
        const waitFor = (id: number, ms: number) =>
          new Promise<unknown>((resolve, reject) => {
            const started = Date.now();
            const poll = setInterval(() => {
              if (responses.has(id)) {
                clearInterval(poll);
                resolve(responses.get(id));
              } else if (Date.now() - started > ms) {
                clearInterval(poll);
                reject(new Error(`no response for id ${id} within ${ms}ms`));
              }
            }, 50);
            poll.unref?.();
          });

        send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'bundle-test', version: '0.0.0' },
          },
        });
        await waitFor(1, 10_000);
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });

        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'query', arguments: { mode: 'live_cost' } },
        });
        const reply = (await waitFor(2, 20_000)) as {
          result?: { content?: Array<{ text?: string }> };
          error?: { message?: string };
        };

        // Invariant 1: an answer came back, and it is not the wasm incident.
        const text = JSON.stringify(reply);
        expect(text).not.toContain('sql-wasm.wasm');
        expect(reply.result ?? reply.error).toBeTruthy();

        // Invariant 2: the server survived answering it.
        expect(child.exitCode).toBeNull();
        expect(() => process.kill(child.pid!, 0)).not.toThrow();
      } finally {
        child.kill('SIGTERM');
        rmSync(stateDir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
