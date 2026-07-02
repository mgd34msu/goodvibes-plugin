/**
 * Boot smoke test: initialize handshake + empty tools list over an in-memory
 * transport (the same handshake the stdio bundle serves).
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from '../index.js';

describe('goodvibes-analytics skeleton', () => {
  it('completes initialize and serves an empty tools list', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(serverTransport);

    const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(client.getServerVersion()?.version).toBe(SERVER_VERSION);
    expect((await client.listTools()).tools).toEqual([]);

    await client.close();
    await server.close();
  });
});
