/**
 * Boot smoke test: the server answers `initialize` and lists its registered
 * tools over an in-memory transport, the same handshake the stdio bundle
 * serves. The shape assertions deliberately do not pin an exact tool count, so
 * adding a tool does not break them.
 *
 * The doc-parity test below does pin the count, on purpose and in one place.
 * The shipped READMEs advertise how many tools intel serves, and a number in
 * prose cannot notice when the roster changes underneath it. This asserts the
 * advertised numbers still equal the number of tools actually served, so the
 * next tool added fails here rather than shipping a README that undercounts it.
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, SERVER_NAME, SERVER_VERSION } from '../index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Boot the server in memory and return the tool names it actually serves. */
async function servedToolNames(): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(serverTransport);
  const client = new Client({ name: 'parity', version: '0.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  await client.close();
  await server.close();
  return names;
}

describe('goodvibes intel server', () => {
  it('completes initialize and serves well-formed tool definitions', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    const version = client.getServerVersion();
    expect(version?.name).toBe(SERVER_NAME);
    expect(version?.version).toBe(SERVER_VERSION);

    const tools = await client.listTools();
    for (const tool of tools.tools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
    }

    await client.close();
    await server.close();
  });
});

describe('the tool counts the shipped docs advertise', () => {
  it('match the number of tools the server actually serves', async () => {
    const served = (await servedToolNames()).length;

    // Every place a reader is told how many tools intel has. Each pattern
    // captures the number so the failure message shows what the doc claims
    // against what the server serves, rather than just "no match".
    const claims: Array<{ file: string; label: string; pattern: RegExp }> = [
      {
        file: 'README.md',
        label: 'server table row',
        pattern: /^\| \*\*intel\*\* \| (\d+) \|/m,
      },
      {
        file: 'plugins/goodvibes/README.md',
        label: 'server table row',
        pattern: /^\| `intel` \| (\d+) \|/m,
      },
      {
        file: 'plugins/goodvibes/README.md',
        label: 'section heading',
        pattern: /^### intel: (\d+) tools$/m,
      },
    ];

    for (const claim of claims) {
      const text = readFileSync(path.join(REPO_ROOT, claim.file), 'utf-8');
      const match = claim.pattern.exec(text);
      expect(match, `${claim.file} (${claim.label}) no longer states an intel tool count`).toBeTruthy();
      expect(
        Number(match![1]),
        `${claim.file} (${claim.label}) advertises ${match![1]} intel tools, server serves ${served}`,
      ).toBe(served);
    }
  });

  it('agree with the plugin-wide total across all three servers', async () => {
    // The plugin-wide "N tools" figure is the sum of the three servers. intel
    // is the only count this package can measure directly, so the other two are
    // read from the same table the total is claimed beside. That still catches
    // the real failure: a total that no longer adds up.
    const served = (await servedToolNames()).length;
    const readme = readFileSync(path.join(REPO_ROOT, 'plugins/goodvibes/README.md'), 'utf-8');

    const rowFor = (server: string): number => {
      const match = new RegExp(`^\\| \`${server}\` \\| (\\d+) \\|`, 'm').exec(readme);
      expect(match, `plugins/goodvibes/README.md has no ${server} row`).toBeTruthy();
      return Number(match![1]);
    };

    const intel = rowFor('intel');
    const total = intel + rowFor('analytics') + rowFor('connect');
    expect(intel, 'the intel row disagrees with the running server').toBe(served);

    const totalMatch = /\*\*(\d+) tools across three MCP servers\*\*/.exec(readme);
    expect(totalMatch, 'plugins/goodvibes/README.md no longer states a plugin-wide tool total').toBeTruthy();
    expect(
      Number(totalMatch![1]),
      `README advertises ${totalMatch![1]} tools; the per-server rows sum to ${total}`,
    ).toBe(total);
  });
});
