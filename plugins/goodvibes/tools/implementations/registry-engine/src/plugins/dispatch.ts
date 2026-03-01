/**
 * Tool dispatch table — maps MCP tool names to business logic functions.
 */

import { RegistryContext } from '../core/types.js';
import { McpResponse } from '../shared/types.js';
import { searchSkills, searchAgents, searchTools } from '../extensions/search.js';
import { recommendSkills } from '../extensions/recommendations.js';
import { getSkillContent, getAgentContent } from '../extensions/content.js';
import { analyzeDependencies } from '../extensions/dependencies.js';

export type ToolDispatcher = (context: RegistryContext, args: unknown) => Promise<McpResponse>;

/** Validates that args is a non-null object and throws if not. */
function requireObject(args: unknown, tool: string): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error(`Tool ${tool}: args must be a non-null object, got ${typeof args}`);
  }
  return args as Record<string, unknown>;
}

/** Validates and extracts a required string field from args. */
function requireString(obj: Record<string, unknown>, field: string, tool: string): string {
  const val = obj[field];
  if (typeof val !== 'string' || val.trim() === '') {
    throw new Error(`Tool ${tool}: '${field}' must be a non-empty string`);
  }
  return val;
}

export const DISPATCH_TABLE: Record<string, ToolDispatcher> = {
  search_skills: async (ctx, args) => {
    const obj = requireObject(args, 'search_skills');
    const query = requireString(obj, 'query', 'search_skills');
    const limit = typeof obj.limit === 'number' ? obj.limit : undefined;
    const category = typeof obj.category === 'string' ? obj.category : undefined;
    return searchSkills(ctx.skillsIndex, { query, limit, category });
  },
  search_agents: async (ctx, args) => {
    const obj = requireObject(args, 'search_agents');
    const query = requireString(obj, 'query', 'search_agents');
    const limit = typeof obj.limit === 'number' ? obj.limit : undefined;
    return searchAgents(ctx.agentsIndex, { query, limit });
  },
  search_tools: async (ctx, args) => {
    const obj = requireObject(args, 'search_tools');
    const query = requireString(obj, 'query', 'search_tools');
    const limit = typeof obj.limit === 'number' ? obj.limit : undefined;
    return searchTools(ctx.toolsIndex, { query, limit });
  },
  recommend_skills: async (ctx, args) => {
    const obj = requireObject(args, 'recommend_skills');
    const task = requireString(obj, 'task', 'recommend_skills');
    const max_results = typeof obj.max_results === 'number' ? obj.max_results : undefined;
    return recommendSkills(ctx.skillsIndex, { task, max_results });
  },
  get_skill_content: async (_ctx, args) => {
    const obj = requireObject(args, 'get_skill_content');
    const path = requireString(obj, 'path', 'get_skill_content');
    return getSkillContent({ path });
  },
  get_agent_content: async (_ctx, args) => {
    const obj = requireObject(args, 'get_agent_content');
    const path = requireString(obj, 'path', 'get_agent_content');
    return getAgentContent({ path });
  },
  skill_dependencies: async (ctx, args) => {
    const obj = requireObject(args, 'skill_dependencies');
    const skill = requireString(obj, 'skill', 'skill_dependencies');
    const depth = typeof obj.depth === 'number' ? obj.depth : undefined;
    const include_optional = typeof obj.include_optional === 'boolean' ? obj.include_optional : undefined;
    return analyzeDependencies(ctx.skillsIndex, ctx.skillsRegistry, { skill, depth, include_optional });
  },
};

export function getDispatcher(name: string): ToolDispatcher | undefined {
  return DISPATCH_TABLE[name];
}

export function hasDispatcher(name: string): boolean {
  return name in DISPATCH_TABLE;
}

export function listTools(): string[] {
  return Object.keys(DISPATCH_TABLE);
}
