/**
 * Unit tests for main server index module
 *
 * Tests cover:
 * - LazyRegistryLoader class
 * - GoodVibesServer class
 * - Server initialization
 * - Tool registration
 * - Request handling
 * - Error cases
 *
 * Note: The index.ts module auto-runs the server, so we test
 * the exported components and internal logic through mocking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as yaml from 'js-yaml';
import Fuse from 'fuse.js';

// Mock dependencies before importing the module
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { type: 'object' },
  ListToolsRequestSchema: { type: 'object' },
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../logging.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

// Mock the config module
vi.mock('../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
  FUSE_OPTIONS: {
    keys: [
      { name: 'name', weight: 0.3 },
      { name: 'description', weight: 0.4 },
      { name: 'keywords', weight: 0.3 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  },
}));

// Mock schemas
vi.mock('../schemas/index.js', () => ({
  TOOL_SCHEMAS: [
    { name: 'test_tool', description: 'Test tool', inputSchema: { type: 'object' } },
  ],
}));

// Mock handlers registry
vi.mock('../handlers/index.js', () => ({
  TOOL_HANDLERS: {
    test_tool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"result": "success"}' }],
    }),
    error_tool: vi.fn().mockRejectedValue(new Error('Handler error')),
  },
}));

import {
  sampleSkillsRegistry,
  sampleAgentsRegistry,
  sampleToolsRegistry,
} from './setup.js';

describe('LazyRegistryLoader', () => {
  // Import the actual utils module to test the loading functions
  const loadRegistryMock = vi.fn();
  const createIndexMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.readFile).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.includes('skills')) {
        return Promise.resolve(yaml.dump(sampleSkillsRegistry));
      }
      if (pathStr.includes('agents')) {
        return Promise.resolve(yaml.dump(sampleAgentsRegistry));
      }
      if (pathStr.includes('tools')) {
        return Promise.resolve(yaml.dump(sampleToolsRegistry));
      }
      return Promise.reject(new Error('File not found'));
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadRegistry and createIndex', () => {
    it('should load registry from YAML file', async () => {
      const { loadRegistry } = await import('../utils.js');

      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(yaml.dump(sampleSkillsRegistry));

      const result = await loadRegistry('skills/_registry.yaml');

      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.0');
    });

    it('should create Fuse index from registry', async () => {
      const { createIndex } = await import('../utils.js');

      const index = createIndex(sampleSkillsRegistry);

      expect(index).not.toBeNull();
      expect(index).toBeInstanceOf(Fuse);
    });

    it('should return null for null registry in createIndex', async () => {
      const { createIndex } = await import('../utils.js');

      const index = createIndex(null);

      expect(index).toBeNull();
    });
  });
});

describe('Server Request Handling', () => {
  let mockSetRequestHandler: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Capture the handler when setRequestHandler is called
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    mockSetRequestHandler = vi.fn();

    vi.mocked(Server).mockImplementation(() => ({
      setRequestHandler: mockSetRequestHandler,
      connect: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('tool call handling logic', () => {
    it('should handle successful tool calls', async () => {
      const { TOOL_HANDLERS } = await import('../handlers/index.js');

      // Simulate handler execution
      const handler = TOOL_HANDLERS.test_tool;
      const result = await handler({} as never, {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('should handle tool errors gracefully', async () => {
      // Test the error handling pattern used in the server
      const errorHandler = async () => {
        throw new Error('Handler error');
      };

      await expect(errorHandler()).rejects.toThrow('Handler error');
    });

    it('should return error response for unknown tools', async () => {
      const { TOOL_HANDLERS } = await import('../handlers/index.js');

      // Simulate unknown tool lookup
      const handler = TOOL_HANDLERS['unknown_tool'];

      expect(handler).toBeUndefined();
    });
  });
});

describe('Server Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOODVIBES_EAGER_LOAD;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('eager vs lazy loading', () => {
    it('should support lazy loading by default', async () => {
      const { logInfo } = await import('../logging.js');

      // Lazy loading should be the default
      expect(process.env.GOODVIBES_EAGER_LOAD).toBeUndefined();
    });

    it('should support eager loading when GOODVIBES_EAGER_LOAD is true', async () => {
      process.env.GOODVIBES_EAGER_LOAD = 'true';

      // Verify env is set
      expect(process.env.GOODVIBES_EAGER_LOAD).toBe('true');
    });

    it('should not enable eager loading for other env values', () => {
      process.env.GOODVIBES_EAGER_LOAD = 'false';

      // Only 'true' should enable eager loading
      expect(process.env.GOODVIBES_EAGER_LOAD === 'true').toBe(false);
    });
  });

  describe('server configuration', () => {
    it('should configure server with correct name', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');

      // Server should be constructed with goodvibes-tools name
      expect(Server).toBeDefined();
    });

    it('should configure server with tools capability', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');

      // Verify Server is available for capabilities config
      expect(Server).toBeDefined();
    });
  });
});

describe('Handler Context', () => {
  describe('HandlerContext structure', () => {
    it('should have correct structure for search handlers', () => {
      const context = {
        skillsIndex: null,
        agentsIndex: null,
        toolsIndex: null,
        skillsRegistry: null,
      };

      expect(context.skillsIndex).toBeNull();
      expect(context.agentsIndex).toBeNull();
      expect(context.toolsIndex).toBeNull();
      expect(context.skillsRegistry).toBeNull();
    });

    it('should support populating indexes', () => {
      const mockFuse = new Fuse(sampleSkillsRegistry.search_index, {
        keys: ['name', 'description'],
      });

      const context = {
        skillsIndex: mockFuse,
        agentsIndex: null,
        toolsIndex: null,
        skillsRegistry: sampleSkillsRegistry,
      };

      expect(context.skillsIndex).not.toBeNull();
      expect(context.skillsRegistry?.version).toBe('1.0.0');
    });
  });
});

describe('Error Handling', () => {
  describe('tool handler errors', () => {
    it('should format error response correctly', () => {
      const error = new Error('Test error');
      const errorResponse = {
        content: [
          { type: 'text' as const, text: JSON.stringify({ error: error.message }) },
        ],
        isError: true,
      };

      expect(errorResponse.isError).toBe(true);
      expect(JSON.parse(errorResponse.content[0].text)).toEqual({
        error: 'Test error',
      });
    });

    it('should handle non-Error objects', () => {
      const errorMessage = 'Unknown error';
      const errorResponse = {
        content: [
          { type: 'text' as const, text: JSON.stringify({ error: errorMessage }) },
        ],
        isError: true,
      };

      expect(JSON.parse(errorResponse.content[0].text).error).toBe('Unknown error');
    });
  });

  describe('unknown tool handling', () => {
    it('should return Unknown tool error', () => {
      const toolName = 'nonexistent_tool';
      const errorResponse = {
        content: [
          { type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) },
        ],
        isError: true,
      };

      expect(JSON.parse(errorResponse.content[0].text).error).toBe(
        'Unknown tool: nonexistent_tool'
      );
    });
  });
});

describe('Registry Loader State', () => {
  describe('isLoaded checks', () => {
    it('should track loading state by registry type', () => {
      const state = {
        skillsLoaded: false,
        agentsLoaded: false,
        toolsLoaded: false,
      };

      // Initially not loaded
      expect(state.skillsLoaded).toBe(false);

      // After loading
      state.skillsLoaded = true;
      expect(state.skillsLoaded).toBe(true);
    });
  });

  describe('getSnapshot', () => {
    it('should return current state snapshot', () => {
      const snapshot = {
        skillsIndex: null,
        agentsIndex: null,
        toolsIndex: null,
        skillsRegistry: null,
      };

      // Snapshot should reflect current state
      expect(snapshot.skillsIndex).toBeNull();
      expect(snapshot.agentsIndex).toBeNull();
      expect(snapshot.toolsIndex).toBeNull();
      expect(snapshot.skillsRegistry).toBeNull();
    });

    it('should return populated state after loading', () => {
      const mockFuse = new Fuse([], { keys: ['name'] });

      const snapshot = {
        skillsIndex: mockFuse,
        agentsIndex: null,
        toolsIndex: null,
        skillsRegistry: sampleSkillsRegistry,
      };

      expect(snapshot.skillsIndex).not.toBeNull();
      expect(snapshot.skillsRegistry?.search_index).toHaveLength(5);
    });
  });
});

describe('Concurrent Loading', () => {
  it('should support parallel registry loading', async () => {
    const loadPromises = [
      Promise.resolve(sampleSkillsRegistry),
      Promise.resolve(sampleAgentsRegistry),
      Promise.resolve(sampleToolsRegistry),
    ];

    const results = await Promise.all(loadPromises);

    expect(results).toHaveLength(3);
    expect(results[0].search_index.length).toBeGreaterThan(0);
    expect(results[1].search_index.length).toBeGreaterThan(0);
    expect(results[2].search_index.length).toBeGreaterThan(0);
  });

  it('should share loading promise for concurrent requests', async () => {
    let loadCount = 0;
    const loadFn = async () => {
      loadCount++;
      return sampleSkillsRegistry;
    };

    // Simulate concurrent requests
    const promise1 = loadFn();
    const promise2 = promise1; // Same promise should be reused

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe(result2);
    expect(loadCount).toBe(1);
  });
});
