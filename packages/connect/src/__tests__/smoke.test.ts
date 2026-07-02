/**
 * Boot smoke test: initialize handshake + empty tools list, and the connect
 * envelope carries a mode stamp.
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from '../index.js';

describe('goodvibes-connect skeleton', () => {
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

  it('stamps the restricted mode into an unknown-tool envelope', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(serverTransport);
    const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    const res = await client.callTool({ name: 'api_request', arguments: {} });
    const block = (res.content as { type: string; text: string }[])[0];
    const parsed = JSON.parse(block.text) as { meta: { mode?: string } };
    expect(parsed.meta.mode).toBe('restricted');

    await client.close();
    await server.close();
  });
});
