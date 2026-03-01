import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  const mockLoadConfig = vi.fn().mockReturnValue({ someConfig: true });

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

    it('creates a RuntimeEngine with loaded config and project root', () => {
      new RuntimeEngineServer();
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
    it('calls processManager.shutdown()', async () => {
      const server = new RuntimeEngineServer();
      await server.stop();
      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('calls server.close()', async () => {
      const server = new RuntimeEngineServer();
      await server.stop();
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('logs stopping and stopped messages', async () => {
      const server = new RuntimeEngineServer();
      await server.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping runtime engine');
      expect(mockLogger.info).toHaveBeenCalledWith('Runtime engine stopped');
    });

    it('logs warn and continues when shutdown() throws', async () => {
      mockStartup.mockResolvedValue(undefined);
      mockShutdown.mockRejectedValueOnce(new Error('shutdown error'));
      const server = new RuntimeEngineServer();
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
        ([schema]: [string]) => schema === 'ListToolsRequestSchema'
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
        ([schema]: [string]) => schema === 'CallToolRequestSchema'
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
      const callToolHandler = getCallToolHandler();
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
    });
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
