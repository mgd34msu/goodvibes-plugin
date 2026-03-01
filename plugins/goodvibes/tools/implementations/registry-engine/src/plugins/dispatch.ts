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

export const DISPATCH_TABLE: Record<string, ToolDispatcher> = {
  search_skills: async (ctx, args: any) => searchSkills(ctx.skillsIndex, args),
  search_agents: async (ctx, args: any) => searchAgents(ctx.agentsIndex, args),
  search_tools: async (ctx, args: any) => searchTools(ctx.toolsIndex, args),
  recommend_skills: async (ctx, args: any) => recommendSkills(ctx.skillsIndex, args),
  get_skill_content: async (_ctx, args: any) => getSkillContent(args),
  get_agent_content: async (_ctx, args: any) => getAgentContent(args),
  skill_dependencies: async (ctx, args: any) =>
    analyzeDependencies(ctx.skillsIndex, ctx.skillsRegistry, args),
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
