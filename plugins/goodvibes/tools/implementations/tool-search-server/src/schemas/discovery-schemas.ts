/**
 * Discovery tool schemas - search, content retrieval, and recommendations
 */

export const DISCOVERY_SCHEMAS = [
  // Core search tools
  {
    name: 'search_skills',
    description: 'Search the skill registry for relevant skills based on keywords or task description',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query or keywords' },
        category: { type: 'string', description: 'Optional category filter' },
        limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_agents',
    description: 'Search for specialized agents by expertise area',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords describing expertise needed' },
        limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_tools',
    description: 'Search for available tools by functionality',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords describing tool functionality' },
        limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'recommend_skills',
    description: 'Analyze task and recommend relevant skills',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Natural language task description' },
        max_results: { type: 'integer', description: 'Max recommendations (default: 5)', default: 5 },
      },
      required: ['task'],
    },
  },
  // Content retrieval
  {
    name: 'get_skill_content',
    description: 'Load full content of a skill by path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Skill path from registry' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_agent_content',
    description: 'Load full content of an agent by path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Agent path from registry' },
      },
      required: ['path'],
    },
  },
  {
    name: 'skill_dependencies',
    description: 'Show skill relationships and dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill to analyze' },
        depth: { type: 'integer', description: 'Dependency tree depth (default: 2)', default: 2 },
        include_optional: { type: 'boolean', description: 'Include optional deps', default: true },
      },
      required: ['skill'],
    },
  },
];
