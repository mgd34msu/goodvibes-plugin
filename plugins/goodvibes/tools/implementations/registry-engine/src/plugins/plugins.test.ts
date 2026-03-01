/**
 * Comprehensive tests for the L3 plugins layer of registry-engine.
 *
 * Covers:
 * - dispatch.ts: DISPATCH_TABLE, getDispatcher, hasDispatcher, listTools
 * - schemas.ts: TOOL_SCHEMAS structure and completeness
 * - server.ts: bootstrap(), MCP server wiring, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted values — available in vi.mock() factories because vi.hoisted()
// runs before hoisting occurs. ALL variables referenced inside vi.mock()
// factories must come from here.
// ---------------------------------------------------------------------------

const {
  mockSetRequestHandler,
  mockConnect,
  mockClose,
  mockServerInstance,
  MockServer,
  mockTransportInstance,
  MockStdioServerTransport,
  ErrorCode,
  McpError,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = vi.hoisted(() => {
  const mockSetRequestHandler = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockServerInstance = {
    setRequestHandler: mockSetRequestHandler,
    connect: mockConnect,
    close: mockClose,
    onerror: undefined as ((error: Error) => void) | undefined,
  };
  // Use a spied class so 'new Server()' works correctly in production code
  const MockServer = vi.fn(function MockServerCtor() {
    return mockServerInstance;
  });

  const mockTransportInstance = {};
  const MockStdioServerTransport = vi.fn(function MockTransportCtor() {
    return mockTransportInstance;
  });

  // MCP type stubs — must be in hoisted so the types.js mock factory can reference them
  const ErrorCode = {
    MethodNotFound: -32601,
    InternalError: -32603,
  };

  class McpError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
      this.name = 'McpError';
    }
  }

  const CallToolRequestSchema = 'CallToolRequestSchema';
  const ListToolsRequestSchema = 'ListToolsRequestSchema';

  return {
    mockSetRequestHandler,
    mockConnect,
    mockClose,
    mockServerInstance,
    MockServer,
    mockTransportInstance,
    MockStdioServerTransport,
    ErrorCode,
    McpError,
    CallToolRequestSchema,
    ListToolsRequestSchema,
  };
});

// ---------------------------------------------------------------------------
// Module mocks — declared before imports (vi hoists these automatically)
// ---------------------------------------------------------------------------

// Mock L2 extension functions to isolate L3 dispatch logic
vi.mock('../extensions/search.js', () => ({
  searchSkills: vi.fn(),
  searchAgents: vi.fn(),
  searchTools: vi.fn(),
}));

vi.mock('../extensions/recommendations.js', () => ({
  recommendSkills: vi.fn(),
}));

vi.mock('../extensions/content.js', () => ({
  getSkillContent: vi.fn(),
  getAgentContent: vi.fn(),
}));

vi.mock('../extensions/dependencies.js', () => ({
  analyzeDependencies: vi.fn(),
}));

// Mock the loader so RegistryIndexCache doesn't do real filesystem I/O.
// Use a regular function (not arrow) so 'new RegistryIndexCache()' works.
vi.mock('../extensions/loader.js', () => ({
  RegistryIndexCache: vi.fn(function RegistryIndexCacheCtor() {
    return {
      warmAll: vi.fn().mockResolvedValue(undefined),
      getContext: vi.fn().mockResolvedValue({
        skillsIndex: null,
        agentsIndex: null,
        toolsIndex: null,
        skillsRegistry: null,
      }),
    };
  }),
}));

// Mock the MCP SDK server — reference hoisted values
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: MockServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: MockStdioServerTransport,
}));

// Mock MCP types — reference hoisted values
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ErrorCode,
  McpError,
  CallToolRequestSchema,
  ListToolsRequestSchema,
}));

// Mock shared modules to prevent config/logger side effects
vi.mock('../shared/constants.js', () => ({
  SERVER_NAME: 'registry-engine',
  SERVER_VERSION: '1.0.0',
}));

vi.mock('../shared/config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
}));

vi.mock('../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    request: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  DISPATCH_TABLE,
  getDispatcher,
  hasDispatcher,
  listTools,
} from './dispatch.js';
import type { ToolDispatcher } from './dispatch.js';
import { TOOL_SCHEMAS } from './schemas.js';
import { bootstrap } from './server.js';

import { searchSkills, searchAgents, searchTools } from '../extensions/search.js';
import { recommendSkills } from '../extensions/recommendations.js';
import { getSkillContent, getAgentContent } from '../extensions/content.js';
import { analyzeDependencies } from '../extensions/dependencies.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ALL_TOOL_NAMES = [
  'search_skills',
  'search_agents',
  'search_tools',
  'recommend_skills',
  'get_skill_content',
  'get_agent_content',
  'skill_dependencies',
] as const;

const makeContext = () => ({
  skillsIndex: null as null,
  agentsIndex: null as null,
  toolsIndex: null as null,
  skillsRegistry: null as null,
});

const mockMcpResponse = { content: [{ type: 'text' as const, text: 'ok' }] };

// ---------------------------------------------------------------------------
// SECTION 1: schemas.ts
// ---------------------------------------------------------------------------

describe('TOOL_SCHEMAS', () => {
  it('is an array', () => {
    expect(Array.isArray(TOOL_SCHEMAS)).toBe(true);
  });

  it('contains exactly 7 schema definitions', () => {
    expect(TOOL_SCHEMAS).toHaveLength(7);
  });

  it('contains entries for all expected tool names', () => {
    const names = TOOL_SCHEMAS.map((s) => s.name);
    for (const toolName of ALL_TOOL_NAMES) {
      expect(names).toContain(toolName);
    }
  });

  it('has no duplicate tool names', () => {
    const names = TOOL_SCHEMAS.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  describe.each(ALL_TOOL_NAMES)('schema for %s', (toolName) => {
    const schema = TOOL_SCHEMAS.find((s) => s.name === toolName)!;

    it('has a non-empty description', () => {
      expect(typeof schema.description).toBe('string');
      expect(schema.description.length).toBeGreaterThan(0);
    });

    it('has an inputSchema with type object', () => {
      expect(schema.inputSchema).toBeDefined();
      expect(schema.inputSchema.type).toBe('object');
    });

    it('has inputSchema.properties defined', () => {
      expect(schema.inputSchema.properties).toBeDefined();
      expect(typeof schema.inputSchema.properties).toBe('object');
    });

    it('has at least one required field', () => {
      expect(Array.isArray(schema.inputSchema.required)).toBe(true);
      expect((schema.inputSchema.required as string[]).length).toBeGreaterThan(0);
    });
  });

  describe('schema-specific required fields', () => {
    it('search_skills requires query', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'search_skills')!;
      expect(s.inputSchema.required).toContain('query');
    });

    it('search_agents requires query', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'search_agents')!;
      expect(s.inputSchema.required).toContain('query');
    });

    it('search_tools requires query', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'search_tools')!;
      expect(s.inputSchema.required).toContain('query');
    });

    it('recommend_skills requires task', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'recommend_skills')!;
      expect(s.inputSchema.required).toContain('task');
    });

    it('get_skill_content requires path', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'get_skill_content')!;
      expect(s.inputSchema.required).toContain('path');
    });

    it('get_agent_content requires path', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'get_agent_content')!;
      expect(s.inputSchema.required).toContain('path');
    });

    it('skill_dependencies requires skill', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'skill_dependencies')!;
      expect(s.inputSchema.required).toContain('skill');
    });
  });

  describe('optional fields are present in properties', () => {
    it('search_skills has category and limit properties', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'search_skills')!;
      expect(s.inputSchema.properties).toHaveProperty('category');
      expect(s.inputSchema.properties).toHaveProperty('limit');
    });

    it('search_agents has limit property', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'search_agents')!;
      expect(s.inputSchema.properties).toHaveProperty('limit');
    });

    it('search_tools has limit property', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'search_tools')!;
      expect(s.inputSchema.properties).toHaveProperty('limit');
    });

    it('recommend_skills has max_results property', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'recommend_skills')!;
      expect(s.inputSchema.properties).toHaveProperty('max_results');
    });

    it('skill_dependencies has depth and include_optional properties', () => {
      const s = TOOL_SCHEMAS.find((x) => x.name === 'skill_dependencies')!;
      expect(s.inputSchema.properties).toHaveProperty('depth');
      expect(s.inputSchema.properties).toHaveProperty('include_optional');
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 2: dispatch.ts — lookup functions
// ---------------------------------------------------------------------------

describe('dispatch: hasDispatcher()', () => {
  it('returns true for all 7 registered tools', () => {
    for (const name of ALL_TOOL_NAMES) {
      expect(hasDispatcher(name)).toBe(true);
    }
  });

  it('returns false for an unknown tool name', () => {
    expect(hasDispatcher('unknown_tool')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasDispatcher('')).toBe(false);
  });

  it('returns false for a tool name with typo', () => {
    expect(hasDispatcher('search_skill')).toBe(false);
  });
});

describe('dispatch: getDispatcher()', () => {
  it('returns a function for each registered tool', () => {
    for (const name of ALL_TOOL_NAMES) {
      const dispatcher = getDispatcher(name);
      expect(typeof dispatcher).toBe('function');
    }
  });

  it('returns undefined for an unknown tool name', () => {
    expect(getDispatcher('not_a_tool')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getDispatcher('')).toBeUndefined();
  });
});

describe('dispatch: listTools()', () => {
  it('returns an array', () => {
    expect(Array.isArray(listTools())).toBe(true);
  });

  it('returns exactly 7 tool names', () => {
    expect(listTools()).toHaveLength(7);
  });

  it('contains all expected tool names', () => {
    const tools = listTools();
    for (const name of ALL_TOOL_NAMES) {
      expect(tools).toContain(name);
    }
  });

  it('returns strings only', () => {
    for (const name of listTools()) {
      expect(typeof name).toBe('string');
    }
  });
});

describe('dispatch: DISPATCH_TABLE', () => {
  it('is a plain object', () => {
    expect(typeof DISPATCH_TABLE).toBe('object');
    expect(DISPATCH_TABLE).not.toBeNull();
  });

  it('has an entry for every tool name in listTools()', () => {
    for (const name of listTools()) {
      expect(DISPATCH_TABLE).toHaveProperty(name);
    }
  });

  it('has exactly 7 entries', () => {
    expect(Object.keys(DISPATCH_TABLE)).toHaveLength(7);
  });

  it('has function values for all entries', () => {
    for (const [, fn] of Object.entries(DISPATCH_TABLE)) {
      expect(typeof fn).toBe('function');
    }
  });

  it('tool names in DISPATCH_TABLE match TOOL_SCHEMAS names', () => {
    const dispatchNames = new Set(Object.keys(DISPATCH_TABLE));
    const schemaNames = new Set(TOOL_SCHEMAS.map((s) => s.name));
    expect(dispatchNames).toEqual(schemaNames);
  });
});

// ---------------------------------------------------------------------------
// SECTION 3: dispatch.ts — individual dispatcher behavior
// ---------------------------------------------------------------------------

describe('dispatch: search_skills dispatcher', () => {
  beforeEach(() => vi.mocked(searchSkills).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls searchSkills with ctx.skillsIndex and extracted args', async () => {
    const ctx = makeContext();
    const dispatcher = getDispatcher('search_skills')!;
    await dispatcher(ctx, { query: 'testing' });

    expect(searchSkills).toHaveBeenCalledWith(ctx.skillsIndex, { query: 'testing', limit: undefined, category: undefined });
  });

  it('passes limit when provided as number', async () => {
    const ctx = makeContext();
    await getDispatcher('search_skills')!(ctx, { query: 'auth', limit: 10 });

    expect(searchSkills).toHaveBeenCalledWith(ctx.skillsIndex, { query: 'auth', limit: 10, category: undefined });
  });

  it('passes category when provided as string', async () => {
    const ctx = makeContext();
    await getDispatcher('search_skills')!(ctx, { query: 'auth', category: 'outcome' });

    expect(searchSkills).toHaveBeenCalledWith(ctx.skillsIndex, { query: 'auth', limit: undefined, category: 'outcome' });
  });

  it('ignores limit when not a number', async () => {
    const ctx = makeContext();
    await getDispatcher('search_skills')!(ctx, { query: 'auth', limit: 'five' });

    expect(searchSkills).toHaveBeenCalledWith(ctx.skillsIndex, { query: 'auth', limit: undefined, category: undefined });
  });

  it('ignores category when not a string', async () => {
    const ctx = makeContext();
    await getDispatcher('search_skills')!(ctx, { query: 'auth', category: 42 });

    expect(searchSkills).toHaveBeenCalledWith(ctx.skillsIndex, { query: 'auth', limit: undefined, category: undefined });
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_skills')!(ctx, null)).rejects.toThrow(
      'Tool search_skills: args must be a non-null object'
    );
  });

  it('throws when args is not an object', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_skills')!(ctx, 'not-an-object')).rejects.toThrow(
      'Tool search_skills: args must be a non-null object'
    );
  });

  it('throws when args is an array', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_skills')!(ctx, [])).rejects.toThrow(
      'Tool search_skills: args must be a non-null object'
    );
  });

  it('throws when query is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_skills')!(ctx, {})).rejects.toThrow(
      "search_skills: 'query' must be a non-empty string"
    );
  });

  it('throws when query is empty string', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_skills')!(ctx, { query: '' })).rejects.toThrow(
      "search_skills: 'query' must be a non-empty string"
    );
  });

  it('throws when query is whitespace only', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_skills')!(ctx, { query: '   ' })).rejects.toThrow(
      "search_skills: 'query' must be a non-empty string"
    );
  });

  it('returns the value from searchSkills', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('search_skills')!(ctx, { query: 'testing' });
    expect(result).toBe(mockMcpResponse);
  });
});

describe('dispatch: search_agents dispatcher', () => {
  beforeEach(() => vi.mocked(searchAgents).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls searchAgents with ctx.agentsIndex and extracted args', async () => {
    const ctx = makeContext();
    await getDispatcher('search_agents')!(ctx, { query: 'tester' });

    expect(searchAgents).toHaveBeenCalledWith(ctx.agentsIndex, { query: 'tester', limit: undefined });
  });

  it('passes limit when provided as number', async () => {
    const ctx = makeContext();
    await getDispatcher('search_agents')!(ctx, { query: 'tester', limit: 3 });

    expect(searchAgents).toHaveBeenCalledWith(ctx.agentsIndex, { query: 'tester', limit: 3 });
  });

  it('ignores limit when not a number', async () => {
    const ctx = makeContext();
    await getDispatcher('search_agents')!(ctx, { query: 'tester', limit: true });

    expect(searchAgents).toHaveBeenCalledWith(ctx.agentsIndex, { query: 'tester', limit: undefined });
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_agents')!(ctx, null)).rejects.toThrow(
      'Tool search_agents: args must be a non-null object'
    );
  });

  it('throws when query is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_agents')!(ctx, {})).rejects.toThrow(
      "search_agents: 'query' must be a non-empty string"
    );
  });

  it('returns the value from searchAgents', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('search_agents')!(ctx, { query: 'tester' });
    expect(result).toBe(mockMcpResponse);
  });
});

describe('dispatch: search_tools dispatcher', () => {
  beforeEach(() => vi.mocked(searchTools).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls searchTools with ctx.toolsIndex and extracted args', async () => {
    const ctx = makeContext();
    await getDispatcher('search_tools')!(ctx, { query: 'file search' });

    expect(searchTools).toHaveBeenCalledWith(ctx.toolsIndex, { query: 'file search', limit: undefined });
  });

  it('passes limit when provided as number', async () => {
    const ctx = makeContext();
    await getDispatcher('search_tools')!(ctx, { query: 'file search', limit: 5 });

    expect(searchTools).toHaveBeenCalledWith(ctx.toolsIndex, { query: 'file search', limit: 5 });
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_tools')!(ctx, null)).rejects.toThrow(
      'Tool search_tools: args must be a non-null object'
    );
  });

  it('throws when query is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('search_tools')!(ctx, {})).rejects.toThrow(
      "search_tools: 'query' must be a non-empty string"
    );
  });

  it('returns the value from searchTools', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('search_tools')!(ctx, { query: 'file search' });
    expect(result).toBe(mockMcpResponse);
  });
});

describe('dispatch: recommend_skills dispatcher', () => {
  beforeEach(() => vi.mocked(recommendSkills).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls recommendSkills with ctx.skillsIndex and extracted args', async () => {
    const ctx = makeContext();
    await getDispatcher('recommend_skills')!(ctx, { task: 'build an API' });

    expect(recommendSkills).toHaveBeenCalledWith(ctx.skillsIndex, { task: 'build an API', max_results: undefined });
  });

  it('passes max_results when provided as number', async () => {
    const ctx = makeContext();
    await getDispatcher('recommend_skills')!(ctx, { task: 'build an API', max_results: 3 });

    expect(recommendSkills).toHaveBeenCalledWith(ctx.skillsIndex, { task: 'build an API', max_results: 3 });
  });

  it('ignores max_results when not a number', async () => {
    const ctx = makeContext();
    await getDispatcher('recommend_skills')!(ctx, { task: 'build an API', max_results: '3' });

    expect(recommendSkills).toHaveBeenCalledWith(ctx.skillsIndex, { task: 'build an API', max_results: undefined });
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('recommend_skills')!(ctx, null)).rejects.toThrow(
      'Tool recommend_skills: args must be a non-null object'
    );
  });

  it('throws when task is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('recommend_skills')!(ctx, {})).rejects.toThrow(
      "recommend_skills: 'task' must be a non-empty string"
    );
  });

  it('throws when task is empty string', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('recommend_skills')!(ctx, { task: '' })).rejects.toThrow(
      "recommend_skills: 'task' must be a non-empty string"
    );
  });

  it('returns the value from recommendSkills', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('recommend_skills')!(ctx, { task: 'build an API' });
    expect(result).toBe(mockMcpResponse);
  });
});

describe('dispatch: get_skill_content dispatcher', () => {
  beforeEach(() => vi.mocked(getSkillContent).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls getSkillContent with extracted path (ignores ctx)', async () => {
    const ctx = makeContext();
    await getDispatcher('get_skill_content')!(ctx, { path: 'skills/testing-strategy' });

    expect(getSkillContent).toHaveBeenCalledWith({ path: 'skills/testing-strategy' });
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('get_skill_content')!(ctx, null)).rejects.toThrow(
      'Tool get_skill_content: args must be a non-null object'
    );
  });

  it('throws when path is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('get_skill_content')!(ctx, {})).rejects.toThrow(
      "get_skill_content: 'path' must be a non-empty string"
    );
  });

  it('throws when path is empty string', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('get_skill_content')!(ctx, { path: '' })).rejects.toThrow(
      "get_skill_content: 'path' must be a non-empty string"
    );
  });

  it('returns the value from getSkillContent', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('get_skill_content')!(ctx, { path: 'skills/testing-strategy' });
    expect(result).toBe(mockMcpResponse);
  });
});

describe('dispatch: get_agent_content dispatcher', () => {
  beforeEach(() => vi.mocked(getAgentContent).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls getAgentContent with extracted path (ignores ctx)', async () => {
    const ctx = makeContext();
    await getDispatcher('get_agent_content')!(ctx, { path: 'agents/tester.md' });

    expect(getAgentContent).toHaveBeenCalledWith({ path: 'agents/tester.md' });
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('get_agent_content')!(ctx, null)).rejects.toThrow(
      'Tool get_agent_content: args must be a non-null object'
    );
  });

  it('throws when path is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('get_agent_content')!(ctx, {})).rejects.toThrow(
      "get_agent_content: 'path' must be a non-empty string"
    );
  });

  it('returns the value from getAgentContent', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('get_agent_content')!(ctx, { path: 'agents/tester.md' });
    expect(result).toBe(mockMcpResponse);
  });
});

describe('dispatch: skill_dependencies dispatcher', () => {
  beforeEach(() => vi.mocked(analyzeDependencies).mockResolvedValue(mockMcpResponse));
  afterEach(() => vi.clearAllMocks());

  it('calls analyzeDependencies with skillsIndex, skillsRegistry, and extracted args', async () => {
    const ctx = makeContext();
    await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy' });

    expect(analyzeDependencies).toHaveBeenCalledWith(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      { skill: 'testing-strategy', depth: undefined, include_optional: undefined }
    );
  });

  it('passes depth when provided as number', async () => {
    const ctx = makeContext();
    await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy', depth: 3 });

    expect(analyzeDependencies).toHaveBeenCalledWith(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      { skill: 'testing-strategy', depth: 3, include_optional: undefined }
    );
  });

  it('passes include_optional when provided as boolean false', async () => {
    const ctx = makeContext();
    await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy', include_optional: false });

    expect(analyzeDependencies).toHaveBeenCalledWith(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      { skill: 'testing-strategy', depth: undefined, include_optional: false }
    );
  });

  it('passes include_optional: true correctly', async () => {
    const ctx = makeContext();
    await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy', include_optional: true });

    expect(analyzeDependencies).toHaveBeenCalledWith(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      { skill: 'testing-strategy', depth: undefined, include_optional: true }
    );
  });

  it('ignores depth when not a number', async () => {
    const ctx = makeContext();
    await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy', depth: '2' });

    expect(analyzeDependencies).toHaveBeenCalledWith(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      { skill: 'testing-strategy', depth: undefined, include_optional: undefined }
    );
  });

  it('ignores include_optional when not a boolean', async () => {
    const ctx = makeContext();
    await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy', include_optional: 'yes' });

    expect(analyzeDependencies).toHaveBeenCalledWith(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      { skill: 'testing-strategy', depth: undefined, include_optional: undefined }
    );
  });

  it('throws when args is null', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('skill_dependencies')!(ctx, null)).rejects.toThrow(
      'Tool skill_dependencies: args must be a non-null object'
    );
  });

  it('throws when skill is missing', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('skill_dependencies')!(ctx, {})).rejects.toThrow(
      "skill_dependencies: 'skill' must be a non-empty string"
    );
  });

  it('throws when skill is empty string', async () => {
    const ctx = makeContext();
    await expect(getDispatcher('skill_dependencies')!(ctx, { skill: '' })).rejects.toThrow(
      "skill_dependencies: 'skill' must be a non-empty string"
    );
  });

  it('returns the value from analyzeDependencies', async () => {
    const ctx = makeContext();
    const result = await getDispatcher('skill_dependencies')!(ctx, { skill: 'testing-strategy' });
    expect(result).toBe(mockMcpResponse);
  });
});

// ---------------------------------------------------------------------------
// SECTION 4: server.ts — bootstrap() and MCP wiring
// ---------------------------------------------------------------------------

describe('server: bootstrap()', () => {
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  // Capture registered handlers by schema key for later invocation
  let registeredHandlers: Map<string, (request: Record<string, unknown>) => Promise<unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers = new Map();

    // Restore resolved value for async mocks (clearAllMocks resets these)
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);

    // Capture setRequestHandler calls so we can invoke them in tests
    mockSetRequestHandler.mockImplementation(
      (schema: string, handler: (req: Record<string, unknown>) => Promise<unknown>) => {
        registeredHandlers.set(schema, handler);
      }
    );

    // Spy on process.on to capture signal handlers without side-effects
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('creates a Server instance with correct name and version', async () => {
    await bootstrap();
    expect(MockServer).toHaveBeenCalledWith(
      { name: 'registry-engine', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
  });

  it('registers exactly 2 request handlers (ListTools and CallTool)', async () => {
    await bootstrap();
    expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
  });

  it('registers a ListTools handler using ListToolsRequestSchema', async () => {
    await bootstrap();
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      ListToolsRequestSchema,
      expect.any(Function)
    );
  });

  it('registers a CallTool handler using CallToolRequestSchema', async () => {
    await bootstrap();
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      CallToolRequestSchema,
      expect.any(Function)
    );
  });

  it('creates a StdioServerTransport and connects the server', async () => {
    await bootstrap();
    expect(MockStdioServerTransport).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith(mockTransportInstance);
  });

  describe('ListTools handler', () => {
    it('returns all 7 tool schemas', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(ListToolsRequestSchema)!;
      const result = await handler({});
      expect(result).toEqual({ tools: TOOL_SCHEMAS });
    });

    it('returns tools array with all expected names', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(ListToolsRequestSchema)!;
      const result = await handler({}) as { tools: Array<{ name: string }> };
      const names = result.tools.map((t) => t.name);
      for (const name of ALL_TOOL_NAMES) {
        expect(names).toContain(name);
      }
    });
  });

  describe('CallTool handler — successful dispatch', () => {
    beforeEach(() => {
      vi.mocked(searchSkills).mockResolvedValue(mockMcpResponse);
      vi.mocked(searchAgents).mockResolvedValue(mockMcpResponse);
      vi.mocked(searchTools).mockResolvedValue(mockMcpResponse);
      vi.mocked(recommendSkills).mockResolvedValue(mockMcpResponse);
      vi.mocked(getSkillContent).mockResolvedValue(mockMcpResponse);
      vi.mocked(getAgentContent).mockResolvedValue(mockMcpResponse);
      vi.mocked(analyzeDependencies).mockResolvedValue(mockMcpResponse);
    });

    it('dispatches search_skills and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'search_skills', arguments: { query: 'testing' } } });
      expect(result).toBe(mockMcpResponse);
      expect(searchSkills).toHaveBeenCalled();
    });

    it('dispatches search_agents and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'search_agents', arguments: { query: 'specialist' } } });
      expect(result).toBe(mockMcpResponse);
      expect(searchAgents).toHaveBeenCalled();
    });

    it('dispatches search_tools and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'search_tools', arguments: { query: 'grep' } } });
      expect(result).toBe(mockMcpResponse);
      expect(searchTools).toHaveBeenCalled();
    });

    it('dispatches recommend_skills and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'recommend_skills', arguments: { task: 'write tests' } } });
      expect(result).toBe(mockMcpResponse);
      expect(recommendSkills).toHaveBeenCalled();
    });

    it('dispatches get_skill_content and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'get_skill_content', arguments: { path: 'skills/testing' } } });
      expect(result).toBe(mockMcpResponse);
      expect(getSkillContent).toHaveBeenCalled();
    });

    it('dispatches get_agent_content and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'get_agent_content', arguments: { path: 'agents/tester.md' } } });
      expect(result).toBe(mockMcpResponse);
      expect(getAgentContent).toHaveBeenCalled();
    });

    it('dispatches skill_dependencies and returns result', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;
      const result = await handler({ params: { name: 'skill_dependencies', arguments: { skill: 'testing-strategy' } } });
      expect(result).toBe(mockMcpResponse);
      expect(analyzeDependencies).toHaveBeenCalled();
    });
  });

  describe('CallTool handler — unknown tool name', () => {
    it('throws McpError with MethodNotFound code for unknown tool', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'nonexistent_tool', arguments: {} } })
      ).rejects.toMatchObject({
        name: 'McpError',
        code: ErrorCode.MethodNotFound,
      });
    });

    it('includes the unknown tool name in the error message', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'bad_tool', arguments: {} } })
      ).rejects.toMatchObject({
        message: expect.stringContaining('bad_tool'),
      });
    });

    it('includes available tool names in the error message', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'bad_tool', arguments: {} } })
      ).rejects.toMatchObject({
        message: expect.stringContaining('search_skills'),
      });
    });
  });

  describe('CallTool handler — dispatcher throws error', () => {
    it('wraps Error in McpError with InternalError code', async () => {
      vi.mocked(searchSkills).mockRejectedValue(new Error('index not found'));
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'search_skills', arguments: { query: 'test' } } })
      ).rejects.toMatchObject({
        name: 'McpError',
        code: ErrorCode.InternalError,
      });
    });

    it('includes tool name in wrapped error message', async () => {
      vi.mocked(searchSkills).mockRejectedValue(new Error('index not found'));
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'search_skills', arguments: { query: 'test' } } })
      ).rejects.toMatchObject({
        message: expect.stringContaining('search_skills'),
      });
    });

    it('includes original error message in wrapped error', async () => {
      vi.mocked(searchSkills).mockRejectedValue(new Error('index not found'));
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'search_skills', arguments: { query: 'test' } } })
      ).rejects.toMatchObject({
        message: expect.stringContaining('index not found'),
      });
    });

    it('wraps non-Error throw in McpError with InternalError code', async () => {
      vi.mocked(searchSkills).mockRejectedValue('plain string error');
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      await expect(
        handler({ params: { name: 'search_skills', arguments: { query: 'test' } } })
      ).rejects.toMatchObject({
        name: 'McpError',
        code: ErrorCode.InternalError,
        message: expect.stringContaining('plain string error'),
      });
    });

    it('wraps validation error (invalid args) in McpError with InternalError code', async () => {
      await bootstrap();
      const handler = registeredHandlers.get(CallToolRequestSchema)!;

      // Missing required 'query' field triggers requireString to throw
      await expect(
        handler({ params: { name: 'search_skills', arguments: {} } })
      ).rejects.toMatchObject({
        name: 'McpError',
        code: ErrorCode.InternalError,
      });
    });
  });

  describe('lifecycle: signal handlers', () => {
    it('registers a SIGINT handler', async () => {
      await bootstrap();
      const sigintCall = (processOnSpy.mock.calls as Array<[string, unknown]>).find(
        ([event]) => event === 'SIGINT'
      );
      expect(sigintCall).toBeDefined();
    });

    it('registers a SIGTERM handler', async () => {
      await bootstrap();
      const sigtermCall = (processOnSpy.mock.calls as Array<[string, unknown]>).find(
        ([event]) => event === 'SIGTERM'
      );
      expect(sigtermCall).toBeDefined();
    });

    it('SIGINT handler calls server.close()', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      await bootstrap();

      const sigintCall = (processOnSpy.mock.calls as Array<[string, (() => Promise<void>)]>).find(
        ([event]) => event === 'SIGINT'
      );
      await sigintCall?.[1]?.();

      expect(mockClose).toHaveBeenCalled();
      mockExit.mockRestore();
    });

    it('SIGTERM handler calls server.close()', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      await bootstrap();

      const sigtermCall = (processOnSpy.mock.calls as Array<[string, (() => Promise<void>)]>).find(
        ([event]) => event === 'SIGTERM'
      );
      await sigtermCall?.[1]?.();

      expect(mockClose).toHaveBeenCalled();
      mockExit.mockRestore();
    });

    it('SIGINT handler calls process.exit(0)', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      await bootstrap();

      const sigintCall = (processOnSpy.mock.calls as Array<[string, (() => Promise<void>)]>).find(
        ([event]) => event === 'SIGINT'
      );
      await sigintCall?.[1]?.();

      expect(mockExit).toHaveBeenCalledWith(0);
      mockExit.mockRestore();
    });

    it('SIGTERM handler calls process.exit(0)', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      await bootstrap();

      const sigtermCall = (processOnSpy.mock.calls as Array<[string, (() => Promise<void>)]>).find(
        ([event]) => event === 'SIGTERM'
      );
      await sigtermCall?.[1]?.();

      expect(mockExit).toHaveBeenCalledWith(0);
      mockExit.mockRestore();
    });
  });

  describe('lifecycle: eager loading', () => {
    it('does not call warmAll when GOODVIBES_EAGER_LOAD is not "true"', async () => {
      delete process.env.GOODVIBES_EAGER_LOAD;
      const { RegistryIndexCache } = await import('../extensions/loader.js');
      vi.mocked(RegistryIndexCache).mockClear();

      await bootstrap();

      const instances = vi.mocked(RegistryIndexCache).mock.results;
      const latestInstance = instances[instances.length - 1]?.value;
      expect(latestInstance?.warmAll).not.toHaveBeenCalled();
    });

    it('calls warmAll when GOODVIBES_EAGER_LOAD is "true"', async () => {
      process.env.GOODVIBES_EAGER_LOAD = 'true';
      const { RegistryIndexCache } = await import('../extensions/loader.js');
      vi.mocked(RegistryIndexCache).mockClear();

      await bootstrap();

      const instances = vi.mocked(RegistryIndexCache).mock.results;
      const latestInstance = instances[instances.length - 1]?.value;
      expect(latestInstance?.warmAll).toHaveBeenCalled();

      delete process.env.GOODVIBES_EAGER_LOAD;
    });
  });

  describe('server onerror handler', () => {
    it('sets server.onerror to a function after bootstrap', async () => {
      await bootstrap();
      expect(mockServerInstance.onerror).toBeTypeOf('function');
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 5: plugins/index.ts barrel exports
// ---------------------------------------------------------------------------

describe('plugins/index.ts barrel exports', () => {
  it('re-exports bootstrap from server', async () => {
    const { bootstrap: b } = await import('./index.js');
    expect(typeof b).toBe('function');
  });

  it('re-exports TOOL_SCHEMAS from schemas', async () => {
    const { TOOL_SCHEMAS: ts } = await import('./index.js');
    expect(Array.isArray(ts)).toBe(true);
    expect(ts).toHaveLength(7);
  });

  it('re-exports DISPATCH_TABLE from dispatch', async () => {
    const { DISPATCH_TABLE: dt } = await import('./index.js');
    expect(typeof dt).toBe('object');
    expect(Object.keys(dt)).toHaveLength(7);
  });

  it('re-exports getDispatcher from dispatch', async () => {
    const { getDispatcher: gd } = await import('./index.js');
    expect(typeof gd).toBe('function');
  });

  it('re-exports hasDispatcher from dispatch', async () => {
    const { hasDispatcher: hd } = await import('./index.js');
    expect(typeof hd).toBe('function');
  });

  it('re-exports listTools from dispatch', async () => {
    const { listTools: lt } = await import('./index.js');
    expect(typeof lt).toBe('function');
  });
});
