/**
 * MCP tool schema definitions for registry-engine.
 * Source of truth: plugins/goodvibes/tools/definitions/registry-engine/
 */

export const allSchemas = [
  {
    name: 'search_skills',
    description:
      'Search the skill registry for relevant skills based on keywords,\ntechnology, or task description. Use when needing domain-specific\nguidance that matches available skills.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query or keywords to search for',
        },
        category: {
          type: 'string',
          description: 'Optional category filter (e.g., webdev, devops)',
          default: 'all',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_agents',
    description:
      'Search for specialized agents by expertise area or task type.\nUse when needing to find an agent with specific domain knowledge.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords describing the expertise needed',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results',
          default: 5,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_tools',
    description:
      'Search for available tools by functionality or use case.\nUse when discovering what tools are available for a task.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords describing the tool functionality needed',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results',
          default: 5,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'recommend_skills',
    description:
      'Analyze task description and project context to recommend relevant skills.\nCombines natural language understanding with stack detection.\nPrimary entry point for skill discovery.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Natural language task description',
        },
        context: {
          type: 'object',
          properties: {
            stack: {
              type: 'object',
              description: 'Output from detect_stack (optional)',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Relevant files for context',
            },
            constraints: {
              type: 'array',
              items: { type: 'string' },
              description: "User constraints (e.g., 'no external deps')",
            },
          },
          additionalProperties: false,
        },
        max_results: {
          type: 'integer',
          description: 'Maximum recommendations',
          default: 5,
        },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_skill_content',
    description:
      'Load the full content of a skill by its path.\nUse after searching to get detailed skill instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Skill path from registry (e.g., webdev/frontend/ui-frameworks/implementing-react-hooks)',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_agent_content',
    description:
      'Load full content of an agent by path.\nRetrieves the complete agent definition including capabilities,\nexpertise areas, and configuration from the agent registry.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Agent path from registry',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'skill_dependencies',
    description:
      'Show which skills work together and their dependencies.\nIdentifies prerequisite skills, complementary skills, and conflicts.\nHelps build complete skill sets for complex tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'Skill to analyze',
        },
        depth: {
          type: 'integer',
          description: 'Depth of dependency tree',
          default: 2,
          minimum: 1,
          maximum: 5,
        },
        include_optional: {
          type: 'boolean',
          description: 'Include optional/complementary dependencies',
          default: true,
        },
      },
      required: ['skill'],
      additionalProperties: false,
    },
  },
] as const;
