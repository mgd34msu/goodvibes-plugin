/**
 * Boot smoke test: the server answers `initialize` and lists its registered
 * tools over an in-memory transport (the same handshake the stdio bundle
 * serves). The tools list starts empty in the lane-0 skeleton and grows as
 * lanes 1-4 and 7 register tools (§4.1), this test asserts shape, not an
 * exact count, so it stays green as the roster grows.
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from '../index.js';

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
