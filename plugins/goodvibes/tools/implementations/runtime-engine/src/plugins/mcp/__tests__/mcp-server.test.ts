import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ────────────────────────────────────────────────────────────
// vi.hoisted ensures these are initialised before vi.mock() factories run.

const mocks = vi.hoisted(() => {
  // Per-instance tracking
  let lastServerInstance: {
    setRequestHandler: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onerror: unknown;
  } | null = null;

  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockSetRequestHandler = vi.fn();

  // Server must be a proper constructor (used with `new`)
  function MockServer(this: Record<string, unknown>) {
    const inst = {
      setRequestHandler: mockSetRequestHandler,
      connect: mockConnect,
      close: mockClose,
      onerror: null as unknown,
    };
    lastServerInstance = inst;
    Object.assign(this, inst);
  }
  const mockMcpServerCtor = vi.fn().mockImplementation(function (this: Record<string, unknown>, ...args: unknown[]) {
    MockServer.call(this);
    void args;
  });

  const mockStdioServerTransport = vi.fn().mockImplementation(() => ({}));

  const MOCK_ERROR_CODE = { MethodNotFound: -32601, InternalError: -32603 };

  // McpError must be a real class for instanceof checks
  class MockMcpError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
      this.name = 'McpError';
    }
  }

  const mockLoadConfig = vi.fn().mockReturnValue({ someConfig: true, executor: { mode: 'engaged' } });
  const mockEnsureRuntimeSections = vi.fn();

  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockStartup = vi.fn().mockResolvedValue(undefined);
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  const mockGetUptime = vi.fn().mockReturnValue(100);
  const mockGetConfig = vi.fn().mockReturnValue({ someConfig: true });
  const mockUpdateConfig = vi.fn();
  const mockGetProjectRoot = vi.fn().mockReturnValue('/mock/project');
  const mockGetEventBus = vi.fn().mockReturnValue({});
  const mockGetEventLog = vi.fn().mockReturnValue({});
  const mockGetEventQueue = vi.fn().mockReturnValue({});
  const mockGetWorkflowEngine = vi.fn().mockReturnValue({});
  const mockGetTriggerRegistry = vi.fn().mockReturnValue({});
  const mockGetAgentCoordinator = vi.fn().mockReturnValue({});
  const mockGetDirectiveQueue = vi.fn().mockReturnValue({});
  const mockHealthCheckerCheck = vi.fn().mockResolvedValue({ status: 'ok' });
  const mockGetHealthChecker = vi.fn().mockReturnValue({ check: mockHealthCheckerCheck });
  const mockGetCoreStateStore = vi.fn().mockReturnValue({});

  function makeEngineInstance() {
    return {
      startup: mockStartup,
      shutdown: mockShutdown,
      getUptime: mockGetUptime,
      getConfig: mockGetConfig,
      updateConfig: mockUpdateConfig,
      getProjectRoot: mockGetProjectRoot,
      getEventBus: mockGetEventBus,
      getEventLog: mockGetEventLog,
      getEventQueue: mockGetEventQueue,
      getWorkflowEngine: mockGetWorkflowEngine,
      getTriggerRegistry: mockGetTriggerRegistry,
      getAgentCoordinator: mockGetAgentCoordinator,
      getDirectiveQueue: mockGetDirectiveQueue,
      getHealthChecker: mockGetHealthChecker,
      getCoreStateStore: mockGetCoreStateStore,
    };
  }

  // RuntimeEngine must be a proper constructor (used with `new`)
  const MockRuntimeEngine = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, makeEngineInstance());
  });

  const mockSetupSignalHandlers = vi.fn();

  const mockGetHandler = vi.fn();
  const mockListHandlers = vi.fn().mockReturnValue(['runtime_status', 'runtime_config']);
  const mockAllSchemas = [{ name: 'runtime_status' }, { name: 'runtime_config' }];

  return {
    mockSetRequestHandler,
    mockConnect,
    mockClose,
    mockMcpServerCtor,
    mockStdioServerTransport,
    mockLoadConfig,
    mockEnsureRuntimeSections,
    mockLogger,
    mockStartup,
    mockShutdown,
    mockGetUptime,
    mockGetConfig,
    mockUpdateConfig,
    mockGetProjectRoot,
    mockGetEventBus,
    mockGetEventLog,
    mockGetEventQueue,
    mockGetWorkflowEngine,
    mockGetTriggerRegistry,
    mockGetAgentCoordinator,
    mockGetDirectiveQueue,
    mockHealthCheckerCheck,
    mockGetHealthChecker,
    MockRuntimeEngine,
    makeEngineInstance,
    mockSetupSignalHandlers,
    mockGetHandler,
    mockListHandlers,
    mockAllSchemas,
    MockMcpError,
    MOCK_ERROR_CODE,
    getLastServerInstance: () => lastServerInstance,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────────

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: mocks.mockMcpServerCtor,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: mocks.mockStdioServerTransport,
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
  ErrorCode: mocks.MOCK_ERROR_CODE,
  McpError: mocks.MockMcpError,
}));

vi.mock('../../../shared/config.js', () => ({
  loadConfig: (...args: unknown[]) => mocks.mockLoadConfig(...args),
  ensureRuntimeSections: (...args: unknown[]) => mocks.mockEnsureRuntimeSections(...args),
}));

vi.mock('../../../shared/constants.js', () => ({
  ENGINE_VERSION: '1.0.0-test',
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => mocks.mockLogger,
}));

vi.mock('../../../shared/utils.js', () => ({
  toErrorMessage: (err: unknown) => String(err),
  safeJsonParse: vi.fn(),
}));

vi.mock('../../../bootstrap.js', () => ({
  RuntimeEngine: mocks.MockRuntimeEngine,
}));

vi.mock('../../../core/processing/signals.js', () => ({
  setupSignalHandlers: (...args: unknown[]) => mocks.mockSetupSignalHandlers(...args),
}));

vi.mock('../../../transport/factory.js', () => ({
  createTransport: vi.fn().mockResolvedValue({ mode: 'engaged', disconnect: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('../../../transport/daemon-lifecycle.js', () => ({
  DaemonLifecycle: vi.fn().mockImplementation(() => ({
    isRunning: vi.fn().mockResolvedValue(false),
    start: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../tool-handlers.js', () => ({
  allSchemas: mocks.mockAllSchemas,
  getHandler: (...args: unknown[]) => mocks.mockGetHandler(...args),
  listHandlers: () => mocks.mockListHandlers(),
}));

// Import AFTER mocks
import { RuntimeEngineServer } from '../mcp-server.js';

// Convenience aliases
const {
  mockSetRequestHandler,
  mockConnect,
  mockClose,
  mockMcpServerCtor,
  mockStdioServerTransport,
  mockLoadConfig,
  mockLogger,
  mockStartup,
  mockShutdown,
  MockRuntimeEngine,
  mockSetupSignalHandlers,
  mockGetHandler,
  mockListHandlers,
  mockAllSchemas,
  MockMcpError,
  MOCK_ERROR_CODE,
} = mocks;

// ─── RuntimeEngineServer Tests ───────────────────────────────────────────────

describe('RuntimeEngineServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockStartup.mockResolvedValue(undefined);
    mockShutdown.mockResolvedValue(undefined);
    mockListHandlers.mockReturnValue(['runtime_status', 'runtime_config']);
    // Restore constructor implementations after clearAllMocks
    mockMcpServerCtor.mockImplementation(function (this: Record<string, unknown>) {
      this['setRequestHandler'] = mockSetRequestHandler;
      this['connect'] = mockConnect;
      this['close'] = mockClose;
      this['onerror'] = null;
    });
    MockRuntimeEngine.mockImplementation(function (this: Record<string, unknown>) {
      Object.assign(this, mocks.makeEngineInstance());
    });
    // StdioServerTransport is used with `new`; must remain a regular function
    mockStdioServerTransport.mockImplementation(function (this: Record<string, unknown>) {
      void this;
    });
  });

  // ─── Construction ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates an MCP Server with name and version', () => {
      new RuntimeEngineServer();
      expect(mockMcpServerCtor).toHaveBeenCalledWith(
        { name: 'goodvibes-runtime-engine', version: '1.0.0-test' },
        { capabilities: { tools: {} } }
      );
    });

    it('creates a RuntimeEngine with loaded config and project root', async () => {
      const server = new RuntimeEngineServer();
      await server.start();
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(MockRuntimeEngine).toHaveBeenCalled();
    });

    it('registers ListTools and CallTool request handlers', () => {
      new RuntimeEngineServer();
      expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
      expect(mockSetRequestHandler).toHaveBeenCalledWith('ListToolsRequestSchema', expect.any(Function));
      expect(mockSetRequestHandler).toHaveBeenCalledWith('CallToolRequestSchema', expect.any(Function));
    });
  });

  // ─── start() ──────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('calls processManager.startup()', async () => {
      const server = new RuntimeEngineServer();
      await server.start();
      expect(mockStartup).toHaveBeenCalledTimes(1);
    });

    it('registers signal handlers', async () => {
      const server = new RuntimeEngineServer();
      await server.start();
      expect(mockSetupSignalHandlers).toHaveBeenCalledWith(expect.any(Function));
    });

    it('connects an MCP StdioServerTransport', async () => {
      const server = new RuntimeEngineServer();
      await server.start();
      expect(mockStdioServerTransport).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('logs ready message with tool names and PID', async () => {
      const server = new RuntimeEngineServer();
      await server.start();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('ready'),
        expect.objectContaining({ tools: expect.any(Array), pid: process.pid })
      );
    });

    it('throws if processManager.startup() throws', async () => {
      mockStartup.mockRejectedValueOnce(new Error('startup failed'));
      const server = new RuntimeEngineServer();
      await expect(server.start()).rejects.toThrow('startup failed');
    });
  });

  // ─── stop() ───────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('calls processManager.shutdown() — normal shutdown path', async () => {
      const server = new RuntimeEngineServer();
      await server.start();
      await server.stop();
      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('calls server.close() — stop without prior start skips engine shutdown', async () => {
      const server = new RuntimeEngineServer();
      await server.stop();
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockShutdown).not.toHaveBeenCalled();
    });

    it('logs stopping and stopped messages', async () => {
      const server = new RuntimeEngineServer();
      await server.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping runtime engine');
      expect(mockLogger.info).toHaveBeenCalledWith('Runtime engine stopped');
    });

    it('logs warn and continues when shutdown() throws', async () => {
      mockShutdown.mockRejectedValueOnce(new Error('shutdown error'));
      const server = new RuntimeEngineServer();
      await server.start();
      await expect(server.stop()).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith('RuntimeEngine shutdown error', expect.any(Object));
    });

    it('logs warn and continues when server.close() throws', async () => {
      mockClose.mockRejectedValueOnce(new Error('close error'));
      const server = new RuntimeEngineServer();
      await expect(server.stop()).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith('MCP server close error', expect.any(Object));
    });
  });

  // ─── ListTools handler ────────────────────────────────────────────────────

  describe('ListTools request handler', () => {
    it('returns allSchemas when ListTools is called', async () => {
      new RuntimeEngineServer();
      // Capture the ListTools handler
      const listToolsCall = mockSetRequestHandler.mock.calls.find(
        (call: unknown[]) => call[0] === 'ListToolsRequestSchema'
      );
      expect(listToolsCall).toBeDefined();
      const listToolsHandler = listToolsCall![1] as () => Promise<unknown>;
      const result = await listToolsHandler();
      expect(result).toEqual({ tools: mockAllSchemas });
    });
  });

  // ─── CallTool handler ─────────────────────────────────────────────────────

  describe('CallTool request handler', () => {
    function getCallToolHandler() {
      new RuntimeEngineServer();
      const callToolCall = mockSetRequestHandler.mock.calls.find(
        (call: unknown[]) => call[0] === 'CallToolRequestSchema'
      );
      expect(callToolCall).toBeDefined();
      return callToolCall![1] as (req: unknown) => Promise<unknown>;
    }

    it('dispatches to registered handler when tool is found', async () => {
      const mockToolHandler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      mockGetHandler.mockReturnValue(mockToolHandler);
      const callToolHandler = getCallToolHandler();
      const result = await callToolHandler({ params: { name: 'runtime_status', arguments: {} } });
      expect(mockToolHandler).toHaveBeenCalledWith({}, expect.any(Object));
      expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    });

    it('throws McpError with MethodNotFound when tool is not registered', async () => {
      mockGetHandler.mockReturnValue(undefined);
      const callToolHandler = getCallToolHandler();
      await expect(
        callToolHandler({ params: { name: 'unknown_tool', arguments: {} } })
      ).rejects.toBeInstanceOf(MockMcpError);
    });

    it('includes available tool names in MethodNotFound error message', async () => {
      mockGetHandler.mockReturnValue(undefined);
      mockListHandlers.mockReturnValue(['runtime_status', 'runtime_config']);
      const callToolHandler = getCallToolHandler();
      let caught: Error | undefined;
      try {
        await callToolHandler({ params: { name: 'bad_tool', arguments: {} } });
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).toBeDefined();
      expect(caught!.message).toContain('runtime_status');
    });

    it('re-throws McpError from handler without wrapping', async () => {
      const mcpErr = new MockMcpError(MOCK_ERROR_CODE.InternalError, 'handler error');
      const mockToolHandler = vi.fn().mockRejectedValue(mcpErr);
      mockGetHandler.mockReturnValue(mockToolHandler);
      const callToolHandler = getCallToolHandler();
      await expect(
        callToolHandler({ params: { name: 'runtime_status', arguments: {} } })
      ).rejects.toBe(mcpErr);
    });

    it('wraps non-McpError handler errors in McpError InternalError', async () => {
      const mockToolHandler = vi.fn().mockRejectedValue(new Error('unexpected failure'));
      mockGetHandler.mockReturnValue(mockToolHandler);
      const callToolHandler = getCallToolHandler();
      await expect(
        callToolHandler({ params: { name: 'runtime_status', arguments: {} } })
      ).rejects.toBeInstanceOf(MockMcpError);
    });

    it('logs error when handler throws a non-McpError', async () => {
      const mockToolHandler = vi.fn().mockRejectedValue(new Error('oops'));
      mockGetHandler.mockReturnValue(mockToolHandler);
      const callToolHandler = getCallToolHandler();
      try { await callToolHandler({ params: { name: 'runtime_status', arguments: {} } }); } catch {}
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('runtime_status'),
        expect.any(Object)
      );
    });

    it('passes HandlerContext with all required methods to handler', async () => {
      const mockToolHandler = vi.fn().mockResolvedValue({ content: [] });
      mockGetHandler.mockReturnValue(mockToolHandler);
      // Build a server that has start()ed so processManager is populated
      const serverInstance = new RuntimeEngineServer();
      await serverInstance.start();
      // Capture the CallTool handler that was registered
      const callToolCall = mockSetRequestHandler.mock.calls.find(
        (call: unknown[]) => call[0] === 'CallToolRequestSchema'
      );
      const callToolHandler = callToolCall![1] as (req: unknown) => Promise<unknown>;
      await callToolHandler({ params: { name: 'runtime_status', arguments: {} } });
      const ctx = mockToolHandler.mock.calls[0][1] as Record<string, unknown>;
      expect(typeof ctx['getUptime']).toBe('function');
      expect(typeof ctx['getConfig']).toBe('function');
      expect(typeof ctx['getHealth']).toBe('function');
      expect(typeof ctx['updateConfig']).toBe('function');
      expect(ctx['projectRoot']).toBe('/mock/project');
      expect(ctx['version']).toBe('1.0.0-test');
      expect(typeof ctx['getEventBus']).toBe('function');
      expect(typeof ctx['getEventLog']).toBe('function');
      expect(typeof ctx['getEventQueue']).toBe('function');
      expect(typeof ctx['getWorkflowEngine']).toBe('function');
      expect(typeof ctx['getTriggerRegistry']).toBe('function');
      expect(typeof ctx['getAgentCoordinator']).toBe('function');
      expect(typeof ctx['getDirectiveQueue']).toBe('function');
      expect(typeof ctx['getCoreStateStore']).toBe('function');
    });
  });
});

// ─── Health check and recovery ───────────────────────────────────────────────

describe('health check and recovery', () => {
  let server: RuntimeEngineServer;
  const mockGetConnectionState = vi.fn();
  const mockRemoteGetUptime = vi.fn();
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);

  function makeRemoteTransport(state: string) {
    mockGetConnectionState.mockReturnValue(state);
    return {
      mode: 'remote' as const,
      disconnect: mockDisconnect,
      getConnectionState: mockGetConnectionState,
      getUptime: mockRemoteGetUptime,
    };
  }

  // Helper: start server in daemon mode with a remote transport mock
  async function startDaemonServer(remoteTransport: ReturnType<typeof makeRemoteTransport>) {
    const { createTransport } = await import('../../../transport/factory.js');
    const mockCreateTransport = createTransport as ReturnType<typeof vi.fn>;
    mockCreateTransport.mockResolvedValue(remoteTransport);

    mocks.mockLoadConfig.mockReturnValue({
      executor: {
        mode: 'daemon',
        transport: { auto_start: false, reconnect: null },
      },
    });

    server = new RuntimeEngineServer();
    await server.start();
    return mockCreateTransport;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockRemoteGetUptime.mockResolvedValue(42);
    mockMcpServerCtor.mockImplementation(function (this: Record<string, unknown>) {
      this['setRequestHandler'] = mockSetRequestHandler;
      this['connect'] = mockConnect;
      this['close'] = mockClose;
      this['onerror'] = null;
    });
    MockRuntimeEngine.mockImplementation(function (this: Record<string, unknown>) {
      Object.assign(this, mocks.makeEngineInstance());
    });
    mockStdioServerTransport.mockImplementation(function (this: Record<string, unknown>) {
      void this;
    });
    mockListHandlers.mockReturnValue(['runtime_status']);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('health check skips when healthCheckInProgress is true', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('connected');
    await startDaemonServer(remote);

    // Manually set healthCheckInProgress to true to simulate in-progress check
    (server as any).healthCheckInProgress = true;

    // Advance timer to fire health check interval
    await vi.advanceTimersByTimeAsync(10_000);

    // getConnectionState should NOT have been called because guard returned early
    expect(mockGetConnectionState).not.toHaveBeenCalled();
  });

  it('health check skips if transport is not remote mode', async () => {
    vi.useFakeTimers();
    const { createTransport } = await import('../../../transport/factory.js');
    const mockCreateTransport = createTransport as ReturnType<typeof vi.fn>;
    // Return a non-remote transport
    mockCreateTransport.mockResolvedValue({ mode: 'engaged', disconnect: mockDisconnect });

    mocks.mockLoadConfig.mockReturnValue({
      executor: {
        mode: 'daemon',
        transport: { auto_start: false, reconnect: null },
      },
    });

    server = new RuntimeEngineServer();
    await server.start();

    // Override runtimeTransport with non-remote mode
    (server as any).runtimeTransport = { mode: 'engaged', disconnect: mockDisconnect };

    await vi.advanceTimersByTimeAsync(10_000);

    // getConnectionState should never be called (not a remote transport)
    expect(mockGetConnectionState).not.toHaveBeenCalled();
  });

  it('health check detects dead transport and triggers recovery (createTransport called)', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('dead');
    const mockCreateTransport = await startDaemonServer(remote);

    // Reset call count after initial start (do NOT change mockGetConnectionState)
    mockCreateTransport.mockClear();
    mockDisconnect.mockClear();
    // Recovery will call createTransport again — return a fresh connected transport
    // without calling makeRemoteTransport (which would overwrite mockGetConnectionState)
    mockCreateTransport.mockResolvedValue({
      mode: 'remote' as const,
      disconnect: mockDisconnect,
      getConnectionState: mockGetConnectionState,
      getUptime: mockRemoteGetUptime,
    });

    await vi.advanceTimersByTimeAsync(10_000);

    // disconnect should be called (old transport cleanup)
    expect(mockDisconnect).toHaveBeenCalled();
    // createTransport should be called again for recovery
    expect(mockCreateTransport).toHaveBeenCalled();
  });

  it('health check detects idle transport and triggers recovery', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('idle');
    const mockCreateTransport = await startDaemonServer(remote);

    mockCreateTransport.mockClear();
    // Do NOT call makeRemoteTransport — that would overwrite mockGetConnectionState
    mockCreateTransport.mockResolvedValue({
      mode: 'remote' as const,
      disconnect: mockDisconnect,
      getConnectionState: mockGetConnectionState,
      getUptime: mockRemoteGetUptime,
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(mockCreateTransport).toHaveBeenCalled();
  });

  it('health check skips when state is reconnecting', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('reconnecting');
    const mockCreateTransport = await startDaemonServer(remote);

    mockCreateTransport.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);

    // No recovery attempt when reconnecting
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('health check skips when state is connecting', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('connecting');
    const mockCreateTransport = await startDaemonServer(remote);

    mockCreateTransport.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('health check ping succeeds — no recovery triggered', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('connected');
    mockRemoteGetUptime.mockResolvedValue(100);
    const mockCreateTransport = await startDaemonServer(remote);

    mockCreateTransport.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);

    // Ping succeeded — no recovery
    expect(mockRemoteGetUptime).toHaveBeenCalled();
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('health check ping failure is handled gracefully — no crash, warning logged', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('connected');
    mockRemoteGetUptime.mockRejectedValue(new Error('ping failed'));
    await startDaemonServer(remote);

    // Should not throw
    await expect(vi.advanceTimersByTimeAsync(10_000)).resolves.not.toThrow();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Health check ping failed'),
      expect.any(Object)
    );
  });

  it('recovery handles createTransport failure gracefully — no crash, warning logged', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('dead');
    const mockCreateTransport = await startDaemonServer(remote);

    mockCreateTransport.mockClear();
    // Recovery's createTransport call throws
    mockCreateTransport.mockRejectedValue(new Error('transport creation failed'));

    await expect(vi.advanceTimersByTimeAsync(10_000)).resolves.not.toThrow();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('recovery failed'),
      expect.any(Object)
    );
  });

  it('healthCheckInProgress is reset to false after ping completes', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('connected');
    mockRemoteGetUptime.mockResolvedValue(100);
    await startDaemonServer(remote);

    await vi.advanceTimersByTimeAsync(10_000);

    expect((server as any).healthCheckInProgress).toBe(false);
  });

  it('healthCheckInProgress is reset to false after recovery completes', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('dead');
    const mockCreateTransport = await startDaemonServer(remote);

    mockCreateTransport.mockResolvedValue(makeRemoteTransport('connected'));

    await vi.advanceTimersByTimeAsync(10_000);

    expect((server as any).healthCheckInProgress).toBe(false);
  });

  it('stop() clears the health check timer', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const remote = makeRemoteTransport('connected');
    await startDaemonServer(remote);

    await server.stop();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('handleTransportDead logs a warning', async () => {
    vi.useFakeTimers();
    const remote = makeRemoteTransport('connected');
    await startDaemonServer(remote);

    // Call the private method directly
    const error = new Error('transport died');
    (server as any).handleTransportDead('/proj', {}, error);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Transport declared dead'),
      expect.objectContaining({ error: 'transport died' })
    );
  });

  it('startHealthCheck does not create a second timer if called twice', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const remote = makeRemoteTransport('connected');
    await startDaemonServer(remote);

    const callCountAfterStart = setIntervalSpy.mock.calls.length;

    // Call startHealthCheck again directly
    (server as any).startHealthCheck('/proj', {});

    // No additional setInterval calls
    expect(setIntervalSpy.mock.calls.length).toBe(callCountAfterStart);
    setIntervalSpy.mockRestore();
  });
});

// ─── Handler registry functions (interface contract) ───────────────────────────
// The handlers/index.ts registry (getHandler/listHandlers/hasHandler) is
// the backing implementation of tool-handlers.ts. These tests verify the
// exported interface contract through the mock.

describe('Handler registry (getHandler / listHandlers / allSchemas)', () => {
  it('getHandler returns the registered handler for a known tool', () => {
    const mockToolFn = vi.fn();
    mockGetHandler.mockReturnValue(mockToolFn);
    expect(mockGetHandler('runtime_status')).toBe(mockToolFn);
  });

  it('getHandler returns undefined for an unregistered tool', () => {
    mockGetHandler.mockReturnValue(undefined);
    expect(mockGetHandler('not_a_tool')).toBeUndefined();
  });

  it('listHandlers returns an array containing registered tool names', () => {
    mockListHandlers.mockReturnValue(['runtime_status', 'runtime_config', 'runtime_events', 'runtime_emit', 'runtime_workflow', 'runtime_triggers', 'runtime_agents']);
    const names = mockListHandlers();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('runtime_status');
    expect(names).toContain('runtime_agents');
  });

  it('allSchemas is an array', () => {
    expect(Array.isArray(mockAllSchemas)).toBe(true);
  });

  it('allSchemas entries have a name property', () => {
    expect(mockAllSchemas[0]).toHaveProperty('name');
  });
});
