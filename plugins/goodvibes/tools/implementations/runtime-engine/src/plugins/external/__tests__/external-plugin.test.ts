/**
 * Unit tests for ExternalPlugin — covering updateConfig() and reconfigureExternalPlugins paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock state ────────────────────────────────────────────────────────────

// Track all HttpListener instances created
const listenerInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  isRunning: ReturnType<typeof vi.fn>;
  constructedWith: [string, unknown];
}> = [];

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../file-watcher.js', () => {
  function FileWatcher(this: unknown) {
    return {
      ensureDirs: vi.fn().mockResolvedValue(undefined),
      scan: vi.fn().mockResolvedValue({ events_ingested: 0 }),
    };
  }
  return {
    FileWatcher,
    DEFAULT_FILE_WATCHER_CONFIG: {
      incoming_dir: '/tmp/gv-test/incoming',
      processed_dir: '/tmp/gv-test/processed',
      error_dir: '/tmp/gv-test/errors',
      max_files_per_scan: 50,
    },
  };
});

vi.mock('../http-listener.js', () => {
  function HttpListener(this: unknown, dropDir: string, config: unknown) {
    const instance = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(false),
      constructedWith: [dropDir, config] as [string, unknown],
    };
    listenerInstances.push(instance);
    return instance;
  }
  return { HttpListener };
});

vi.mock('../normalizers/index.js', () => ({
  createDefaultRegistry: vi.fn().mockReturnValue({}),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { ExternalPlugin, type ExternalPluginConfig } from '../external-plugin.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ExternalPluginConfig> = {}): ExternalPluginConfig {
  return {
    file_watcher: {
      incoming_dir: '/tmp/gv-test/incoming',
      processed_dir: '/tmp/gv-test/processed',
      error_dir: '/tmp/gv-test/errors',
      max_files_per_scan: 50,
    },
    ...overrides,
  };
}

function makeHttpConfig(port = 8080) {
  return { port, address: '127.0.0.1', bind_mode: 'localhost' as const, max_payload_bytes: 1 * 1024 * 1024 };
}

function makeQueue() {
  return { enqueue: vi.fn(), dequeue: vi.fn(), depth: vi.fn().mockReturnValue(0) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExternalPlugin.updateConfig', () => {
  beforeEach(() => {
    listenerInstances.length = 0;
  });

  it('updateConfig with http_listener enables startHttpListener', async () => {
    const queue = makeQueue();
    const plugin = new ExternalPlugin(queue as never, makeConfig());

    // Start with no HTTP listener
    expect(plugin.isHttpListenerRunning()).toBe(false);

    // Update config to include http_listener
    const newConfig = makeConfig({ http_listener: makeHttpConfig(9090) });
    plugin.updateConfig(newConfig);

    // Starting the listener should now succeed (creates and starts a new listener)
    await plugin.startHttpListener();
    expect(listenerInstances.length).toBeGreaterThan(0);
    expect(listenerInstances.at(-1)!.start).toHaveBeenCalledOnce();
  });

  it('updateConfig while listener stopped creates a new listener instance', () => {
    const queue = makeQueue();
    const initialConfig = makeConfig({ http_listener: makeHttpConfig(8080) });
    // Constructor creates the first listener instance
    new ExternalPlugin(queue as never, initialConfig);

    // Simulate stopped listener, then update config
    // (The plugin is not running so updateConfig should replace the instance)
    const plugin = new ExternalPlugin(queue as never, initialConfig);
    const countBefore = listenerInstances.length;

    // Set the last listener's isRunning to return false
    listenerInstances.at(-1)!.isRunning.mockReturnValue(false);
    plugin.updateConfig(makeConfig({ http_listener: makeHttpConfig(9090) }));

    expect(listenerInstances.length).toBeGreaterThan(countBefore);
  });

  it('updateConfig while listener is running preserves the existing listener instance', () => {
    const queue = makeQueue();
    const initialConfig = makeConfig({ http_listener: makeHttpConfig(8080) });
    const plugin = new ExternalPlugin(queue as never, initialConfig);
    const countBefore = listenerInstances.length;

    // Simulate a running listener
    listenerInstances.at(-1)!.isRunning.mockReturnValue(true);
    plugin.updateConfig(makeConfig({ http_listener: makeHttpConfig(9090) }));

    // Should NOT create a new listener while running
    expect(listenerInstances.length).toBe(countBefore);
  });

  it('updateConfig removing http_listener reports isHttpListenerRunning as false', () => {
    const queue = makeQueue();
    const configWithHttp = makeConfig({ http_listener: makeHttpConfig(8080) });
    const plugin = new ExternalPlugin(queue as never, configWithHttp);

    listenerInstances.at(-1)!.isRunning.mockReturnValue(false);
    plugin.updateConfig(makeConfig()); // remove http_listener

    expect(plugin.isHttpListenerRunning()).toBe(false);
  });
});

describe('ExternalPlugin reconfigureExternalPlugins scenarios', () => {
  beforeEach(() => {
    listenerInstances.length = 0;
  });

  it('disable path: stopHttpListener stops a running listener', async () => {
    const queue = makeQueue();
    const plugin = new ExternalPlugin(queue as never, makeConfig({ http_listener: makeHttpConfig(8080) }));

    // Simulate running
    listenerInstances.at(-1)!.isRunning.mockReturnValue(true);
    await plugin.stopHttpListener();

    expect(listenerInstances.at(-1)!.stop).toHaveBeenCalledOnce();
  });

  it('enable path: startHttpListener starts after updateConfig adds http_listener', async () => {
    const queue = makeQueue();
    const plugin = new ExternalPlugin(queue as never, makeConfig()); // no HTTP initially

    plugin.updateConfig(makeConfig({ http_listener: makeHttpConfig(8080) }));
    await plugin.startHttpListener();

    expect(listenerInstances.length).toBeGreaterThan(0);
    expect(listenerInstances.at(-1)!.start).toHaveBeenCalledOnce();
  });

  it('enable-from-disabled: startHttpListener without prior updateConfig throws', async () => {
    const queue = makeQueue();
    // Construct without http_listener — ExternalPlugin has no listener config
    const plugin = new ExternalPlugin(queue as never, makeConfig());
    const countBefore = listenerInstances.length;

    // startHttpListener without http_listener config should throw (programmer error)
    await expect(plugin.startHttpListener()).rejects.toThrow('http_listener config is undefined');
    expect(listenerInstances.length).toBe(countBefore);
    expect(plugin.isHttpListenerRunning()).toBe(false);

    // Now provide config via updateConfig, then start should succeed
    plugin.updateConfig(makeConfig({ http_listener: makeHttpConfig(8080) }));
    await plugin.startHttpListener();
    expect(listenerInstances.length).toBeGreaterThan(countBefore);
    expect(listenerInstances.at(-1)!.start).toHaveBeenCalledOnce();
  });

  it('port-change path: stop then updateConfig then start uses new port', async () => {
    const queue = makeQueue();
    const plugin = new ExternalPlugin(queue as never, makeConfig({ http_listener: makeHttpConfig(8080) }));

    // Simulate running, then stop
    listenerInstances.at(-1)!.isRunning.mockReturnValue(true);
    await plugin.stopHttpListener();
    listenerInstances.at(-1)!.isRunning.mockReturnValue(false);

    // Update config with new port
    plugin.updateConfig(makeConfig({ http_listener: makeHttpConfig(9090) }));

    // Start
    await plugin.startHttpListener();

    // A new listener should have been created with port 9090
    const lastInstance = listenerInstances.at(-1)!;
    expect(lastInstance.start).toHaveBeenCalledOnce();
    expect(lastInstance.constructedWith[1]).toMatchObject({ port: 9090 });
  });
});
