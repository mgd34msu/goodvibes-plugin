/**
 * Boot smoke test: initialize handshake + the seven-tool list over an in-memory
 * transport (the same handshake the stdio bundle serves). The engine is created
 * lazily on the first tool call, so this exercises no SQLite/WASM.
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_NAME, SERVER_VERSION, TOOL_MODULES } from '../index.js';

describe('goodvibes-analytics server', () => {
  it('completes initialize and lists the seven analytics tools', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(client.getServerVersion()?.version).toBe(SERVER_VERSION);

    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['budget', 'config', 'dashboard', 'export', 'query', 'sync', 'tag']);
    expect(TOOL_MODULES).toHaveLength(7);

    await client.close();
    await server.close();
  });
});
