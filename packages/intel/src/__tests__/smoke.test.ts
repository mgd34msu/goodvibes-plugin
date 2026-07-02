/**
 * Boot smoke test: the server answers `initialize` and lists an empty tool set
 * over an in-memory transport (the same handshake the stdio bundle serves).
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from '../index.js';

describe('goodvibes-intel skeleton', () => {
  it('completes initialize and serves an empty tools list', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    const version = client.getServerVersion();
    expect(version?.name).toBe(SERVER_NAME);
    expect(version?.version).toBe(SERVER_VERSION);

    const tools = await client.listTools();
    expect(tools.tools).toEqual([]);

    await client.close();
    await server.close();
  });
});
