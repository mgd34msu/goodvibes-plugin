/**
 * Fresh-install gate (2.0.5, the "from GitHub, no setup yet" release theme).
 *
 * Mike's install exposed the invariant this locks down: a freshly-cloned plugin
 * whose servers have NO node_modules (setup has not run, or a plugin update just
 * replaced the installed deps) must still boot every server, answer the MCP
 * handshake, keep every dep-free capability working, and hand back an honest
 * setup-pointer for anything that needs a native/WASM dep, never a crash, never
 * a hang, never a raw "Cannot find module".
 *
 * The test copies each COMMITTED server bundle to a bare temp dir with no
 * node_modules anywhere above it and drives it over stdio exactly like Claude
 * Code does. Carries the bundle-live-call lesson: the child must NOT inherit
 * VITEST, or the entry guard skips main() and the server never starts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const SERVER_SRC = path.join(REPO, 'plugins', 'goodvibes', 'server');
const SERVERS = ['intel', 'analytics', 'connect'] as const;
const BUNDLES_EXIST = SERVERS.every((s) => existsSync(path.join(SERVER_SRC, s, 'index.cjs')));

/** A minimal stdio driver for one committed server bundle. */
interface Driver {
  send: (obj: unknown) => void;
  waitFor: (id: number, ms: number) => Promise<{ result?: unknown; error?: unknown }>;
  child: ChildProcessWithoutNullStreams;
}

function drive(bundle: string, cwd: string): Driver {
  const env: NodeJS.ProcessEnv = { ...process.env, GOODVIBES_DIR: path.join(cwd, '.goodvibes') };
  delete env.VITEST; // entry guard skips main() under VITEST. The child must run for real.
  const child = spawn('node', [bundle], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const responses = new Map<number, { result?: unknown; error?: unknown }>();
  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) {continue;}
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
        if (typeof msg.id === 'number') {responses.set(msg.id, msg);}
      } catch {
        /* non-JSON noise is not this test's concern */
      }
    }
  });
  const send = (obj: unknown): void => {
    child.stdin.write(`${JSON.stringify(obj)}\n`);
  };
  const waitFor = (id: number, ms: number): Promise<{ result?: unknown; error?: unknown }> =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (responses.has(id)) {
          clearInterval(poll);
          resolve(responses.get(id)!);
        } else if (Date.now() - started > ms) {
          clearInterval(poll);
          reject(new Error(`no response for id ${id} within ${ms}ms`));
        }
      }, 40);
      poll.unref?.();
    });
  return { send, waitFor, child };
}

async function handshake(d: Driver): Promise<{ tools: Array<{ name: string }> }> {
  d.send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gate', version: '0' } },
  });
  await d.waitFor(1, 10_000);
  d.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  d.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = (await d.waitFor(2, 10_000)) as { result?: { tools?: Array<{ name: string }> } };
  return { tools: listed.result?.tools ?? [] };
}

let root: string;

beforeAll(() => {
  // A bare temp dir, no node_modules here or above it (tmpdir lives outside the repo).
  root = mkdtempSync(path.join(tmpdir(), 'gv-fresh-gate-'));
  for (const s of SERVERS) {
    cpSync(path.join(SERVER_SRC, s), path.join(root, s), { recursive: true });
  }
  mkdirSync(path.join(root, 'fixtures'), { recursive: true });
  writeFileSync(
    path.join(root, 'fixtures', 'sample.ts'),
    'export function hello(): number {\n  return 42;\n}\n',
  );
});

afterAll(() => {
  if (root) {rmSync(root, { recursive: true, force: true });}
});

describe('fresh-install gate: committed bundles with zero node_modules', () => {
  it.skipIf(!BUNDLES_EXIST)(
    'boots all three servers and answers initialize + tools/list',
    async () => {
      for (const s of SERVERS) {
        const d = drive(path.join(root, s, 'index.cjs'), root);
        try {
          const { tools } = await handshake(d);
          expect(tools.length, `${s} should list tools`).toBeGreaterThan(0);
          expect(d.child.exitCode, `${s} should still be alive`).toBeNull();
        } finally {
          d.child.kill('SIGTERM');
        }
      }
    },
    45_000,
  );

  it.skipIf(!BUNDLES_EXIST)(
    'intel: a native-dependent call returns the setup pointer, a dep-free call succeeds',
    async () => {
      const d = drive(path.join(root, 'intel', 'index.cjs'), root);
      try {
        await handshake(d);
        const fixture = path.join(root, 'fixtures', 'sample.ts');

        // Native-dependent: code_read outline needs web-tree-sitter (no fallback).
        d.send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'code_read', arguments: { files: [fixture], extract: 'outline' } },
        });
        const outlineReply = (await d.waitFor(3, 20_000)) as { result?: { content?: Array<{ text?: string }> } };
        const outlineText = outlineReply.result?.content?.[0]?.text ?? '';
        expect(outlineText).toContain('needs native dependencies that are not installed yet');
        expect(outlineText).toContain('/goodvibes:setup');
        // The honest envelope, never the raw module-resolution failure.
        expect(outlineText).not.toContain('Cannot find module');

        // Dep-free: code_read lines needs nothing native and must return content.
        d.send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'code_read', arguments: { files: [fixture], extract: 'lines' } },
        });
        const linesReply = (await d.waitFor(4, 20_000)) as { result?: { content?: Array<{ text?: string }> } };
        const parsed = JSON.parse(linesReply.result?.content?.[0]?.text ?? '{}') as {
          success?: boolean;
          data?: { files?: Record<string, { lines?: string[] }> };
        };
        expect(parsed.success).toBe(true);
        const fileEntry = Object.values(parsed.data?.files ?? {})[0];
        expect(fileEntry?.lines?.join('\n')).toContain('export function hello');

        expect(d.child.exitCode, 'intel should still be alive after both calls').toBeNull();
      } finally {
        d.child.kill('SIGTERM');
      }
    },
    45_000,
  );
});
