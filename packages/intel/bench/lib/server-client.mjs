/**
 * Minimal JSON-RPC-over-stdio client for the built goodvibes intel bundle.
 *
 * Deliberately dependency-free (no `@modelcontextprotocol/sdk` client import)
 * so these scripts run with plain `node` against the committed bundle, the
 * same way a real MCP host would talk to it, no test framework, no build
 * step. Part of the EXP measurement-harness port (plan §5.3 "Measurement
 * suite"): re-run by lane 8 against the finished v2 build (gate 5).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_PATH = path.join(__dirname, '..', '..', '..', '..', 'plugins', 'goodvibes', 'server', 'intel', 'index.cjs');

/**
 * Spawn the built server, run `fn(callTool)` against it, then shut it down.
 * `callTool(name, args)` resolves to the parsed envelope (the tool's JSON
 * response), or rejects if the server returns an MCP-level error.
 */
export async function withServer(fn) {
  const proc = spawn('node', [SERVER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 1;
  let buf = '';
  let stderr = '';

  proc.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`MCP error: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      }
    }
  });

  function send(method, params) {
    const id = nextId++;
    const req = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify(req) + '\n');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timed out waiting for response to ${method} (id ${id}). stderr: ${stderr}`));
        }
      }, 30000).unref?.();
    });
  }

  function notify(method, params) {
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bench', version: '0.0.0' },
  });
  notify('notifications/initialized', {});

  async function callTool(name, args) {
    const result = await send('tools/call', { name, arguments: args });
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error(`Tool ${name} returned no text content: ${JSON.stringify(result)}`);
    return JSON.parse(text);
  }

  try {
    return await fn(callTool);
  } finally {
    proc.stdin.end();
    proc.kill('SIGTERM');
  }
}

/** Payload-true token estimate (bytes / 3.5), matches `@goodvibes/core/envelope`'s formula, used uniformly for both intel and native comparisons so the numbers are apples-to-apples. */
export function estimateTokens(str) {
  return Math.ceil(Buffer.byteLength(str, 'utf8') / 3.5);
}
