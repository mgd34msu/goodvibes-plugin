#!/usr/bin/env node
/**
 * smoke-mcp.mjs
 *
 * Start each shipped MCP server the way Claude Code does and drive it over
 * stdio: `initialize`, `notifications/initialized`, `tools/list`, then one real
 * `tools/call`.
 *
 *   node scripts/smoke-mcp.mjs [pluginRoot]
 *
 * Why this exists: every other gate in CI checks the repo (types compile, tests
 * pass, the rebuilt bundle matches the committed one). None of them ever start
 * the thing users actually run. A bundle can be byte-perfect and still fail to
 * boot, advertise the wrong tool inventory, or die on its first call. This
 * script is the gate that runs the product.
 *
 * The chosen call per server is deliberately dependency-free: it must succeed
 * on a bare checkout where the servers' native runtime dependencies have not
 * been installed into the durable home yet.
 *
 * State is redirected to a temp directory (GOODVIBES_DIR) so a smoke run never
 * reads or writes the developer's real analytics/service state.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = path.resolve(
  process.argv[2] || process.env.GOODVIBES_PLUGIN_ROOT || path.join(repoRoot, 'plugins', 'goodvibes'),
);
const smokeStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'goodvibes-mcp-smoke-'));

/** The exact tool inventory each server must advertise. */
const expected = {
  intel: [
    'api_routes',
    'api_spec',
    'api_validate',
    'client_boundary',
    'code_glob',
    'code_grep',
    'code_read',
    'code_safe_delete',
    'code_surface',
    'component_tree',
    'db_schema',
    'hook_dependencies',
    'layout_analysis',
    'scaffold',
    'structural_edit',
  ],
  analytics: ['budget', 'config', 'dashboard', 'export', 'query', 'sync', 'tag'],
  connect: ['api_request', 'db_query', 'service'],
};

/**
 * One real call per server that needs no native runtime dependency.
 *
 * `envelope: true` means the server answers in the core `{ success, ... }`
 * envelope from @goodvibes/core/envelope. The analytics server is the
 * exception: its handlers come from the ported v1 engine and return their own
 * payload shape (the `config` handler returns the settings object itself), so
 * there is no `success` field to assert on.
 */
const dependencyFreeCall = {
  intel: {
    envelope: true,
    name: 'code_read',
    arguments: {
      files: [{ path: 'package.json', extract: 'lines', range: { start: 1, end: 3 } }],
      base_path: repoRoot,
    },
  },
  analytics: { envelope: false, name: 'config', arguments: { action: 'get' } },
  connect: { envelope: true, name: 'service', arguments: { action: 'status' } },
};

function withTimeout(promise, label, timeoutMs = 30_000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function smokeServer(name, expectedTools) {
  const bundle = path.join(pluginRoot, 'server', name, 'index.cjs');
  if (!fs.existsSync(bundle)) throw new Error(`${name} bundle is missing: ${bundle}`);

  const env = { ...process.env, GOODVIBES_DIR: path.join(smokeStateRoot, name), PLUGIN_ROOT: pluginRoot };
  // The server bundles skip main() under VITEST so importing them in tests does
  // not start a transport; a child spawned from a vitest run must not inherit it.
  delete env.VITEST;

  const child = spawn(process.execPath, [bundle], {
    cwd: smokeStateRoot,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderr = '';
  const waiting = new Map();
  let streamError = null;
  // The 2.0.1 incident shape is a server that answers the call and then dies.
  // Reading child.exitCode right after the response is not enough: the exit is
  // reported on a later tick, so the check has to be a latched event plus a
  // settle delay, and a clean exit(0) counts as death just as much as a crash.
  let exitedEarly = false;
  let exitInfo = '';
  child.on('exit', (code, signal) => {
    exitedEarly = true;
    exitInfo = `code=${code} signal=${signal ?? 'none'}`;
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    while (stdoutBuffer.includes('\n')) {
      const newline = stdoutBuffer.indexOf('\n');
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // Anything non-JSON on stdout corrupts the transport for a real client.
        streamError = new Error(`${name} wrote non-JSON stdout: ${line}`);
        child.kill('SIGTERM');
        return;
      }
      const resolver = waiting.get(message.id);
      if (resolver) {
        waiting.delete(message.id);
        resolver(message);
      }
    }
  });

  function request(id, method, params = {}) {
    const response = new Promise((resolve) => waiting.set(id, resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return withTimeout(response, `${name}:${method}`);
  }

  let shutdownError;
  try {
    const initialized = await request(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'goodvibes-smoke', version: '0.0.0' },
    });
    if (streamError) throw streamError;
    if (initialized.error) throw new Error(`${name} initialize failed: ${JSON.stringify(initialized.error)}`);
    if (initialized.result?.serverInfo?.name !== name) {
      throw new Error(`${name} advertised unexpected server name: ${initialized.result?.serverInfo?.name}`);
    }
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const listed = await request(2, 'tools/list');
    if (listed.error) throw new Error(`${name} tools/list failed: ${JSON.stringify(listed.error)}`);
    const actual = listed.result.tools.map((tool) => tool.name).sort();
    const wanted = [...expectedTools].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      throw new Error(`${name} tool mismatch\nexpected: ${wanted.join(', ')}\nactual:   ${actual.join(', ')}`);
    }
    for (const tool of listed.result.tools) {
      if (!tool.description || !tool.inputSchema) {
        throw new Error(`${name}:${tool.name} is missing a description or input schema.`);
      }
    }

    const { envelope: expectsEnvelope, ...call } = dependencyFreeCall[name];
    const called = await request(3, 'tools/call', call);
    if (called.error || called.result?.isError === true) {
      throw new Error(`${name}:${call.name} smoke call failed: ${JSON.stringify(called.error ?? called.result)}`);
    }
    const text = called.result?.content?.find((item) => item.type === 'text')?.text;
    if (!text) throw new Error(`${name}:${call.name} returned no text result.`);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`${name}:${call.name} returned a non-JSON result: ${text.slice(0, 200)}`);
    }
    if (expectsEnvelope && payload.success !== true) {
      throw new Error(`${name}:${call.name} returned an unsuccessful envelope: ${text.slice(0, 400)}`);
    }
    if (!expectsEnvelope && (payload.success === false || payload.error)) {
      throw new Error(`${name}:${call.name} reported an error: ${text.slice(0, 400)}`);
    }

    // Let any exit that the tool call triggered actually land before judging.
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (exitedEarly) {
      throw new Error(
        `${name} exited (${exitInfo}) after answering ${call.name}; a server must stay up for the ` +
          `session. ${stderr.trim()}`,
      );
    }
    process.stdout.write(`${name}: initialize ok, ${actual.length} tools, ${call.name} call ok, still alive\n`);
  } finally {
    child.stdin.end();
    if (!exitedEarly) {
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) =>
          setTimeout(() => {
            child.kill('SIGTERM');
            resolve();
          }, 2_000),
        ),
      ]);
    }
    if (child.exitCode && child.exitCode !== 0) {
      shutdownError = new Error(`${name} exited ${child.exitCode}: ${stderr.trim()}`);
    }
  }
  if (shutdownError) throw shutdownError;
}

try {
  for (const [name, tools] of Object.entries(expected)) {
    await smokeServer(name, tools);
  }
  process.stdout.write(`All ${Object.keys(expected).length} MCP servers answered from ${pluginRoot}.\n`);
} catch (error) {
  console.error(`smoke-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(smokeStateRoot, { recursive: true, force: true });
}
