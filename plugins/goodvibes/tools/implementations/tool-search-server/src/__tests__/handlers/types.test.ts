/**
 * Unit tests for handlers/types.ts
 *
 * Tests cover:
 * - HandlerContext interface
 * - ToolHandlerResponse interface
 * - ToolHandler type
 * - ToolHandlerRegistry type
 * - ToolCategory type
 * - ToolHandlerMeta interface
 */

import { describe, it, expect } from 'vitest';
import type Fuse from 'fuse.js';
import type {
  HandlerContext,
  ToolHandlerResponse,
  ToolHandler,
  ToolHandlerRegistry,
  ToolCategory,
  ToolHandlerMeta,
} from '../../handlers/types.js';
import type { Registry, RegistryEntry } from '../../types.js';

describe('HandlerContext Interface', () => {
  it('should accept null for all indexes', () => {
    const context: HandlerContext = {
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

  it('should accept Fuse index for skillsIndex', () => {
    // Mock Fuse instance (we only test type compatibility)
    const mockFuseIndex = {
      search: () => [],
    } as unknown as Fuse<RegistryEntry>;

    const context: HandlerContext = {
      skillsIndex: mockFuseIndex,
      agentsIndex: null,
      toolsIndex: null,
      skillsRegistry: null,
    };

    expect(context.skillsIndex).toBe(mockFuseIndex);
  });

  it('should accept Fuse index for agentsIndex', () => {
    const mockFuseIndex = {
      search: () => [],
    } as unknown as Fuse<RegistryEntry>;

    const context: HandlerContext = {
      skillsIndex: null,
      agentsIndex: mockFuseIndex,
      toolsIndex: null,
      skillsRegistry: null,
    };

    expect(context.agentsIndex).toBe(mockFuseIndex);
  });

  it('should accept Fuse index for toolsIndex', () => {
    const mockFuseIndex = {
      search: () => [],
    } as unknown as Fuse<RegistryEntry>;

    const context: HandlerContext = {
      skillsIndex: null,
      agentsIndex: null,
      toolsIndex: mockFuseIndex,
      skillsRegistry: null,
    };

    expect(context.toolsIndex).toBe(mockFuseIndex);
  });

  it('should accept Registry for skillsRegistry', () => {
    const mockRegistry: Registry = {
      version: '1.0.0',
      search_index: [
        { name: 'Test Skill', path: 'test/skill', description: 'A test skill' },
      ],
    };

    const context: HandlerContext = {
      skillsIndex: null,
      agentsIndex: null,
      toolsIndex: null,
      skillsRegistry: mockRegistry,
    };

    expect(context.skillsRegistry).toBe(mockRegistry);
  });

  it('should accept all indexes and registry at once', () => {
    const mockFuseIndex = {
      search: () => [],
    } as unknown as Fuse<RegistryEntry>;

    const mockRegistry: Registry = {
      version: '1.0.0',
      search_index: [],
    };

    const context: HandlerContext = {
      skillsIndex: mockFuseIndex,
      agentsIndex: mockFuseIndex,
      toolsIndex: mockFuseIndex,
      skillsRegistry: mockRegistry,
    };

    expect(context.skillsIndex).not.toBeNull();
    expect(context.agentsIndex).not.toBeNull();
    expect(context.toolsIndex).not.toBeNull();
    expect(context.skillsRegistry).not.toBeNull();
  });
});

describe('ToolHandlerResponse Interface', () => {
  it('should have required content array', () => {
    const response: ToolHandlerResponse = {
      content: [{ type: 'text', text: 'Hello' }],
    };

    expect(response.content).toBeDefined();
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBe(1);
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toBe('Hello');
  });

  it('should allow optional isError flag', () => {
    const errorResponse: ToolHandlerResponse = {
      content: [{ type: 'text', text: '{"error": "Something went wrong"}' }],
      isError: true,
    };

    expect(errorResponse.isError).toBe(true);
  });

  it('should allow isError to be undefined', () => {
    const response: ToolHandlerResponse = {
      content: [{ type: 'text', text: 'Success' }],
    };

    expect(response.isError).toBeUndefined();
  });

  it('should allow isError to be false', () => {
    const response: ToolHandlerResponse = {
      content: [{ type: 'text', text: 'Success' }],
      isError: false,
    };

    expect(response.isError).toBe(false);
  });

  it('should support multiple content items', () => {
    const response: ToolHandlerResponse = {
      content: [
        { type: 'text', text: 'Part 1' },
        { type: 'text', text: 'Part 2' },
        { type: 'text', text: 'Part 3' },
      ],
    };

    expect(response.content.length).toBe(3);
  });

  it('should support empty content array', () => {
    const response: ToolHandlerResponse = {
      content: [],
    };

    expect(response.content.length).toBe(0);
  });
});

describe('ToolHandler Type', () => {
  it('should accept synchronous handler function', () => {
    const handler: ToolHandler = (ctx, args) => ({
      content: [{ type: 'text', text: 'sync response' }],
    });

    const result = handler(
      { skillsIndex: null, agentsIndex: null, toolsIndex: null, skillsRegistry: null },
      {}
    );

    expect(result).toHaveProperty('content');
  });

  it('should accept asynchronous handler function', async () => {
    const handler: ToolHandler = async (ctx, args) => ({
      content: [{ type: 'text', text: 'async response' }],
    });

    const result = await handler(
      { skillsIndex: null, agentsIndex: null, toolsIndex: null, skillsRegistry: null },
      {}
    );

    expect(result).toHaveProperty('content');
    expect(result.content[0].text).toBe('async response');
  });

  it('should accept generic type parameter for args', () => {
    interface MyArgs {
      name: string;
      count: number;
    }

    const handler: ToolHandler<MyArgs> = (ctx, args) => ({
      content: [{ type: 'text', text: `name: ${args.name}, count: ${args.count}` }],
    });

    const result = handler(
      { skillsIndex: null, agentsIndex: null, toolsIndex: null, skillsRegistry: null },
      { name: 'test', count: 5 }
    );

    expect(result.content[0].text).toBe('name: test, count: 5');
  });

  it('should work with different return scenarios', () => {
    // Return with isError
    const errorHandler: ToolHandler = () => ({
      content: [{ type: 'text', text: 'Error!' }],
      isError: true,
    });

    const errorResult = errorHandler(
      { skillsIndex: null, agentsIndex: null, toolsIndex: null, skillsRegistry: null },
      {}
    );

    expect(errorResult.isError).toBe(true);

    // Return without isError
    const successHandler: ToolHandler = () => ({
      content: [{ type: 'text', text: 'Success!' }],
    });

    const successResult = successHandler(
      { skillsIndex: null, agentsIndex: null, toolsIndex: null, skillsRegistry: null },
      {}
    );

    expect(successResult.isError).toBeUndefined();
  });
});

describe('ToolHandlerRegistry Type', () => {
  it('should be a record of string to ToolHandler', () => {
    const registry: ToolHandlerRegistry = {
      tool_one: () => ({ content: [{ type: 'text', text: '1' }] }),
      tool_two: () => ({ content: [{ type: 'text', text: '2' }] }),
    };

    expect(typeof registry['tool_one']).toBe('function');
    expect(typeof registry['tool_two']).toBe('function');
  });

  it('should allow empty registry', () => {
    const registry: ToolHandlerRegistry = {};

    expect(Object.keys(registry).length).toBe(0);
  });

  it('should allow adding handlers', () => {
    const registry: ToolHandlerRegistry = {};

    registry['new_tool'] = () => ({
      content: [{ type: 'text', text: 'new tool response' }],
    });

    expect(registry['new_tool']).toBeDefined();
  });

  it('should allow accessing handlers by string key', () => {
    const registry: ToolHandlerRegistry = {
      my_tool: () => ({ content: [{ type: 'text', text: 'my response' }] }),
    };

    const toolName = 'my_tool';
    const handler = registry[toolName];

    expect(handler).toBeDefined();
    const result = handler(
      { skillsIndex: null, agentsIndex: null, toolsIndex: null, skillsRegistry: null },
      {}
    );
    expect(result.content[0].text).toBe('my response');
  });
});

describe('ToolCategory Type', () => {
  it('should include all expected categories', () => {
    const categories: ToolCategory[] = [
      'search',
      'content',
      'context',
      'validation',
      'scaffolding',
      'status',
      'lsp',
      'deps',
      'test',
      'security',
      'build',
      'process',
      'runtime',
      'edit',
      'analysis',
      'database',
      'env',
      'package',
      'sync',
      'fixtures',
      'git',
      'frontend',
      'errors',
      'project',
      'framework',
      'docs',
    ];

    // This test validates the type at compile time
    expect(categories.length).toBe(26);

    // All values should be strings
    for (const category of categories) {
      expect(typeof category).toBe('string');
    }
  });

  it('should be usable in switch statements', () => {
    function getCategoryDescription(category: ToolCategory): string {
      switch (category) {
        case 'search':
          return 'Search tools';
        case 'content':
          return 'Content tools';
        case 'context':
          return 'Context tools';
        case 'lsp':
          return 'LSP tools';
        case 'security':
          return 'Security tools';
        default:
          return 'Other tools';
      }
    }

    expect(getCategoryDescription('search')).toBe('Search tools');
    expect(getCategoryDescription('lsp')).toBe('LSP tools');
    expect(getCategoryDescription('frontend')).toBe('Other tools');
  });
});

describe('ToolHandlerMeta Interface', () => {
  it('should have all required properties', () => {
    const meta: ToolHandlerMeta = {
      name: 'test_tool',
      category: 'search',
      requiresContext: true,
    };

    expect(meta.name).toBe('test_tool');
    expect(meta.category).toBe('search');
    expect(meta.requiresContext).toBe(true);
  });

  it('should work with different categories', () => {
    const categories: ToolCategory[] = ['search', 'lsp', 'security', 'frontend'];

    for (const category of categories) {
      const meta: ToolHandlerMeta = {
        name: `${category}_tool`,
        category,
        requiresContext: false,
      };

      expect(meta.category).toBe(category);
    }
  });

  it('should allow requiresContext to be true or false', () => {
    const withContext: ToolHandlerMeta = {
      name: 'search_skills',
      category: 'search',
      requiresContext: true,
    };

    const withoutContext: ToolHandlerMeta = {
      name: 'detect_stack',
      category: 'context',
      requiresContext: false,
    };

    expect(withContext.requiresContext).toBe(true);
    expect(withoutContext.requiresContext).toBe(false);
  });

  it('should match TOOL_SCHEMAS naming convention', () => {
    // Tool names in schemas use snake_case
    const meta: ToolHandlerMeta = {
      name: 'find_references',
      category: 'lsp',
      requiresContext: false,
    };

    expect(meta.name).toMatch(/^[a-z_]+$/);
  });
});

describe('Type Compatibility', () => {
  it('should allow ToolHandlerResponse to be used in Promise', async () => {
    const asyncHandler = async (): Promise<ToolHandlerResponse> => ({
      content: [{ type: 'text', text: 'async' }],
    });

    const result = await asyncHandler();
    expect(result.content).toBeDefined();
  });

  it('should allow spreading content arrays', () => {
    const response1: ToolHandlerResponse = {
      content: [{ type: 'text', text: 'Part 1' }],
    };

    const response2: ToolHandlerResponse = {
      content: [...response1.content, { type: 'text', text: 'Part 2' }],
    };

    expect(response2.content.length).toBe(2);
  });

  it('should work with JSON serialization', () => {
    const response: ToolHandlerResponse = {
      content: [{ type: 'text', text: JSON.stringify({ key: 'value' }) }],
    };

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.key).toBe('value');
  });

  it('should allow partial context with only needed indexes', () => {
    // Handlers that only need skillsIndex
    const partialContext: HandlerContext = {
      skillsIndex: { search: () => [] } as unknown as Fuse<RegistryEntry>,
      agentsIndex: null,
      toolsIndex: null,
      skillsRegistry: null,
    };

    expect(partialContext.skillsIndex).not.toBeNull();
    expect(partialContext.agentsIndex).toBeNull();
  });
});
